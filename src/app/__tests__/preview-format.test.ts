import { describe, it, expect } from 'vitest'
import { __test__ } from '../RedactPro'

describe('AI preview formatting (mdToHTML)', () => {
  it('renders a plain section title as h2', () => {
    const html = __test__.mdToHTML('資格', { stripRedactions: false })
    expect(html).toContain('<h2>資格</h2>')
  })

  it('does not upgrade bullet items with year parentheses into headings', () => {
    const text = [
      '資格',
      '- 基本情報技術者試験（2014年取得）',
      '- AWS Solutions Architect Associate（2019年取得）',
    ].join('\n')

    const html = __test__.mdToHTML(text, { stripRedactions: false })
    // Must remain list items
    expect(html).toContain('class="li">・基本情報技術者試験（2014年取得）</div>')
    expect(html).toContain('class="li">・AWS Solutions Architect Associate（2019年取得）</div>')
    // Must NOT be promoted to h3
    expect(html).not.toContain('<h3>- 基本情報技術者試験')
    expect(html).not.toContain('<h3>- AWS Solutions Architect Associate')
  })

  it('formats key-value lines into kv layout', () => {
    const html = __test__.mdToHTML('氏名： [氏名非公開]\n住所： 東京都', {
      stripRedactions: false,
      highlightRedactions: true,
      removeRedactionOnlyLines: false,
    })
    expect(html).toContain('class="kv"')
    expect(html).toContain('class="k">氏名')
    expect(html).toContain('class="v"><span class="rd">[氏名非公開]</span>')
  })
})

describe('cleanContent', () => {
  it('removes redaction-only kv lines by default', () => {
    const cleaned = __test__.cleanContent('氏名： [氏名非公開]\nスキル： React\n', undefined)
    expect(cleaned).not.toContain('氏名：')
    expect(cleaned).toContain('スキル： React')
  })

  it('keeps redaction-only kv lines when removeRedactionOnlyLines is false', () => {
    const cleaned = __test__.cleanContent('氏名： [氏名非公開]\nスキル： React\n', {
      removeRedactionOnlyLines: false,
    })
    expect(cleaned).toContain('氏名：')
    expect(cleaned).toContain('スキル： React')
  })
})

describe('generatePDFHTML', () => {
  it('generates HTML containing typographic hierarchy and kv styles', () => {
    const html = __test__.generatePDFHTML(
      ['# 職務経歴書', '', '氏名： [氏名非公開]', '', '---', '', '- 箇条書き'].join('\n'),
      'gothic',
      { stripRedactions: false, highlightRedactions: true, removeRedactionOnlyLines: false },
    )
    expect(html).toContain('h2{')
    expect(html).toContain('.kv{')
    expect(html).toContain('<span class="rd">[氏名非公開]</span>')
    expect(html).toContain('class="li">・箇条書き</div>')
    expect(html).toContain('class="hr"')
  })
})

describe('buildAnnotations', () => {
  const makeDet = (id: string, value: string, type: string, category: string, enabled = true) => ({
    id, value, type, category, source: 'regex', enabled, confidence: 0.9, label: type,
  })

  it('returns single text segment when no detections', () => {
    const result = __test__.buildAnnotations('テスト文章です', [], {})
    expect(result).toEqual([{ type: 'text', text: 'テスト文章です' }])
  })

  it('returns single text segment for empty detections array', () => {
    const result = __test__.buildAnnotations('テスト', [], {})
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
  })

  it('splits text around a single detection', () => {
    const dets = [makeDet('1', 'example@test.com', 'email', 'contact')]
    const text = '連絡先: example@test.com まで'
    const result = __test__.buildAnnotations(text, dets, {})
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', text: '連絡先: ' })
    expect(result[1].type).toBe('det')
    expect(result[1].text).toBe('example@test.com')
    expect(result[1].det.id).toBe('1')
    expect(result[2]).toEqual({ type: 'text', text: ' まで' })
  })

  it('handles multiple non-overlapping detections', () => {
    const dets = [
      makeDet('1', '田中太郎', 'name_dict', 'name'),
      makeDet('2', '090-1234-5678', 'phone', 'contact'),
    ]
    const text = '氏名: 田中太郎\n電話: 090-1234-5678'
    const result = __test__.buildAnnotations(text, dets, {})
    const detSegs = result.filter(s => s.type === 'det')
    expect(detSegs).toHaveLength(2)
    expect(detSegs[0].text).toBe('田中太郎')
    expect(detSegs[1].text).toBe('090-1234-5678')
  })

  it('deduplicates overlapping detections (longer value wins)', () => {
    const dets = [
      makeDet('1', '東京都港区', 'address', 'address'),
      makeDet('2', '東京都', 'address', 'address'),
    ]
    const text = '住所: 東京都港区六本木'
    const result = __test__.buildAnnotations(text, dets, {})
    const detSegs = result.filter(s => s.type === 'det')
    // 長い方（東京都港区）が優先される
    expect(detSegs).toHaveLength(1)
    expect(detSegs[0].text).toBe('東京都港区')
    expect(detSegs[0].det.id).toBe('1')
  })

  it('returns masked text when showRedacted is true', () => {
    const dets = [makeDet('1', 'test@mail.com', 'email', 'contact', true)]
    const text = '連絡先: test@mail.com'
    const result = __test__.buildAnnotations(text, dets, { showRedacted: true })
    const detSegs = result.filter(s => s.type === 'det')
    expect(detSegs).toHaveLength(1)
    expect(detSegs[0].masked).toBe(true)
    expect(detSegs[0].text).toBe('[メール非公開]')
  })

  it('handles text with no matches gracefully', () => {
    const dets = [makeDet('1', 'notfound', 'email', 'contact')]
    const text = 'この文章にはマッチしません'
    const result = __test__.buildAnnotations(text, dets, {})
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
    expect(result[0].text).toBe(text)
  })

  it('handles repeated occurrences of the same value', () => {
    const dets = [makeDet('1', 'foo', 'email', 'contact')]
    const text = 'foo bar foo baz foo'
    const result = __test__.buildAnnotations(text, dets, {})
    const detSegs = result.filter(s => s.type === 'det')
    expect(detSegs).toHaveLength(3)
    detSegs.forEach(s => expect(s.text).toBe('foo'))
  })

  it('filters out short detection values (length < 2)', () => {
    const dets = [makeDet('1', 'x', 'email', 'contact')]
    const text = 'x marks the spot'
    const result = __test__.buildAnnotations(text, dets, {})
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
  })
})
