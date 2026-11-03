import { describe, expect, it } from 'vitest'
import { simpleMarkdown } from '../simple-markdown'

describe('simpleMarkdown', () => {
  it('returns an empty string for empty / nullish input', () => {
    expect(simpleMarkdown('')).toBe('')
    expect(simpleMarkdown(null)).toBe('')
    expect(simpleMarkdown(undefined)).toBe('')
  })

  it('escapes HTML before applying markdown', () => {
    expect(simpleMarkdown('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;')
  })

  it('renders headings, bold, bullets and numbered items', () => {
    const html = simpleMarkdown(
      ['## 見出し', '### 小見出し', '- **太字** 項目', '1. 手順'].join('\n'),
    )
    expect(html).toBe(
      [
        '<h3 style="margin:10px 0 4px;font-size:14px;font-weight:700">見出し</h3>',
        '<h4 style="margin:8px 0 4px;font-size:13px;font-weight:700">小見出し</h4>',
        '<div style="padding-left:12px;text-indent:-12px">・<strong>太字</strong> 項目</div>',
        '<div style="padding-left:16px">手順</div>',
      ].join('<br/>'),
    )
  })

  it('turns paragraph breaks into double <br/>', () => {
    expect(simpleMarkdown('a\n\n\nb\nc')).toBe('a<br/><br/>b<br/>c')
  })
})
