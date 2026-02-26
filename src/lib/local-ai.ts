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

/** ローカルAIエンドポイントのSSRF防止: localhost/127.0.0.1のみ許可 */
export function isAllowedLocalEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    const host = url.hostname.toLowerCase()
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1' ||
      host === '0.0.0.0'
    )
  } catch {
    return false
  }
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
