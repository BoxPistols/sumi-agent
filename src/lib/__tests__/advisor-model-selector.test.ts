import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MODEL_COSTS,
  BUDGET,
  assessComplexity,
  selectModel,
  getCostRecord,
  recordCost,
  resetSessionCost,
  checkCostAlert,
} from '../advisor/model-selector'

// localStorage モック
const store: Record<string, string> = {}
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k])
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
  })
})

// ── MODEL_COSTS ──

describe('MODEL_COSTS', () => {
  it('全モデルにcostYen, label, tierが定義されている', () => {
    for (const [, info] of Object.entries(MODEL_COSTS)) {
      expect(info.costYen).toBeGreaterThan(0)
      expect(info.label).toBeTruthy()
      expect(['nano', 'mini']).toContain(info.tier)
    }
  })

  it('nanoはminiより安い', () => {
    expect(MODEL_COSTS['gpt-5-nano'].costYen).toBeLessThan(MODEL_COSTS['gpt-5-mini'].costYen)
  })
})

// ── BUDGET ──

describe('BUDGET', () => {
  it('しきい値が正の数', () => {
    expect(BUDGET.perRoundTrip).toBeGreaterThan(0)
    expect(BUDGET.perTaskCycle).toBeGreaterThan(0)
    expect(BUDGET.perDayAlert).toBeGreaterThan(0)
  })

  it('perRoundTrip < perTaskCycle < perDayAlert の順', () => {
    expect(BUDGET.perRoundTrip).toBeLessThan(BUDGET.perTaskCycle)
    expect(BUDGET.perTaskCycle).toBeLessThan(BUDGET.perDayAlert)
  })
})

// ── assessComplexity ──

describe('assessComplexity', () => {
  const base = {
    userMessage: 'こんにちは',
    messageCount: 1,
    hasJobDescription: false,
    contextLength: 500,
  }

  it('プリセット review → high', () => {
    expect(assessComplexity({ ...base, presetId: 'review' })).toBe('high')
  })

  it('プリセット strengths → high', () => {
    expect(assessComplexity({ ...base, presetId: 'strengths' })).toBe('high')
  })

  it('プリセット questions → low', () => {
    expect(assessComplexity({ ...base, presetId: 'questions' })).toBe('low')
  })

  it('求人票あり → high', () => {
    expect(assessComplexity({ ...base, hasJobDescription: true })).toBe('high')
  })

  it('初回メッセージ → high', () => {
    expect(assessComplexity({ ...base, messageCount: 0 })).toBe('high')
  })

  it('長い質問(200文字超) → high', () => {
    expect(assessComplexity({ ...base, userMessage: 'あ'.repeat(201) })).toBe('high')
  })

  it('複雑キーワード「分析」→ high', () => {
    expect(assessComplexity({ ...base, userMessage: 'この経歴を分析してください' })).toBe('high')
  })

  it('複雑キーワード「強み」→ high', () => {
    expect(assessComplexity({ ...base, userMessage: '強みを教えて' })).toBe('high')
  })

  it('短い一般的フォローアップ → low', () => {
    expect(assessComplexity({ ...base, userMessage: 'ありがとう、他には？' })).toBe('low')
  })

  it('短い確認メッセージ → low', () => {
    expect(assessComplexity({ ...base, userMessage: 'はい、わかりました' })).toBe('low')
  })
})

// ── selectModel ──

describe('selectModel', () => {
  it('high → gpt-5-mini', () => {
    expect(selectModel('high')).toBe('gpt-5-mini')
  })

  it('low → gpt-5-nano', () => {
    expect(selectModel('low')).toBe('gpt-5-nano')
  })
})

// ── コスト追跡 ──

describe('getCostRecord', () => {
  it('初回は空のレコード', () => {
    const rec = getCostRecord()
    expect(rec.dailyTotal).toBe(0)
    expect(rec.sessionTotal).toBe(0)
    expect(rec.callCount).toBe(0)
  })

  it('日付が変わるとリセットされる', () => {
    store['rp_advisor_cost'] = JSON.stringify({
      date: '2020-01-01',
      dailyTotal: 10,
      sessionTotal: 5,
      callCount: 20,
    })
    const rec = getCostRecord()
    expect(rec.dailyTotal).toBe(0)
    expect(rec.callCount).toBe(0)
  })
})

describe('recordCost', () => {
  it('gpt-5-nanoのコストを加算する', () => {
    const rec = recordCost('gpt-5-nano')
    expect(rec.callCount).toBe(1)
    expect(rec.dailyTotal).toBeCloseTo(MODEL_COSTS['gpt-5-nano'].costYen)
    expect(rec.sessionTotal).toBeCloseTo(MODEL_COSTS['gpt-5-nano'].costYen)
  })

  it('複数回の呼び出しが累積する', () => {
    recordCost('gpt-5-nano')
    const rec = recordCost('gpt-5-mini')
    expect(rec.callCount).toBe(2)
    expect(rec.dailyTotal).toBeCloseTo(
      MODEL_COSTS['gpt-5-nano'].costYen + MODEL_COSTS['gpt-5-mini'].costYen,
    )
  })

  it('未知モデルはデフォルト0.10円', () => {
    const rec = recordCost('unknown-model')
    expect(rec.dailyTotal).toBeCloseTo(0.1)
  })
})

describe('resetSessionCost', () => {
  it('セッションコストのみリセット（日次は維持）', () => {
    recordCost('gpt-5-nano')
    recordCost('gpt-5-mini')
    resetSessionCost()
    const rec = getCostRecord()
    expect(rec.sessionTotal).toBe(0)
    expect(rec.dailyTotal).toBeGreaterThan(0)
    expect(rec.callCount).toBe(2)
  })
})

// ── checkCostAlert ──

describe('checkCostAlert', () => {
  const base = { date: '2026-02-24', dailyTotal: 0, sessionTotal: 0, callCount: 0 }

  it('コスト0 → none', () => {
    expect(checkCostAlert(base)).toBe('none')
  })

  it('日次 >= perDayAlert → daily-warn', () => {
    expect(checkCostAlert({ ...base, dailyTotal: BUDGET.perDayAlert })).toBe('daily-warn')
  })

  it('日次 >= 80% perDayAlert → daily-alert', () => {
    expect(checkCostAlert({ ...base, dailyTotal: BUDGET.perDayAlert * 0.8 })).toBe('daily-alert')
  })

  it('セッション >= 80% perTaskCycle → session-warn', () => {
    expect(checkCostAlert({ ...base, sessionTotal: BUDGET.perTaskCycle * 0.8 })).toBe(
      'session-warn',
    )
  })

  it('日次アラートはセッションアラートより優先', () => {
    expect(
      checkCostAlert({
        ...base,
        dailyTotal: BUDGET.perDayAlert,
        sessionTotal: BUDGET.perTaskCycle,
      }),
    ).toBe('daily-warn')
  })
})
