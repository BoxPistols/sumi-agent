/**
 * 設定モーダルの表示用ロジック（純関数）
 *
 * API キーの伏せ字表示、プロバイダーごとの入力欄プレースホルダー、接続テスト結果の文言、
 * /api/ai が返す利用回数（サーバー共用キー）の判定と使用率を扱う。
 */

/** /api/ai（GET）が返すサーバー共用キーの利用状況 */
export interface RateInfo {
  used: number
  limit: number
  remaining: number
}

/** used が数値なら利用状況として扱う（それ以外の応答は無視して表示しない） */
export function isRateInfo(d: unknown): d is RateInfo {
  return typeof d === 'object' && d !== null && typeof (d as { used?: unknown }).used === 'number'
}

/** 入力済みキーを先頭8文字…末尾4文字で見せる。未入力なら空文字 */
export function maskApiKey(apiKey: string): string {
  return apiKey ? apiKey.slice(0, 8) + '...' + apiKey.slice(-4) : ''
}

export function getKeyPlaceholder(provider: string): string {
  return provider === 'openai'
    ? 'sk-proj-...（未入力ならサーバー環境変数）'
    : provider === 'google'
      ? 'AIza...（必須）'
      : '不要（ローカルAI）'
}

/**
 * 接続テスト成功時の文言。
 * ローカルAIはモデル名ではなく、実際に検証したエンドポイントを示す。
 */
export function buildConnectionOkMessage(params: {
  provider: string
  providerLabel: string
  model: string
  localEndpoint: string
  reply: string | null | undefined
}): string {
  const { provider, providerLabel, model, localEndpoint, reply } = params
  const short = (reply || '').replace(/\s+/g, ' ').trim().slice(0, 48)
  const target =
    provider === 'local'
      ? `${providerLabel} / ${localEndpoint.trim() || '既定のエンドポイント'}`
      : `${providerLabel} / ${model}`
  return `接続OK (${target})${short ? ` 返答: ${short}` : ''}`
}

/** 利用回数バーの幅（%）。上限超過でも 100 で止める */
export function rateUsagePercent(info: RateInfo): number {
  return Math.min(100, (info.used / info.limit) * 100)
}
