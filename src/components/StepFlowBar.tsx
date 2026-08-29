'use client'

import { Fragment } from 'react'
import { FLOW_GOAL, FLOW_STEPS, getFlowStepStatus, type FlowStepId } from '@/lib/flow-steps'
import styles from './StepFlowBar.module.css'

export interface StepFlowBarProps {
  /** 現在のステップ */
  current: FlowStepId
  /** 解析済みデータがあるか（ステップ2/3へ進めるか） */
  hasData: boolean
  /** ファイル解析中か */
  analyzing?: boolean
  onStepClick: (id: FlowStepId) => void
}

/**
 * ヘッダー直下に常時表示するステップフローバー。
 * 「1 取り込む → 2 確認する → 3 書き出す」の現在地と、
 * いまやるべきことを一目で示す。
 */
export function StepFlowBar({
  current,
  hasData,
  analyzing = false,
  onStepClick,
}: StepFlowBarProps) {
  const currentStep = FLOW_STEPS.find((s) => s.id === current)
  const hint =
    analyzing && current === 'input'
      ? '解析中です。完了すると自動で次のステップに進みます'
      : (currentStep?.action ?? '')

  return (
    <nav aria-label="作業ステップ" data-intro="step-flow" className={styles.bar}>
      {FLOW_STEPS.map((step, i) => {
        const status = getFlowStepStatus(step.id, current)
        // データがあれば現在地以外のステップへ移動できる（1=やり直し / 3=書き出し）
        const clickable = status !== 'current' && hasData
        return (
          <Fragment key={step.id}>
            {i > 0 && (
              <span className={styles.sep} aria-hidden="true">
                →
              </span>
            )}
            <button
              type="button"
              className={styles.step}
              data-status={status}
              data-clickable={clickable}
              aria-current={status === 'current' ? 'step' : undefined}
              disabled={!clickable && status !== 'current'}
              title={
                status === 'current'
                  ? step.action
                  : step.id === 'input' && hasData
                    ? '最初からやり直す'
                    : step.id === 'export' && hasData
                      ? 'エクスポート画面を開く'
                      : step.action
              }
              onClick={() => {
                if (clickable) onStepClick(step.id)
              }}
              style={{ opacity: !clickable && status === 'upcoming' ? 0.55 : 1 }}
            >
              <span className={styles.num} aria-hidden="true">
                {status === 'done' ? '✓' : step.num}
              </span>
              <span className={styles.label}>{step.label}</span>
            </button>
          </Fragment>
        )
      })}
      <span className={styles.hint} title={`ゴール: ${FLOW_GOAL}`}>
        <span className={styles.hintLabel}>
          {analyzing && current === 'input' ? '状態' : 'いまやること'}
        </span>
        <span className={styles.hintText}>{hint}</span>
      </span>
    </nav>
  )
}
