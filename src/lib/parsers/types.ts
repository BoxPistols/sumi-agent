// ═══ ファイルパーサー共通の型（各パーサーの戻り値と進捗コールバック） ═══

/** 進捗メッセージを UI に流すコールバック */
export type ParseProgressFn = (message: string) => void

/** パーサーへ渡すオプション（現状 PDF のみが参照する） */
export interface ParseOptions {
  onProgress?: ParseProgressFn
  /** PDF 全体の最大処理時間（ms）。0 以下ならタイムアウトなし */
  timeoutMs?: number
}

/** Excel のセル構造（セル構造保持モードで表を再構築するために使う） */
export interface XlSheetMeta {
  sheetName: string
  aoa: string[][]
}

/** すべてのパーサーが返す結果。形式固有のフィールドは optional */
export interface ParsedFile {
  text: string
  /** PDF/Excel は実数、DOCX は概算ページ数、それ以外は null */
  pageCount: number | null
  /** 表示用の形式名（例: "PDF", "Excel", "CSV (shift_jis)"） */
  format: string
  /** テキストがほぼ取れなかったページ番号（1 始まり, OCR 対象） */
  sparsePages?: number[]
  /** OCR 用に保持する PDF の生データ（pdf.js に渡す前に複製したもの） */
  pdfData?: ArrayBuffer
  /** 日本語 PDF で CMap 展開に失敗したと推定されるか */
  cmapFailed?: boolean
  xlMeta?: XlSheetMeta[]
}

export interface ParsedPdf extends ParsedFile {
  pageCount: number
  format: 'PDF'
  sparsePages: number[]
  pdfData: ArrayBuffer
  cmapFailed: boolean
}

export interface ParsedSpreadsheet extends ParsedFile {
  pageCount: number
  format: 'Excel'
  xlMeta: XlSheetMeta[]
}
