/**
 * モック経歴書データを各種ファイル形式に変換するスクリプト
 * 使い方: node scripts/generate-mock-formats.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MOCK_DIR = path.resolve(__dirname, '../test-data/mock-resumes')

function readMock(filename) {
  return fs.readFileSync(path.join(MOCK_DIR, filename), 'utf-8')
}

// ─── CSV ───
function generateCSV() {
  const text = readMock('15_社員名簿_CSV形式.txt')
  const lines = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') break
    lines.push(line)
  }
  const out = path.join(MOCK_DIR, '15_社員名簿.csv')
  fs.writeFileSync(out, lines.join('\n'), 'utf-8')
  console.log(`  CSV: ${out}`)
}

// ─── XLSX ──
function generateXLSX() {
  const text = readMock('15_社員名簿_CSV形式.txt')
  const lines = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') break
    lines.push(line)
  }
  const data = lines.map(l => l.split(','))
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '社員名簿')
  const out = path.join(MOCK_DIR, '15_社員名簿.xlsx')
  XLSX.writeFile(wb, out)
  console.log(`  XLSX: ${out}`)
}

// ─── HTML ──
function generateHTML() {
  const text = readMock('01_職務経歴書_ITエンジニア.txt')
  const body = text.split('\n').map(line => {
    if (line.startsWith('■ ')) return `<h2>${line.slice(2)}</h2>`
    if (line.startsWith('【')) return `<h3>${line}</h3>`
    if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`
    if (line.trim() === '') return '<br>'
    return `<p>${line}</p>`
  }).join('\n')
  const html = `<!DOCTYPE html>\n<html lang="ja">\n<head><meta charset="UTF-8"><title>職務経歴書</title></head>\n<body>\n${body}\n</body>\n</html>`
  const out = path.join(MOCK_DIR, '01_職務経歴書_ITエンジニア.html')
  fs.writeFileSync(out, html, 'utf-8')
  console.log(`  HTML: ${out}`)
}

// ─── Markdown ──
function generateMarkdown() {
  const text = readMock('03_職務経歴書_デザイナー.txt')
  const md = text.split('\n').map(line => {
    if (line.startsWith('■ ')) return `## ${line.slice(2)}`
    if (line.startsWith('◆ ')) return `### ${line.slice(2)}`
    if (line.startsWith('━')) return '---'
    return line
  }).join('\n')
  const out = path.join(MOCK_DIR, '03_職務経歴書_デザイナー.md')
  fs.writeFileSync(out, md, 'utf-8')
  console.log(`  Markdown: ${out}`)
}

// ─── JSON ──
function generateJSON() {
  const text = readMock('13_スキルシート_SES.txt')
  const data = { documentType: 'スキルシート', rawText: text, metadata: { format: 'SES', source: 'mock-data' } }
  const out = path.join(MOCK_DIR, '13_スキルシート_SES.json')
  fs.writeFileSync(out, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`  JSON: ${out}`)
}

// ─── RTF ──
function generateRTF() {
  const text = readMock('04_職務経歴書_営業職.txt')
  let body = ''
  for (const ch of text) {
    const c = ch.charCodeAt(0)
    if (c === 10) body += '\\par\n'
    else if (c > 127) body += `\\u${c}?`
    else if ('\\{}'.includes(ch)) body += '\\' + ch
    else body += ch
  }
  const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 MS Gothic;}}\\f0\\fs20\n${body}\n}`
  const out = path.join(MOCK_DIR, '04_職務経歴書_営業職.rtf')
  fs.writeFileSync(out, rtf, 'utf-8')
  console.log(`  RTF: ${out}`)
}

// ─── DOCX (minimal valid structure) ──
function generateDOCX() {
  const text = readMock('05_職務経歴書_看護師.txt')
  const paras = text.split('\n').map(line => {
    const esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<w:p><w:r><w:t xml:space="preserve">${esc}</w:t></w:r></w:p>`
  }).join('\n')

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`

  const tmp = path.join(MOCK_DIR, '_docx_tmp')
  fs.mkdirSync(path.join(tmp, '_rels'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'word'), { recursive: true })
  fs.writeFileSync(path.join(tmp, '[Content_Types].xml'), contentTypes)
  fs.writeFileSync(path.join(tmp, '_rels', '.rels'), rels)
  fs.writeFileSync(path.join(tmp, 'word', 'document.xml'), doc)

  const out = path.join(MOCK_DIR, '05_職務経歴書_看護師.docx')
  try {
    execSync(`cd "${tmp}" && zip -r "${out}" . -x ".*"`, { stdio: 'ignore' })
    console.log(`  DOCX: ${out}`)
  } catch {
    console.log('  DOCX: skipped (zip not available)')
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('モックデータ各形式を生成中...\n')
generateCSV()
generateXLSX()
generateHTML()
generateMarkdown()
generateJSON()
generateRTF()
generateDOCX()
console.log('\n完了')
