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
