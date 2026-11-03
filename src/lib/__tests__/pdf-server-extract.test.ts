import { describe, it, expect } from 'vitest'
import { shouldUseServerPdfExtraction, SERVER_PDF_SPARSE_RATIO } from '../pdf-server-extract'

const sparsePdf = {
  format: 'PDF',
  hasPdfData: true,
  sparsePageCount: 2,
  pageCount: 2,
}

describe('shouldUseServerPdfExtraction', () => {
  it('Lite では文字を取り出しにくいPDFでもサーバーに送らない', () => {
    expect(shouldUseServerPdfExtraction({ ...sparsePdf, isLite: true })).toBe(false)
  })

  it('Pro で文字の取れないページが閾値以上ならサーバー抽出を使う', () => {
    expect(shouldUseServerPdfExtraction({ ...sparsePdf, isLite: false })).toBe(true)
    // 閾値ちょうど（3/10 = 0.3）は使う
    expect(
      shouldUseServerPdfExtraction({
        isLite: false,
        format: 'PDF',
        hasPdfData: true,
        sparsePageCount: 3,
        pageCount: 10,
      }),
    ).toBe(true)
    expect(SERVER_PDF_SPARSE_RATIO).toBe(0.3)
  })

  it('Pro でも文字の取れないページが閾値未満なら使わない', () => {
    expect(
      shouldUseServerPdfExtraction({
        isLite: false,
        format: 'PDF',
        hasPdfData: true,
        sparsePageCount: 1,
        pageCount: 10,
      }),
    ).toBe(false)
  })

  it('PDF以外・PDFデータなし・ページ数不明では使わない', () => {
    expect(shouldUseServerPdfExtraction({ ...sparsePdf, isLite: false, format: 'DOCX' })).toBe(
      false,
    )
    expect(shouldUseServerPdfExtraction({ ...sparsePdf, isLite: false, hasPdfData: false })).toBe(
      false,
    )
    expect(shouldUseServerPdfExtraction({ ...sparsePdf, isLite: false, sparsePageCount: 0 })).toBe(
      false,
    )
    expect(shouldUseServerPdfExtraction({ ...sparsePdf, isLite: false, pageCount: 0 })).toBe(false)
  })
})
