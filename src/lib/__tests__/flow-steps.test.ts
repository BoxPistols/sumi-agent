import { describe, it, expect } from 'vitest'
import { FLOW_STEPS, FLOW_GOAL, getCurrentFlowStep, getFlowStepStatus } from '../flow-steps'

describe('FLOW_STEPS', () => {
  it('取り込む→確認する→整える→書き出すの4ステップが順番に定義されている', () => {
    expect(FLOW_STEPS.map((s) => s.id)).toEqual(['input', 'review', 'format', 'export'])
    expect(FLOW_STEPS.map((s) => s.num)).toEqual([1, 2, 3, 4])
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
    expect(getCurrentFlowStep({ hasData: false, exportOpen: false, formatMode: true })).toBe(
      'input',
    )
  })

  it('データがあれば review', () => {
    expect(getCurrentFlowStep({ hasData: true, exportOpen: false })).toBe('review')
  })

  it('整えるモード中は format', () => {
    expect(getCurrentFlowStep({ hasData: true, exportOpen: false, formatMode: true })).toBe(
      'format',
    )
  })

  it('エクスポートプレビュー表示中は format より export を優先', () => {
    expect(getCurrentFlowStep({ hasData: true, exportOpen: true })).toBe('export')
    expect(getCurrentFlowStep({ hasData: true, exportOpen: true, formatMode: true })).toBe('export')
  })
})

describe('getFlowStepStatus', () => {
  it('現在地より前は done、現在地は current、後は upcoming', () => {
    expect(getFlowStepStatus('input', 'review')).toBe('done')
    expect(getFlowStepStatus('review', 'review')).toBe('current')
    expect(getFlowStepStatus('format', 'review')).toBe('upcoming')
    expect(getFlowStepStatus('export', 'review')).toBe('upcoming')
  })

  it('input が現在地なら残りはすべて upcoming', () => {
    expect(getFlowStepStatus('input', 'input')).toBe('current')
    expect(getFlowStepStatus('review', 'input')).toBe('upcoming')
    expect(getFlowStepStatus('format', 'input')).toBe('upcoming')
    expect(getFlowStepStatus('export', 'input')).toBe('upcoming')
  })

  it('format が現在地なら前2つは done、export は upcoming', () => {
    expect(getFlowStepStatus('input', 'format')).toBe('done')
    expect(getFlowStepStatus('review', 'format')).toBe('done')
    expect(getFlowStepStatus('format', 'format')).toBe('current')
    expect(getFlowStepStatus('export', 'format')).toBe('upcoming')
  })

  it('export が現在地なら前3つは done', () => {
    expect(getFlowStepStatus('input', 'export')).toBe('done')
    expect(getFlowStepStatus('review', 'export')).toBe('done')
    expect(getFlowStepStatus('format', 'export')).toBe('done')
    expect(getFlowStepStatus('export', 'export')).toBe('current')
  })
})
