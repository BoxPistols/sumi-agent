/**
 * 経歴書アドバイザー: コンテキスト生成
 *
 * 経歴書テキスト + 検出結果サマリーをAIに渡すコンテキスト文字列に変換する。
 */

interface Detection {
  category: string
  label: string
  enabled: boolean
}

interface ContextParams {
  originalText: string
  redactedText: string
  detections: Detection[]
  fileName: string
  format: string
  pageCount?: number
  useRedacted?: boolean
}

const MAX_TEXT_LENGTH = 6000

/**
 * 検出結果をカテゴリ別件数の要約文字列に変換
 */
function summarizeDetections(detections: Detection[]): string {
  const counts: Record<string, number> = {}
  for (const d of detections) {
    const cat = d.label || d.category || '不明'
    counts[cat] = (counts[cat] || 0) + 1
  }
  if (Object.keys(counts).length === 0) return 'なし'
  return Object.entries(counts)
    .map(([k, v]) => `${k}: ${v}件`)
    .join(', ')
}

/**
 * AIに渡すコンテキスト文字列を構築
 */
export function buildAdvisorContext(params: ContextParams): string {
  const sourceText = params.useRedacted ? params.redactedText : params.originalText
  const origTrunc =
    sourceText.length > MAX_TEXT_LENGTH
      ? sourceText.slice(0, MAX_TEXT_LENGTH) + '\n...(以下省略)'
      : sourceText

  const detSummary = summarizeDetections(params.detections)

  return `【経歴書データ】
ファイル: ${params.fileName} (${params.format}${params.pageCount ? `, ${params.pageCount}ページ` : ''})
PII検出結果: ${detSummary}
検出総数: ${params.detections.length}件（マスク有効: ${params.detections.filter((d) => d.enabled).length}件）

【経歴書テキスト】
${origTrunc}`
}
