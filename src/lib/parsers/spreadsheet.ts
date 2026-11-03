// ═══ 表形式ファイルのパーサー（Excel/ODS は SheetJS、CSV は文字コード判定後に Papa Parse） ═══

import * as Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { decodeText, readBuf } from './encoding'
import type { ParsedFile, ParsedSpreadsheet, XlSheetMeta } from './types'

export async function parseXLSX(f: Blob): Promise<ParsedSpreadsheet> {
  const ab = await readBuf(f)
  const wb = XLSX.read(ab, { type: 'array', codepage: 932, raw: false, cellDates: true })
  let t = ''
  const xlMeta: XlSheetMeta[] = []
  for (const sn of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown>(wb.Sheets[sn], { header: 1, blankrows: false })
    if (!aoa || aoa.length === 0) continue
    const lines = aoa
      .map((row) =>
        Array.isArray(row) ? row.map((c: unknown) => String(c ?? '').trim()).join(' | ') : '',
      )
      .filter((l) => l.replace(/[\s|]/g, '').length > 0)
    if (lines.length > 0) {
      t += `--- Sheet: ${sn} ---\n${lines.join('\n')}\n\n`
      xlMeta.push({
        sheetName: sn,
        aoa: aoa.map((row) =>
          Array.isArray(row) ? row.map((c: unknown) => String(c ?? '').trim()) : [],
        ),
      })
    }
  }
  return { text: t, pageCount: wb.SheetNames.length, format: 'Excel', xlMeta }
}

export async function parseCSV(f: Blob): Promise<ParsedFile> {
  const ab = await readBuf(f)
  const { text, encoding } = decodeText(ab)
  const p = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true })
  return {
    text: p.data
      .filter((r) => r.some((c) => c.trim()))
      .map((r) => r.join(' | '))
      .join('\n'),
    pageCount: null,
    format: `CSV (${encoding})`,
  }
}
