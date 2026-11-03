// ═══ ファイルパーサーの入口（拡張子で各パーサーへ振り分け、抽出テキストの空白・改行を整えて正規化する） ═══

import { normalizeText } from '@/lib/redact-engine'
import { parseDOCX, parseODT } from './office'
import { parsePDF } from './pdf'
import { parseCSV, parseXLSX } from './spreadsheet'
import { parseHTML, parseJSON, parseMD, parseRTF, parseTXT } from './text'
import type { ParsedFile, ParseOptions, ParseProgressFn } from './types'

export type {
  ParsedFile,
  ParsedPdf,
  ParsedSpreadsheet,
  ParseOptions,
  ParseProgressFn,
  XlSheetMeta,
} from './types'
export { decodeText, detectEncoding, readBuf } from './encoding'
export type { DetectedEncoding } from './encoding'
export {
  PDF_DOCUMENT_TIMEOUT_MS,
  PDF_PAGE_TIMEOUT_MS,
  PDF_PARSE_TIMEOUT_MS,
  PDFJS_LOAD_TIMEOUT_MS,
  loadPdfJs,
  parsePDF,
  withTimeout,
} from './pdf'
export type {
  PdfDocumentProxy,
  PdfGetDocumentParams,
  PdfJsLib,
  PdfLoadingTask,
  PdfPageProxy,
  PdfTextContent,
  PdfTextItem,
} from './pdf'
export { parseCSV, parseXLSX } from './spreadsheet'
export { parseHTML, parseJSON, parseMD, parseRTF, parseTXT } from './text'
export { parseDOCX, parseODT } from './office'

type Parser = (file: File, opts: ParseOptions) => Promise<ParsedFile>

export async function parseFile(file: File, onProgress?: ParseProgressFn): Promise<ParsedFile> {
  // split は必ず 1 要素以上を返すので pop() は undefined にならない
  const ext = (file.name.split('.').pop() as string).toLowerCase()
  const P: Record<string, Parser> = {
    pdf: parsePDF,
    docx: parseDOCX,
    doc: parseDOCX,
    xlsx: parseXLSX,
    xls: parseXLSX,
    ods: parseXLSX,
    csv: parseCSV,
    txt: parseTXT,
    tsv: parseTXT,
    md: parseMD,
    markdown: parseMD,
    html: parseHTML,
    htm: parseHTML,
    rtf: parseRTF,
    json: parseJSON,
    odt: parseODT,
  }
  if (!P[ext]) {
    throw new Error(
      '未対応: .' +
        ext +
        '\n対応形式: PDF, Word(.docx/.doc), Excel(.xlsx/.xls), ODS, CSV, TSV, TXT, Markdown, HTML, RTF, JSON, ODT',
    )
  }
  const r = await P[ext](file, { onProgress })
  r.text = normalizeText(
    r.text
      .replace(/[^\S\n]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '')
      .trimEnd(),
  )
  return r
}
