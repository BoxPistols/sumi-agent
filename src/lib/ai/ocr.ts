/**
 * テキストがほとんど取れない PDF ページの AI OCR
 *
 * PDF をそのまま Base64 で AI に渡し、指定ページだけのテキストを抽出させる（canvas 描画はしない）。
 * 得られたページ本文は mergeOcrResults で抽出済みテキストの該当ページに差し替える。
 */
import { callAI } from '@/lib/ai/client'
import { errorMessage } from '@/lib/ai/error-message'
import { getProviderForModel } from '@/lib/constants'

/** ページ番号 → OCR で得た本文 */
export type OcrResults = Record<number, string>

export async function ocrSparsePages(
  pdfData: ArrayBuffer | null | undefined,
  sparsePages: number[] | null | undefined,
  apiKey: string | undefined,
  model: string,
  onProgress?: (message: string) => void,
): Promise<OcrResults> {
  if (!sparsePages || sparsePages.length === 0) return {}
  if (!pdfData || pdfData.byteLength === 0) {
    if (onProgress) onProgress('OCR: PDFデータなし')
    return {}
  }
  const provider = getProviderForModel(model)

  // Convert PDF ArrayBuffer to base64 for direct API submission
  if (onProgress) onProgress('OCR: PDF→Base64変換中...')
  let pdfB64: string
  try {
    const bytes = new Uint8Array(pdfData.slice(0))
    const chunks: string[] = []
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length))))
    }
    pdfB64 = btoa(chunks.join(''))
  } catch (e) {
    if (onProgress) onProgress(`OCR: Base64変換エラー: ${errorMessage(e)}`)
    return {}
  }

  const pdfSizeMB = ((pdfB64.length * 0.75) / 1024 / 1024).toFixed(1)
  if (onProgress) onProgress(`OCR: PDF ${pdfSizeMB}MB — ${sparsePages.length}ページを解析中...`)
  console.log(
    `OCR: PDF direct mode — ${pdfSizeMB}MB, ${sparsePages.length} sparse pages: [${sparsePages.join(',')}]`,
  )

  // Size check (Claude API limit ~25MB for base64 documents)
  if (pdfB64.length > 32 * 1024 * 1024) {
    if (onProgress) onProgress(`OCR: PDFが大きすぎます (${pdfSizeMB}MB > 25MB)`)
    return {}
  }

  const results: OcrResults = {}

  // Send PDF directly to Claude Vision API in page batches (no canvas rendering)
  const batchSize = 6
  for (let b = 0; b < sparsePages.length; b += batchSize) {
    const batch = sparsePages.slice(b, b + batchSize)
    const pct = Math.round(((b + batch.length) / sparsePages.length) * 100)
    const pageList = batch.join(', ')
    if (onProgress)
      onProgress(
        `OCR: ${pct}% — Page ${pageList} (${Math.min(b + batch.length, sparsePages.length)}/${sparsePages.length})`,
      )

    try {
      const ocrPrompt = `このPDFのページ ${pageList} からテキストを抽出してください。

ルール：
1. 指定ページのテキストのみ抽出（他のページは無視）
2. 各ページを「--- Page N ---」で区切る（Nはページ番号）
3. レイアウト構造（見出し、本文、リスト、表組み等）をなるべく保持
4. URLやメールアドレスは正確に抽出
5. UIスクリーンショットやデザイン画像内の文字も読み取れる範囲で抽出
6. テキストのみ出力（説明文や前置きは一切不要）
7. テキストが無いページは「--- Page N ---」の後に「[画像のみ]」と記載`
      const txt = await callAI({
        provider,
        model: model || 'gpt-6-luna',
        apiKey,
        maxTokens: 8000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfB64,
                },
              },
              { type: 'text', text: ocrPrompt },
            ],
          },
        ],
      })
      console.log(`OCR API response (pages ${pageList}): ${txt.length} chars`)

      // Parse per-page results
      const sections = txt.split(/---\s*Page\s*(\d+)\s*---/)
      for (let s = 1; s < sections.length; s += 2) {
        const pn = parseInt(sections[s])
        const pt = (sections[s + 1] || '').trim()
        if (pt.length > 3 && !isNaN(pn) && pt !== '[画像のみ]') {
          results[pn] = pt
        }
      }

      // Single page fallback
      if (batch.length === 1 && !results[batch[0]]) {
        const cleaned = txt.replace(/---\s*Page\s*\d+\s*---/g, '').trim()
        if (cleaned.length > 5 && cleaned !== '[画像のみ]') results[batch[0]] = cleaned
      }
    } catch (e) {
      console.error('OCR fetch error:', e)
      if (onProgress) onProgress(`OCR通信エラー: ${errorMessage(e) || '不明'}`)
    }
  }

  if (onProgress)
    onProgress(
      `OCR完了: ${Object.keys(results).length}/${sparsePages.length}ページからテキスト復元`,
    )
  console.log(
    `OCR results: ${Object.keys(results).length} pages, keys: [${Object.keys(results).join(',')}]`,
  )
  return results
}

// Merge OCR results into extracted text
export function mergeOcrResults(
  baseText: string,
  ocrResults: OcrResults | null | undefined,
): string {
  if (!ocrResults || Object.keys(ocrResults).length === 0) return baseText
  const pages = baseText.split(/(?=--- Page \d+ ---)/)
  const merged = pages.map((page) => {
    const match = page.match(/---\s*Page\s*(\d+)\s*---/)
    if (!match) return page
    const pageNum = parseInt(match[1])
    if (ocrResults[pageNum]) {
      // Replace sparse page content with OCR result
      return `--- Page ${pageNum} ---\n${ocrResults[pageNum]}\n`
    }
    return page
  })
  return merged.join('\n')
}
