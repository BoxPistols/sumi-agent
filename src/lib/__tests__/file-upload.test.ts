/**
 * ファイルアップロードテスト: test-data/mock-resumes の各形式ファイルを
 * 実際のパーサーロジック（xlsx, papaparse, mammoth等）で読み込み、
 * テキスト抽出が正常に行われることを検証する。
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { detectAll } from '../detection'

const MOCK_DIR = path.resolve(__dirname, '../../../test-data/mock-resumes')

function readFile(filename: string): Buffer {
  return fs.readFileSync(path.join(MOCK_DIR, filename))
}

function fileExists(filename: string): boolean {
  return fs.existsSync(path.join(MOCK_DIR, filename))
}

// ═══ TXT形式 ═══
describe('TXTファイル読み込み', () => {
  const txtFiles = [
    '01_職務経歴書_ITエンジニア.txt',
    '02_履歴書_事務職.txt',
    '03_職務経歴書_デザイナー.txt',
    '04_職務経歴書_営業職.txt',
    '05_職務経歴書_看護師.txt',
    '06_英文レジュメ_PM.txt',
    '07_職務経歴書_飲食店長.txt',
    '08_職務経歴書_会計士.txt',
    '09_アルバイト応募_大学生.txt',
    '10_職務経歴書_外国人_日本語.txt',
    '11_職務経歴書_建設現場監督.txt',
    '12_推薦書_人材紹介会社.txt',
    '13_スキルシート_SES.txt',
    '14_経歴書_クリエイティブ職.txt',
    '15_社員名簿_CSV形式.txt',
    '16_職務経歴書_介護福祉士.txt',
    '17_職務経歴書_教員.txt',
    '18_職務経歴書_薬剤師.txt',
  ]

  for (const file of txtFiles) {
    it(`${file} を読み込める`, () => {
      expect(fileExists(file)).toBe(true)
      const buf = readFile(file)
      const text = buf.toString('utf-8')
      expect(text.length).toBeGreaterThan(100)
      // テキストに何らかの日本語が含まれる（06は英文だが拡張子で分岐するので除外）
      if (!file.includes('英文')) {
        expect(text).toMatch(/[\u3000-\u9FFF]/)
      }
    })
  }

  it('01_ITエンジニア.txt に氏名・メール・電話が含まれる', () => {
    const text = readFile('01_職務経歴書_ITエンジニア.txt').toString('utf-8')
    expect(text).toContain('山田')
    expect(text).toContain('yamada.taro@example.com')
    expect(text).toContain('090-1234-5678')
  })
})

// ═══ CSV形式 ═══
describe('CSVファイル読み込み', () => {
  it('15_社員名簿.csv を読み込み・パースできる', () => {
    expect(fileExists('15_社員名簿.csv')).toBe(true)
    const text = readFile('15_社員名簿.csv').toString('utf-8')
    const result = Papa.parse(text, { header: false, skipEmptyLines: true })
    expect(result.data.length).toBeGreaterThanOrEqual(2) // ヘッダ + 1行以上
    // ヘッダ行に「氏名」が含まれる
    const header = (result.data[0] as string[]).join(',')
    expect(header).toContain('氏名')
  })

  it('CSVから全従業員データをテキスト抽出できる', () => {
    const text = readFile('15_社員名簿.csv').toString('utf-8')
    const result = Papa.parse(text, { header: false, skipEmptyLines: true })
    const rows = result.data as string[][]
    const joined = rows.filter(r => r.some(c => c.trim())).map(r => r.join(' | ')).join('\n')
    // 10名分のデータ
    expect(joined).toContain('高橋翔太')
    expect(joined).toContain('井上')
    expect(joined).toContain('@company.co.jp')
    expect(rows.length).toBeGreaterThanOrEqual(11) // ヘッダ + 10名
  })
})

// ═══ XLSX形式 ═══
describe('XLSXファイル読み込み', () => {
  it('15_社員名簿.xlsx を読み込み・パースできる', () => {
    expect(fileExists('15_社員名簿.xlsx')).toBe(true)
    const buf = readFile('15_社員名簿.xlsx')
    const wb = XLSX.read(buf, { type: 'buffer', codepage: 932, raw: false, cellDates: true })
    expect(wb.SheetNames.length).toBeGreaterThanOrEqual(1)
  })

  it('XLSXからテキスト抽出で全従業員データが取れる', () => {
    const buf = readFile('15_社員名簿.xlsx')
    const wb = XLSX.read(buf, { type: 'buffer', codepage: 932, raw: false, cellDates: true })
    let text = ''
    for (const sn of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn], { FS: ' | ', blankrows: false })
      const cl = csv.split('\n').filter(l => l.replace(/[\s|]/g, '').length > 0).join('\n')
      if (cl) text += `--- Sheet: ${sn} ---\n${cl}\n\n`
    }
    expect(text).toContain('高橋翔太')
    expect(text).toContain('045-123-4567')
    expect(text).toContain('@company.co.jp')
  })
})

// ═══ HTML形式 ═══
describe('HTMLファイル読み込み', () => {
  it('01_職務経歴書_ITエンジニア.html を読み込める', () => {
    expect(fileExists('01_職務経歴書_ITエンジニア.html')).toBe(true)
    const text = readFile('01_職務経歴書_ITエンジニア.html').toString('utf-8')
    expect(text).toContain('<')
    expect(text.length).toBeGreaterThan(100)
  })

  it('HTMLからテキスト抽出で個人情報が含まれる', () => {
    const html = readFile('01_職務経歴書_ITエンジニア.html').toString('utf-8')
    // HTMLタグを除去してテキスト抽出（アプリのextractTextFromHTMLと同等）
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|h[1-6]|li|tr|dt|dd)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s{2,}/g, ' ')
      .trim()
    expect(text).toContain('山田')
    expect(text.length).toBeGreaterThan(200)
  })
})

// ═══ Markdown形式 ═══
describe('Markdownファイル読み込み', () => {
  it('03_職務経歴書_デザイナー.md を読み込める', () => {
    expect(fileExists('03_職務経歴書_デザイナー.md')).toBe(true)
    const text = readFile('03_職務経歴書_デザイナー.md').toString('utf-8')
    expect(text.length).toBeGreaterThan(100)
  })

  it('Markdownに見出し記法とPIIが含まれる', () => {
    const text = readFile('03_職務経歴書_デザイナー.md').toString('utf-8')
    expect(text).toMatch(/^##\s/m) // Markdown見出し
    expect(text).toContain('朝霧')
    expect(text).toContain('070-2345-6789')
    expect(text).toContain('asagiri.haruka@icloud.com')
  })
})

// ═══ JSON形式 ═══
describe('JSONファイル読み込み', () => {
  it('13_スキルシート_SES.json を読み込み・パースできる', () => {
    expect(fileExists('13_スキルシート_SES.json')).toBe(true)
    const text = readFile('13_スキルシート_SES.json').toString('utf-8')
    const obj = JSON.parse(text)
    expect(obj).toBeDefined()
    expect(obj.documentType).toBe('スキルシート')
  })

  it('JSONから再帰的にテキスト抽出できる', () => {
    const text = readFile('13_スキルシート_SES.json').toString('utf-8')
    const obj = JSON.parse(text)

    function extract(o: unknown, p = ''): string {
      if (typeof o === 'string') return `${p}: ${o}`
      if (Array.isArray(o)) return o.map((v, i) => extract(v, `${p}[${i}]`)).filter(Boolean).join('\n')
      if (o && typeof o === 'object') return Object.entries(o).map(([k, v]) => extract(v, p ? `${p}.${k}` : k)).filter(Boolean).join('\n')
      if (o !== null && o !== undefined) return `${p}: ${String(o)}`
      return ''
    }

    const extracted = extract(obj)
    expect(extracted).toContain('池田 悠人')
    expect(extracted).toContain('080-5678-9012')
    expect(extracted).toContain('ikeda.yuto@technopro.com')
    expect(extracted).toContain('75万円/月')
  })
})

// ═══ RTF形式 ═══
describe('RTFファイル読み込み', () => {
  it('04_職務経歴書_営業職.rtf を読み込める', () => {
    expect(fileExists('04_職務経歴書_営業職.rtf')).toBe(true)
    const buf = readFile('04_職務経歴書_営業職.rtf')
    expect(buf.length).toBeGreaterThan(100)
  })

  it('RTFからUnicodeエスケープでテキスト抽出できる', () => {
    const raw = readFile('04_職務経歴書_営業職.rtf').toString('utf-8')
    // アプリのRTFパーサーと同等の処理
    let result = raw
    result = result.replace(/\{\\fonttbl[^}]*(\{[^}]*\})*[^}]*\}/g, '')
    result = result.replace(/\{\\colortbl[^}]*\}/g, '')
    result = result.replace(/\\par[d]?\s?/g, '\n')
    result = result.replace(/\\line\s?/g, '\n')
    result = result.replace(/\\tab\s?/g, '\t')
    result = result.replace(/\\\n/g, '\n')
    result = result.replace(/\\'([0-9a-fA-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    result = result.replace(/\\u(\d+)\s?\??/g, (_m, n) => String.fromCharCode(parseInt(n)))
    result = result.replace(/\\[a-z]+[-]?\d*\s?/g, '')
    result = result.replace(/[{}]/g, '')
    result = result.replace(/\n{3,}/g, '\n\n').trim()

    // RTFのUnicodeエスケープ経由で日本語テキストが復元される
    expect(result).toContain('職務経歴書')
    expect(result).toContain('090-3456-7890')
    expect(result).toContain('takahashi.shota@outlook.jp')
  })
})

// ═══ DOCX形式 ═══
describe('DOCXファイル読み込み', () => {
  it('05_職務経歴書_看護師.docx を読み込める', async () => {
    expect(fileExists('05_職務経歴書_看護師.docx')).toBe(true)
    const buf = readFile('05_職務経歴書_看護師.docx')
    // ZIPマジックナンバー (PK)
    expect(buf[0]).toBe(0x50) // 'P'
    expect(buf[1]).toBe(0x4B) // 'K'
  })

  it('DOCXからmammothでテキスト抽出できる', async () => {
    const mammoth = await import('mammoth')
    const filePath = path.join(MOCK_DIR, '05_職務経歴書_看護師.docx')
    const result = await mammoth.extractRawText({ path: filePath })
    const text = result.value || ''
    expect(text.length).toBeGreaterThan(100)
    expect(text).toContain('看護師')
  })
})

// ═══ クロスフォーマット: 同一内容の形式間一致 ═══
describe('クロスフォーマット一致テスト', () => {
  it('01_ITエンジニア: TXTとHTMLから同じ氏名・メールが抽出される', () => {
    const txtText = readFile('01_職務経歴書_ITエンジニア.txt').toString('utf-8')
    const htmlRaw = readFile('01_職務経歴書_ITエンジニア.html').toString('utf-8')
    const htmlText = htmlRaw
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim()

    // 同じPIIが両方に含まれる
    expect(txtText).toContain('yamada.taro@example.com')
    expect(htmlText).toContain('yamada.taro@example.com')
    expect(txtText).toContain('090-1234-5678')
    expect(htmlText).toContain('090-1234-5678')
  })

  it('15_社員名簿: CSVとXLSXから同じデータが抽出される', () => {
    // CSV
    const csvText = readFile('15_社員名簿.csv').toString('utf-8')
    const csvResult = Papa.parse(csvText, { header: false, skipEmptyLines: true })
    const csvJoined = (csvResult.data as string[][]).map(r => r.join(',')).join('\n')

    // XLSX
    const xlsBuf = readFile('15_社員名簿.xlsx')
    const wb = XLSX.read(xlsBuf, { type: 'buffer', codepage: 932, raw: false, cellDates: true })
    const xlsText = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { blankrows: false })

    // 両方に同じ従業員データが含まれる
    for (const name of ['高橋翔太', '山田', '佐藤大介', '渡辺', '伊藤康平']) {
      expect(csvJoined).toContain(name)
      expect(xlsText).toContain(name)
    }
  })

  it('13_スキルシート: TXTとJSONから同じPIIが抽出される', () => {
    const txtText = readFile('13_スキルシート_SES.txt').toString('utf-8')
    const jsonText = readFile('13_スキルシート_SES.json').toString('utf-8')
    const obj = JSON.parse(jsonText)

    // 両方に同じ個人情報
    expect(txtText).toContain('池田 悠人')
    expect(obj.rawText).toContain('池田 悠人')
    expect(txtText).toContain('080-5678-9012')
    expect(obj.rawText).toContain('080-5678-9012')
  })
})

// ═══ 対応形式の網羅テスト ═══
describe('全形式ファイル存在確認', () => {
  const expectedFiles = [
    // TXT (18種)
    '01_職務経歴書_ITエンジニア.txt',
    '02_履歴書_事務職.txt',
    '03_職務経歴書_デザイナー.txt',
    '04_職務経歴書_営業職.txt',
    '05_職務経歴書_看護師.txt',
    '06_英文レジュメ_PM.txt',
    '07_職務経歴書_飲食店長.txt',
    '08_職務経歴書_会計士.txt',
    '09_アルバイト応募_大学生.txt',
    '10_職務経歴書_外国人_日本語.txt',
    '11_職務経歴書_建設現場監督.txt',
    '12_推薦書_人材紹介会社.txt',
    '13_スキルシート_SES.txt',
    '14_経歴書_クリエイティブ職.txt',
    '15_社員名簿_CSV形式.txt',
    '16_職務経歴書_介護福祉士.txt',
    '17_職務経歴書_教員.txt',
    '18_職務経歴書_薬剤師.txt',
    // 他形式
    '15_社員名簿.csv',
    '15_社員名簿.xlsx',
    '01_職務経歴書_ITエンジニア.html',
    '03_職務経歴書_デザイナー.md',
    '13_スキルシート_SES.json',
    '04_職務経歴書_営業職.rtf',
    '05_職務経歴書_看護師.docx',
  ]

  for (const file of expectedFiles) {
    it(`${file} が存在する`, () => {
      expect(fileExists(file)).toBe(true)
      const stat = fs.statSync(path.join(MOCK_DIR, file))
      expect(stat.size).toBeGreaterThan(0)
    })
  }
})

// ═══ 検出パイプライン統合: 各形式から抽出→検出 ═══
describe('形式別検出パイプライン', () => {

  it('CSV形式から個人情報を検出できる', () => {
    const text = readFile('15_社員名簿.csv').toString('utf-8')
    const csvResult = Papa.parse(text, { header: false, skipEmptyLines: true })
    const rows = csvResult.data as string[][]
    const joined = rows.filter(r => r.some(c => c.trim())).map(r => r.join(' | ')).join('\n')
    const dets = detectAll(joined)
    expect(dets.filter(d => d.type === 'email').length).toBeGreaterThanOrEqual(5)
    expect(dets.filter(d => d.type === 'phone').length).toBeGreaterThanOrEqual(5)
  })

  it('XLSX形式から個人情報を検出できる', () => {
    const buf = readFile('15_社員名簿.xlsx')
    const wb = XLSX.read(buf, { type: 'buffer', codepage: 932, raw: false, cellDates: true })
    let text = ''
    for (const sn of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn], { FS: ' | ', blankrows: false })
      text += csv + '\n'
    }
    const dets = detectAll(text)
    expect(dets.filter(d => d.type === 'email').length).toBeGreaterThanOrEqual(5)
  })

  it('JSON形式から個人情報を検出できる', () => {
    const raw = readFile('13_スキルシート_SES.json').toString('utf-8')
    const obj = JSON.parse(raw)
    function extract(o: unknown, p = ''): string {
      if (typeof o === 'string') return `${p}: ${o}`
      if (Array.isArray(o)) return o.map((v, i) => extract(v, `${p}[${i}]`)).filter(Boolean).join('\n')
      if (o && typeof o === 'object') return Object.entries(o).map(([k, v]) => extract(v, p ? `${p}.${k}` : k)).filter(Boolean).join('\n')
      if (o !== null && o !== undefined) return `${p}: ${String(o)}`
      return ''
    }
    const text = extract(obj)
    const dets = detectAll(text)
    expect(dets.filter(d => d.type === 'email').length).toBeGreaterThanOrEqual(2)
    expect(dets.filter(d => d.type === 'phone').length).toBeGreaterThanOrEqual(1)
  })

  it('RTF形式から個人情報を検出できる', () => {
    const raw = readFile('04_職務経歴書_営業職.rtf').toString('utf-8')
    let result = raw
    result = result.replace(/\{\\fonttbl[^}]*(\{[^}]*\})*[^}]*\}/g, '')
    result = result.replace(/\\par[d]?\s?/g, '\n')
    result = result.replace(/\\u(\d+)\s?\??/g, (_m, n) => String.fromCharCode(parseInt(n)))
    result = result.replace(/\\[a-z]+[-]?\d*\s?/g, '')
    result = result.replace(/[{}]/g, '').trim()
    const dets = detectAll(result)
    expect(dets.filter(d => d.type === 'email').length).toBeGreaterThanOrEqual(1)
    expect(dets.filter(d => d.type === 'phone').length).toBeGreaterThanOrEqual(1)
  })

  it('HTML形式から個人情報を検出できる', () => {
    const html = readFile('01_職務経歴書_ITエンジニア.html').toString('utf-8')
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|h[1-6]|li|tr|dt|dd)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim()
    const dets = detectAll(text)
    expect(dets.filter(d => d.type === 'email').length).toBeGreaterThanOrEqual(1)
    expect(dets.filter(d => d.category === 'name').length).toBeGreaterThanOrEqual(1)
  })

  it('Markdown形式から個人情報を検出できる', () => {
    const text = readFile('03_職務経歴書_デザイナー.md').toString('utf-8')
    const dets = detectAll(text)
    expect(dets.filter(d => d.type === 'email').length).toBeGreaterThanOrEqual(1)
    expect(dets.filter(d => d.type === 'phone').length).toBeGreaterThanOrEqual(1)
    expect(dets.filter(d => d.category === 'name').length).toBeGreaterThanOrEqual(1)
  })

  it('DOCX形式から個人情報を検出できる', async () => {
    const mammoth = await import('mammoth')
    const filePath = path.join(MOCK_DIR, '05_職務経歴書_看護師.docx')
    const result = await mammoth.extractRawText({ path: filePath })
    const text = result.value || ''
    const dets = detectAll(text)
    expect(dets.filter(d => d.category === 'name').length).toBeGreaterThanOrEqual(1)
  })
})
