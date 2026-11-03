// ═══ PDF テキスト抽出（CDN から読み込んだ pdf.js で座標付きテキストを取り出し、行・段組・縦書きを再構成する） ═══

import type { ParsedPdf, ParseProgressFn } from './types'
import { readBuf } from './encoding'

// PDF parsing watchdogs (prevents "never-ending" extraction)
export const PDF_PARSE_TIMEOUT_MS = 60_000 // total wall time
export const PDFJS_LOAD_TIMEOUT_MS = 15_000 // pdf.js script load
export const PDF_DOCUMENT_TIMEOUT_MS = 25_000 // getDocument() phase
export const PDF_PAGE_TIMEOUT_MS = 20_000 // getPage()/getTextContent() phase per page

// ─── pdf.js (window.pdfjsLib) のうち、このモジュールが使う範囲だけの型 ───

export interface PdfTextItem {
  str: string
  /** [a, b, c, d, e, f]。e/f が x/y、a/d がフォントサイズ相当 */
  transform: number[]
  width: number
  height: number
}

export interface PdfTextContent {
  items: PdfTextItem[]
}

export interface PdfPageProxy {
  getTextContent(): Promise<PdfTextContent>
}

export interface PdfDocumentProxy {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPageProxy>
  cleanup(): unknown
  destroy(): unknown
}

export interface PdfLoadingTask {
  promise: Promise<PdfDocumentProxy>
  destroy(): unknown
}

export interface PdfGetDocumentParams {
  data: ArrayBuffer
  cMapUrl?: string
  cMapPacked?: boolean
}

export interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(params: PdfGetDocumentParams): PdfLoadingTask
}

type PdfJsWindow = Window & { pdfjsLib?: PdfJsLib }

// Window をグローバル拡張しないのは、同じ window.pdfjsLib を触る他モジュールと型宣言が衝突しないようにするため
function getPdfJsLib(): PdfJsLib | undefined {
  return (window as PdfJsWindow).pdfjsLib
}

// loadPdfJs 済みの前提で呼ぶ。未定義なら（元の実装と同じく）プロパティ参照で TypeError になる
function pdfJs(): PdfJsLib {
  return getPdfJsLib() as PdfJsLib
}

export function withTimeout<T>(
  p: Promise<T>,
  timeoutMs: number | undefined,
  msg: string,
  onTimeout?: () => void,
): Promise<T> {
  const ms = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 0
  if (!ms) return p
  let t: ReturnType<typeof setTimeout> | null = null
  return new Promise<T>((resolve, reject) => {
    t = setTimeout(() => {
      try {
        onTimeout?.()
      } catch {
        // 後始末の失敗よりタイムアウトとして reject することを優先する
      }
      reject(new Error(msg))
    }, ms)
    Promise.resolve(p).then(
      (v) => {
        if (t) clearTimeout(t)
        resolve(v)
      },
      (e: unknown) => {
        if (t) clearTimeout(t)
        reject(e)
      },
    )
  })
}

export async function loadPdfJs(opts?: {
  timeoutMs?: number
  onProgress?: ParseProgressFn
}): Promise<void> {
  if (getPdfJsLib()) return
  const timeoutMs = opts?.timeoutMs ?? PDFJS_LOAD_TIMEOUT_MS
  const onProgress = opts?.onProgress
  if (onProgress) onProgress('PDF: PDF.js読込中...')
  await withTimeout(
    new Promise((r, j) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      s.async = true
      s.onload = () => r(true)
      s.onerror = () => j(new Error('PDF.jsの読み込みに失敗しました'))
      document.head.appendChild(s)
    }),
    timeoutMs,
    `PDF.jsの読み込みがタイムアウトしました（${Math.round(timeoutMs / 1000)}秒）`,
  )
  pdfJs().GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
}

interface LayoutItem {
  x: number
  y: number
  w: number
  h: number
  fs: number
  text: string
}

export async function parsePDF(
  f: Blob,
  opts?: { onProgress?: ParseProgressFn; timeoutMs?: number },
): Promise<ParsedPdf> {
  const onProgress = opts?.onProgress
  const totalTimeoutMs = opts?.timeoutMs ?? PDF_PARSE_TIMEOUT_MS
  const deadline = Date.now() + totalTimeoutMs
  const sec = Math.round(totalTimeoutMs / 1000)
  const remain = () => Math.max(0, deadline - Date.now())
  const cap = (ms: number) => Math.min(ms, remain())
  const timeUp = () => remain() <= 0

  const abortMsg = `PDFのテキスト抽出がタイムアウトしました（最大${sec}秒）。\n\n対処:\n- PDFが大きい/破損/保護されている可能性があります\n- 画像PDFの場合は「AI OCR」を有効にして再実行してください`

  if (onProgress) onProgress('PDF: ファイル読込中...')
  const ab = await withTimeout(readBuf(f), cap(totalTimeoutMs), abortMsg)
  if (timeUp()) throw new Error(abortMsg)
  await loadPdfJs({ timeoutMs: cap(PDFJS_LOAD_TIMEOUT_MS), onProgress })
  // Clone buffer before pdf.js consumes it (ArrayBuffer gets detached)
  const abCopy = ab.slice(0)
  // Try with CMap for better Japanese text extraction, fall back without
  let pdf: PdfDocumentProxy | null = null
  let loadingTask: PdfLoadingTask | null = null
  const destroy = () => {
    try {
      loadingTask?.destroy?.()
    } catch {
      // 破棄済み・破棄中の例外は無視してよい
    }
    try {
      pdf?.destroy?.()
    } catch {
      // 同上
    }
  }
  try {
    if (onProgress) onProgress('PDF: 読み込み中（CMap）...')
    loadingTask = pdfJs().getDocument({
      data: ab,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
    })
    pdf = await withTimeout(loadingTask.promise, cap(PDF_DOCUMENT_TIMEOUT_MS), abortMsg, () => {
      try {
        loadingTask?.destroy()
      } catch {
        // タイムアウト時の後始末なので失敗しても reject は続行する
      }
    })
  } catch (e) {
    console.warn('PDF with CMap failed, retrying without:', e)
    const ab2 = abCopy.slice(0)
    if (onProgress) onProgress('PDF: 読み込み再試行（通常）...')
    loadingTask = pdfJs().getDocument({ data: ab2 })
    pdf = await withTimeout(loadingTask.promise, cap(PDF_DOCUMENT_TIMEOUT_MS), abortMsg, () => {
      try {
        loadingTask?.destroy()
      } catch {
        // 同上
      }
    })
  }
  const doc: PdfDocumentProxy = pdf
  let fullText = ''
  const sparsePages: number[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    if (timeUp()) {
      destroy()
      throw new Error(abortMsg)
    }
    if (onProgress) {
      const pct = Math.round((i / doc.numPages) * 100)
      onProgress(`PDF: ${pct}% (${i}/${doc.numPages}) ページ抽出中...`)
    }
    const pg = await withTimeout(doc.getPage(i), cap(PDF_PAGE_TIMEOUT_MS), abortMsg, destroy)
    const c = await withTimeout(pg.getTextContent(), cap(PDF_PAGE_TIMEOUT_MS), abortMsg, destroy)

    // Collect all text items with position info
    const items: LayoutItem[] = []
    for (const it of c.items) {
      if (!it.str || it.str.trim() === '') continue
      const x = it.transform[4]
      const y = it.transform[5]
      const w = it.width || 0
      const h = it.height || Math.abs(it.transform[3]) || 12
      const fs = Math.abs(it.transform[0]) || 12
      items.push({ x, y, w, h, fs, text: it.str })
    }
    if (items.length === 0) {
      fullText += `--- Page ${i} ---\n\n`
      continue
    }

    // Step 1: Y-tolerance grouping (items within fs*0.4 of each other = same row)
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    const rows: LayoutItem[][] = []
    let curRow: LayoutItem[] = [items[0]]
    for (let j = 1; j < items.length; j++) {
      const prev = curRow[curRow.length - 1]
      const cur = items[j]
      const tolerance = Math.max(prev.fs, cur.fs) * 0.4
      if (Math.abs(cur.y - prev.y) <= tolerance) {
        curRow.push(cur)
      } else {
        rows.push(curRow)
        curRow = [cur]
      }
    }
    if (curRow.length > 0) rows.push(curRow)

    // Step 2: Detect vertical text sequences (single CJK chars stacked vertically at similar X)
    // Identify columns of single chars with same X (±5px) and small Y gaps
    const verticalGroups: { text: string; items: LayoutItem[] }[] = []
    const usedInVertical = new Set<LayoutItem>()
    // Only detect if we have many single-char items at similar X
    const singleCharItems = items.filter(
      (it) =>
        it.text.trim().length === 1 && /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(it.text),
    )
    if (singleCharItems.length > 3) {
      // Group by X proximity
      // Map ではなく通常オブジェクトなのは、Object.entries の列挙順（整数キー昇順）に結果が依存するため
      const xGroups: Record<string, LayoutItem[]> = {}
      for (const it of singleCharItems) {
        const xKey = Math.round(it.x / 6) * 6
        if (!xGroups[xKey]) xGroups[xKey] = []
        xGroups[xKey].push(it)
      }
      for (const [, group] of Object.entries(xGroups)) {
        if (group.length < 3) continue
        // Sort by Y descending (top to bottom)
        group.sort((a, b) => b.y - a.y)
        // Check if Y gaps are consistent (vertical text)
        let isVertical = true
        for (let k = 1; k < group.length; k++) {
          const gap = group[k - 1].y - group[k].y
          if (gap > group[k].fs * 2.5 || gap < group[k].fs * 0.3) {
            isVertical = false
            break
          }
        }
        if (isVertical) {
          const combined = group.map((g) => g.text).join('')
          verticalGroups.push({ text: combined, items: group })
          for (const g of group) usedInVertical.add(g)
        }
      }
    }

    // Step 3: Rebuild rows excluding vertical text items
    const filteredRows = rows
      .map((row) => row.filter((it) => !usedInVertical.has(it)))
      .filter((r) => r.length > 0)

    // Step 4: Smart line reconstruction with column detection
    const pageLines: string[] = []

    // Add vertical text groups as header/label info
    if (verticalGroups.length > 0) {
      // These are typically table headers - combine them
      const vTexts = verticalGroups.map((vg) => vg.text).filter((t) => t.length >= 2)
      if (vTexts.length > 0) {
        pageLines.push('[' + vTexts.join(' / ') + ']')
      }
    }

    for (const row of filteredRows) {
      row.sort((a, b) => a.x - b.x)

      // Detect gaps between items to determine column breaks vs word joins
      const segments: LayoutItem[][] = []
      let seg: LayoutItem[] = [row[0]]
      for (let k = 1; k < row.length; k++) {
        const prev = seg[seg.length - 1]
        const cur = row[k]
        const prevEnd = prev.x + (prev.w || prev.text.length * prev.fs * 0.55)
        const gap = cur.x - prevEnd
        // Large gap = column break, use separator
        const gapThreshold = cur.fs * 2.5
        if (gap > gapThreshold) {
          segments.push(seg)
          seg = [cur]
        } else {
          seg.push(cur)
        }
      }
      if (seg.length > 0) segments.push(seg)

      // Build line from segments
      const lineParts = segments.map((s) => {
        return s
          .map((it, idx) => {
            if (idx === 0) return it.text
            const prev = s[idx - 1]
            const prevEnd = prev.x + (prev.w || prev.text.length * prev.fs * 0.55)
            const gap = it.x - prevEnd
            // Small gap between CJK chars = no space needed
            const prevIsCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]$/.test(prev.text)
            const curIsCJK = /^[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(it.text)
            if (prevIsCJK && curIsCJK && gap < it.fs * 0.8) return it.text
            if (gap > it.fs * 0.3) return ' ' + it.text
            return it.text
          })
          .join('')
      })

      // Join segments with clear separator for multi-column content
      const line = lineParts.length > 1 ? lineParts.join(' | ') : lineParts[0]
      if (line && line.trim()) pageLines.push(line.trim())
    }

    // Step 5: Post-process - merge orphan lines, clean artifacts
    const cleaned: string[] = []
    for (const line of pageLines) {
      // Skip lines that are just single chars or purely symbols
      if (line.length === 1 && /[\s\u3000]/.test(line)) continue
      // Skip lines that are just column separators
      if (/^[|／\/\s]+$/.test(line)) continue
      cleaned.push(line)
    }

    fullText += `--- Page ${i} ---\n${cleaned.join('\n')}\n\n`

    // Track pages with very little extractable text (likely image/outlined text)
    const realContent = cleaned.filter((l) => l.length > 3).join('')
    if (realContent.length < 30) sparsePages.push(i)

    // Yield to UI/event loop (prevents long sync blocks)
    await new Promise((r) => setTimeout(r, 0))
  }
  // Detect CMap failure: if Japanese PDF has very few Japanese characters, text extraction failed
  const jpChars = (fullText.match(/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/g) || []).length
  const totalChars = fullText.replace(/[\s\-|/]/g, '').length
  const cmapFailed = doc.numPages > 2 && totalChars > 20 && jpChars < totalChars * 0.05
  // If CMap failed, mark ALL pages with content potential as sparse (force OCR)
  if (cmapFailed) {
    for (let i = 1; i <= doc.numPages; i++) {
      if (!sparsePages.includes(i)) sparsePages.push(i)
    }
    sparsePages.sort((a, b) => a - b)
  }
  const numPages = doc.numPages
  // Cleanup (avoid leaking workers/memory)
  try {
    doc.cleanup?.()
  } catch {
    // 解放失敗は抽出結果に影響しない
  }
  try {
    doc.destroy?.()
  } catch {
    // 同上
  }
  try {
    loadingTask?.destroy?.()
  } catch {
    // 同上
  }
  return {
    text: fullText,
    pageCount: numPages,
    format: 'PDF',
    sparsePages,
    pdfData: abCopy,
    cmapFailed,
  }
}
