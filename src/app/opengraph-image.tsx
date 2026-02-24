import { ImageResponse } from 'next/og'
import { loadNotoSansJP, FONT_FAMILY } from './og-font'

export const alt = 'Sumi - 経歴書の個人情報 自動検出・マスキング'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage() {
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
      {/* Left: 幾何学ロゴマーク */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          width: 140,
          height: 140,
          background: '#E7E5E4',
          borderRadius: 28,
          padding: '0 28px',
          gap: 16,
          marginRight: 48,
        }}
      >
        <div
          style={{ width: 84, height: 16, background: '#1C1917', borderRadius: 4, display: 'flex' }}
        />
        <div
          style={{ width: 60, height: 16, background: '#1C1917', borderRadius: 4, display: 'flex' }}
        />
      </div>

      {/* Right: Text */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: '#E7E5E4',
            lineHeight: 1.1,
            display: 'flex',
          }}
        >
          Sumi
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: '#A8A29E',
            lineHeight: 1.4,
            display: 'flex',
          }}
        >
          経歴書の個人情報 自動検出・マスキング
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#78716C',
            lineHeight: 1.4,
            display: 'flex',
          }}
        >
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
