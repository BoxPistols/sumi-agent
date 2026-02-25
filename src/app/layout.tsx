import type { Metadata, Viewport } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://sumi-agent.vercel.app'),
  title: 'Sumi - 経歴書の個人情報 自動検出・マスキング',
  description:
    '個人情報はブラウザの外に出ない。履歴書・職務経歴書のPIIを自動検出・マスキング。PDF/Word/Excel対応。',
  keywords: ['PII', 'マスキング', '個人情報', '履歴書', '経歴書', 'Sumi', '墨消し'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Sumi',
    statusBarStyle: 'black-translucent',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sumi - 経歴書の個人情報 自動検出・マスキング',
    description: '個人情報はブラウザの外に出ない。履歴書・職務経歴書のPIIを自動検出・マスキング。',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1C1917',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
