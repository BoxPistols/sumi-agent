import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'RedactPro - AI個人情報マスキングツール',
  description:
    '日本語履歴書・職務経歴書の個人情報を自動検出・マスキング。PDF/Word/Excel/16形式対応。',
  keywords: ['PII', 'マスキング', '個人情報', '履歴書', 'AI', '日本語'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'RedactPro',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4C85F6',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
