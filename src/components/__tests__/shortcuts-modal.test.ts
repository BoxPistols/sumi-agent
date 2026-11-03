/**
 * ShortcutsModal / ChatWidget（閉じた状態）の描画テスト。
 *
 * DOM 環境を使わず react-dom/server の静的マークアップで検証する。
 * - ダイアログとしてのアクセシブルネーム・閉じるボタン
 * - エディタ外で開いたときだけ「エディタ画面」バッジを出すこと
 * - チャットの FAQ が回答付きで揃っていること
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShortcutsModal } from '../redact/ShortcutsModal'
import { CHAT_FAQ, ChatWidget } from '../redact/ChatWidget'

describe('ShortcutsModal の描画', () => {
  const render = (hasEditorContext: boolean) =>
    renderToStaticMarkup(createElement(ShortcutsModal, { onClose: vi.fn(), hasEditorContext }))

  it('モーダルダイアログとして名前と閉じるボタンを持つ', () => {
    const html = render(true)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="キーボードショートカット"')
    expect(html).toContain('aria-label="閉じる"')
  })

  it('3 つのセクションと全キーを表示する', () => {
    const html = render(true)
    for (const title of ['全般', 'ビュー切替', 'エディタ操作']) expect(html).toContain(title)
    const keys = html.match(/<kbd[^>]*>[^<]*<\/kbd>/g) ?? []
    expect(keys).toHaveLength(19)
    expect(html).toContain('>Esc</kbd>')
    expect(html).toContain('ダーク / ライト切替')
  })

  it('Pro バッジはエディタ系の 2 セクションに付く', () => {
    expect(render(true).match(/>Pro<\/span>/g)).toHaveLength(2)
  })

  it('エディタ外では「エディタ画面」バッジを出し、エディタ内では出さない', () => {
    expect(render(false).match(/>エディタ画面<\/span>/g)).toHaveLength(2)
    expect(render(true)).not.toContain('>エディタ画面</span>')
  })
})

describe('ChatWidget', () => {
  it('閉じた状態では開くボタンだけを描画する', () => {
    const html = renderToStaticMarkup(createElement(ChatWidget))
    expect(html).toContain('aria-label="サポートチャットを開く"')
    expect(html).toContain('data-open="false"')
    expect(html).not.toContain('サポート</span>')
  })

  it('FAQ の各カテゴリに質問があり、質問・回答とも空でない', () => {
    expect(CHAT_FAQ.map((c) => c.category)).toEqual([
      '基本操作',
      '検出・マスキング',
      'AI機能',
      'エクスポート',
      'その他',
    ])
    for (const cat of CHAT_FAQ) {
      expect(cat.questions.length).toBeGreaterThan(0)
      for (const item of cat.questions) {
        expect(item.q.trim()).not.toBe('')
        expect(item.a.trim()).not.toBe('')
      }
    }
  })

  it('保存先の FAQ は Lite がサーバーに送信しないことを明記する', () => {
    const other = CHAT_FAQ.find((c) => c.category === 'その他')
    const item = other?.questions.find((q) => q.q === 'データはどこに保存される？')
    expect(item?.a).toContain(
      'Lite版はファイルの読み取りから検出・マスキングまでブラウザ内で完結し',
    )
  })
})
