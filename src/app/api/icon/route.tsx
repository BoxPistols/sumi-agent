import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'

function IconContent({ s }: { s: number }) {
  const r = s * 0.19
  const px = s * 0.19
  const barH = s * 0.125
  const gap = s * 0.08
  const barR = s * 0.03

  return (
    <div
      style={{
        width: s,
        height: s,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: '#1C1917',
        borderRadius: r,
        padding: `0 ${px}px`,
        gap,
      }}
    >
      <div
        style={{
          width: '100%',
          height: barH,
          background: '#FAF9F6',
          borderRadius: barR,
          display: 'flex',
        }}
      />
      <div
        style={{
          width: '70%',
          height: barH,
          background: '#FAF9F6',
          borderRadius: barR,
          display: 'flex',
        }}
      />
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
