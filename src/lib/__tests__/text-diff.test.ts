/**
 * 行単位の簡易差分（computeLineDiff / countChangedLines / findChangeChunks）のテスト。
 */
import { describe, it, expect } from 'vitest'
import { computeLineDiff, countChangedLines, findChangeChunks } from '../text-diff'
import type { LineDiff } from '../text-diff'

describe('computeLineDiff', () => {
  it('同じテキストは全行 same', () => {
    const d = computeLineDiff('a\nb\nc', 'a\nb\nc')
    expect(d).toEqual([
      { type: 'same', orig: 'a', mod: 'a' },
      { type: 'same', orig: 'b', mod: 'b' },
      { type: 'same', orig: 'c', mod: 'c' },
    ])
  })

  it('同じ行番号同士を比べ、異なる行を changed にする', () => {
    const d = computeLineDiff('山田太郎\n東京都', '[氏名非公開]\n東京都')
    expect(d).toEqual([
      { type: 'changed', orig: '山田太郎', mod: '[氏名非公開]' },
      { type: 'same', orig: '東京都', mod: '東京都' },
    ])
  })

  it('行数が違うときは短い側を空文字で埋める', () => {
    expect(computeLineDiff('a\nb', 'a')).toEqual([
      { type: 'same', orig: 'a', mod: 'a' },
      { type: 'changed', orig: 'b', mod: '' },
    ])
    expect(computeLineDiff('a', 'a\nb')).toEqual([
      { type: 'same', orig: 'a', mod: 'a' },
      { type: 'changed', orig: '', mod: 'b' },
    ])
  })

  it('挿入はずれとして扱う（LCS ではない）', () => {
    const d = computeLineDiff('a\nb', 'x\na\nb')
    expect(d.map((x) => x.type)).toEqual(['changed', 'changed', 'changed'])
  })

  it('空文字同士は 1 行の same', () => {
    expect(computeLineDiff('', '')).toEqual([{ type: 'same', orig: '', mod: '' }])
  })
})

describe('countChangedLines', () => {
  it('changed の行数を数える', () => {
    expect(countChangedLines(computeLineDiff('a\nb\nc', 'a\nB\nC'))).toBe(2)
    expect(countChangedLines([])).toBe(0)
  })
})

describe('findChangeChunks', () => {
  const diffsOf = (types: string): LineDiff[] =>
    [...types].map((c) => ({ type: c === 'c' ? 'changed' : 'same', orig: '', mod: '' }))

  it('連続する changed 行を 1 チャンクとし、先頭 index を返す', () => {
    expect(findChangeChunks(diffsOf('sccsscsc'))).toEqual([1, 5, 7])
  })

  it('先頭・末尾の changed も拾う', () => {
    expect(findChangeChunks(diffsOf('cssc'))).toEqual([0, 3])
    expect(findChangeChunks(diffsOf('cccc'))).toEqual([0])
  })

  it('変更がなければ空', () => {
    expect(findChangeChunks(diffsOf('sss'))).toEqual([])
    expect(findChangeChunks([])).toEqual([])
  })
})
