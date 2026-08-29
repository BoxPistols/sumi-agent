/**
 * 作業ステップフロー定義
 *
 * 「取り込む → 確認する → 書き出す」の3ステップで
 * ユーザーの現在地と次にすべきことを常に提示するための定義。
 * StepFlowBar コンポーネントと App / EditorScreen / UploadScreen が参照する。
 */

export type FlowStepId = 'input' | 'review' | 'export'

export type FlowStepStatus = 'done' | 'current' | 'upcoming'

export interface FlowStep {
  id: FlowStepId
  num: number
  /** ステップバーに表示する短いラベル */
  label: string
  /** 現在ステップのときに表示する「いまやること」の説明 */
  action: string
}

/** アプリ全体のゴール（ステップバーのツールチップ等で表示） */
export const FLOW_GOAL = '個人情報をマスクした経歴書を書き出す'

export const FLOW_STEPS: FlowStep[] = [
  {
    id: 'input',
    num: 1,
    label: '取り込む',
    action: 'ファイルを選択（またはドラッグ＆ドロップ）。まずはサンプルでもOK',
  },
  {
    id: 'review',
    num: 2,
    label: '確認する',
    action: '検出された個人情報を確認し、不要な項目はオフにする',
  },
  {
    id: 'export',
    num: 3,
    label: '書き出す',
    action: '形式を選んで保存、またはコピーする',
  },
]

/** アプリ状態から現在のステップを判定する */
export function getCurrentFlowStep(state: { hasData: boolean; exportOpen: boolean }): FlowStepId {
  if (!state.hasData) return 'input'
  return state.exportOpen ? 'export' : 'review'
}

/** あるステップが現在地に対して done / current / upcoming のどれかを返す */
export function getFlowStepStatus(stepId: FlowStepId, current: FlowStepId): FlowStepStatus {
  const order = FLOW_STEPS.map((s) => s.id)
  const stepIdx = order.indexOf(stepId)
  const currentIdx = order.indexOf(current)
  if (stepIdx < currentIdx) return 'done'
  if (stepIdx === currentIdx) return 'current'
  return 'upcoming'
}

/**
 * ステップバー ⇔ 各画面間の連携イベント名
 *
 * モノリス構造（RedactPro.tsx）内で props バケツリレーを避けるため、
 * window の CustomEvent で疎結合に連携する。
 */
/** ステップバー → EditorScreen: エクスポートプレビューを開閉する（detail: {open: boolean}） */
export const FLOW_EVENT_SET_EXPORT = 'sumi:flow-set-export'
/** EditorScreen → App: エクスポートプレビューの開閉状態を通知（detail: {open: boolean}） */
export const FLOW_EVENT_EXPORT_STATE = 'sumi:flow-export-state'
/** UploadScreen → App: 解析中かどうかを通知（detail: {active: boolean}） */
export const FLOW_EVENT_ANALYZING = 'sumi:flow-analyzing'
