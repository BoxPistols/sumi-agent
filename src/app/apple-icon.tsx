import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: '#1C1917',
        borderRadius: 36,
        padding: '0 34px',
        gap: 14,
      }}
    >
      <div
        style={{ width: 112, height: 22, background: '#FAF9F6', borderRadius: 5, display: 'flex' }}
      />
      <div
        style={{ width: 80, height: 22, background: '#FAF9F6', borderRadius: 5, display: 'flex' }}
      />
    </div>,
    { ...size },
  )
}
