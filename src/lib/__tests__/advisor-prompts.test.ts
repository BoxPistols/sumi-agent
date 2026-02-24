import { describe, it, expect } from 'vitest'
import { ADVISOR_SYSTEM_PROMPT, ADVISOR_PRESETS } from '../advisor/prompts'

describe('ADVISOR_SYSTEM_PROMPT', () => {
  it('空でない', () => {
    expect(ADVISOR_SYSTEM_PROMPT.length).toBeGreaterThan(100)
  })

  it('人材エージェント向けの文脈を含む', () => {
    expect(ADVISOR_SYSTEM_PROMPT).toContain('人材紹介')
  })

  it('Markdown形式の指示を含む', () => {
    expect(ADVISOR_SYSTEM_PROMPT).toContain('Markdown')
  })
})

describe('ADVISOR_PRESETS', () => {
  it('6つのプリセットがある', () => {
    expect(ADVISOR_PRESETS).toHaveLength(6)
  })

  it('各プリセットにid, label, prompt, descがある', () => {
    for (const preset of ADVISOR_PRESETS) {
      expect(preset.id).toBeTruthy()
      expect(preset.label).toBeTruthy()
      expect(preset.prompt).toBeTruthy()
      expect(preset.desc).toBeTruthy()
    }
  })

  it('IDが重複しない', () => {
    const ids = ADVISOR_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  const expectedIds = ['review', 'strengths', 'questions', 'matching', 'rewrite', 'job-match']
  for (const id of expectedIds) {
    it(`プリセット「${id}」が存在する`, () => {
      expect(ADVISOR_PRESETS.some((p) => p.id === id)).toBe(true)
    })
  }

  it('求人票マッチングプリセットが最後', () => {
    const last = ADVISOR_PRESETS[ADVISOR_PRESETS.length - 1]
    expect(last.id).toBe('job-match')
  })
})
