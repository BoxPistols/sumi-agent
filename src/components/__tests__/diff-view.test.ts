/**
 * DiffView の描画テスト（react-dom/server の静的マークアップで検証）。
 * - 左右の列に行番号つきで元テキスト／変更後テキストが並ぶ
 * - 変更行に data-changed、各チャンク先頭に data-chunk-start が付く
 * - 右列のマスキングタグが強調用の要素に分かれる
 * - 変更がなければ前後移動のナビゲーションを出さない
 */
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DiffView, type DiffViewProps } from '../redact/DiffView'

const render = (props: Partial<DiffViewProps> = {}) =>
  renderToStaticMarkup(
    createElement(DiffView, {
      original: '山田太郎\n東京都\nメモ\n090-0234-5678',
      modified: '[氏名非公開]\n東京都\nメモ\n[電話番号非公開]',
      ...props,
    }),
  )

describe('DiffView', () => {
  it('既定の見出し（差分: 変更箇所 / 元テキスト / マスキング済み）と変更行数を表示する', () => {
    const html = render()
    expect(html).toContain('差分: 変更箇所')
    expect(html).toContain('元テキスト')
    expect(html).toContain('マスキング済み')
    expect(html).toContain('2 行変更')
  })

  it('label / modifiedLabel を指定するとその文言になる', () => {
    const html = render({ label: 'アドバイザー改善提案', modifiedLabel: '改善提案' })
    expect(html).toContain('差分: アドバイザー改善提案')
    expect(html).toContain('改善提案')
    expect(html).not.toContain('マスキング済み')
  })

  it('左右とも全行を描画し、変更行だけ data-changed="true" になる', () => {
    const html = render()
    expect(html.match(/data-side="del"/g)).toHaveLength(4)
    expect(html.match(/data-side="add"/g)).toHaveLength(4)
    // 変更行（1 行目・4 行目）× 左右
    expect(html.match(/data-changed="true"/g)).toHaveLength(4)
    expect(html.match(/data-changed="false"/g)).toHaveLength(4)
  })

  it('チャンク先頭の行（左列）に data-chunk-start を連番で付ける', () => {
    const html = render()
    expect(html).toContain('data-chunk-start="0"')
    expect(html).toContain('data-chunk-start="1"')
    expect(html).not.toContain('data-chunk-start="2"')
  })

  it('チャンクがあるとき前後移動ボタンと位置表示（– / 件数）を出す', () => {
    const html = render()
    expect(html).toContain('aria-label="前の変更へ"')
    expect(html).toContain('aria-label="次の変更へ"')
    expect(html).toContain('– / 2')
    // 初期状態（未選択）では「前へ」だけ無効
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="前の変更へ"/)
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="次の変更へ"/)
  })

  it('右列のマスキングタグは前後のテキストと別の span に分ける', () => {
    const html = render({ original: 'TEL: 090', modified: 'TEL: [電話番号非公開] まで' })
    expect(html).toContain('<span>TEL: </span>')
    expect(html).toMatch(/<span class="[^"]*">\[電話番号非公開\]<\/span>/)
    expect(html).toContain('<span> まで</span>')
  })

  it('変更がなければナビゲーションを出さず 0 行変更と表示する', () => {
    const html = render({ original: 'a\nb', modified: 'a\nb' })
    expect(html).not.toContain('前の変更へ')
    expect(html).not.toContain('data-chunk-start')
    expect(html).toContain('0 行変更')
  })

  it('空行はノーブレークスペースで高さを保つ', () => {
    const html = render({ original: 'a\n\nb', modified: 'a\n\nb' })
    const nbsp = String.fromCharCode(0xa0)
    expect(html).toContain(`>${nbsp}</span>`)
  })
})
