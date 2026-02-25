import { describe, it, expect } from 'vitest'
import { buildAdvisorContext } from '../advisor/context'

const baseParams = {
  originalText: '田中太郎\n東京都渋谷区\nJavaScript開発者',
  redactedText: '[氏名非公開]\n[住所非公開]\nJavaScript開発者',
  detections: [
    { category: 'name', label: '氏名', enabled: true },
    { category: 'address', label: '住所', enabled: true },
  ],
  fileName: 'resume.pdf',
  format: 'PDF',
}

describe('buildAdvisorContext', () => {
  it('ファイル名・形式を含む', () => {
    const ctx = buildAdvisorContext(baseParams)
    expect(ctx).toContain('resume.pdf')
    expect(ctx).toContain('PDF')
  })

  it('検出サマリーを含む', () => {
    const ctx = buildAdvisorContext(baseParams)
    expect(ctx).toContain('氏名: 1件')
    expect(ctx).toContain('住所: 1件')
  })

  it('検出総数とマスク有効数を表示', () => {
    const ctx = buildAdvisorContext(baseParams)
    expect(ctx).toContain('検出総数: 2件')
    expect(ctx).toContain('マスク有効: 2件')
  })

  it('経歴書テキストを含む', () => {
    const ctx = buildAdvisorContext(baseParams)
    expect(ctx).toContain('田中太郎')
    expect(ctx).toContain('JavaScript開発者')
  })

  it('ページ数がある場合は表示', () => {
    const ctx = buildAdvisorContext({ ...baseParams, pageCount: 3 })
    expect(ctx).toContain('3ページ')
  })

  it('ページ数がない場合は省略', () => {
    const ctx = buildAdvisorContext(baseParams)
    expect(ctx).not.toContain('ページ')
  })

  it('6000文字を超えるテキストはトランケートされる', () => {
    const longText = 'あ'.repeat(7000)
    const ctx = buildAdvisorContext({ ...baseParams, originalText: longText })
    expect(ctx).toContain('...(以下省略)')
    // 6000文字 + ヘッダー部分が含まれる
    expect(ctx.length).toBeLessThan(longText.length)
  })

  it('6000文字以下のテキストはトランケートされない', () => {
    const ctx = buildAdvisorContext(baseParams)
    expect(ctx).not.toContain('以下省略')
  })

  it('検出結果が空の場合「なし」と表示', () => {
    const ctx = buildAdvisorContext({ ...baseParams, detections: [] })
    expect(ctx).toContain('PII検出結果: なし')
    expect(ctx).toContain('検出総数: 0件')
  })

  it('無効化された検出がある場合のマスク有効数', () => {
    const dets = [
      { category: 'name', label: '氏名', enabled: true },
      { category: 'address', label: '住所', enabled: false },
    ]
    const ctx = buildAdvisorContext({ ...baseParams, detections: dets })
    expect(ctx).toContain('検出総数: 2件')
    expect(ctx).toContain('マスク有効: 1件')
  })

  it('同じカテゴリの検出は合算される', () => {
    const dets = [
      { category: 'name', label: '氏名', enabled: true },
      { category: 'name', label: '氏名', enabled: true },
      { category: 'contact', label: '連絡先', enabled: true },
    ]
    const ctx = buildAdvisorContext({ ...baseParams, detections: dets })
    expect(ctx).toContain('氏名: 2件')
    expect(ctx).toContain('連絡先: 1件')
  })

  it('useRedacted=false（デフォルト）は元テキストを使用', () => {
    const ctx = buildAdvisorContext({ ...baseParams, useRedacted: false })
    expect(ctx).toContain('田中太郎')
    expect(ctx).not.toContain('[氏名非公開]')
  })

  it('useRedacted=true はマスク済みテキストを使用', () => {
    const ctx = buildAdvisorContext({ ...baseParams, useRedacted: true })
    expect(ctx).toContain('[氏名非公開]')
    expect(ctx).toContain('[住所非公開]')
    expect(ctx).not.toContain('田中太郎')
  })
})
