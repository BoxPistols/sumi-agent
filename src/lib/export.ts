// ═══ エクスポート生成とダウンロード ═══
// マスキング済みテキストを txt / md / csv / xlsx / pdf(印刷用HTML) / docx(Word互換HTML) に変換し、
// ブラウザでダウンロード（PDF は新しいタブで印刷ダイアログ）させる。

import * as XLSX from 'xlsx'
import { generatePDFHTML } from './resume-html'

export type ExportFormat = 'txt' | 'md' | 'csv' | 'xlsx' | 'pdf' | 'docx'

/** セル構造を保持した Excel シート（マスキング適用済み） */
export interface XlSheetMeta {
  sheetName?: string
  aoa: readonly (readonly unknown[])[]
}

export interface ExportMeta {
  fileName?: string
  maskCount?: number
  xlMeta?: readonly XlSheetMeta[]
}

/** テキスト系（txt / md / csv / docx / 未知の形式）の出力 */
export interface TextExportResult {
  data: string
  mime: string
  name: string
  isPrintPdf?: undefined
  dataUri?: undefined
}

/** xlsx の出力（base64 の data URI） */
export interface DataUriExportResult {
  dataUri: string
  name: string
  data?: undefined
  mime?: undefined
  isPrintPdf?: undefined
}

/** pdf の出力（印刷ダイアログを自動で開く HTML） */
export interface PrintPdfExportResult {
  data: string
  mime: string
  name: string
  isPrintPdf: true
  dataUri?: undefined
}

export type ExportResult = TextExportResult | DataUriExportResult | PrintPdfExportResult

// ═══ Export helpers ═══
export function fileTimestamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
}

// ArrayBuffer → Base64 変換ユーティリティ
export function arrayBufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.slice(0))
  const chunks: string[] = []
  const cs = 8192
  for (let i = 0; i < bytes.length; i += cs)
    chunks.push(
      // apply は実行時に配列様オブジェクトを受け付ける。Array 化のコピーを避けるため型だけ合わせる
      String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + cs, bytes.length)) as unknown as number[],
      ),
    )
  return btoa(chunks.join(''))
}

// ═══ Export generators ═══
export function generateExport(
  rawContent: string,
  format: string,
  baseName: string,
  meta?: ExportMeta | null,
): ExportResult {
  const bom = '\uFEFF',
    ts = new Date().toLocaleString('ja-JP')
  // Strip page/sheet markers from export output
  const content = rawContent
    .replace(/^-{2,}\s*(?:Page\s+\d+|Sheet:\s*.+)\s*-{2,}\s*\n?/gm, '')
    .replace(/^\n+/, '')
  switch (format) {
    case 'txt':
      return { data: bom + content, mime: 'text/plain;charset=utf-8', name: baseName + '.txt' }
    case 'md':
      return {
        data: bom + `# ${baseName}\n\n> Exported: ${ts}\n\n---\n\n${content}`,
        mime: 'text/markdown;charset=utf-8',
        name: baseName + '.md',
      }
    case 'csv':
    case 'xlsx': {
      let aoa: string[][]
      let isTabular = false
      const xlm = meta?.xlMeta
      if (xlm && xlm.length > 0 && format === 'xlsx') {
        // セル構造保持モード: xlMetaから直接aoa構築
        aoa = []
        for (const sheet of xlm) {
          for (const row of sheet.aoa) {
            aoa.push(row.map((c) => String(c ?? '')))
          }
        }
        isTabular = true
      } else {
        // フォールバック: パイプ区切りテキストから再構成
        const allLines = content
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l)
        const pipeLines = allLines.filter((l) => l.includes(' | '))
        isTabular = pipeLines.length >= 2 && pipeLines.length / allLines.length >= 0.3

        if (isTabular) {
          aoa = []
          for (const line of allLines) {
            if (line.includes(' | ')) {
              aoa.push(line.split(' | ').map((c) => c.trim()))
            } else {
              const colCount = aoa.length > 0 ? aoa[0].length : 2
              const row: string[] = Array(colCount).fill('')
              row[0] = line
              aoa.push(row)
            }
          }
        } else {
          aoa = [['項目', '内容']]
          for (const line of allLines) {
            if (/^(?:\(\d+\)\s*|#{1,3}\s+|【.+】)/.test(line)) {
              aoa.push([line, ''])
              continue
            }
            const kv =
              line.match(/^[-・]\s*(.+?)\s*[：:]\s*(.+)$/) || line.match(/^(.+?)\s*[：:]\s*(.+)$/)
            if (kv && kv[1].length <= 30) {
              aoa.push([kv[1].replace(/^[-・]\s*/, ''), kv[2]])
              continue
            }
            if (line.includes(' | ')) {
              aoa.push(line.split(' | ').map((p) => p.trim()))
              continue
            }
            if (/^[-・]/.test(line)) {
              aoa.push(['', line.replace(/^[-・]\s*/, '')])
              continue
            }
            aoa.push(['', line])
          }
        }
      }

      if (format === 'csv') {
        const csvOut = aoa
          .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
          .join('\n')
        return { data: bom + csvOut, mime: 'text/csv;charset=utf-8', name: baseName + '.csv' }
      }
      // xlsx
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const colCount = aoa.length > 0 ? Math.max(...aoa.map((r) => r.length)) : 2
      ws['!cols'] = isTabular
        ? Array.from({ length: colCount }, () => ({ wch: 18 }))
        : [{ wch: 24 }, { wch: 80 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'マスキング済み')
      const out: string = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
      return {
        dataUri:
          'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + out,
        name: baseName + '.xlsx',
      }
    }
    case 'pdf': {
      const doc = `# ${baseName}\n\n**出力日時:** ${ts}\n\n---\n\n${content}`
      const html = generatePDFHTML(doc, 'gothic', {
        stripRedactions: false,
        highlightRedactions: true,
        removeRedactionOnlyLines: false,
      })
      const printHTML = html.replace(
        '</body>',
        `<script>window.onload=function(){window.print();setTimeout(()=>{window.close()},1000)}<\/script></body>`,
      )
      return {
        data: printHTML,
        mime: 'text/html;charset=utf-8',
        name: baseName + '.html',
        isPrintPdf: true,
      }
    }
    case 'docx': {
      const esc = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
      const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:'Noto Sans JP','MS Gothic',sans-serif;font-size:10.5pt;line-height:1.8;color:#222}h1{font-size:14pt;border-bottom:1.5pt solid #333;padding-bottom:4pt}.rd{background:#fee;color:#c33;font-weight:bold}</style></head><body><h1>${baseName}</h1><p style="font-size:8pt;color:#888">出力: ${ts}</p><div>${esc.replace(/\[([^\]]*非公開[^\]]*|[^\]]*Redacted[^\]]*)\]/g, '<span class="rd">[$1]</span>')}</div></body></html>`
      return { data: bom + doc, mime: 'application/msword;charset=utf-8', name: baseName + '.docx' }
    }
    default:
      return { data: content, mime: 'text/plain;charset=utf-8', name: baseName + '.txt' }
  }
}

export function triggerDownload(ex: ExportResult): void {
  try {
    if (ex.isPrintPdf) {
      const blob = new Blob([ex.data], { type: ex.mime })
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      if (win) win.focus()
      return
    }
    const a = document.createElement('a')
    // xlsx は dataUri、それ以外はテキストを data URL にエンコードする
    a.href =
      ex.dataUri !== undefined ? ex.dataUri : 'data:' + ex.mime + ',' + encodeURIComponent(ex.data)
    a.download = ex.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch {
    // ポップアップブロック等で失敗しても画面操作は継続できるため握りつぶす
  }
}
