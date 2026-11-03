import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import {
  arrayBufferToBase64,
  fileTimestamp,
  generateExport,
  triggerDownload,
  type ExportResult,
} from '../export'

const BOM = '\uFEFF'
const XLSX_PREFIX = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,'

/** xlsx の dataUri を読み戻して先頭シートの名前と 2 次元配列を返す */
function readXlsx(ex: ExportResult): { sheetName: string; rows: string[][] } {
  expect(ex.dataUri).toBeDefined()
  const b64 = (ex.dataUri ?? '').slice(XLSX_PREFIX.length)
  const wb = XLSX.read(b64, { type: 'base64' })
  const sheetName = wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
  })
  return { sheetName, rows }
}

describe('fileTimestamp', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('formats local time as YYYYMMDD_HHmm with zero padding', () => {
    vi.setSystemTime(new Date(2024, 0, 5, 9, 7, 59))
    expect(fileTimestamp()).toBe('20240105_0907')
  })

  it('handles two-digit months, days, hours and minutes', () => {
    vi.setSystemTime(new Date(2025, 11, 31, 23, 45))
    expect(fileTimestamp()).toBe('20251231_2345')
  })
})

describe('arrayBufferToBase64', () => {
  it('encodes an ArrayBuffer', () => {
    const buf = new TextEncoder().encode('Hello').buffer
    expect(arrayBufferToBase64(buf)).toBe('SGVsbG8=')
  })

  it('encodes a Uint8Array', () => {
    expect(arrayBufferToBase64(new Uint8Array([0, 255, 128]))).toBe('AP+A')
  })

  it('encodes only the viewed range of a Uint8Array with an offset', () => {
    const backing = new Uint8Array([1, 2, 3, 72, 105, 9])
    const view = backing.subarray(3, 5) // "Hi"
    expect(arrayBufferToBase64(view)).toBe('SGk=')
  })

  it('returns an empty string for an empty buffer', () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('')
  })

  it('matches Buffer encoding across the 8192-byte chunk boundary', () => {
    const bytes = new Uint8Array(20000)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 256
    expect(arrayBufferToBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString('base64'))
  })
})

describe('generateExport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 2, 4, 10, 20, 30))
  })
  afterEach(() => vi.useRealTimers())

  const ts = () => new Date().toLocaleString('ja-JP')

  describe('txt', () => {
    it('prepends a BOM and strips page/sheet markers and leading blank lines', () => {
      const ex = generateExport('\n--- Page 1 ---\n本文A\n-- Sheet: 売上 --\n本文B', 'txt', 'out')
      expect(ex).toEqual({
        data: BOM + '本文A\n本文B',
        mime: 'text/plain;charset=utf-8',
        name: 'out.txt',
      })
    })
  })

  describe('md', () => {
    it('wraps content with a title, export timestamp and a rule', () => {
      const ex = generateExport('本文', 'md', 'resume')
      expect(ex.mime).toBe('text/markdown;charset=utf-8')
      expect(ex.name).toBe('resume.md')
      expect(ex.data).toBe(BOM + `# resume\n\n> Exported: ${ts()}\n\n---\n\n本文`)
    })
  })

  describe('csv', () => {
    it('builds 項目/内容 rows from key-value text when the content is not tabular', () => {
      const text = [
        '【基本情報】',
        '氏名：[氏名非公開]',
        '- スキル: React',
        '・箇条書き',
        '自由記述',
      ].join('\n')
      const ex = generateExport(text, 'csv', 'r')
      expect(ex.mime).toBe('text/csv;charset=utf-8')
      expect(ex.name).toBe('r.csv')
      expect(ex.data).toBe(
        BOM +
          [
            '"項目","内容"',
            '"【基本情報】",""',
            '"氏名","[氏名非公開]"',
            '"スキル","React"',
            '"","箇条書き"',
            '"","自由記述"',
          ].join('\n'),
      )
    })

    it('treats keys longer than 30 characters as plain text rows', () => {
      const longKey = 'あ'.repeat(31)
      const ex = generateExport(`${longKey}：値`, 'csv', 'r')
      expect(ex.data).toBe(BOM + `"項目","内容"\n"","${longKey}：値"`)
    })

    it('reconstructs a table from pipe-separated lines and pads non-pipe lines', () => {
      const text = ['名前 | 年齢', 'A | 1', 'メモ行', 'B | 2'].join('\n')
      const ex = generateExport(text, 'csv', 't')
      expect(ex.data).toBe(BOM + ['"名前","年齢"', '"A","1"', '"メモ行",""', '"B","2"'].join('\n'))
    })

    it('escapes double quotes by doubling them', () => {
      const ex = generateExport('説明：彼は "達人" です', 'csv', 'q')
      expect(ex.data).toContain('"説明","彼は ""達人"" です"')
    })

    it('ignores xlMeta (cell mode is xlsx-only)', () => {
      const ex = generateExport('本文', 'csv', 'c', { xlMeta: [{ aoa: [['x', 'y']] }] })
      expect(ex.data).toBe(BOM + '"項目","内容"\n"","本文"')
    })
  })

  describe('xlsx', () => {
    it('returns a base64 data URI with no mime/data fields', () => {
      const ex = generateExport('氏名：山田', 'xlsx', 'book')
      expect(ex.name).toBe('book.xlsx')
      expect(ex.dataUri?.startsWith(XLSX_PREFIX)).toBe(true)
      expect(ex.data).toBeUndefined()
      expect(ex.mime).toBeUndefined()
      expect(ex.isPrintPdf).toBeUndefined()
    })

    it('writes the key-value fallback into a "マスキング済み" sheet', () => {
      const ex = generateExport('氏名：[氏名非公開]\n自由記述', 'xlsx', 'book')
      const { sheetName, rows } = readXlsx(ex)
      expect(sheetName).toBe('マスキング済み')
      expect(rows).toEqual([
        ['項目', '内容'],
        ['氏名', '[氏名非公開]'],
        ['', '自由記述'],
      ])
    })

    it('uses xlMeta cells directly, concatenating sheets and stringifying null/numbers', () => {
      const ex = generateExport('無視される本文', 'xlsx', 'book', {
        xlMeta: [
          {
            sheetName: 'S1',
            aoa: [
              ['名前', '点数'],
              ['[氏名非公開]', 90],
            ],
          },
          { sheetName: 'S2', aoa: [[null, undefined, 'z']] },
        ],
      })
      const { rows } = readXlsx(ex)
      expect(rows).toEqual([
        ['名前', '点数', ''],
        ['[氏名非公開]', '90', ''],
        ['', '', 'z'],
      ])
    })

    it('falls back to text when xlMeta is empty', () => {
      const ex = generateExport('A | B\n1 | 2', 'xlsx', 'book', { xlMeta: [] })
      expect(readXlsx(ex).rows).toEqual([
        ['A', 'B'],
        ['1', '2'],
      ])
    })
  })

  describe('pdf', () => {
    it('returns print-ready HTML flagged as isPrintPdf', () => {
      const ex = generateExport('氏名：[氏名非公開]', 'pdf', 'cv')
      expect(ex.isPrintPdf).toBe(true)
      expect(ex.mime).toBe('text/html;charset=utf-8')
      expect(ex.name).toBe('cv.html')
      expect(ex.data?.startsWith('<!DOCTYPE html>')).toBe(true)
      expect(ex.data).toContain('<h2>cv</h2>')
      // 現状の挙動: 「**出力日時:** ...」は kv 行として先に分割されるため ** が残る（太字にならない）
      expect(ex.data).toContain(
        `<div class="kv"><div class="k">**出力日時</div><div class="v">** ${ts()}</div></div>`,
      )
      // removeRedactionOnlyLines:false + highlight でプレースホルダー行を残して強調する
      expect(ex.data).toContain('<span class="rd">[氏名非公開]</span>')
      expect(ex.data).toContain(
        '<script>window.onload=function(){window.print();setTimeout(()=>{window.close()},1000)}</script></body>',
      )
    })
  })

  describe('docx', () => {
    it('returns Word-compatible HTML with escaped content and highlighted placeholders', () => {
      const ex = generateExport('a<b>&c\n[氏名非公開] / [Name Redacted] / [その他]', 'docx', 'w')
      expect(ex.mime).toBe('application/msword;charset=utf-8')
      expect(ex.name).toBe('w.docx')
      expect(ex.data?.startsWith(BOM + '<html xmlns:o=')).toBe(true)
      expect(ex.data).toContain('<h1>w</h1>')
      expect(ex.data).toContain(`出力: ${ts()}`)
      expect(ex.data).toContain('a&lt;b&gt;&amp;c<br>')
      expect(ex.data).toContain('<span class="rd">[氏名非公開]</span>')
      expect(ex.data).toContain('<span class="rd">[Name Redacted]</span>')
      expect(ex.data).toContain(' / [その他]</div>')
    })
  })

  describe('unknown format', () => {
    it('falls back to plain text without a BOM', () => {
      expect(generateExport('--- Page 2 ---\nx', 'rtf', 'u')).toEqual({
        data: 'x',
        mime: 'text/plain;charset=utf-8',
        name: 'u.txt',
      })
    })
  })
})

describe('triggerDownload', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('opens print PDFs in a new tab via a blob URL', () => {
    const focus = vi.fn()
    const open = vi.fn(() => ({ focus }))
    const createObjectURL = vi.fn(() => 'blob:x')
    vi.stubGlobal('window', { open })
    vi.stubGlobal('URL', { createObjectURL })

    triggerDownload({ data: '<html></html>', mime: 'text/html', name: 'a.html', isPrintPdf: true })

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(open).toHaveBeenCalledWith('blob:x', '_blank')
    expect(focus).toHaveBeenCalled()
  })

  it('clicks a temporary anchor with a data URL for text exports', () => {
    const anchor = { href: '', download: '', click: vi.fn() }
    const appendChild = vi.fn()
    const removeChild = vi.fn()
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild, removeChild },
    })

    triggerDownload({ data: 'a b', mime: 'text/plain', name: 'a.txt' })

    expect(anchor.href).toBe('data:text/plain,a%20b')
    expect(anchor.download).toBe('a.txt')
    expect(anchor.click).toHaveBeenCalled()
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(removeChild).toHaveBeenCalledWith(anchor)
  })

  it('uses dataUri as-is for xlsx exports', () => {
    const anchor = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', {
      createElement: () => anchor,
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    })
    triggerDownload({ dataUri: 'data:x;base64,AA==', name: 'b.xlsx' })
    expect(anchor.href).toBe('data:x;base64,AA==')
  })

  it('swallows errors (no DOM available)', () => {
    expect(() => triggerDownload({ data: 'x', mime: 'text/plain', name: 'x.txt' })).not.toThrow()
  })
})
