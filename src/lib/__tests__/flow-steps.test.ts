import { describe, it, expect } from 'vitest'
import { FLOW_STEPS, FLOW_GOAL, getCurrentFlowStep, getFlowStepStatus } from '../flow-steps'

describe('FLOW_STEPS', () => {
  it('取り込む→確認する→書き出すの3ステップが順番に定義されている', () => {
    expect(FLOW_STEPS.map((s) => s.id)).toEqual(['input', 'review', 'export'])
    expect(FLOW_STEPS.map((s) => s.num)).toEqual([1, 2, 3])
  })

  it('各ステップにラベルとアクション説明がある', () => {
    for (const step of FLOW_STEPS) {
      expect(step.label.length).toBeGreaterThan(0)
      expect(step.action.length).toBeGreaterThan(0)
    }
  })

  it('ゴールが定義されている', () => {
    expect(FLOW_GOAL.length).toBeGreaterThan(0)
  })
})

describe('getCurrentFlowStep', () => {
  it('データがなければ常に input', () => {
    expect(getCurrentFlowStep({ hasData: false, exportOpen: false })).toBe('input')
    expect(getCurrentFlowStep({ hasData: false, exportOpen: true })).toBe('input')
  })

  it('データがあれば review', () => {
    expect(getCurrentFlowStep({ hasData: true, exportOpen: false })).toBe('review')
  })

  it('エクスポートプレビュー表示中は export', () => {
    expect(getCurrentFlowStep({ hasData: true, exportOpen: true })).toBe('export')
  })
})

describe('getFlowStepStatus', () => {
  it('現在地より前は done、現在地は current、後は upcoming', () => {
    expect(getFlowStepStatus('input', 'review')).toBe('done')
    expect(getFlowStepStatus('review', 'review')).toBe('current')
    expect(getFlowStepStatus('export', 'review')).toBe('upcoming')
  })

  it('input が現在地なら残り2つは upcoming', () => {
    expect(getFlowStepStatus('input', 'input')).toBe('current')
    expect(getFlowStepStatus('review', 'input')).toBe('upcoming')
    expect(getFlowStepStatus('export', 'input')).toBe('upcoming')
  })

  it('export が現在地なら前2つは done', () => {
    expect(getFlowStepStatus('input', 'export')).toBe('done')
    expect(getFlowStepStatus('review', 'export')).toBe('done')
    expect(getFlowStepStatus('export', 'export')).toBe('current')
  })
})
