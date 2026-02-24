import { ImageResponse } from 'next/og'
import { loadNotoSansJP, FONT_FAMILY } from './og-font'

export const alt = 'RedactPro - AI個人情報マスキングツール'
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
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        fontFamily: `"${FONT_FAMILY}", system-ui, sans-serif`,
      }}
    >
      {/* Left: Icon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 160,
          height: 160,
          background: 'linear-gradient(135deg, #4C85F6, #7C5CFF)',
          borderRadius: 36,
          marginRight: 48,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 90,
            height: 110,
            background: 'rgba(255,255,255,0.95)',
            borderRadius: 8,
            padding: '24px 12px 12px',
            gap: 10,
          }}
        >
          <div
            style={{
              width: '100%',
              height: 10,
              background: '#1E293B',
              borderRadius: 3,
              opacity: 0.85,
              display: 'flex',
            }}
          />
          <div
            style={{
              width: '75%',
              height: 7,
              background: '#CBD5E1',
              borderRadius: 3,
              display: 'flex',
            }}
          />
          <div
            style={{
              width: '100%',
              height: 10,
              background: '#1E293B',
              borderRadius: 3,
              opacity: 0.85,
              display: 'flex',
            }}
          />
          <div
            style={{
              width: '60%',
              height: 7,
              background: '#CBD5E1',
              borderRadius: 3,
              display: 'flex',
            }}
          />
        </div>
      </div>

      {/* Right: Text */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: '#F8FAFC',
            lineHeight: 1.1,
            display: 'flex',
          }}
        >
          RedactPro
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#94A3B8',
            lineHeight: 1.4,
            display: 'flex',
          }}
        >
          AI個人情報マスキングツール
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          {['PDF', 'Word', 'Excel', 'CSV', 'AI検出'].map((tag) => (
            <div
              key={tag}
              style={{
                padding: '6px 16px',
                background: 'rgba(76,133,246,0.15)',
                border: '1px solid rgba(76,133,246,0.3)',
                borderRadius: 20,
                color: '#93B5FC',
                fontSize: 18,
                fontWeight: 700,
                display: 'flex',
              }}
            >
              {tag}
            </div>
          ))}
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
