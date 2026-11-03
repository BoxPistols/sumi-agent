/**
 * AI による個人情報（人名・SNS アカウント）の検出
 *
 * 正規表現では拾いにくい人名・SNS アカウントだけを AI に抽出させ、
 * 本文に実在する文字列だけを検出結果として返す。失敗時は代替モデルで 1 回だけ再試行する。
 */
import { callAI } from '@/lib/ai/client'
import { errorMessage } from '@/lib/ai/error-message'
import { getProviderForModel } from '@/lib/constants'
import type { AppDetection } from '@/lib/redact-engine'

/** AI 検出が生成する検出結果（source は常に 'ai'） */
export type AIDetection = AppDetection & { source: 'ai' }

export type AIDetectionParseResult =
  | { ok: true; items: unknown[] }
  | { ok: false; reason: 'empty' | 'no_json' | 'not_array' | 'json_parse' }

export interface DetectWithAIResult {
  detections: AIDetection[]
  usedModel: string
  fallbackUsed: boolean
  error?: string
}

type RunResult =
  | { ok: true; results: AIDetection[]; rawLen: number }
  | { ok: false; reason: string; rawLen: number }

export function ensureUniqueDetectionIds<T extends { id?: unknown }>(
  detections: readonly T[],
): (T & { id: string })[] {
  const seenIds = new Map<string, number>()
  return detections.map((d, index) => {
    const baseId = typeof d.id === 'string' && d.id.trim() ? d.id : `d_${index}`
    const count = seenIds.get(baseId) || 0
    seenIds.set(baseId, count + 1)
    return count === 0 ? { ...d, id: baseId } : { ...d, id: `${baseId}__${count}` }
  })
}

// ═══ AI-Based PII Detection ═══
export function parseAIDetectionJson(raw: unknown): AIDetectionParseResult {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'empty' }
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return { ok: false, reason: 'no_json' }
  try {
    const items: unknown = JSON.parse(jsonMatch[0])
    if (!Array.isArray(items)) return { ok: false, reason: 'not_array' }
    return { ok: true, items }
  } catch {
    return { ok: false, reason: 'json_parse' }
  }
}

export async function detectWithAI(
  text: string,
  apiKey: string | undefined,
  model: string,
  fallbackModel?: string | null,
  onProgress?: (message: string) => void,
): Promise<DetectWithAIResult> {
  const truncated = text.slice(0, 8000)
  const prompt = `以下の日本語テキストから個人を特定できる情報（PII）を全て抽出してJSON配列で返してください。

検出対象：
- person_name: 人名（姓名、フルネーム。フリガナも別エントリで）
  重要：「マーケター」「エンジニア」「デザイナー」等の職種名は人名ではありません
  重要：「朝霧デザイン」等の屋号・サービス名は人名ではありません
- sns_account: SNSアカウント名・ユーザーID
  検出パターン例：
  - @username（Twitter/X、Instagram等）
  - GitHub: username または @username
  - LinkedIn: /in/username
  - Facebook: ユーザー名
  - その他 @ で始まるユーザー名
  重要：メールアドレスの @ は検出しない（別途検出済み）
  重要：URL内の @ は検出しない（別途検出済み）

以下の情報は検出不要（別途正規表現で検出済み）：
- メールアドレス、電話番号、住所、URL、生年月日、郵便番号、マイナンバー

レスポンス形式（JSON配列のみ、他のテキスト不要）：
[{"type":"person_name","value":"検出した文字列"},{"type":"sns_account","value":"@xxx"}]

テキスト：
${truncated}`

  const runOnce = async (m: string): Promise<RunResult> => {
    const provider = getProviderForModel(m)
    const raw = await callAI({
      provider,
      model: m || 'gpt-6-luna',
      apiKey,
      maxTokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })
    const parsed = parseAIDetectionJson(raw)
    if (!parsed.ok)
      return {
        ok: false,
        reason: parsed.reason,
        rawLen: (raw || '').length,
      }
    const results: AIDetection[] = []
    const seen = new Set<string>()
    for (const item of parsed.items) {
      if (!item || typeof item !== 'object') continue
      const { value, type } = item as { value?: unknown; type?: unknown }
      if (typeof value !== 'string' || value.length < 2) continue
      if (typeof type !== 'string') continue
      const k = `ai:${type}:${value}`
      if (seen.has(k)) continue
      seen.add(k)
      if (type === 'person_name') {
        if (text.includes(value)) {
          results.push({
            id: `ai_${results.length}`,
            type: 'name_ai',
            label: '氏名（AI検出）',
            category: 'name',
            value,
            source: 'ai',
            confidence: 0.95,
            enabled: true,
          })
        }
      } else if (type === 'sns_account') {
        if (text.includes(value)) {
          results.push({
            id: `ai_sns_${results.length}`,
            type: 'sns_ai',
            label: 'SNSアカウント',
            category: 'contact',
            value,
            source: 'ai',
            confidence: 0.9,
            enabled: true,
          })
        }
      }
    }
    return { ok: true, results, rawLen: (raw || '').length }
  }

  let primary: RunResult
  try {
    primary = await runOnce(model)
    if (primary.ok)
      return {
        detections: primary.results,
        usedModel: model,
        fallbackUsed: false,
      }
  } catch (e) {
    primary = { ok: false, reason: errorMessage(e) || 'error', rawLen: 0 }
  }
  // ここに来るのは primary が失敗したときだけ
  const primaryReason = primary.ok ? undefined : primary.reason

  if (fallbackModel && fallbackModel !== model) {
    try {
      if (onProgress) onProgress(`AI PII検出: ${fallbackModel} で再試行中...`)
      const fb = await runOnce(fallbackModel)
      if (fb.ok)
        return {
          detections: fb.results,
          usedModel: fallbackModel,
          fallbackUsed: true,
        }
      return {
        detections: [],
        usedModel: fallbackModel,
        fallbackUsed: true,
        error: `AI検出失敗(${model}→${fallbackModel}): ${primaryReason || '不明'}`,
      }
    } catch (e) {
      return {
        detections: [],
        usedModel: fallbackModel,
        fallbackUsed: true,
        error: `AI検出失敗(${model}→${fallbackModel}): ${errorMessage(e) || '不明'}`,
      }
    }
  }

  return {
    detections: [],
    usedModel: model,
    fallbackUsed: false,
    error: `AI検出失敗(${model}): ${primaryReason || '不明'}`,
  }
}
