/**
 * サーバー側 PDF 文字抽出（/api/pdf/extract の pdftotext）を使うかの判定
 *
 * pdf.js は CID フォントの PDF で文字を取り出せないことがあり、Pro では
 * PDF 全体をサーバーへ送って pdftotext で抽出し直す。Lite は「ブラウザの外に
 * 出さない」と画面で約束しているため、この判定を通る経路だけがサーバーに送る。
 */

/** 文字が取れなかったページがこの割合以上のときだけサーバー抽出を試す */
export const SERVER_PDF_SPARSE_RATIO = 0.3

export interface ServerPdfExtractInput {
  isLite: boolean
  format: string | undefined
  hasPdfData: boolean
  /** pdf.js で文字がほぼ取れなかったページ数 */
  sparsePageCount: number
  pageCount: number
}

export function shouldUseServerPdfExtraction(input: ServerPdfExtractInput): boolean {
  if (input.isLite) return false
  if (input.format !== 'PDF' || !input.hasPdfData) return false
  if (input.sparsePageCount <= 0 || input.pageCount <= 0) return false
  return input.sparsePageCount / input.pageCount >= SERVER_PDF_SPARSE_RATIO
}
