/**
 * OpenAI リクエストパラメータの決定ロジック
 *
 * `/api/ai` の Route Handler とテストで同じ実装を使うための純粋関数。
 * GPT-5 系はレスポンスの一部を隠れた推論トークンに使うため、
 * トークン上限と reasoning_effort / temperature の扱いが他モデルと異なる。
 */

/** GPT-5 系かどうか */
export function isGpt5Model(model: string): boolean {
  return model.startsWith('gpt-5')
}

/** max_completion_tokens の実効値（nano は 4000、その他 GPT-5 は 16000 が上限） */
export function resolveOpenAITokenLimit(model: string, requestedMax: number): number {
  const isGpt5 = isGpt5Model(model)
  const tokenLimit = isGpt5 && model.includes('nano') ? 4000 : isGpt5 ? 16000 : requestedMax
  return Math.min(requestedMax, tokenLimit)
}

/** reasoning_effort を付与すべきか（GPT-5 系のみ） */
export function shouldAddReasoningEffort(model: string): boolean {
  return isGpt5Model(model)
}

/** temperature を指定できるか（GPT-5 系は不可） */
export function supportsTemperature(model: string): boolean {
  return !isGpt5Model(model)
}

/** サーバー共用キー（ユーザーキー未提供）で利用できるモデルか */
export function isModelAllowedWithoutUserKey(
  provider: string,
  model: string,
  defaultOpenAIModel: string,
): boolean {
  if (provider === 'openai' && model !== defaultOpenAIModel) return false
  return true
}
