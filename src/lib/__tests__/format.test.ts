import { describe, it, expect } from 'vitest'
import { formatDuration } from '../format'

describe('formatDuration', () => {
  it('1時間未満は m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65_400)).toBe('1:05')
  })

  it('1時間以上は h:mm:ss', () => {
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })

  it('未定義や負の値は 0:00', () => {
    expect(formatDuration(undefined)).toBe('0:00')
    expect(formatDuration(-5000)).toBe('0:00')
  })
})
