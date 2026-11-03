// ═══ 行単位の簡易差分（DiffView 用） ═══
// 2 つのテキストを同じ行番号同士で突き合わせ、一致／変更を判定する。
// LCS 等の挿入・削除の検出はしない（マスキングは行数を変えないため、行番号の対応で十分）。

export type LineDiffType = 'same' | 'changed'

export interface LineDiff {
  type: LineDiffType
  orig: string
  mod: string
}

/**
 * 行番号ごとに original と modified を比較する。
 * 行数が違う場合、足りない側は空文字として扱う。
 */
export function computeLineDiff(original: string, modified: string): LineDiff[] {
  const origLines = original.split('\n')
  const modLines = modified.split('\n')
  const maxLen = Math.max(origLines.length, modLines.length)
  const diffs: LineDiff[] = []
  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i] || ''
    const m = modLines[i] || ''
    if (o === m) {
      diffs.push({ type: 'same', orig: o, mod: m })
    } else {
      diffs.push({ type: 'changed', orig: o, mod: m })
    }
  }
  return diffs
}

/** 変更行の数 */
export function countChangedLines(diffs: readonly LineDiff[]): number {
  return diffs.filter((d) => d.type === 'changed').length
}

/**
 * チャンク計算: 連続する changed 行をグループ化し、各グループの先頭indexを返す。
 * 「前の変更へ／次の変更へ」のジャンプ先になる。
 */
export function findChangeChunks(diffs: readonly LineDiff[]): number[] {
  const c: number[] = []
  let inChunk = false
  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i].type === 'changed') {
      if (!inChunk) {
        c.push(i)
        inChunk = true
      }
    } else {
      inChunk = false
    }
  }
  return c
}
