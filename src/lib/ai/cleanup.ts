/**
 * AI によるテキストの整形（PDF 抽出テキストの崩れ修正・マスキング済み文書の再構成）
 *
 * aiCleanupText はページ単位のバッチで崩れだけを直させ、情報が減った応答は採用しない（非破壊）。
 * aiReformat はマスキング済みテキストを指定フォーマットに組み直させる。
 */
import { callAI } from '@/lib/ai/client'
import { getProviderForModel } from '@/lib/constants'

// AI-based PDF text cleanup - processes per-page, non-destructive
export async function aiCleanupText(
  rawText: string,
  apiKey: string | undefined,
  model?: string | null,
  onProgress?: (message: string) => void,
  fallbackModel?: string | null,
): Promise<string | null> {
  const primaryModel = model || 'gpt-6-luna'
  const fbModel = fallbackModel && fallbackModel !== primaryModel ? fallbackModel : null

  // Split into pages
  const pageChunks = rawText.split(/(?=--- Page \d+ ---)/)
  if (pageChunks.length === 0) return null

  // Group pages into batches (~5000 chars each to stay within token limits)
  const batches: string[] = []
  let cur: string[] = []
  let curLen = 0
  for (const chunk of pageChunks) {
    const trimmed = chunk.trim()
    if (!trimmed) continue
    if (curLen + trimmed.length > 5000 && cur.length > 0) {
      batches.push(cur.join('\n\n'))
      cur = [trimmed]
      curLen = trimmed.length
    } else {
      cur.push(trimmed)
      curLen += trimmed.length
    }
  }
  if (cur.length > 0) batches.push(cur.join('\n\n'))

  const results: string[] = []
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    const pct = Math.round(((bi + 1) / batches.length) * 100)
    if (onProgress) onProgress(`AI再構成: ${pct}% (${bi + 1}/${batches.length}バッチ)`)
    // Skip batches that are mostly just page headers with no real content
    const contentLines = batch
      .split('\n')
      .filter((l) => !/^---\s*Page\s*\d+/.test(l) && l.trim().length > 0)
    if (contentLines.length < 2) {
      results.push(batch)
      continue
    }

    const runCleanup = async (m: string): Promise<string> => {
      const provider = getProviderForModel(m)
      return await callAI({
        provider,
        model: m,
        apiKey,
        maxTokens: 4000,
        messages: [
          {
            role: 'user',
            content: `以下はPDFから機械的に抽出したテキストです。レイアウト崩れを修正してください。

ルール：
1. 元の情報を変更・追加・削除しない。情報量を減らさない
2. 崩れた文字列を修正（例：「企 画」→「企画」、「デ ザ イ ン」→「デザイン」）
3. テーブル構造が崩れている場合、列と行を正しく対応させる
4. 「--- Page N ---」の区切りを必ず維持する
5. URLはそのまま維持
6. 空のページ（テキストが無いページ）でも「--- Page N ---」は残す
7. 再構成テキストのみを出力（説明文や前置きは不要）

テキスト：
${batch}`,
          },
        ],
      })
    }

    const normalizeCleaned = (rawCleaned: unknown): string => {
      if (!rawCleaned || typeof rawCleaned !== 'string') return ''
      // Strip AI preamble before first "--- Page" marker
      let cleaned = rawCleaned
      const firstPage = rawCleaned.indexOf('--- Page')
      if (firstPage > 0) cleaned = rawCleaned.slice(firstPage)
      return cleaned.trim()
    }

    const isValidCleaned = (cleaned: string): boolean => {
      if (!cleaned) return false
      const origLines = batch.split('\n').filter((l) => l.trim().length > 0).length
      const cleanLines = cleaned.split('\n').filter((l) => l.trim().length > 0).length
      return cleanLines >= origLines * 0.6 && cleaned.length > batch.length * 0.4
    }

    try {
      let rawCleaned = await runCleanup(primaryModel)
      let cleaned = normalizeCleaned(rawCleaned)

      // If invalid and we have a fallback model, retry once
      if (!isValidCleaned(cleaned) && fbModel) {
        if (onProgress) onProgress(`AI再構成: ${pct}% — ${fbModel} で再試行中...`)
        try {
          rawCleaned = await runCleanup(fbModel)
          const fbCleaned = normalizeCleaned(rawCleaned)
          if (isValidCleaned(fbCleaned)) cleaned = fbCleaned
        } catch {
          // 代替モデルも失敗したら一次モデルの結果（無効なら元のバッチ）で続行する
        }
      }

      if (isValidCleaned(cleaned)) results.push(cleaned)
      else results.push(batch)
    } catch {
      // Network/model error: fallback once if available
      if (fbModel) {
        try {
          if (onProgress) onProgress(`AI再構成: ${pct}% — ${fbModel} で再試行中...`)
          const rawCleaned = await runCleanup(fbModel)
          const cleaned = normalizeCleaned(rawCleaned)
          if (isValidCleaned(cleaned)) {
            results.push(cleaned)
            continue
          }
        } catch {
          // 代替モデルも失敗したら元のバッチをそのまま残す（整形は任意の改善なので失敗させない）
        }
      }
      results.push(batch)
    }
  }

  const final = results.join('\n\n').trim()
  // Final validation: result must retain most of original content
  const origLineCount = rawText.split('\n').filter((l) => l.trim().length > 0).length
  const finalLineCount = final.split('\n').filter((l) => l.trim().length > 0).length
  if (finalLineCount < origLineCount * 0.5) {
    return null // Too much content lost, reject AI cleanup
  }
  return final
}

// ═══ AI Reformat ═══
export async function aiReformat(
  redactedText: string,
  instruction: string,
  apiKey: string | undefined,
  model: string,
): Promise<string> {
  const provider = getProviderForModel(model)
  return await callAI({
    provider,
    model: model || 'gpt-6-luna',
    apiKey,
    maxTokens: 4000,
    messages: [
      {
        role: 'user',
        content: `あなたは人材紹介エージェントの書類作成アシスタントです。以下は個人情報をマスキング済みの職務経歴書テキストです。指定されたフォーマット指示に従って再構成してください。\n\n【重要】\n- [氏名非公開]等のマスキング箇所はそのまま維持\n- 新たな個人情報を推測・追加しない\n- 内容の事実を変更しない\n\n【フォーマット指示】\n${instruction}\n\n【マスキング済みテキスト】\n${redactedText.slice(0, 6000)}`,
      },
    ],
  })
}
