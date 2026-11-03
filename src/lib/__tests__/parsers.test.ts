/**
 * ファイルパーサー（src/lib/parsers）のテスト。
 * - Node には FileReader が無いので、readBuf の意味（readAsArrayBuffer → onload で result）を
 *   そのまま再現する最小スタブを stubGlobal する。readBuf 自体は変更しない。
 * - extractTextFromHTML は DOMParser 依存（Node に無い）なので、parseHTML では受け渡しだけを検証する。
 * - pdf.js は本番では CDN から window.pdfjsLib に載る。ネットワークを使わず、同じ API 形の
 *   フェイクを window に置いて parsePDF のレイアウト再構成・タイムアウト・フォールバックを検証する。
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfDocumentProxy, PdfJsLib, PdfLoadingTask, PdfTextItem } from '@/lib/parsers'
import {
  decodeText,
  detectEncoding,
  loadPdfJs,
  parseCSV,
  parseDOCX,
  parseFile,
  parseHTML,
  parseJSON,
  parseMD,
  parseODT,
  parsePDF,
  parseRTF,
  parseTXT,
  parseXLSX,
  readBuf,
  withTimeout,
} from '@/lib/parsers'

vi.mock('@/lib/url-import', () => ({
  extractTextFromHTML: vi.fn((html: string) => `extracted:${html.length}`),
}))

// Node 版 mammoth は { arrayBuffer } 入力を受け付けない（ブラウザ版の unzip のみ対応）。
// ブラウザ版と同じく ArrayBuffer を ZIP として開けるよう、Node 版が読める { buffer } に読み替える。
vi.mock('mammoth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mammoth')>()
  type Input = Parameters<typeof actual.extractRawText>[0]
  return {
    ...actual,
    extractRawText: (input: Input) =>
      'arrayBuffer' in input
        ? actual.extractRawText({ buffer: Buffer.from(input.arrayBuffer) })
        : actual.extractRawText(input),
  }
})

class FileReaderStub {
  result: ArrayBuffer | null = null
  onload: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then(
      (ab) => {
        this.result = ab
        this.onload?.()
      },
      (e: unknown) => this.onerror?.(e),
    )
  }
}

beforeEach(() => {
  vi.stubGlobal('FileReader', FileReaderStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const MOCK_DIR = path.resolve(__dirname, '../../../test-data/mock-resumes')
const fixture = (name: string): File => new File([fs.readFileSync(path.join(MOCK_DIR, name))], name)
const bytes = (...b: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(b)
const fileOf = (content: string | Uint8Array, name: string): File =>
  new File([content as BlobPart], name)
const BS = String.fromCharCode(92)

// "あいう" の各エンコーディング表現
const SJIS_AIU = [0x82, 0xa0, 0x82, 0xa2, 0x82, 0xa4]
const EUC_AIU = [0xa4, 0xa2, 0xa4, 0xa4, 0xa4, 0xa6]

describe('detectEncoding', () => {
  it('UTF-8 BOM を utf-8 と判定する', () => {
    expect(detectEncoding(bytes(0xef, 0xbb, 0xbf, 0x41))).toBe('utf-8')
  })

  it('UTF-16LE BOM (FF FE) を utf-16le と判定する', () => {
    expect(detectEncoding(bytes(0xff, 0xfe, 0x42, 0x30))).toBe('utf-16le')
  })

  it('UTF-16BE BOM (FE FF) は特別扱いせずヒューリスティックで utf-8 になる', () => {
    expect(detectEncoding(bytes(0xfe, 0xff, 0x30, 0x42))).toBe('utf-8')
  })

  it('空・ASCII のみは utf-8', () => {
    expect(detectEncoding(bytes())).toBe('utf-8')
    expect(detectEncoding(new TextEncoder().encode('hello, world'))).toBe('utf-8')
  })

  it('BOM 無し UTF-8 の日本語を utf-8 と判定する', () => {
    expect(detectEncoding(new TextEncoder().encode('職務経歴書 山田太郎'))).toBe('utf-8')
  })

  it('Shift_JIS（2 バイト目が 0x80-0xFC）を shift_jis と判定する', () => {
    expect(detectEncoding(bytes(...SJIS_AIU))).toBe('shift_jis')
  })

  it('EUC-JP（両バイト 0xA1-0xFE）を euc-jp と判定する', () => {
    expect(detectEncoding(bytes(...EUC_AIU))).toBe('euc-jp')
  })

  it('Shift_JIS の半角カナ連続は EUC-JP の 2 バイト文字と区別できず euc-jp になる', () => {
    // ｱｲｳ = B1 B2 B3
    expect(detectEncoding(bytes(0xb1, 0xb2, 0xb3))).toBe('euc-jp')
  })

  it('先頭 10000 バイトしか走査しない', () => {
    const b = new Uint8Array(10000 + SJIS_AIU.length).fill(0x41)
    b.set(SJIS_AIU, 10000)
    expect(detectEncoding(b)).toBe('utf-8')
  })
})

describe('decodeText', () => {
  it('Shift_JIS を判定してデコードする', () => {
    expect(decodeText(bytes(...SJIS_AIU).buffer)).toEqual({ text: 'あいう', encoding: 'shift_jis' })
  })

  it('EUC-JP を判定してデコードする', () => {
    expect(decodeText(bytes(...EUC_AIU).buffer)).toEqual({ text: 'あいう', encoding: 'euc-jp' })
  })

  it('UTF-8 BOM はデコード結果に残らない', () => {
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0x41, 0x42).buffer)).toEqual({
      text: 'AB',
      encoding: 'utf-8',
    })
  })

  it('UTF-16LE をデコードする', () => {
    // BOM + あ(U+3042) + い(U+3044)
    expect(decodeText(bytes(0xff, 0xfe, 0x42, 0x30, 0x44, 0x30).buffer)).toEqual({
      text: 'あい',
      encoding: 'utf-16le',
    })
  })
})

describe('readBuf', () => {
  it('Blob の中身を ArrayBuffer で返す', async () => {
    const ab = await readBuf(new Blob([bytes(1, 2, 3) as BlobPart]))
    expect(Array.from(new Uint8Array(ab))).toEqual([1, 2, 3])
  })
})

describe('withTimeout', () => {
  it('timeoutMs が 0 以下・未指定なら同じ Promise をそのまま返す', () => {
    const p = Promise.resolve(1)
    expect(withTimeout(p, 0, 'x')).toBe(p)
    expect(withTimeout(p, -5, 'x')).toBe(p)
    expect(withTimeout(p, undefined, 'x')).toBe(p)
  })

  it('期限内に解決すれば値を返し、onTimeout は呼ばない', async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const r = withTimeout(Promise.resolve('ok'), 1000, 'timeout', onTimeout)
    await expect(r).resolves.toBe('ok')
    await vi.advanceTimersByTimeAsync(2000)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('期限切れで msg の Error で reject し、onTimeout を呼ぶ', async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const r = withTimeout(new Promise<never>(() => {}), 1000, '時間切れ', onTimeout)
    const settled = expect(r).rejects.toThrow('時間切れ')
    await vi.advanceTimersByTimeAsync(1000)
    await settled
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('onTimeout が例外を投げても msg で reject する', async () => {
    vi.useFakeTimers()
    const r = withTimeout(new Promise<never>(() => {}), 10, '時間切れ', () => {
      throw new Error('cleanup failed')
    })
    const settled = expect(r).rejects.toThrow('時間切れ')
    await vi.advanceTimersByTimeAsync(10)
    await settled
  })

  it('元の Promise の reject をそのまま伝える', async () => {
    const err = new Error('boom')
    await expect(withTimeout(Promise.reject(err), 1000, 'timeout')).rejects.toBe(err)
  })
})

describe('テキスト系パーサー', () => {
  it('parseTXT は文字コードを format に含める', async () => {
    await expect(parseTXT(fileOf(bytes(...SJIS_AIU), 'a.txt'))).resolves.toEqual({
      text: 'あいう',
      pageCount: null,
      format: 'Text (shift_jis)',
    })
  })

  it('parseMD は Markdown として返す', async () => {
    await expect(parseMD(fileOf('# 見出し\n本文', 'a.md'))).resolves.toEqual({
      text: '# 見出し\n本文',
      pageCount: null,
      format: 'Markdown (utf-8)',
    })
  })

  it('parseCSV は空セルだけの行を除き、セルを " | " で連結する', async () => {
    const r = await parseCSV(fileOf('氏名,電話\n,\n"山田, 太郎",090\n\n', 'a.csv'))
    expect(r).toEqual({
      text: '氏名 | 電話\n山田, 太郎 | 090',
      pageCount: null,
      format: 'CSV (utf-8)',
    })
  })

  it('parseCSV は Shift_JIS の CSV も読める', async () => {
    const r = await parseCSV(fileOf(bytes(...SJIS_AIU, 0x2c, 0x41), 'a.csv'))
    expect(r.text).toBe('あいう | A')
    expect(r.format).toBe('CSV (shift_jis)')
  })

  it('parseJSON は値をパス付きで列挙し、null/undefined は除く', async () => {
    const json = JSON.stringify({
      name: '山田',
      tags: ['a', 1, null, true],
      nested: { x: { y: 'z' } },
    })
    await expect(parseJSON(fileOf(json, 'a.json'))).resolves.toEqual({
      text: 'name: 山田\ntags[0]: a\ntags[1]: 1\ntags[3]: true\nnested.x.y: z',
      pageCount: null,
      format: 'JSON',
    })
  })

  it('parseJSON はトップレベルのスカラーをパス無しで返す', async () => {
    expect((await parseJSON(fileOf('"abc"', 'a.json'))).text).toBe(': abc')
  })

  it('parseJSON は不正な JSON を生テキストで返す', async () => {
    await expect(parseJSON(fileOf('{ broken', 'a.json'))).resolves.toEqual({
      text: '{ broken',
      pageCount: null,
      format: 'JSON (raw)',
    })
  })

  it('parseRTF は表・制御語・波括弧を除き、改行/タブ/16 進文字を復元する', async () => {
    const rtf = String.raw`{\rtf1\ansi{\fonttbl{\f0 Arial;}}{\colortbl;\red0\green0\blue0;}\f0 Hello\par World\tab X\'41}`
    await expect(parseRTF(fileOf(rtf, 'a.rtf'))).resolves.toEqual({
      text: 'Hello\nWorld\tXA',
      pageCount: null,
      format: 'RTF',
    })
  })

  it('parseRTF は Unicode 制御語を文字に戻す', async () => {
    // 山 = 23665, 田 = 30000
    const rtf = `{${BS}rtf1 ${BS}u23665?${BS}u30000?}`
    expect((await parseRTF(fileOf(rtf, 'a.rtf'))).text).toBe('山田')
  })

  it('parseHTML はデコードした HTML を extractTextFromHTML に渡す', async () => {
    const { extractTextFromHTML } = await import('@/lib/url-import')
    const html = '<p>山田</p>'
    await expect(parseHTML(fileOf(html, 'a.html'))).resolves.toEqual({
      text: `extracted:${html.length}`,
      pageCount: null,
      format: 'HTML',
    })
    expect(extractTextFromHTML).toHaveBeenCalledWith(html)
  })
})

describe('Word / ODT パーサー', () => {
  it('ZIP でない DOCX はタグを剥がした簡易抽出に落ちる', async () => {
    const xml = '<w:t>山田太郎の職務経歴書です。連絡先と住所は別紙に記載しています。</w:t>'
    await expect(parseDOCX(fileOf(xml, 'a.docx'))).resolves.toEqual({
      text: '山田太郎の職務経歴書です。連絡先と住所は別紙に記載しています。',
      pageCount: null,
      format: 'Word (basic)',
    })
  })

  it('DOCX として読めず簡易抽出も短すぎればエラーにする', async () => {
    await expect(parseDOCX(fileOf('x', 'a.docx'))).rejects.toThrow(
      /^DOCX解析エラー: [\s\S]*\nファイルが破損している可能性があります$/,
    )
  })

  it('ZIP でない ODT は印字可能な語だけを拾う簡易抽出に落ちる', async () => {
    const xml = '<text:p>alpha beta gamma delta epsilon zeta</text:p>'
    await expect(parseODT(fileOf(xml, 'a.odt'))).resolves.toEqual({
      text: 'alpha beta gamma delta epsilon zeta',
      pageCount: null,
      format: 'ODT (basic)',
    })
  })

  it('ODT から語が取れなければ DOCX 保存を勧めるエラーにする', async () => {
    await expect(parseODT(fileOf('x y', 'a.odt'))).rejects.toThrow(
      'ODTの解析に失敗しました。Word(.docx)形式での保存を推奨します。',
    )
  })
})

describe('実ファイル（test-data/mock-resumes）', () => {
  it('parseXLSX: 社員名簿.xlsx からシート単位のテキストとセル構造を取り出す', async () => {
    const r = await parseXLSX(fixture('15_社員名簿.xlsx'))
    expect(r.format).toBe('Excel')
    expect(r.pageCount).toBeGreaterThanOrEqual(1)
    expect(r.text).toMatch(/^--- Sheet: .+ ---\n/)
    expect(r.text).toContain('高橋翔太')
    expect(r.xlMeta.length).toBeGreaterThanOrEqual(1)
    expect(r.xlMeta[0].aoa[0]).toContain('氏名')
    expect(r.xlMeta[0].aoa.every((row) => row.every((c) => typeof c === 'string'))).toBe(true)
  })

  it('parseCSV: 社員名簿.csv を UTF-8 として読み、セルを " | " で連結する', async () => {
    const r = await parseCSV(fixture('15_社員名簿.csv'))
    expect(r.format).toBe('CSV (utf-8)')
    expect(r.text.split('\n')[0]).toBe(
      '社員番号 | 氏名 | フリガナ | 生年月日 | 性別 | 住所 | 電話番号 | メールアドレス | 部署 | 役職 | 入社日 | 年収',
    )
    expect(r.text).toContain('EMP-001 | 高橋翔太 | タカハシショウタ')
  })

  it('parseDOCX: 看護師の職務経歴書.docx を mammoth で抽出する', async () => {
    const r = await parseDOCX(fixture('05_職務経歴書_看護師.docx'))
    expect(r.format).toBe('Word (DOCX)')
    expect(r.pageCount).toBe(Math.max(1, Math.ceil(r.text.length / 1500)))
    expect(r.text).toContain('職務経歴書')
    expect(r.text).toContain('中村')
    expect(r.text).not.toMatch(/\n\n\n\n/)
  })

  it('parseFile: RTF / JSON / Markdown の実ファイルを読める', async () => {
    const rtf = await parseFile(fixture('04_職務経歴書_営業職.rtf'))
    expect(rtf.format).toBe('RTF')
    expect(rtf.text.startsWith('職務経歴書')).toBe(true)
    expect(rtf.text).not.toMatch(/[{}\\]/)

    const json = await parseFile(fixture('13_スキルシート_SES.json'))
    expect(json.format).toBe('JSON')
    expect(json.text).toContain('documentType: スキルシート')

    const md = await parseFile(fixture('03_職務経歴書_デザイナー.md'))
    expect(md.format).toBe('Markdown (utf-8)')
    expect(md.text).toContain('## 職務要約')
  })
})

describe('parseFile', () => {
  it.each([
    ['a.TXT', 'Text (utf-8)'],
    ['a.tsv', 'Text (utf-8)'],
    ['a.md', 'Markdown (utf-8)'],
    ['a.markdown', 'Markdown (utf-8)'],
    ['a.csv', 'CSV (utf-8)'],
    ['a.json', 'JSON'],
    ['a.rtf', 'RTF'],
    ['a.htm', 'HTML'],
    ['a.html', 'HTML'],
  ])('%s を拡張子（大文字小文字無視）で振り分ける → %s', async (name, format) => {
    expect((await parseFile(fileOf('{"k":"v"}', name))).format).toBe(format)
  })

  it('未対応の拡張子は対応形式一覧つきのエラーにする', async () => {
    await expect(parseFile(fileOf('x', 'virus.exe'))).rejects.toThrow(
      '未対応: .exe\n対応形式: PDF, Word(.docx/.doc), Excel(.xlsx/.xls), ODS, CSV, TSV, TXT, Markdown, HTML, RTF, JSON, ODT',
    )
  })

  it('拡張子が無いファイル名は名前全体を拡張子として扱う', async () => {
    await expect(parseFile(fileOf('x', 'README'))).rejects.toThrow(/^未対応: \.readme\n/)
  })

  it('行末空白・3 連以上の改行・先頭改行を整え、normalizeText をかける', async () => {
    const r = await parseFile(fileOf('\n\nＡＢＣ１２３  \n\n\n\nnext   line\t\n\n', 'a.txt'))
    expect(r.text).toBe('ABC123\n\nnext line')
  })
})

// ─── pdf.js フェイク ───

const item = (str: string, x: number, y: number, w: number, fs = 10): PdfTextItem => ({
  str,
  transform: [fs, 0, 0, fs, x, y],
  width: w,
  height: fs,
})

interface FakePdf {
  lib: PdfJsLib
  getDocument: ReturnType<typeof vi.fn>
  taskDestroy: ReturnType<typeof vi.fn>
  docDestroy: ReturnType<typeof vi.fn>
}

function fakePdfJs(
  pages: PdfTextItem[][],
  documentPromises?: Array<() => Promise<PdfDocumentProxy>>,
): FakePdf {
  const taskDestroy = vi.fn()
  const docDestroy = vi.fn()
  const doc: PdfDocumentProxy = {
    numPages: pages.length,
    getPage: async (n) => ({ getTextContent: async () => ({ items: pages[n - 1] }) }),
    cleanup: vi.fn(),
    destroy: docDestroy,
  }
  let call = 0
  const getDocument = vi.fn((): PdfLoadingTask => {
    const make = documentPromises?.[call++]
    return { promise: make ? make() : Promise.resolve(doc), destroy: taskDestroy }
  })
  return {
    lib: { GlobalWorkerOptions: { workerSrc: '' }, getDocument },
    getDocument,
    taskDestroy,
    docDestroy,
  }
}

const pdfFile = () => fileOf(bytes(0x25, 0x50, 0x44, 0x46), 'a.pdf')
const LONG_JP = 'これは十分に長い本文テキストの行でありスパース判定を避けるためのものです'

describe('loadPdfJs', () => {
  it('window.pdfjsLib が既にあれば何もしない', async () => {
    const { lib } = fakePdfJs([])
    vi.stubGlobal('window', { pdfjsLib: lib })
    const onProgress = vi.fn()
    await loadPdfJs({ onProgress })
    expect(onProgress).not.toHaveBeenCalled()
    expect(lib.GlobalWorkerOptions.workerSrc).toBe('')
  })

  it('script を挿入し、読み込み後に workerSrc を設定する', async () => {
    const { lib } = fakePdfJs([])
    const win: { pdfjsLib?: PdfJsLib } = {}
    const script: { src?: string; onload?: () => void } = {}
    vi.stubGlobal('window', win)
    vi.stubGlobal('document', {
      createElement: () => script,
      head: {
        appendChild: () => {
          win.pdfjsLib = lib
          script.onload?.()
        },
      },
    })
    const onProgress = vi.fn()
    await loadPdfJs({ onProgress })
    expect(onProgress).toHaveBeenCalledWith('PDF: PDF.js読込中...')
    expect(script.src).toBe('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
    expect(lib.GlobalWorkerOptions.workerSrc).toBe(
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    )
  })

  it('script の読み込み失敗を日本語エラーで返す', async () => {
    const script: { onerror?: () => void } = {}
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      createElement: () => script,
      head: { appendChild: () => script.onerror?.() },
    })
    await expect(loadPdfJs()).rejects.toThrow('PDF.jsの読み込みに失敗しました')
  })
})

describe('parsePDF（pdf.js フェイク）', () => {
  it('行・段組・CJK 連結を再構成し、テキストの少ないページを sparsePages にする', async () => {
    const { lib, getDocument, docDestroy } = fakePdfJs([
      [
        item('氏名', 50, 700, 20),
        item('山田太郎', 200, 700, 40), // 前の語の終端から 130 離れている → 段組区切り
        item('World', 80, 680, 25), // Hello の終端 75 から 5 > fs*0.3 → 空白を挟む
        item('Hello', 50, 680, 25),
        item('東京', 50, 660, 20),
        item('都', 71, 660, 10), // CJK 同士で隙間 1 < fs*0.8 → 空白なし
        item(LONG_JP, 50, 640, 300),
        item('   ', 50, 620, 10), // 空白のみは無視
      ],
      [],
      [item('abc', 50, 700, 15)],
    ])
    vi.stubGlobal('window', { pdfjsLib: lib })
    const onProgress = vi.fn()
    const file = pdfFile()
    const r = await parsePDF(file, { onProgress })

    expect(r.text).toBe(
      '--- Page 1 ---\n氏名 | 山田太郎\nHello World\n東京都\n' +
        LONG_JP +
        '\n\n' +
        '--- Page 2 ---\n\n' +
        '--- Page 3 ---\nabc\n\n',
    )
    expect(r.pageCount).toBe(3)
    expect(r.format).toBe('PDF')
    // 項目ゼロのページは continue されるため sparsePages に入らない（現行挙動）
    expect(r.sparsePages).toEqual([3])
    expect(r.cmapFailed).toBe(false)
    expect(r.pdfData.byteLength).toBe(file.size)
    expect(getDocument).toHaveBeenCalledTimes(1)
    expect(getDocument.mock.calls[0][0]).toMatchObject({
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
    })
    expect(docDestroy).toHaveBeenCalled()
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
      'PDF: ファイル読込中...',
      'PDF: 読み込み中（CMap）...',
      'PDF: 33% (1/3) ページ抽出中...',
      'PDF: 67% (2/3) ページ抽出中...',
      'PDF: 100% (3/3) ページ抽出中...',
    ])
  })

  it('同じ X に縦に並んだ 1 文字の CJK を縦書き見出しとしてまとめる', async () => {
    const { lib } = fakePdfJs([
      [
        item('縦', 10, 600, 10),
        item('書', 10, 588, 10),
        item('見', 10, 576, 10),
        item('出', 10, 564, 10),
        item(LONG_JP, 100, 500, 300),
      ],
    ])
    vi.stubGlobal('window', { pdfjsLib: lib })
    const r = await parsePDF(pdfFile())
    expect(r.text).toBe(`--- Page 1 ---\n[縦書見出]\n${LONG_JP}\n\n`)
  })

  it('3 ページ以上で日本語がほぼ無いと CMap 失敗とみなし全ページを OCR 対象にする', async () => {
    const en = 'This is a sufficiently long English line of text'
    const { lib } = fakePdfJs([[item(en, 0, 0, 300)], [item(en, 0, 0, 300)], [item(en, 0, 0, 300)]])
    vi.stubGlobal('window', { pdfjsLib: lib })
    const r = await parsePDF(pdfFile())
    expect(r.cmapFailed).toBe(true)
    expect(r.sparsePages).toEqual([1, 2, 3])
  })

  it('CMap 付きの読み込みに失敗したら CMap なしで再試行する', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ok = fakePdfJs([[item(LONG_JP, 0, 0, 300)]])
    const { lib, getDocument } = fakePdfJs(
      [],
      [
        () => Promise.reject(new Error('cmap')),
        () => ok.lib.getDocument({ data: new ArrayBuffer(0) }).promise,
      ],
    )
    vi.stubGlobal('window', { pdfjsLib: lib })
    const onProgress = vi.fn()
    const r = await parsePDF(pdfFile(), { onProgress })
    expect(r.text).toBe(`--- Page 1 ---\n${LONG_JP}\n\n`)
    expect(getDocument).toHaveBeenCalledTimes(2)
    expect(getDocument.mock.calls[1][0]).not.toHaveProperty('cMapUrl')
    expect(warn).toHaveBeenCalledWith('PDF with CMap failed, retrying without:', expect.any(Error))
    expect(onProgress).toHaveBeenCalledWith('PDF: 読み込み再試行（通常）...')
  })

  it('getDocument が応答しなければ段階タイムアウトで打ち切り、loadingTask を破棄する', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const never = () => new Promise<PdfDocumentProxy>(() => {})
    const { lib, getDocument, taskDestroy } = fakePdfJs([], [never, never])
    vi.stubGlobal('window', { pdfjsLib: lib })

    const settled = expect(parsePDF(pdfFile())).rejects.toThrow(
      'PDFのテキスト抽出がタイムアウトしました（最大60秒）。',
    )
    await vi.waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(25_000)
    await vi.waitFor(() => expect(getDocument).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(25_000)
    await settled
    expect(taskDestroy).toHaveBeenCalledTimes(2)
  })

  it('parseFile は .pdf を parsePDF に回し、進捗コールバックを渡す', async () => {
    const { lib } = fakePdfJs([[item(LONG_JP, 0, 0, 300)]])
    vi.stubGlobal('window', { pdfjsLib: lib })
    const onProgress = vi.fn()
    const r = await parseFile(pdfFile(), onProgress)
    expect(r.format).toBe('PDF')
    expect(r.text).toBe(`--- Page 1 ---\n${LONG_JP}`)
    expect(onProgress).toHaveBeenCalledWith('PDF: ファイル読込中...')
  })
})
