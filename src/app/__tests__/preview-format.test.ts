import { describe, it, expect } from 'vitest'
import { __test__ } from '../RedactPro'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Seg = Record<string, any>

const _ba = __test__.buildAnnotations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ann = (...args: Parameters<typeof _ba>): Seg[] => _ba(...args) as any

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
    id,
    value,
    type,
    category,
    source: 'regex',
    enabled,
    confidence: 0.9,
    label: type,
  })

  it('returns single text segment when no detections', () => {
    const result = ann('テスト文章です', [], {})
    expect(result).toEqual([{ type: 'text', text: 'テスト文章です' }])
  })

  it('returns single text segment for empty detections array', () => {
    const result = ann('テスト', [], {})
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
  })

  it('splits text around a single detection', () => {
    const dets = [makeDet('1', 'example@test.com', 'email', 'contact')]
    const text = '連絡先: example@test.com まで'
    const result = ann(text, dets, {})
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
    const result = ann(text, dets, {})
    const detSegs = result.filter((s: Seg) => s.type === 'det')
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
    const result = ann(text, dets, {})
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    // 長い方（東京都港区）が優先される
    expect(detSegs).toHaveLength(1)
    expect(detSegs[0].text).toBe('東京都港区')
    expect(detSegs[0].det.id).toBe('1')
  })

  it('returns masked text when showRedacted is true', () => {
    const dets = [makeDet('1', 'test@mail.com', 'email', 'contact', true)]
    const text = '連絡先: test@mail.com'
    const result = ann(text, dets, { showRedacted: true })
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    expect(detSegs).toHaveLength(1)
    expect(detSegs[0].masked).toBe(true)
    expect(detSegs[0].text).toBe('[メール非公開]')
  })

  it('handles text with no matches gracefully', () => {
    const dets = [makeDet('1', 'notfound', 'email', 'contact')]
    const text = 'この文章にはマッチしません'
    const result = ann(text, dets, {})
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
    expect(result[0].text).toBe(text)
  })

  it('handles repeated occurrences of the same value', () => {
    const dets = [makeDet('1', 'foo', 'email', 'contact')]
    const text = 'foo bar foo baz foo'
    const result = ann(text, dets, {})
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    expect(detSegs).toHaveLength(3)
    detSegs.forEach((s) => expect(s.text).toBe('foo'))
  })

  it('filters out short detection values (length < 2)', () => {
    const dets = [makeDet('1', 'x', 'email', 'contact')]
    const text = 'x marks the spot'
    const result = ann(text, dets, {})
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
  })

  it('dedup works when shorter value appears first in array', () => {
    // 入力順序逆転: 短い値が先
    const dets = [
      makeDet('2', '東京都', 'address', 'address'),
      makeDet('1', '東京都港区', 'address', 'address'),
    ]
    const text = '住所: 東京都港区六本木'
    const result = ann(text, dets, {})
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    expect(detSegs).toHaveLength(1)
    expect(detSegs[0].text).toBe('東京都港区')
    expect(detSegs[0].det.id).toBe('1')
  })

  it('marks enabled:false detections with disabledDet flag', () => {
    const dets = [makeDet('1', '田中太郎', 'name_dict', 'name', false)]
    const text = '氏名: 田中太郎'
    const result = ann(text, dets, {})
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    expect(detSegs).toHaveLength(1)
    expect(detSegs[0].masked).toBe(false)
    expect(detSegs[0].disabledDet).toBe(true)
    expect(detSegs[0].text).toBe('田中太郎')
  })

  it('enabled:false detection is not masked even with showRedacted', () => {
    const dets = [makeDet('1', 'test@mail.com', 'email', 'contact', false)]
    const text = '連絡先: test@mail.com'
    const result = ann(text, dets, { showRedacted: true })
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    expect(detSegs).toHaveLength(1)
    expect(detSegs[0].masked).toBe(false)
    expect(detSegs[0].disabledDet).toBe(true)
    expect(detSegs[0].text).toBe('test@mail.com')
  })

  it('keepPrefecture preserves prefecture in address mask', () => {
    const dets = [makeDet('1', '東京都港区六本木1-2-3', 'address', 'address')]
    const text = '住所: 東京都港区六本木1-2-3'
    const result = ann(text, dets, {
      showRedacted: true,
      keepPrefecture: true,
    })
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    expect(detSegs).toHaveLength(1)
    expect(detSegs[0].masked).toBe(true)
    expect(detSegs[0].text).toBe('東京都[住所詳細非公開]')
  })

  it('keepPrefecture falls back for non-prefecture address', () => {
    const dets = [makeDet('1', '六本木1-2-3', 'address', 'address')]
    const text = '住所: 六本木1-2-3'
    const result = ann(text, dets, {
      showRedacted: true,
      keepPrefecture: true,
    })
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    expect(detSegs).toHaveLength(1)
    expect(detSegs[0].text).toBe('[住所非公開]')
  })

  it('nameInitial generates initials for katakana name', () => {
    const dets = [makeDet('1', 'タナカ タロウ', 'name_dict', 'name')]
    const text = '氏名: タナカ タロウ です'
    const result = ann(text, dets, { showRedacted: true, nameInitial: true })
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    expect(detSegs).toHaveLength(1)
    expect(detSegs[0].masked).toBe(true)
    // Should be initials like "T.T." (not placeholder)
    expect(detSegs[0].text).toMatch(/^[A-Z]\.[A-Z]\.$/)
  })

  it('nameInitial falls back to placeholder for non-name category', () => {
    const dets = [makeDet('1', 'test@mail.com', 'email', 'contact')]
    const text = '連絡先: test@mail.com'
    const result = ann(text, dets, { showRedacted: true, nameInitial: true })
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    expect(detSegs).toHaveLength(1)
    expect(detSegs[0].text).toBe('[メール非公開]')
  })

  it('multiple detections with length >= 2 all matched', () => {
    const dets = [makeDet('1', 'AB', 'email', 'contact'), makeDet('2', 'CD', 'phone', 'contact')]
    const text = 'AB and CD end'
    const result = ann(text, dets, {})
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    expect(detSegs).toHaveLength(2)
    expect(detSegs[0].text).toBe('AB')
    expect(detSegs[1].text).toBe('CD')
  })

  it('mixed enabled and disabled detections', () => {
    const dets = [
      makeDet('1', '田中太郎', 'name_dict', 'name', true),
      makeDet('2', '090-1234-5678', 'phone', 'contact', false),
    ]
    const text = '氏名: 田中太郎\n電話: 090-1234-5678'
    const result = ann(text, dets, { showRedacted: true })
    const detSegs = result.filter((s: Seg) => s.type === 'det')
    expect(detSegs).toHaveLength(2)
    // 有効な検出はマスク
    expect(detSegs[0].masked).toBe(true)
    expect(detSegs[0].text).toBe('[氏名非公開]')
    // 無効な検出は元テキスト + disabledDet
    expect(detSegs[1].masked).toBe(false)
    expect(detSegs[1].disabledDet).toBe(true)
    expect(detSegs[1].text).toBe('090-1234-5678')
  })
})
