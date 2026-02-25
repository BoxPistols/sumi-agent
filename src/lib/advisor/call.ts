/**
 * 経歴書アドバイザー: AI呼び出しラッパー
 *
 * 既存の /api/ai エンドポイントを利用し、会話履歴+経歴書コンテキストを構築してAIに送信する。
 * modelMode='auto' 時はタスク複雑度に応じてnano/miniを動的に選択する。
 */

import { getProviderForModel } from '@/lib/constants'
import { ADVISOR_SYSTEM_PROMPT } from './prompts'
import { assessComplexity, selectModel, recordCost, MODEL_COSTS } from './model-selector'
import type { AdvisorMessage } from './types'

const MAX_HISTORY = 10
const MAX_TOKENS = 4000

interface CallAdvisorParams {
  messages: AdvisorMessage[]
  context: string
  apiKey?: string
  model?: string
  modelMode?: 'auto' | 'manual'
  presetId?: string
  jobDescription?: string
}

export interface CallAdvisorResult {
  text: string
  modelUsed: string
  modelLabel: string
  costYen: number
  rateLimit?: { remaining: number; limit: number; resetAt?: number }
}

/**
 * アドバイザーAI呼び出し
 *
 * @returns AIの応答テキスト + 使用モデル情報
 * @throws {Error} API呼び出し失敗時
 */
export async function callAdvisor(params: CallAdvisorParams): Promise<CallAdvisorResult> {
  const { messages, context, apiKey, model, modelMode = 'auto', presetId, jobDescription } = params

  // モデル選択
  let modelId: string
  if (modelMode === 'auto') {
    const lastUserMsg = messages[messages.length - 1]
    const complexity = assessComplexity({
      userMessage: lastUserMsg?.content || '',
      presetId,
      messageCount: messages.filter((m) => m.role === 'user').length - 1,
      hasJobDescription: !!jobDescription,
      contextLength: context.length,
    })
    modelId = selectModel(complexity)
  } else {
    modelId = model || 'gpt-5-nano'
  }

  const provider = getProviderForModel(modelId)

  // システムプロンプト + 経歴書コンテキスト
  let system = ADVISOR_SYSTEM_PROMPT + '\n\n' + context
  if (jobDescription) {
    system += `\n\n【参考: 求人票】\n${jobDescription.slice(0, 3000)}`
  }

  // rewrite-full: 全文生成用の指示を追加
  if (presetId === 'rewrite-full') {
    system +=
      '\n\n【重要な指示】改善後の経歴書テキスト全文のみを出力してください。Markdown見出し・箇条書きによる説明・コメント・前置き・後書きは一切不要です。元テキストと同じ構造で、改善後のプレーンテキストのみを返してください。'
  }

  // rewrite-full の場合は maxTokens を拡張
  const tokens = presetId === 'rewrite-full' ? 8000 : MAX_TOKENS

  // 会話履歴を直近N件に制限
  const recentMessages = messages.slice(-MAX_HISTORY)
  const apiMessages = recentMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      model: modelId,
      messages: apiMessages,
      maxTokens: tokens,
      system,
      apiKey,
    }),
  })

  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(e.error || `AI API error: ${res.status}`)
  }

  // コスト記録
  recordCost(modelId)
  const costInfo = MODEL_COSTS[modelId] || { costYen: 0.1, label: modelId, tier: 'nano' }

  const d = await res.json()
  return {
    text: d.text || '',
    modelUsed: modelId,
    modelLabel: costInfo.label,
    costYen: costInfo.costYen,
    rateLimit:
      typeof d.remaining === 'number'
        ? { remaining: d.remaining, limit: d.limit, resetAt: d.resetAt }
        : undefined,
  }
}
