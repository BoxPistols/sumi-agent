/** 経過時間（ミリ秒）を「m:ss」または「h:mm:ss」で表す */
export function formatDuration(ms: number | null | undefined): string {
  const s = Math.max(0, Math.floor((ms || 0) / 1000))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return hh > 0 ? `${hh}:${two(mm)}:${two(ss)}` : `${mm}:${two(ss)}`
}
