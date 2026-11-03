/**
 * /api/ai（サーバー側の中継）を呼ぶクライアント
 *
 * API キーはサーバー側の環境変数か、利用者が設定画面で入力したものだけを使う。
 * 共用キーの残り回数はレスポンスに載ってくるので、購読している画面へ配る。
 */

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: unknown
}

export interface CallAIParams {
  provider: string
  model: string
  messages: AIMessage[]
  maxTokens?: number
  apiKey?: string
  system?: string
  localEndpoint?: string
}

export interface RateLimitInfo {
  remaining: number
  limit: number
  /** 共用キーの回数がリセットされる時刻（epoch ms）。アドバイザー経由では付かないことがある */
  resetAt?: number
}

type RateLimitListener = (rl: RateLimitInfo) => void

let rateLimitListeners: RateLimitListener[] = []

/** 共用キーの残り回数が更新されたら呼ばれる。戻り値で購読を解除する */
export function onRateLimitUpdate(fn: RateLimitListener): () => void {
  rateLimitListeners.push(fn)
  return () => {
    rateLimitListeners = rateLimitListeners.filter((f) => f !== fn)
  }
}

/** /api/ai 以外の経路（アドバイザー等）で得た残り回数も同じ購読者へ配る */
export function notifyRateLimit(rl: RateLimitInfo): void {
  rateLimitListeners.forEach((fn) => fn(rl))
}

interface AIResponseBody {
  text?: string
  remaining?: number
  limit?: number
  resetAt?: number
  error?: string
}

export async function callAI({
  provider,
  model,
  messages,
  maxTokens = 4000,
  apiKey,
  system,
  localEndpoint,
}: CallAIParams): Promise<string> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, messages, maxTokens, system, apiKey, localEndpoint }),
  })
  if (!res.ok) {
    const e = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as AIResponseBody
    throw new Error(e.error || `AI API error: ${res.status}`)
  }
  const d = (await res.json()) as AIResponseBody
  if (typeof d.remaining === 'number' && typeof d.limit === 'number') {
    const rl: RateLimitInfo = { remaining: d.remaining, limit: d.limit, resetAt: d.resetAt || 0 }
    notifyRateLimit(rl)
  }
  return d.text || ''
}
