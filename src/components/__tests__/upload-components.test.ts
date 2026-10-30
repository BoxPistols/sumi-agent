/**
 * 取り込み系コンポーネント（DropZone / SampleCard）の描画とロジックのテスト。
 *
 * DOM 環境を使わず react-dom/server の静的マークアップで検証する。
 * - 初見ユーザー向けの文言・主ボタン・対応形式が描画されること
 * - アクセシブルネーム / data-intro（ガイドツアーの対象）が維持されること
 * - selectFiles が multiple の有無で正しく絞り込むこと
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_FORMAT_LABELS,
  DEFAULT_PRIVACY_NOTE,
  DropZone,
  selectFiles,
} from '../upload/DropZone'
import { SampleCard, type SampleItem } from '../upload/SampleCard'

const file = (name: string) => new File(['x'], name, { type: 'text/plain' })

describe('selectFiles', () => {
  it('空・null・undefined は空配列', () => {
    expect(selectFiles(null, false)).toEqual([])
    expect(selectFiles(undefined, true)).toEqual([])
    expect(selectFiles([], true)).toEqual([])
  })

  it('multiple=false では先頭の1件だけを返す（Lite）', () => {
    const files = [file('a.txt'), file('b.txt'), file('c.txt')]
    const picked = selectFiles(files, false)
    expect(picked).toHaveLength(1)
    expect(picked[0].name).toBe('a.txt')
  })

  it('multiple=true では全件を配列で返す（Pro のバッチ処理）', () => {
    const files = [file('a.txt'), file('b.txt')]
    const picked = selectFiles(files, true)
    expect(picked.map((f) => f.name)).toEqual(['a.txt', 'b.txt'])
  })

  it('FileList 風の ArrayLike も受け付ける', () => {
    const fake = { 0: file('x.pdf'), 1: file('y.pdf'), length: 2 } as ArrayLike<File>
    expect(selectFiles(fake, true)).toHaveLength(2)
    expect(selectFiles(fake, false)[0].name).toBe('x.pdf')
  })
})

describe('DropZone の描画', () => {
  const render = (props: Partial<Parameters<typeof DropZone>[0]> = {}) =>
    renderToStaticMarkup(createElement(DropZone, { onFiles: vi.fn(), ...props }))

  it('主ボタン「ファイルを選択」とドラッグ＆ドロップの案内を表示する', () => {
    const html = render()
    expect(html).toContain('<button type="button"')
    expect(html).toContain('aria-label="ファイルを選択"')
    expect(html).toContain('>ファイルを選択</button>')
    // e2e（smoke.spec.ts）が部分一致で参照する文言
    expect(html).toContain('ファイルをドラッグ')
  })

  it('ガイドツアーの対象 data-intro="upload-zone" を持つ', () => {
    expect(render()).toContain('data-intro="upload-zone"')
  })

  it('隠しファイル入力は accept と aria-label を持ち、Lite では multiple なし', () => {
    const html = render({ multiple: false })
    expect(html).toContain('type="file"')
    expect(html).toContain(`accept="${ACCEPTED_EXTENSIONS}"`)
    expect(html).not.toMatch(/<input[^>]*\bmultiple\b/)
  })

  it('Pro（multiple）では multiple 属性と一括処理の案内が付く', () => {
    const html = render({ multiple: true })
    expect(html).toMatch(/<input[^>]*\bmultiple\b/)
    expect(html).toContain('複数ファイルをまとめて選ぶと一括で処理します')
  })

  it('対応形式をすべて列挙する', () => {
    const html = render()
    for (const label of ACCEPTED_FORMAT_LABELS) expect(html).toContain(label)
  })

  it('既定（Lite）ではブラウザ内処理・サーバー保存なしの説明を含む', () => {
    expect(render()).toContain(DEFAULT_PRIVACY_NOTE)
    expect(render()).toContain('サーバーには保存されません')
  })

  it('privacyNote を渡すと送信先の例外（Pro）を正確に説明できる', () => {
    const note = 'AI検出ではサーバーに送信しますが、保存はしません。'
    const html = render({ multiple: true, privacyNote: note })
    expect(html).toContain(note)
    expect(html).not.toContain(DEFAULT_PRIVACY_NOTE)
  })

  it('size / embedded / disabled が data 属性に反映される', () => {
    const html = render({ size: 'lg', embedded: true, disabled: true })
    expect(html).toContain('data-size="lg"')
    expect(html).toContain('data-embedded="true"')
    expect(html).toContain('data-disabled="true"')
    expect(html).toMatch(/<button[^>]*\bdisabled\b/)
  })

  it('accept の拡張子はすべてドット始まりで重複がない', () => {
    const exts = ACCEPTED_EXTENSIONS.split(',')
    expect(exts.every((e) => e.startsWith('.'))).toBe(true)
    expect(new Set(exts).size).toBe(exts.length)
  })
})

describe('SampleCard の描画', () => {
  const items: SampleItem[] = [
    { type: 'pdf', label: '経歴書サンプル（PDF）', desc: '2ページ', color: '#DC2626' },
    { type: 'xlsx', label: '社員一覧サンプル（Excel）', desc: '5名分', color: '#059669' },
  ]
  const render = (props: Partial<Parameters<typeof SampleCard>[0]> = {}) =>
    renderToStaticMarkup(createElement(SampleCard, { items, onPick: vi.fn(), ...props }))

  it('見出しと「ファイルがなくても試せる」案内を表示する', () => {
    const html = render()
    expect(html).toContain('サンプルで試す')
    expect(html).toContain('手元にファイルがなくても')
  })

  it('各サンプルがボタンとして描画される', () => {
    const html = render()
    for (const item of items) {
      expect(html).toContain(item.label)
      expect(html).toContain(item.desc)
    }
    expect(html.match(/<button type="button"/g)).toHaveLength(items.length)
  })

  it('1件のときは1列、複数のときは2列のグリッドになる', () => {
    expect(render({ items: items.slice(0, 1) })).toContain('data-cols="1"')
    expect(render()).toContain('data-cols="2"')
  })

  it('introId を data-intro として付与し、未指定なら付与しない', () => {
    expect(render({ introId: 'sample-demo' })).toContain('data-intro="sample-demo"')
    expect(render()).not.toContain('data-intro=')
  })

  it('zipHref があるときだけダウンロードリンクを出す', () => {
    expect(render()).not.toContain('<a ')
    const html = render({ zipHref: '/mock-resumes.zip' })
    expect(html).toContain('href="/mock-resumes.zip"')
    expect(html).toContain('download')
    expect(html).toContain('aria-label="モック履歴書一式をダウンロード（ZIP）"')
  })

  it('画面上で「DEMO」という表記を使わない', () => {
    expect(render({ zipHref: '/mock-resumes.zip' })).not.toContain('DEMO')
  })
})
