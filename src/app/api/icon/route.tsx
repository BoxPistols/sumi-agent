import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'

function IconContent({ s }: { s: number }) {
  const r = s * 0.22
  const docW = s * 0.5
  const docH = s * 0.65
  const pad = s * 0.12
  const barH = s * 0.055
  const lineH = s * 0.04
  const gap = s * 0.05

  return (
    <div
      style={{
        width: s,
        height: s,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #4C85F6, #7C5CFF)',
        borderRadius: r,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: docW,
          height: docH,
          background: 'rgba(255,255,255,0.95)',
          borderRadius: s * 0.04,
          padding: `${pad}px ${pad * 0.7}px ${pad * 0.6}px`,
          gap,
        }}
      >
        <div
          style={{
            width: '100%',
            height: barH,
            background: '#1E293B',
            borderRadius: s * 0.015,
            opacity: 0.85,
            display: 'flex',
          }}
        />
        <div
          style={{
            width: '75%',
            height: lineH,
            background: '#CBD5E1',
            borderRadius: s * 0.015,
            display: 'flex',
          }}
        />
        <div
          style={{
            width: '100%',
            height: barH,
            background: '#1E293B',
            borderRadius: s * 0.015,
            opacity: 0.85,
            display: 'flex',
          }}
        />
        <div
          style={{
            width: '60%',
            height: lineH,
            background: '#CBD5E1',
            borderRadius: s * 0.015,
            display: 'flex',
          }}
        />
      </div>
    </div>
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const sizeParam = searchParams.get('size')
  const s = sizeParam ? Math.min(Math.max(parseInt(sizeParam, 10) || 192, 16), 1024) : 192

  return new ImageResponse(<IconContent s={s} />, {
    width: s,
    height: s,
  })
}
