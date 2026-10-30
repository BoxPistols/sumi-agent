/**
 * StepFlowBar の描画テスト（react-dom/server の静的マークアップで検証）。
 * - 4ステップと現在地（aria-current）が描画される
 * - 「いまやること」と各ステップの title が Lite / Pro で出し分けられる
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StepFlowBar } from '../StepFlowBar'
import { FLOW_STEPS, getFlowStepAction } from '@/lib/flow-steps'

const render = (props: Partial<Parameters<typeof StepFlowBar>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(StepFlowBar, {
      current: 'review',
      hasData: true,
      onStepClick: vi.fn(),
      ...props,
    }),
  )

describe('StepFlowBar', () => {
  it('4ステップのラベルをすべて描画し、現在地に aria-current="step" を付ける', () => {
    const html = render()
    for (const step of FLOW_STEPS) expect(html).toContain(step.label)
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
    expect(html).toContain('data-status="done"')
    expect(html).toContain('data-status="current"')
    expect(html).toContain('data-status="upcoming"')
  })

  it('「いまやること」は現在ステップの説明を表示する', () => {
    expect(render({ current: 'review' })).toContain(getFlowStepAction('review'))
  })

  it('Lite では「整える」の説明が Lite 向け文言になる（現在地・それ以外の title の両方）', () => {
    const liteAction = getFlowStepAction('format', { isLite: true })
    const proAction = getFlowStepAction('format')
    // 現在地が「整える」のとき
    expect(render({ current: 'format', isLite: true })).toContain(liteAction)
    expect(render({ current: 'format', isLite: true })).not.toContain(proAction)
    // 現在地が「確認する」のとき、「整える」ボタンの title も Lite 向けになる
    const html = render({ current: 'review', isLite: true })
    expect(html).toContain(`title="${liteAction}"`)
    expect(html).not.toContain(`title="${proAction}"`)
  })

  it('Pro では「整える」の説明は編集を含む標準の文言のまま', () => {
    const html = render({ current: 'review', isLite: false })
    expect(html).toContain(`title="${getFlowStepAction('format')}"`)
  })

  it('解析中は状態メッセージに切り替わる', () => {
    const html = render({ current: 'input', hasData: false, analyzing: true })
    expect(html).toContain('解析中です')
  })

  it('データがなければ 2〜4 のステップは disabled', () => {
    const html = render({ current: 'input', hasData: false })
    expect(html.match(/<button[^>]*\bdisabled\b/g)).toHaveLength(3)
  })
})
