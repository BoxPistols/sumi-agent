/**
 * ローカルAI（Ollama / LM Studio / LocalAI）ユーティリティ
 * - SSRF防止のエンドポイント検証
 * - OpenAI互換APIリクエスト構築
 */

/** ContentBlock 型（route.ts と共有） */
export interface LocalAIContentBlock {
  type: string
  text?: string
  [key: string]: unknown
}

/** メッセージ型 */
export interface LocalAIMessage {
  role: string
  content: string | LocalAIContentBlock[]
}

/**
 * ローカルAIエンドポイントのSSRF防止: ループバックのみ許可
 *
 * 0.0.0.0 は「全インターフェース」を指し、環境によってループバック以外へ
 * 解決されうるため許可しない。
 */
export function isAllowedLocalEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
  } catch {
    return false
  }
}

/**
 * エラー表示用にエンドポイントを最小化する（認証情報・パス・クエリを除去）
 * 返すのは `http://localhost:11434` のようなオリジンのみ。
 */
export function sanitizeEndpointForDisplay(endpoint: string): string | null {
  try {
    const url = new URL(endpoint)
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

/** リダイレクトを手動で辿り、各遷移先がループバックであることを検証する */
export async function fetchLocalWithRedirectGuard(
  url: string,
  init: RequestInit,
  doFetch: (u: string, i: RequestInit) => Promise<Response>,
  maxRedirects = 3,
): Promise<Response> {
  let currentUrl = url
  for (let i = 0; i <= maxRedirects; i++) {
    if (!isAllowedLocalEndpoint(currentUrl)) {
      throw new Error('ローカルAIの遷移先がループバック以外を指しています')
    }
    const res = await doFetch(currentUrl, { ...init, redirect: 'manual' })
    // 3xx 以外はそのまま返す
    if (res.status < 300 || res.status >= 400) return res
    const location = res.headers.get('location')
    if (!location) return res
    currentUrl = new URL(location, currentUrl).toString()
  }
  throw new Error('ローカルAIのリダイレクト回数が上限を超えました')
}

/** エンドポイントから /chat/completions URL を構築（末尾スラッシュ正規化） */
export function buildLocalChatUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, '')}/chat/completions`
}

/** ローカルAI用メッセージ変換（ContentBlock[] → テキスト抽出） */
export function buildLocalMessages(
  messages: LocalAIMessage[],
  system?: string,
): Array<{ role: string; content: string }> {
  const msgs: Array<{ role: string; content: string }> = []
  if (system) msgs.push({ role: 'system', content: system })
  for (const m of messages) {
    if (typeof m.content === 'string') {
      msgs.push({ role: m.role, content: m.content })
    } else {
      const text = m.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n')
      msgs.push({ role: m.role, content: text })
    }
  }
  return msgs
}

/** ローカルAI用リクエストボディ構築 */
export function buildLocalRequestBody(
  model: string,
  messages: LocalAIMessage[],
  maxTokens: number,
  system?: string,
): Record<string, unknown> {
  const msgs = buildLocalMessages(messages, system)
  const localModel = model === 'local-auto' ? undefined : model
  const body: Record<string, unknown> = { messages: msgs, max_tokens: maxTokens }
  if (localModel) body.model = localModel
  return body
}
