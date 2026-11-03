/**
 * catch した値から message を取り出す（AI タスク共通）
 *
 * catch 節の値は unknown なので、`e?.message` 相当を型安全に書くための小さな補助。
 * message が無い・文字列でない場合は undefined を返し、呼び出し側の `|| '不明'` 等に委ねる。
 */
export function errorMessage(e: unknown): string | undefined {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const { message } = e as { message: unknown }
    return typeof message === 'string' ? message : undefined
  }
  return undefined
}
