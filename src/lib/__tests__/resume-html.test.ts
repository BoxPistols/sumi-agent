import { describe, expect, it } from 'vitest'
import {
  FONT_FAMILIES,
  FONT_IMPORTS,
  cleanContent,
  escHTML,
  generatePDFHTML,
  isPIIValue,
  mdToHTML,
} from '../resume-html'

const KEEP = { stripRedactions: false, removeRedactionOnlyLines: false } as const
const HIGHLIGHT = { ...KEEP, highlightRedactions: true } as const

describe('escHTML', () => {
  it('escapes &, < and > but leaves quotes untouched', () => {
    expect(escHTML(`<a href="x">&'</a>`)).toBe(`&lt;a href="x"&gt;&amp;'&lt;/a&gt;`)
  })

  it('treats null / undefined / empty as an empty string', () => {
    expect(escHTML(null)).toBe('')
    expect(escHTML(undefined)).toBe('')
    expect(escHTML('')).toBe('')
  })
})

describe('isPIIValue', () => {
  it('is true for one or more 非公開 placeholders with surrounding whitespace', () => {
    expect(isPIIValue('[氏名非公開]')).toBe(true)
    expect(isPIIValue('  [住所非公開] [住所詳細非公開]  ')).toBe(true)
    expect(isPIIValue('[非公開]')).toBe(true)
  })

  it('is false when any real text remains', () => {
    expect(isPIIValue('[氏名非公開] 様')).toBe(false)
    expect(isPIIValue('東京都')).toBe(false)
    expect(isPIIValue('')).toBe(false)
  })

  it('does not treat English "Redacted" placeholders as PII-only values', () => {
    expect(isPIIValue('[Name Redacted]')).toBe(false)
  })
})

describe('cleanContent', () => {
  it('drops page and sheet markers even when redaction-only lines are kept', () => {
    const text = ['--- Page 1 ---', '本文', '-- Sheet: 売上 --', '末尾'].join('\n')
    expect(cleanContent(text, { removeRedactionOnlyLines: false })).toBe('本文\n末尾')
  })

  it('keeps blank lines', () => {
    expect(cleanContent('a\n\n  \nb')).toBe('a\n\n  \nb')
  })

  it('removes lines that consist only of placeholders and kv lines with half-width colons', () => {
    const text = ['[氏名非公開]', 'Email: [メール非公開]', '住所： 東京都[住所詳細非公開]'].join(
      '\n',
    )
    expect(cleanContent(text)).toBe('住所： 東京都[住所詳細非公開]')
  })
})

describe('mdToHTML', () => {
  it('turns numbered, bracket and symbol lines into h2', () => {
    const html = mdToHTML(['（1）職歴', '(2) 学歴', '【資格】', '■ 自己PR'].join('\n'), KEEP)
    expect(html).toBe(
      ['<h2>職歴</h2>', '<h2>学歴</h2>', '<h2>資格</h2>', '<h2>自己PR</h2>'].join('\n'),
    )
  })

  it('maps markdown #, ##, ### to h2, h3, h4 and escapes heading text', () => {
    const html = mdToHTML(['# A<B>', '## 経歴', '### 詳細'].join('\n'), KEEP)
    expect(html).toBe(['<h2>A&lt;B&gt;</h2>', '<h3>経歴</h3>', '<h4>詳細</h4>'].join('\n'))
  })

  it('promotes short company lines with a year in full-width parens to h3', () => {
    expect(mdToHTML('株式会社サンプル（2018年4月〜2021年3月）', KEEP)).toBe(
      '<h3>株式会社サンプル（2018年4月〜2021年3月）</h3>',
    )
  })

  it('does not promote company-ish lines longer than 48 characters', () => {
    const long = 'あ'.repeat(45) + '（2018年）'
    expect(mdToHTML(long, KEEP)).toBe(`<div>${long}</div>`)
  })

  it('renders --- as a horizontal rule', () => {
    expect(mdToHTML('a\n---\nb', KEEP)).toBe('<div>a</div>\n<hr class="hr">\n<div>b</div>')
  })

  it('renders * and ・ list items with bold support', () => {
    const html = mdToHTML(['* **強調** 項目', '・中黒'].join('\n'), KEEP)
    expect(html).toBe(
      ['<div class="li">・<strong>強調</strong> 項目</div>', '<div class="li">・中黒</div>'].join(
        '\n',
      ),
    )
  })

  it('collapses consecutive blank lines and trims leading/trailing breaks', () => {
    const html = mdToHTML(['', '', 'a', '', '', '', 'b', '', ''].join('\n'), KEEP)
    expect(html).toBe(['<div>a</div>', "<br class='sp'>", '<div>b</div>'].join('\n'))
  })

  it('drops spacer breaks adjacent to headings', () => {
    const html = mdToHTML(['a', '', '## 見出し', '', 'b'].join('\n'), KEEP)
    expect(html).toBe(['<div>a</div>', '<h3>見出し</h3>', '<div>b</div>'].join('\n'))
  })

  it('strips placeholders by default (stripRedactions defaults to true)', () => {
    const html = mdToHTML('連絡先は[メール非公開]まで', { removeRedactionOnlyLines: false })
    expect(html).toBe('<div>連絡先はまで</div>')
  })

  it('leaves placeholders un-highlighted when highlightRedactions is off', () => {
    expect(mdToHTML('担当 [氏名非公開] です', KEEP)).toBe('<div>担当 [氏名非公開] です</div>')
  })

  it('highlights placeholders (including English ones) in plain lines and list items', () => {
    const html = mdToHTML(
      ['担当 [Name Redacted] です', '- 連絡 [電話番号非公開]'].join('\n'),
      HIGHLIGHT,
    )
    expect(html).toBe(
      [
        '<div>担当 <span class="rd">[Name Redacted]</span> です</div>',
        '<div class="li">・連絡 <span class="rd">[電話番号非公開]</span></div>',
      ].join('\n'),
    )
  })

  it('renders kv rows with bold keys and keeps the raw kv value when not stripping', () => {
    const html = mdToHTML('**役職**: リーダー', KEEP)
    expect(html).toBe(
      '<div class="kv"><div class="k"><strong>役職</strong></div><div class="v">リーダー</div></div>',
    )
  })
})

describe('generatePDFHTML', () => {
  it('uses the mincho font import and family when requested', () => {
    const html = generatePDFHTML('本文', 'mincho')
    expect(html).toContain(FONT_IMPORTS.mincho)
    expect(html).toContain(`body{font-family:${FONT_FAMILIES.mincho};`)
    expect(html).not.toContain('Noto+Sans+JP')
  })

  it('falls back to gothic for unknown font types', () => {
    const html = generatePDFHTML('本文', 'comic')
    expect(html).toContain(FONT_IMPORTS.gothic)
    expect(html).toContain(`body{font-family:${FONT_FAMILIES.gothic};`)
  })

  it('applies default md options (strip placeholders, drop redaction-only lines)', () => {
    const html = generatePDFHTML('氏名：[氏名非公開]\n担当[氏名非公開]さん', 'gothic')
    expect(html).toContain('<div class="body"><div>担当さん</div></div>')
    expect(html).not.toContain('非公開')
  })
})
