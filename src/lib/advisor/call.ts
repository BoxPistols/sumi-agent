/**
 * 経歴書アドバイザー: AI呼び出しラッパー
 *
 * 既存の /api/ai エンドポイントを利用し、会話履歴+経歴書コンテキストを構築してAIに送信する。
 */

import { getProviderForModel } from '@/lib/constants'
import { ADVISOR_SYSTEM_PROMPT } from './prompts'
import type { AdvisorMessage } from './types'

const MAX_HISTORY = 10
const MAX_TOKENS = 4000

interface CallAdvisorParams {
  messages: AdvisorMessage[]
  context: string
  apiKey?: string
  model?: string
  jobDescription?: string
}

/**
 * アドバイザーAI呼び出し
 *
 * @returns AIの応答テキスト
 * @throws {Error} API呼び出し失敗時
 */
export async function callAdvisor(params: CallAdvisorParams): Promise<string> {
  const { messages, context, apiKey, model, jobDescription } = params
  const modelId = model || 'claude-sonnet-4-20250514'
  const provider = getProviderForModel(modelId)

  // システムプロンプト + 経歴書コンテキスト
  let system = ADVISOR_SYSTEM_PROMPT + '\n\n' + context
  if (jobDescription) {
    system += `\n\n【参考: 求人票】\n${jobDescription.slice(0, 3000)}`
  }

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
      maxTokens: MAX_TOKENS,
      system,
      apiKey,
    }),
  })

  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(e.error || `AI API error: ${res.status}`)
  }

  const d = await res.json()
  return d.text || ''
}
