import { ImageResponse } from 'next/og'
import { loadNotoSansJP, FONT_FAMILY } from './og-font'

export const alt = 'RedactPro - AI個人情報マスキングツール'
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
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        fontFamily: `"${FONT_FAMILY}", system-ui, sans-serif`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 120,
          height: 120,
          background: 'linear-gradient(135deg, #4C85F6, #7C5CFF)',
          borderRadius: 28,
          marginRight: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 68,
            height: 86,
            background: 'rgba(255,255,255,0.95)',
            borderRadius: 6,
            padding: '18px 10px 10px',
            gap: 8,
          }}
        >
          <div
            style={{
              width: '100%',
              height: 8,
              background: '#1E293B',
              borderRadius: 2,
              opacity: 0.85,
              display: 'flex',
            }}
          />
          <div
            style={{
              width: '75%',
              height: 6,
              background: '#CBD5E1',
              borderRadius: 2,
              display: 'flex',
            }}
          />
          <div
            style={{
              width: '100%',
              height: 8,
              background: '#1E293B',
              borderRadius: 2,
              opacity: 0.85,
              display: 'flex',
            }}
          />
          <div
            style={{
              width: '60%',
              height: 6,
              background: '#CBD5E1',
              borderRadius: 2,
              display: 'flex',
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 52, fontWeight: 800, color: '#F8FAFC', display: 'flex' }}>
          RedactPro
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#94A3B8', display: 'flex' }}>
          AI個人情報マスキングツール
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
