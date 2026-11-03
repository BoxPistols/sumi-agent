// ═══ 文字コード判定とファイル読込（BOM → バイト列ヒューリスティックで UTF-8 / Shift_JIS / EUC-JP を推定） ═══

export type DetectedEncoding = 'utf-8' | 'utf-16le' | 'shift_jis' | 'euc-jp'

export function detectEncoding(b: Uint8Array): DetectedEncoding {
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return 'utf-8'
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return 'utf-16le'
  let sj = 0
  let eu = 0
  let u8 = 0
  for (let i = 0; i < Math.min(b.length, 10000); i++) {
    const v = b[i]
    if (v <= 0x7f) continue
    if (v >= 0xc0 && v <= 0xdf && i + 1 < b.length && (b[i + 1] & 0xc0) === 0x80) {
      u8 += 2
      i++
      continue
    }
    if (
      v >= 0xe0 &&
      v <= 0xef &&
      i + 2 < b.length &&
      (b[i + 1] & 0xc0) === 0x80 &&
      (b[i + 2] & 0xc0) === 0x80
    ) {
      u8 += 3
      i += 2
      continue
    }
    if (v >= 0xa1 && v <= 0xfe && i + 1 < b.length && b[i + 1] >= 0xa1 && b[i + 1] <= 0xfe) {
      eu += 2
      i++
      continue
    }
    if (((v >= 0x81 && v <= 0x9f) || (v >= 0xe0 && v <= 0xfc)) && i + 1 < b.length) {
      const b2 = b[i + 1]
      if ((b2 >= 0x40 && b2 <= 0x7e) || (b2 >= 0x80 && b2 <= 0xfc)) {
        sj += 2
        i++
        continue
      }
    }
  }
  if (sj === 0 && eu === 0 && u8 === 0) return 'utf-8'
  if (u8 >= sj && u8 >= eu) return 'utf-8'
  return sj >= eu ? 'shift_jis' : 'euc-jp'
}

export function decodeText(ab: ArrayBuffer): { text: string; encoding: DetectedEncoding } {
  const b = new Uint8Array(ab)
  const e = detectEncoding(b)
  return { text: new TextDecoder(e, { fatal: false }).decode(b), encoding: e }
}

export function readBuf(f: Blob): Promise<ArrayBuffer> {
  return new Promise((r, j) => {
    const x = new FileReader()
    // readAsArrayBuffer を使うので result は必ず ArrayBuffer
    x.onload = () => r(x.result as ArrayBuffer)
    x.onerror = j
    x.readAsArrayBuffer(f)
  })
}
