'use client'

/**
 * キーボードショートカット一覧のモーダル
 *
 * エディタ画面でのみ効くキーには、エディタ外で開いたとき「エディタ画面」バッジを付ける。
 */
import { useEffect } from 'react'
import s from '@/app/redact-pro.module.css'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { C, T } from '@/lib/theme'

export interface ShortcutsModalProps {
  onClose: () => void
  /** エディタ画面（解析結果あり・バッチ処理中）から開いたか */
  hasEditorContext: boolean
}

interface ShortcutSection {
  title: string
  pro?: boolean
  editor?: boolean
  shortcuts: { key: string; desc: string }[]
}

const SECTIONS: ShortcutSection[] = [
  {
    title: '全般',
    shortcuts: [
      { key: 'D', desc: 'ダーク / ライト切替' },
      { key: '?', desc: 'ヘルプ' },
      { key: 'K', desc: 'ショートカット一覧' },
      { key: ',', desc: '設定' },
      { key: 'E', desc: 'Lite / Pro 切替' },
      { key: 'Esc', desc: 'ダイアログを閉じる' },
    ],
  },
  {
    title: 'ビュー切替',
    pro: true,
    editor: true,
    shortcuts: [
      { key: '1', desc: 'マスク後' },
      { key: '2', desc: '差分' },
      { key: '3', desc: '生テキスト' },
      { key: '4', desc: '生テキストとの差分' },
      { key: '5', desc: 'AI整形' },
      { key: '6', desc: 'AI整形との差分' },
    ],
  },
  {
    title: 'エディタ操作',
    pro: true,
    editor: true,
    shortcuts: [
      { key: 'M', desc: 'マスク / 元文 切替' },
      { key: 'P', desc: 'プレビュー切替' },
      { key: 'W', desc: '編集モード切替' },
      { key: 'I', desc: 'PDF印刷' },
      { key: 'C', desc: 'コピー' },
      { key: 'R', desc: '検出結果パネル' },
      { key: 'A', desc: 'アドバイザーパネル' },
    ],
  },
]

export function ShortcutsModal({ onClose, hasEditorContext }: ShortcutsModalProps) {
  const trapRef = useFocusTrap()
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div
      className={s['modal-overlay']}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={trapRef}
        className={`rp-modal-inner ${s['modal-dialog']}`}
        role="dialog"
        aria-modal="true"
        aria-label="キーボードショートカット"
        style={{ maxWidth: 720 }}
      >
        <div className={s['modal-header']}>
          <span className={s['modal-header-title']}>キーボードショートカット</span>
          <button onClick={onClose} aria-label="閉じる" className={s['modal-close-btn']}>
            ✕
          </button>
        </div>
        <div className={s['modal-body']}>
          <p className={s['help-note']} style={{ marginTop: 0, marginBottom: 12 }}>
            テキスト入力中・ダイアログ表示中は無効
          </p>
          <div className={s['sc-cols']}>
            {SECTIONS.map((sec) => (
              <div key={sec.title} className={s['sc-section']}>
                <div className={s['sc-section-title']}>
                  {sec.title}
                  {sec.pro && (
                    <span
                      className={s['help-badge']}
                      style={{
                        color: C.purple,
                        background: C.purpleDim,
                        marginLeft: 6,
                        fontSize: 10,
                      }}
                    >
                      Pro
                    </span>
                  )}
                  {sec.editor && !hasEditorContext && (
                    <span
                      className={s['help-badge']}
                      style={{
                        color: T.text3,
                        background: T.surfaceAlt,
                        marginLeft: 4,
                        fontSize: 10,
                      }}
                    >
                      エディタ画面
                    </span>
                  )}
                </div>
                <div className={s['sc-grid']}>
                  {sec.shortcuts.map((sc) => (
                    <div key={sc.key} className={s['sc-row']}>
                      <kbd className={s['sc-key']}>{sc.key}</kbd>
                      <span className={s['sc-desc']}>{sc.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
