'use client'
/**
 * 書き出しプレビューモーダル。
 * 出力形式（txt / md / csv / xlsx / pdf / docx）ごとの見た目をプレビューし、テキストの確認・編集・コピー・ダウンロードを行う。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import s from '@/app/redact-pro.module.css'
import { Btn } from '@/components/redact/ui'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { generateExport, triggerDownload } from '@/lib/export'
import type { XlSheetMeta } from '@/lib/parsers/types'
import { PH_RE } from '@/lib/redact-engine'
import { generatePDFHTML, mdToHTML } from '@/lib/resume-html'
import { T } from '@/lib/theme'
import { launchTour } from '@/lib/tour'
import { EXPORT_FORMATS } from '@/lib/ui-config'
import type { ExportFormat } from '@/lib/ui-config'

/** ヘッダーに出すファイル情報と、Excel 出力でセル構造を保つためのシート */
export interface PreviewMeta {
  fileName: string
  maskCount: number
  /** マスキング適用済みのシート。あれば xlsx のプレビュー・出力でセル構造を保持する */
  xlMeta?: readonly XlSheetMeta[]
}

export interface PreviewModalProps {
  title: string
  content: string
  /** ダウンロード時のファイル名（拡張子なし） */
  baseName: string
  onClose: () => void
  /** 指定すると「編集」タブが出て、保存時に編集後テキストを受け取る */
  onContentChange?: (content: string) => void
  /** false で「編集」タブを隠す */
  editable?: boolean
  meta?: PreviewMeta
}

type PreviewView = 'layout' | 'text' | 'edit'
type ExportFormatId = ExportFormat['id']

const escHtml = (str: string) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function PreviewModal({
  title,
  content,
  baseName,
  onClose,
  onContentChange,
  editable,
  meta,
}: PreviewModalProps) {
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [copied, setCopied] = useState(false)
  const [fmt, setFmt] = useState<ExportFormatId>('txt')
  const [view, setView] = useState<PreviewView>('layout')
  const [editedContent, setEditedContent] = useState(content)
  const [hasChanges, setHasChanges] = useState(false)
  const [headingRule, setHeadingRule] = useState(() => {
    try {
      return localStorage.getItem('rp_heading_rule') !== 'off'
    } catch {
      return true
    }
  })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setEditedContent(content)
    setHasChanges(false)
  }, [content])
  // プレビューモーダル初回ツアー
  useEffect(() => {
    const done = localStorage.getItem('rp_tour_preview_done')
    if (done) return
    const timer = setTimeout(async () => {
      try {
        const { PREVIEW_MODAL_STEPS } = await import('@/lib/intro-steps')
        await launchTour(PREVIEW_MODAL_STEPS, 'rp_tour_preview_done')
      } catch (e) {
        console.warn('preview tour failed:', e)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [])

  const handleSave = useCallback(() => {
    if (onContentChange && hasChanges) {
      onContentChange(editedContent)
    }
    setView('text')
    setHasChanges(false)
  }, [onContentChange, hasChanges, editedContent])

  const handleCancelEdit = useCallback(() => {
    setEditedContent(content)
    setView('text')
    setHasChanges(false)
  }, [content])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'edit') {
          handleCancelEdit()
          return
        }
        onClose()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && view === 'edit') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, view, handleSave, handleCancelEdit])

  const displayContent = view === 'edit' ? editedContent : content
  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  // pdf は triggerDownload 側で印刷用タブを開く
  const handleDownload = () => {
    const ex = generateExport(displayContent, fmt, baseName, meta)
    triggerDownload(ex)
  }
  const lines = displayContent.split('\n').length
  const chars = displayContent.length
  const curFmt = EXPORT_FORMATS.find((f) => f.id === fmt)

  // CSV/XLSX: default to layout (table view) when switching format
  useEffect(() => {
    if ((fmt === 'csv' || fmt === 'xlsx') && view === 'edit') setView('layout')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 形式を切り替えた瞬間だけ判定する（編集タブに入る操作は妨げない）
  }, [fmt])

  const layoutHtml = useMemo(() => {
    const esc = escHtml
    if (fmt === 'txt') {
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
body{font-family:'Consolas','Monaco','Noto Sans JP',monospace;font-size:11pt;line-height:1.8;color:#111;background:#fff;padding:30px 36px;white-space:pre-wrap;word-break:break-word;margin:0}
</style></head><body>${esc(displayContent)}</body></html>`
    }
    if (fmt === 'md') {
      const body = mdToHTML(displayContent, {
        stripRedactions: false,
        highlightRedactions: true,
        removeRedactionOnlyLines: false,
      })
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap');
body{font-family:'Noto Sans JP',sans-serif;font-size:10.5pt;line-height:1.8;color:#111827;background:#fff;padding:26px 30px;margin:0;max-width:660px}
h2{font-size:14pt;font-weight:700;margin:18px 0 8px;padding-bottom:6px;border-bottom:1px solid #d1d5db}
h3{font-size:11.5pt;font-weight:700;margin:14px 0 6px}
h4{font-size:10.6pt;font-weight:700;margin:12px 0 4px}
.kv{display:grid;grid-template-columns:minmax(110px,160px) 1fr;gap:12px;padding:2px 0}
.k{color:#475569;font-weight:700}.v{color:#0f172a}
.li{padding-left:1em;text-indent:-1em;line-height:1.75;margin:1px 0}
.rd{background:#fee;color:#c33;padding:0 4px;border-radius:3px;font-weight:700}
.hr{border:0;border-top:1px solid #e5e7eb;margin:12px 0}
code{background:#f1f5f9;padding:2px 6px;border-radius:3px;font-size:0.9em}
pre{background:#f1f5f9;padding:12px 16px;border-radius:6px;overflow-x:auto;font-size:0.9em}
</style></head><body>${body}</body></html>`
    }
    if (fmt === 'csv') {
      // Note: simple split — quoted fields with commas are not handled (preview-only)
      const rows = displayContent.split('\n').map((r) => r.split(','))
      let table = '<table><thead><tr>'
      if (rows.length > 0)
        rows[0].forEach((c) => {
          table += `<th>${esc(c.trim())}</th>`
        })
      table += '</tr></thead><tbody>'
      for (let i = 1; i < rows.length; i++) {
        table += '<tr>'
        rows[i].forEach((c) => {
          table += `<td>${esc(c.trim())}</td>`
        })
        table += '</tr>'
      }
      table += '</tbody></table>'
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
body{font-family:'Noto Sans JP',sans-serif;font-size:10pt;margin:0;padding:20px;background:#fff}
table{border-collapse:collapse;width:100%;font-size:10pt}
th,td{border:1px solid #d1d5db;padding:6px 10px;text-align:left;white-space:nowrap}
th{background:#f3f4f6;font-weight:700;color:#374151}
tr:nth-child(even){background:#f9fafb}
</style></head><body>${table}</body></html>`
    }
    if (fmt === 'xlsx') {
      let table = ''
      const xlm = meta?.xlMeta
      if (xlm && xlm.length > 0) {
        // セル構造保持モード: xlMetaから直接テーブル生成
        for (const sheet of xlm) {
          if (sheet.aoa.length === 0) continue
          if (xlm.length > 1)
            table += `<div style="padding:6px 10px;background:#d0d5dd;font-weight:700;font-size:9pt">${esc(sheet.sheetName)}</div>`
          table += `<table><thead><tr>${sheet.aoa[0].map((c) => `<th>${esc(String(c ?? ''))}</th>`).join('')}</tr></thead><tbody>`
          for (let i = 1; i < sheet.aoa.length; i++) {
            const row = sheet.aoa[i]
            table += `<tr>${row.map((c) => `<td>${esc(String(c ?? ''))}</td>`).join('')}</tr>`
          }
          table += '</tbody></table>'
        }
      } else {
        // フォールバック: パイプ区切りテキストからテーブル再構成
        const xlLines = displayContent
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l)
        const xlPipeLines = xlLines.filter((l) => l.includes(' | '))
        const xlIsTabular = xlPipeLines.length >= 2 && xlPipeLines.length / xlLines.length >= 0.3
        if (xlIsTabular) {
          let headerSet = false
          for (const line of xlLines) {
            if (line.includes(' | ')) {
              const cells = line.split(' | ').map((c) => c.trim())
              if (!headerSet) {
                table += `<table><thead><tr>${cells.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`
                headerSet = true
              } else {
                table += `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`
              }
            } else {
              if (!headerSet) {
                table += `<table><tbody>`
                headerSet = true
              }
              const colCount = xlPipeLines.length > 0 ? xlPipeLines[0].split(' | ').length : 2
              table += `<tr class='sec'><td colspan='${colCount}'>${esc(line)}</td></tr>`
            }
          }
          table += '</tbody></table>'
        } else {
          table = '<table><thead><tr><th>項目</th><th>内容</th></tr></thead><tbody>'
          for (const t of xlLines) {
            if (/^(?:\(\d+\)\s*|#{1,3}\s+|【.+】)/.test(t)) {
              table += `<tr class='sec'><td colspan='2'>${esc(t)}</td></tr>`
              continue
            }
            const kv =
              t.match(/^[-・]\s*(.+?)\s*[：:]\s+(.+)$/) || t.match(/^(.+?)\s*[：:]\s+(.+)$/)
            if (kv && kv[1].length <= 30) {
              table += `<tr><td class='k'>${esc(kv[1].replace(/^[-・]\s*/, ''))}</td><td>${esc(kv[2])}</td></tr>`
              continue
            }
            if (t.includes(' | ')) {
              table += `<tr>${t
                .split(' | ')
                .map((p) => `<td>${esc(p.trim())}</td>`)
                .join('')}</tr>`
              continue
            }
            table += `<tr><td></td><td>${esc(t)}</td></tr>`
          }
          table += '</tbody></table>'
        }
      }
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
body{font-family:'Calibri','Noto Sans JP',sans-serif;font-size:10pt;margin:0;padding:0;background:#fff}
table{border-collapse:collapse;width:100%;font-size:10pt}
th,td{border:1px solid #9ca3af;padding:4px 8px;text-align:left;min-width:60px;white-space:pre-wrap;word-break:break-word}
th{background:#D9E2F3;font-weight:700;color:#1f2937;text-align:center}
td.k{background:#f8f9fa;font-weight:600;color:#374151;width:180px;white-space:nowrap}
tr.sec td{background:#e8ecf4;font-weight:700;color:#1e3a5f;text-align:center;padding:6px 8px}
tr:hover{background:#EBF0FA}
</style></head><body>${table}</body></html>`
    }
    if (fmt === 'docx') {
      const body = mdToHTML(displayContent, {
        stripRedactions: false,
        highlightRedactions: true,
        removeRedactionOnlyLines: false,
      })
      return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;600;700&display=swap');
@page{size:A4;margin:25mm 25mm}
body{font-family:'Noto Serif JP','MS 明朝',serif;font-size:10.5pt;line-height:1.8;color:#111827;background:#fff;margin:0;padding:36px 40px;max-width:660px}
h2{font-size:13pt;font-weight:700;margin:20px 0 8px;padding-bottom:6px;border-bottom:1px solid #d1d5db}
h3{font-size:11pt;font-weight:700;margin:16px 0 6px}
h4{font-size:10.5pt;font-weight:700;margin:12px 0 4px}
.kv{display:grid;grid-template-columns:minmax(110px,160px) 1fr;gap:12px;padding:2px 0}
.k{color:#475569;font-weight:700}.v{color:#0f172a}
.li{padding-left:1em;text-indent:-1em;line-height:1.8;margin:1px 0}
.rd{background:#fee;color:#c33;padding:0 4px;border-radius:3px;font-weight:700}
.hr{border:0;border-top:1px solid #d1d5db;margin:14px 0}
</style></head><body>${body}</body></html>`
    }
    // default: pdf
    return generatePDFHTML(displayContent, 'gothic', {
      stripRedactions: false,
      highlightRedactions: true,
      removeRedactionOnlyLines: false,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 元の実装どおり meta（xlMeta）の変化では再生成しない
  }, [displayContent, fmt])
  const ruleOverride = useMemo(() => {
    if (!headingRule)
      return '<style>h2{border-bottom:none!important;padding-bottom:0!important}</style>'
    return '<style>h2{border-bottom-color:#d1d5db!important;border-bottom-width:1px!important}</style>'
  }, [headingRule])
  const finalHtml = useMemo(
    () => layoutHtml.replace('</head>', ruleOverride + '</head>'),
    [layoutHtml, ruleOverride],
  )
  return (
    <div
      className={s['preview-overlay']}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={trapRef}
        className={`rp-modal-inner ${s['preview-dialog']}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          maxWidth: expanded ? '96vw' : 820,
          maxHeight: expanded ? '96vh' : '92vh',
        }}
      >
        <div className={s['preview-header']}>
          <div>
            <div className={s['preview-title']}>{title}</div>
            <div className={s['preview-meta']}>
              {lines} 行 / {chars.toLocaleString()} 文字
              {meta && (
                <span style={{ fontSize: 11, color: T.text3, opacity: 0.8 }}>
                  | {meta.fileName} | マスク: {meta.maskCount}件
                </span>
              )}
            </div>
          </div>
          <div className={s['preview-header-right']}>
            <div data-intro="preview-tabs" className={s['preview-tabs']}>
              <button
                onClick={() => setView('layout')}
                title="書式付きプレビュー"
                aria-label="書式付きプレビュー"
                className={s['preview-tab']}
                data-active={view === 'layout'}
              >
                レイアウト
              </button>
              <button
                onClick={() => setView('text')}
                title="プレーンテキスト表示"
                aria-label="プレーンテキスト表示"
                className={s['preview-tab']}
                data-active={view === 'text'}
              >
                テキスト
              </button>
              {editable !== false && onContentChange && (
                <>
                  <span style={{ width: 1, alignSelf: 'stretch', background: T.border }} />
                  <button
                    onClick={() => setView('edit')}
                    title="テキストを編集"
                    aria-label="テキストを編集"
                    className={s['preview-tab']}
                    data-active={view === 'edit'}
                  >
                    編集
                  </button>
                </>
              )}
            </div>
            {view === 'layout' && fmt !== 'csv' && fmt !== 'xlsx' && (
              <button
                onClick={() => {
                  const next = !headingRule
                  setHeadingRule(next)
                  try {
                    localStorage.setItem('rp_heading_rule', next ? 'on' : 'off')
                  } catch {
                    // 保存できなくても今回の表示切替は効いているので無視する
                  }
                }}
                title={headingRule ? '見出し罫線を非表示' : '見出し罫線を表示'}
                aria-label="見出し罫線の切替"
                className={s['preview-rule-btn']}
                data-active={headingRule}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="3" y1="12" x2="21" y2="12" />
                </svg>
                罫線
              </button>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? '縮小' : '最大化'}
              aria-label={expanded ? '縮小' : '最大化'}
              className={s['modal-close-btn']}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {expanded ? (
                  <>
                    {/* 縮小アイコン */}
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </>
                ) : (
                  <>
                    {/* 最大化アイコン */}
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </>
                )}
              </svg>
            </button>
            <button
              onClick={onClose}
              title="閉じる"
              aria-label="閉じる"
              className={s['modal-close-btn']}
            >
              x
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
          {view === 'edit' ? (
            <div className={s['preview-edit-area']}>
              <textarea
                aria-label="テキストを編集"
                value={editedContent}
                onChange={(e) => {
                  setEditedContent(e.target.value)
                  setHasChanges(e.target.value !== content)
                }}
                className={s['preview-edit-textarea']}
                spellCheck={false}
                autoFocus
              />
              <div className={s['preview-edit-bar']}>
                {hasChanges && (
                  <span style={{ fontSize: 11, color: T.amber, marginRight: 'auto' }}>
                    未保存の変更があります
                  </span>
                )}
                <Btn
                  variant="ghost"
                  onClick={handleCancelEdit}
                  style={{ padding: '6px 14px', fontSize: 12, borderRadius: 8 }}
                >
                  キャンセル
                </Btn>
                <Btn
                  onClick={handleSave}
                  disabled={!hasChanges}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    borderRadius: 8,
                    opacity: hasChanges ? 1 : 0.5,
                  }}
                >
                  保存 (Ctrl+S)
                </Btn>
              </div>
            </div>
          ) : view === 'layout' ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: fmt === 'csv' || fmt === 'xlsx' ? 12 : 24,
                background: fmt === 'csv' || fmt === 'xlsx' ? '#fff' : T.bg,
                overflow: 'auto',
              }}
            >
              {fmt === 'csv' || fmt === 'xlsx' ? (
                <iframe
                  srcDoc={layoutHtml}
                  sandbox="allow-same-origin"
                  style={{
                    width: '100%',
                    minHeight: 400,
                    border: 'none',
                  }}
                  title="TablePreview"
                  onLoad={(e) => {
                    const frame = e.currentTarget
                    try {
                      const h = frame.contentDocument?.documentElement?.scrollHeight
                      if (h) frame.style.height = Math.max(h, 400) + 'px'
                    } catch {
                      // 高さ合わせは見た目の調整だけなので、読めない場合は最小高さのまま表示する
                    }
                  }}
                />
              ) : fmt === 'txt' ? (
                <div
                  style={{
                    width: '100%',
                    maxWidth: 700,
                    background: '#fff',
                    boxShadow: '0 2px 12px rgba(0,0,0,.08)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <iframe
                    srcDoc={finalHtml}
                    sandbox="allow-same-origin"
                    style={{ width: '100%', minHeight: 600, border: 'none' }}
                    title="TextPreview"
                    onLoad={(e) => {
                      const frame = e.currentTarget
                      try {
                        const h = frame.contentDocument?.documentElement?.scrollHeight
                        if (h && h > 600) frame.style.height = h + 'px'
                      } catch {
                        // 高さ合わせは見た目の調整だけなので、読めない場合は最小高さのまま表示する
                      }
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: 595,
                    minHeight: 842,
                    background: '#fff',
                    boxShadow: '0 4px 24px rgba(0,0,0,.12)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    transform: 'scale(0.9)',
                    transformOrigin: 'top center',
                    maxWidth: '100%',
                  }}
                >
                  <iframe
                    srcDoc={finalHtml}
                    sandbox="allow-same-origin"
                    style={{
                      width: '100%',
                      minHeight: 842,
                      border: 'none',
                      pointerEvents: 'none',
                    }}
                    title="LayoutPreview"
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
              )}
            </div>
          ) : (
            <pre className={s['preview-text-view']}>
              {content.split('\n').map((line, i) => {
                const re = new RegExp(PH_RE.source, 'g')
                const parts: ReactNode[] = []
                let last = 0
                let m: RegExpExecArray | null
                while ((m = re.exec(line)) !== null) {
                  if (m.index > last)
                    parts.push(<span key={`t${i}-${last}`}>{line.slice(last, m.index)}</span>)
                  parts.push(
                    <span key={`r${i}-${m.index}`} className={s['preview-redact-tag']}>
                      {m[0]}
                    </span>,
                  )
                  last = m.index + m[0].length
                }
                if (last < line.length)
                  parts.push(<span key={`e${i}-${last}`}>{line.slice(last)}</span>)
                return (
                  <div key={i} className={s['preview-line']}>
                    <span className={s['preview-line-num']}>{i + 1}</span>
                    <span style={{ flex: 1 }}>{parts.length ? parts : line || '\u00A0'}</span>
                  </div>
                )
              })}
            </pre>
          )}
        </div>
        <div className={s['preview-footer']}>
          <div className={s['preview-formats']}>
            <span className={s['preview-formats-label']}>出力形式:</span>
            <div data-intro="export-formats" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {EXPORT_FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFmt(f.id)}
                  title={`${f.label}形式`}
                  aria-label={`${f.label}形式`}
                  className={s['preview-fmt-btn']}
                  data-active={fmt === f.id}
                >
                  <span className={s['preview-fmt-icon']} data-active={fmt === f.id}>
                    {f.icon}
                  </span>
                  {f.label}
                  {f.id === 'pdf' && (
                    <span
                      title="ブラウザの印刷機能を使用してPDFを生成します"
                      style={{ fontSize: 12, marginLeft: -2, opacity: 0.8 }}
                    >
                      🖨️
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div data-intro="export-actions" className={s['preview-export-row']}>
            {fmt === 'pdf' && (
              <span
                style={{
                  fontSize: 12,
                  color: T.amber,
                  marginRight: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 12 }}>🖨️</span>{' '}
                印刷ダイアログから「PDFとして保存」を選択してください
              </span>
            )}
            <Btn
              variant="ghost"
              onClick={onClose}
              title="閉じる"
              style={{ padding: '7px 16px', fontSize: 12, borderRadius: 8 }}
            >
              閉じる
            </Btn>
            <Btn
              variant="ghost"
              onClick={handleCopy}
              title="クリップボードにコピー"
              aria-live="polite"
              style={{ padding: '7px 16px', fontSize: 12, borderRadius: 8 }}
            >
              {copied ? '\u2713 コピー済' : 'コピー'}
            </Btn>
            <Btn
              onClick={handleDownload}
              title={`${curFmt?.label}形式でダウンロード`}
              style={{ padding: '7px 16px', fontSize: 12, borderRadius: 8 }}
            >
              {curFmt?.label} で保存
            </Btn>
          </div>
          {view === 'layout' && (
            <div className={s['preview-format-hint']}>
              {fmt === 'csv' || fmt === 'xlsx'
                ? 'テーブルプレビューはCSV/Excel出力のイメージです。'
                : fmt === 'txt'
                  ? 'プレーンテキスト表示です。'
                  : fmt === 'md'
                    ? 'Markdownをレンダリングしたプレビューです。'
                    : fmt === 'docx'
                      ? 'Word出力のイメージです（明朝体・広めの余白）。'
                      : 'PDF出力のイメージです（閲覧環境により余白や改ページが微調整されることがあります）。'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
