'use client'
/**
 * PDF プレビュー・編集モーダル。
 * マスキング済みテキストを最終確認・編集し、A4 の HTML を印刷（PDF 保存）・Word・HTML・テキストとして書き出す。
 */
import { useEffect, useMemo, useState } from 'react'
import s from '@/app/redact-pro.module.css'
import { Btn } from '@/components/redact/ui'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { fileTimestamp } from '@/lib/export'
import { generatePDFHTML } from '@/lib/resume-html'
import type { FontType } from '@/lib/resume-html'
import { T } from '@/lib/theme'

export interface DesignExportModalProps {
  text: string
  /** 呼び出し側が渡しているが、このモーダルは AI を使わないため参照しない */
  apiKey?: string
  /** 呼び出し側が渡しているが、このモーダルは AI を使わないため参照しない */
  model?: string
  onClose: () => void
  /** ダウンロード時のファイル名（拡張子なし）。未指定なら redacted_<日時> */
  baseName?: string
}

export function DesignExportModal({
  text,
  onClose,
  baseName: baseNameProp,
}: DesignExportModalProps) {
  const trapRef = useFocusTrap<HTMLDivElement>()
  const exportBase = baseNameProp || 'redacted_' + fileTimestamp()
  const [editText, setEditText] = useState(text)
  const [fontType, setFontType] = useState<FontType>('gothic')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const htmlContent = useMemo(() => generatePDFHTML(editText, fontType), [editText, fontType])

  const handleExport = () => {
    // Open as self-printing HTML in a new tab
    const printHTML = htmlContent.replace(
      '</body>',
      `<script>window.onload=function(){window.print();setTimeout(()=>{window.close()},1000)}</script></body>`,
    )
    const blob = new Blob([printHTML], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
  }

  const handleDownloadHTML = () => {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = exportBase + '.html'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }

  const handleDownloadWord = () => {
    const wordHTML = htmlContent
      .replace('<!DOCTYPE html>', '')
      .replace(
        '<html lang="ja">',
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ja">',
      )
      .replace(
        '<head>',
        '<head><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->',
      )
    const bom = '\uFEFF'
    const blob = new Blob([bom + wordHTML], { type: 'application/msword;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = exportBase + '.docx'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }

  const handleCopyText = () => {
    navigator.clipboard.writeText(editText).then(() => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const charCount = editText.length
  const lineCount = editText.split('\n').length

  return (
    <div className={s['design-overlay']} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="PDF プレビュー・編集"
        className={s['design-dialog']}
      >
        {/* Header */}
        <div className={s['design-header']}>
          <div className={s['design-header-left']}>
            <span style={{ fontSize: 16 }}>📄</span>
            <div>
              <div className={s['design-header-title']}>PDF プレビュー・編集</div>
              <div className={s['settings-sublabel']}>最終確認 → テキスト編集 → 出力</div>
            </div>
          </div>
          <div className={s['design-header-right']}>
            <span className={s['settings-sublabel']} style={{ fontFamily: T.mono }}>
              {lineCount}行 / {charCount}文字
            </span>
            <button onClick={onClose} aria-label="閉じる" className={s['design-close-btn']}>
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={s['design-body']}>
          {/* Left: Editor */}
          <div className={`rp-design-controls ${s['design-editor']}`}>
            {/* Toolbar */}
            <div className={s['design-toolbar']}>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>フォント</span>
              <button
                onClick={() => setFontType('gothic')}
                className={s['design-font-btn']}
                data-active={fontType === 'gothic'}
              >
                ゴシック
              </button>
              <button
                onClick={() => setFontType('mincho')}
                className={s['design-font-btn']}
                data-active={fontType === 'mincho'}
              >
                明朝
              </button>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleCopyText}
                aria-live="polite"
                className={s['design-copy-btn']}
                style={{ color: saved ? T.green : T.text3 }}
              >
                {saved ? '✓ コピー済' : '📋 コピー'}
              </button>
            </div>
            {/* Tips */}
            <div className={s['design-tips']}>
              <span style={{ fontWeight: 600, color: T.text2 }}>記法: </span>
              <code
                style={{
                  background: T.surface,
                  padding: '1px 4px',
                  borderRadius: 3,
                  fontFamily: T.mono,
                }}
              >
                **太字**
              </code>
              <code
                style={{
                  background: T.surface,
                  padding: '1px 4px',
                  borderRadius: 3,
                  fontFamily: T.mono,
                  marginLeft: 6,
                }}
              >
                # 見出し
              </code>
              <code
                style={{
                  background: T.surface,
                  padding: '1px 4px',
                  borderRadius: 3,
                  fontFamily: T.mono,
                  marginLeft: 6,
                }}
              >
                ## 小見出し
              </code>
              　<span style={{ opacity: 0.6 }}>非公開タグは自動除去</span>
            </div>
            {/* Textarea */}
            <textarea
              aria-label="HTMLソースを編集"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              spellCheck={false}
              className={s['design-textarea']}
            />
            {/* Actions */}
            <div className={s['design-actions']}>
              <Btn
                onClick={handleExport}
                style={{
                  width: '100%',
                  borderRadius: 10,
                  fontSize: 13,
                  background: T.accent,
                  color: T.bg,
                  gap: 6,
                }}
              >
                🖨️ PDFとして印刷・保存
              </Btn>
              <div className={s['design-actions-hint']}>
                <span>🖨️</span>{' '}
                別タブで開き、ブラウザの印刷ダイアログから「PDFとして保存」を選択してください
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn
                  variant="ghost"
                  onClick={handleDownloadWord}
                  style={{ flex: 1, borderRadius: 8, fontSize: 12, padding: '9px 8px' }}
                >
                  Word (.docx)
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={handleDownloadHTML}
                  style={{ flex: 1, borderRadius: 8, fontSize: 12, padding: '9px 8px' }}
                >
                  HTML
                </Btn>
                <Btn
                  variant="ghost"
                  onClick={handleCopyText}
                  style={{ flex: 1, borderRadius: 8, fontSize: 12, padding: '9px 8px' }}
                >
                  {saved ? '✓ コピー済' : '📋 テキスト'}
                </Btn>
              </div>
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className={s['design-preview-area']}>
            <div className={s['design-preview-page']}>
              <iframe
                srcDoc={htmlContent}
                sandbox="allow-same-origin"
                style={{
                  width: '100%',
                  minHeight: 842,
                  border: 'none',
                  pointerEvents: 'none',
                }}
                title="Preview"
                onLoad={(e) => {
                  const frame = e.currentTarget
                  try {
                    const h = frame.contentDocument?.documentElement?.scrollHeight
                    if (h && h > 842) frame.style.height = h + 'px'
                  } catch {
                    // 高さ合わせは見た目の調整だけなので、読めない場合は最小高さのまま表示する
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
