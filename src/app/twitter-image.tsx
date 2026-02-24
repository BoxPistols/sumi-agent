import { ImageResponse } from 'next/og'
import { loadNotoSansJP, FONT_FAMILY } from './og-font'

export const alt = 'Sumi - 経歴書の個人情報 自動検出・マスキング'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function TwitterImage() {
  const fontData = await loadNotoSansJP()

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1C1917',
        fontFamily: `"${FONT_FAMILY}", system-ui, sans-serif`,
      }}
    >
      {/* 幾何学ロゴマーク */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          width: 110,
          height: 110,
          background: '#E7E5E4',
          borderRadius: 22,
          padding: '0 22px',
          gap: 12,
          marginRight: 40,
        }}
      >
        <div
          style={{ width: 66, height: 13, background: '#1C1917', borderRadius: 3, display: 'flex' }}
        />
        <div
          style={{ width: 46, height: 13, background: '#1C1917', borderRadius: 3, display: 'flex' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 52, fontWeight: 800, color: '#E7E5E4', display: 'flex' }}>Sumi</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#78716C', display: 'flex' }}>
          個人情報はブラウザの外に出ない
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: FONT_FAMILY, data: fontData, style: 'normal' as const, weight: 700 as const },
      ],
    },
  )
}
