/**
 * アドバイザー Auto モデル選択 + コスト管理
 *
 * タスク複雑度に基づいてnano/miniを動的に選択し、
 * セッション/日次のコスト追跡とアラートを管理する。
 */

// ── コスト定義（円） ──
export const MODEL_COSTS: Record<string, { costYen: number; label: string; tier: 'nano' | 'mini' }> = {
  'gpt-5-nano':  { costYen: 0.10, label: 'GPT-5 Nano',  tier: 'nano' },
  'gpt-5-mini':  { costYen: 0.51, label: 'GPT-5 Mini',  tier: 'mini' },
  'gpt-4.1-nano': { costYen: 0.11, label: 'GPT-4.1 Nano', tier: 'nano' },
  'gpt-4.1-mini': { costYen: 0.45, label: 'GPT-4.1 Mini', tier: 'mini' },
}

// ── 予算しきい値（円） ──
export const BUDGET = {
  perRoundTrip: 1.0,    // 1往復あたり上限
  perTaskCycle: 5.0,    // 1タスクサイクル上限
  perDayAlert: 30.0,    // 日次アラートライン
} as const

// ── 複雑度判定 ──
type Complexity = 'low' | 'high'

/** プリセットIDごとの複雑度 */
const PRESET_COMPLEXITY: Record<string, Complexity> = {
  'review':    'high',   // 全体構成の分析 → 論理思考が必要
  'strengths': 'high',   // 潜在的な強みの発見 → 推論力が必要
  'rewrite':   'high',   // 記述改善 → 具体的な提案力が必要
  'job-match': 'high',   // 求人票マッチング → 2文書の照合分析
  'questions': 'low',    // 項目列挙 → 定量的タスク
  'matching':  'high',   // 適性分析 → 推論力が必要
}

/** ヒューリスティクスによる複雑度判定 */
export function assessComplexity(params: {
  userMessage: string
  presetId?: string
  messageCount: number
  hasJobDescription: boolean
  contextLength: number
}): Complexity {
  const { userMessage, presetId, messageCount, hasJobDescription, contextLength } = params

  // プリセット指定がある場合はそれに従う
  if (presetId && PRESET_COMPLEXITY[presetId]) {
    return PRESET_COMPLEXITY[presetId]
  }

  // 求人票付き → high（2文書照合）
  if (hasJobDescription) return 'high'

  // 初回メッセージ（経歴書全体の分析） → high
  if (messageCount === 0) return 'high'

  // 長い質問（200文字超） → high
  if (userMessage.length > 200) return 'high'

  // 論理思考を要するキーワード
  const complexKeywords = [
    '分析', '比較', '評価', '改善', '提案', '戦略', '長所', '短所',
    '強み', '弱み', '課題', '理由', 'なぜ', 'どのように', '具体的',
    'マッチ', '適性', 'ギャップ', 'アドバイス', '推薦', 'レビュー',
  ]
  if (complexKeywords.some((kw) => userMessage.includes(kw))) return 'high'

  // それ以外 → low（フォローアップ、簡単な質問）
  return 'low'
}

/** 複雑度に応じてモデルを選択 */
export function selectModel(complexity: Complexity): string {
  // high → GPT-5 Mini（最新世代の高精度モデル）
  // low  → GPT-5 Nano（最新世代の最安モデル）
  return complexity === 'high' ? 'gpt-5-mini' : 'gpt-5-nano'
}

// ── コスト追跡 ──
const LS_COST_KEY = 'rp_advisor_cost'

interface CostRecord {
  date: string        // YYYY-MM-DD
  dailyTotal: number  // 日次累計（円）
  sessionTotal: number // セッション累計（円）
  callCount: number   // 呼び出し回数
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 現在のコスト記録を取得 */
export function getCostRecord(): CostRecord {
  try {
    const raw = localStorage.getItem(LS_COST_KEY)
    if (!raw) return { date: today(), dailyTotal: 0, sessionTotal: 0, callCount: 0 }
    const record: CostRecord = JSON.parse(raw)
    // 日付が変わったらリセット
    if (record.date !== today()) {
      return { date: today(), dailyTotal: 0, sessionTotal: 0, callCount: 0 }
    }
    return record
  } catch {
    return { date: today(), dailyTotal: 0, sessionTotal: 0, callCount: 0 }
  }
}

/** コストを記録 */
export function recordCost(modelId: string): CostRecord {
  const cost = MODEL_COSTS[modelId]?.costYen || 0.10
  const record = getCostRecord()
  record.dailyTotal += cost
  record.sessionTotal += cost
  record.callCount += 1
  try {
    localStorage.setItem(LS_COST_KEY, JSON.stringify(record))
  } catch { /* ignore */ }
  return record
}

/** セッションコストをリセット（新しいファイル読み込み時等） */
export function resetSessionCost(): void {
  const record = getCostRecord()
  record.sessionTotal = 0
  try {
    localStorage.setItem(LS_COST_KEY, JSON.stringify(record))
  } catch { /* ignore */ }
}

export type CostAlert = 'none' | 'session-warn' | 'daily-alert' | 'daily-warn'

/** アラートレベルを判定 */
export function checkCostAlert(record: CostRecord): CostAlert {
  if (record.dailyTotal >= BUDGET.perDayAlert) return 'daily-warn'
  if (record.dailyTotal >= BUDGET.perDayAlert * 0.8) return 'daily-alert'
  if (record.sessionTotal >= BUDGET.perTaskCycle * 0.8) return 'session-warn'
  return 'none'
}
