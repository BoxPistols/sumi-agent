/** OG / Twitter 画像用の日本語フォントローダー（サブセット） */

// OG/Twitter 画像内で使用する日本語テキストを列挙
const JP_TEXT = '経歴書の個人情報自動検出・マスキングブラウザ完結外に出ない墨'

/**
 * Google Fonts から必要文字のみサブセットした Noto Sans JP を取得。
 * 静的生成時に一度だけ fetch されキャッシュされる。
 */
export async function loadNotoSansJP(): Promise<ArrayBuffer> {
  const url =
    'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap&text=' +
    encodeURIComponent(JP_TEXT)
  const css = await fetch(url, { next: { revalidate: 86400 } }).then((r) => r.text())
  const match = css.match(/url\(([^)]+)\)/)
  if (!match) {
    throw new Error('Failed to extract Noto Sans JP font URL from Google Fonts CSS')
  }
  return fetch(match[1]).then((r) => r.arrayBuffer())
}

export const FONT_FAMILY = 'Noto Sans JP'
