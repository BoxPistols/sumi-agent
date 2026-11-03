/**
 * 複数ファイル取り込み（バッチ）で 1 ファイルを解析する
 *
 * 抽出 → （Pro のみ）サーバー PDF 抽出・OCR・AI 整形 → ルールベース検出 → （Pro のみ）AI 検出 → マスク設定の適用。
 * Lite は AI もサーバー抽出も使わない。呼び出し側に頼らず、この関数自身でもその不変条件を守る。
 */
import type { AnalysisResult } from '@/lib/app-types'
import { getModelsForRun, type AIModelSettings } from '@/lib/ai/models'
import { aiCleanupText, detectWithAI, mergeOcrResults, ocrSparsePages } from '@/lib/ai/tasks'
import { arrayBufferToBase64 } from '@/lib/export'
import { parseFile } from '@/lib/parsers'
import { shouldUseServerPdfExtraction } from '@/lib/pdf-server-extract'
import { detectAll, mergeDetections, type AppDetection } from '@/lib/redact-engine'
import type { MaskConfig } from '@/lib/ui-config'

export interface ProcessFileSettings extends AIModelSettings {
  aiDetect?: boolean
}

export interface ProcessFileOptions {
  onStage?: (message: string) => void
  onProgress?: (percent: number) => void
  signal?: AbortSignal
  isLite?: boolean
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

function errorMessage(e: unknown): string | undefined {
  return e instanceof Error ? e.message : undefined
}

export async function processFileEntry(
  file: File,
  maskConfig: MaskConfig,
  settings: ProcessFileSettings | null | undefined,
  options?: ProcessFileOptions | null,
  customKeywords?: string[],
): Promise<AnalysisResult> {
  const { onStage, onProgress, signal, isLite = false } = options || {}
  const aiOn = !isLite && settings?.aiDetect !== false
  const runModels = aiOn ? getModelsForRun(settings) : null
  // AI を使うときは runModels が必ずあり formatModel/detectModel は文字列になる（'' は型合わせのみ）
  const formatModel = runModels?.formatModel || settings?.model || ''
  const startAt = Date.now()

  // Stage 1: parse
  onStage?.('テキスト抽出中...')
  onProgress?.(5)
  throwIfAborted(signal)
  const p = await parseFile(file, (msg) => onStage?.(msg))
  let workText = p.text
  let originalRaw = p.text
  const format = p.format
  let pageCount = p.pageCount
  let sparsePages = p.sparsePages
  const pdfData = p.pdfData
  onProgress?.(20)

  // Stage 1.5: サーバーサイド pdftotext フォールバック（PDF全体を送るため Pro のみ）
  if (
    pdfData &&
    shouldUseServerPdfExtraction({
      isLite,
      format,
      hasPdfData: !!pdfData,
      sparsePageCount: sparsePages?.length || 0,
      pageCount: pageCount || 0,
    })
  ) {
    try {
      onStage?.('サーバー側PDF抽出中...')
      const pdfB64 = arrayBufferToBase64(pdfData)
      const res = await fetch('/api/pdf/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: pdfB64 }),
      })
      if (res.ok) {
        const { text: serverText, pageCount: sp } = (await res.json()) as {
          text?: string
          pageCount?: number
        }
        if (serverText && serverText.length > workText.length * 1.5) {
          workText = serverText
          originalRaw = serverText
          sparsePages = []
          if (sp) pageCount = sp
          onStage?.(`pdftotext: ${sp || '?'}ページ抽出完了`)
        }
      }
    } catch (e) {
      console.warn('pdftotext fallback failed:', e)
    }
  }

  // Stage 2: OCR for image-heavy PDF
  if (aiOn && format === 'PDF' && sparsePages && sparsePages.length > 0) {
    throwIfAborted(signal)
    onStage?.(`OCR対象: ${sparsePages.length}/${pageCount || '?'}ページ`)
    try {
      const ocrResults = await ocrSparsePages(
        pdfData,
        sparsePages,
        settings?.apiKey,
        formatModel,
        (msg) => onStage?.(msg),
      )
      if (Object.keys(ocrResults).length > 0) {
        originalRaw = workText
        workText = mergeOcrResults(workText, ocrResults)
      }
    } catch (e) {
      onStage?.(`OCRエラー: ${errorMessage(e) || '不明'}`)
    }
  }
  onProgress?.(40)

  // Stage 3: AI text cleanup for PDFs
  if (aiOn && format === 'PDF') {
    throwIfAborted(signal)
    onStage?.('AIテキスト再構成中...')
    try {
      const cleaned = await aiCleanupText(
        workText,
        settings?.apiKey,
        formatModel,
        (msg) => onStage?.(msg),
        runModels?.formatFallbackModel,
      )
      const origNonEmpty = workText.split('\n').filter((l) => l.trim().length > 0).length
      const cleanNonEmpty = cleaned
        ? cleaned.split('\n').filter((l) => l.trim().length > 0).length
        : 0
      if (
        cleaned &&
        cleanNonEmpty >= origNonEmpty * 0.5 &&
        cleaned.length > workText.length * 0.4
      ) {
        if (!originalRaw || originalRaw === workText) originalRaw = workText
        workText = cleaned
      }
    } catch {
      // 整形に失敗しても抽出テキストのまま検出へ進む
    }
  }
  onProgress?.(55)

  // Stage 4: regex + dictionary detection
  throwIfAborted(signal)
  onStage?.('PII検出中...')
  const dets = detectAll(workText, customKeywords)
  onProgress?.(70)

  // Stage 5: AI PII detection
  let allDets: AppDetection[] = dets
  if (aiOn) {
    throwIfAborted(signal)
    const detectModel = runModels?.detectModel || settings?.model || ''
    onStage?.(`AI PII検出中... (${detectModel})`)
    try {
      const aiRes = await detectWithAI(
        workText,
        settings?.apiKey,
        detectModel,
        runModels?.detectFallbackModel,
        (msg) => onStage?.(msg),
      )
      const aiDets = aiRes?.detections || []
      if (aiDets.length > 0) allDets = mergeDetections(dets, aiDets)
    } catch {
      // AI 検出が失敗してもルールベースの結果は返す
    }
  }
  onProgress?.(90)

  // Stage 6: apply mask config
  const wm = allDets.map((d) => ({
    ...d,
    enabled: maskConfig[d.category as keyof MaskConfig] !== false,
  }))
  const analysisMs = Date.now() - startAt
  onProgress?.(100)

  return {
    file_name: file.name,
    file_format: format,
    page_count: pageCount,
    text_preview: workText.slice(0, 8000),
    fullText: workText,
    rawText: originalRaw,
    sparsePageCount: sparsePages?.length || 0,
    detections: wm,
    stats: {
      total: wm.length,
      regex: wm.filter((d) => d.source === 'regex').length,
      dict: wm.filter((d) => d.source === 'dict').length,
      ai: wm.filter((d) => d.source === 'ai').length,
      heuristic: wm.filter((d) => d.source === 'heuristic').length,
    },
    fileSize: `${(file.size / 1024).toFixed(1)} KB`,
    isDemo: false,
    analysis_ms: analysisMs,
    maskOpts: {
      keepPrefecture: !!maskConfig.keepPrefecture,
      nameInitial: !!maskConfig.nameInitial,
    },
  }
}
