/**
 * バッチ処理まわりの表示（FileTabBar / BatchProcessingView / BatchErrorView）の描画テスト。
 *
 * DOM 環境を使わず react-dom/server の静的マークアップで検証する。
 * - タブごとの状態がアクセシブルネームで読み上げられること
 * - 完了件数（n/N）と ZIP 出力ボタンの有効・無効
 * - 処理中・エラー画面の文言と既定値のフォールバック
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BatchFileEntry, BatchFileStatus } from '@/lib/app-types'
import { FileTabBar } from '../redact/FileTabBar'
import { BatchErrorView, BatchProcessingView } from '../redact/BatchViews'

let seq = 0
const entry = (fileName: string, status: BatchFileStatus, extra: Partial<BatchFileEntry> = {}) => {
  seq += 1
  const e: BatchFileEntry = {
    id: `f${seq}`,
    file: new File(['x'], fileName),
    fileName,
    status,
    stage: '',
    progress: 0,
    data: null,
    error: null,
    abortController: new AbortController(),
    ...extra,
  }
  return e
}

describe('FileTabBar の描画', () => {
  const render = (files: BatchFileEntry[], activeIdx = 0) =>
    renderToStaticMarkup(
      createElement(FileTabBar, {
        files,
        activeIdx,
        onSelect: vi.fn(),
        onRemove: vi.fn(),
        onBatchExport: vi.fn(),
        onAddFiles: vi.fn(),
      }),
    )

  it('各状態をファイル名付きの aria-label / title で示す', () => {
    const html = render([
      entry('a.pdf', 'done'),
      entry('b.pdf', 'processing', { stage: 'AI検出中', progress: 40 }),
      entry('c.pdf', 'processing'),
      entry('d.pdf', 'error'),
      entry('e.pdf', 'cancelled'),
      entry('f.pdf', 'queued'),
    ])
    expect(html).toContain('aria-label="a.pdf (完了)"')
    expect(html).toContain('aria-label="b.pdf (AI検出中)"')
    expect(html).toContain('aria-label="c.pdf (処理中)"')
    expect(html).toContain('aria-label="d.pdf (エラー)"')
    expect(html).toContain('aria-label="e.pdf (キャンセル)"')
    expect(html).toContain('aria-label="f.pdf (待機中)"')
    expect(html).toContain('title="a.pdf (完了)"')
  })

  it('処理中のタブだけに進捗バーを出す', () => {
    const html = render([
      entry('a.pdf', 'processing', { progress: 40 }),
      entry('b.pdf', 'done', { progress: 100 }),
    ])
    expect(html).toContain('width:40%')
    expect(html).not.toContain('width:100%')
  })

  it('キャンセルしたタブは取り消し線で示す', () => {
    expect(render([entry('a.pdf', 'cancelled')])).toContain('text-decoration:line-through')
  })

  it('完了件数を n/N で表示し、完了が 1 件以上なら ZIP 出力を押せる', () => {
    const html = render([entry('a.pdf', 'done'), entry('b.pdf', 'processing')])
    expect(html).toContain('>1/2</span>')
    expect(html).toContain('ZIP出力')
    expect(html).toContain('data-disabled="false"')
    expect(html).toContain('aria-label="全ファイルのマスキング結果をZIPで一括ダウンロード"')
  })

  it('完了が 0 件なら ZIP 出力は無効表示', () => {
    const html = render([entry('a.pdf', 'queued')])
    expect(html).toContain('>0/1</span>')
    expect(html).toContain('data-disabled="true"')
    expect(html).toContain('opacity:0.4')
  })

  it('ファイルが 0 件なら追加ボタンだけを出し、件数と ZIP 出力は出さない', () => {
    const html = render([])
    expect(html).toContain('aria-label="ファイルを追加"')
    expect(html).not.toContain('ZIP出力')
  })
})

describe('BatchProcessingView の描画', () => {
  it('ファイル名・段階・進捗を表示し、aria-live で読み上げる', () => {
    const html = renderToStaticMarkup(
      createElement(BatchProcessingView, {
        file: entry('a.pdf', 'processing', { stage: 'OCR中', progress: 55 }),
      }),
    )
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-label="a.pdfを処理中: OCR中 55%"')
    expect(html).toContain('role="status"')
    expect(html).toContain('>OCR中</div>')
    expect(html).toContain('width:55%')
    expect(html).toContain('>55%</div>')
  })

  it('段階・進捗が空なら待機中と 0% を出す', () => {
    const html = renderToStaticMarkup(
      createElement(BatchProcessingView, { file: entry('a.pdf', 'queued') }),
    )
    expect(html).toContain('aria-label="a.pdfを処理中: 処理待機中 0%"')
    expect(html).toContain('>処理待機中...</div>')
  })
})

describe('BatchErrorView の描画', () => {
  it('エラーメッセージを role="alert" で出す', () => {
    const html = renderToStaticMarkup(
      createElement(BatchErrorView, {
        file: entry('a.pdf', 'error', { error: '読み込みに失敗しました' }),
      }),
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('a.pdf')
    expect(html).toContain('読み込みに失敗しました')
  })

  it('メッセージがなければ既定文言、onRetry がなければ再試行ボタンなし', () => {
    const html = renderToStaticMarkup(
      createElement(BatchErrorView, { file: entry('a.pdf', 'error') }),
    )
    expect(html).toContain('処理中にエラーが発生しました')
    expect(html).not.toContain('再試行')
  })

  it('onRetry を渡すと再試行ボタンを出す', () => {
    const html = renderToStaticMarkup(
      createElement(BatchErrorView, { file: entry('a.pdf', 'error'), onRetry: vi.fn() }),
    )
    expect(html).toContain('再試行')
  })
})
