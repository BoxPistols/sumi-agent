import React from 'react'

/** テーマCSS変数を注入するデコレータ */
export function ThemeDecorator({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        :root, [data-theme="light"] {
          --rp-accent: #1C1917;
          --rp-accentDim: rgba(28,25,23,0.06);
          --rp-bg: #FAF9F6;
          --rp-bg2: #FFFFFF;
          --rp-surface: #FFFFFF;
          --rp-surfaceAlt: #F5F5F4;
          --rp-border: #D6D3D1;
          --rp-text: #1C1917;
          --rp-text2: #57534E;
          --rp-text3: #78716C;
        }
        [data-theme="dark"] {
          --rp-accent: #E7E5E4;
          --rp-accentDim: rgba(231,229,228,0.1);
          --rp-bg: #1C1917;
          --rp-bg2: #292524;
          --rp-surface: #292524;
          --rp-surfaceAlt: #44403C;
          --rp-border: #57534E;
          --rp-text: #E7E5E4;
          --rp-text2: #A8A29E;
          --rp-text3: #78716C;
        }
        body { font-family: 'Noto Sans JP','DM Sans',system-ui,sans-serif; }
      `}</style>
      <div style={{ padding: 24, background: 'var(--rp-bg)', minHeight: '100vh' }}>{children}</div>
    </>
  )
}
