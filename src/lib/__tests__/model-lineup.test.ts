/**
 * モデルラインナップ テスト
 *
 * 対応プロバイダは OpenAI (GPT-5.6 Luna) / Gemini / ローカルAI の3つのみ。
 * 以下を検証する:
 * 1. プロバイダ・モデル定義（Claude/Anthropic と旧GPTモデルの排除）
 * 2. デフォルトモデルの統一
 * 3. コスト定義
 * 4. API パラメータ分岐（token limit / reasoning_effort / temperature）
 * 5. 保存済みモデル名のマイグレーション
 * 6. サーバー共用キーで利用できるモデルの制限
 */

import { describe, it, expect } from 'vitest'
import { AI_PROVIDERS, AI_MODELS, getProviderForModel, migrateProviderId } from '../constants'
import { MODEL_COSTS, selectModel } from '../advisor/model-selector'

const LUNA = 'gpt-5.6-luna'

// 廃止された、コードベースに残ってはいけないモデルID
const RETIRED_MODELS = [
  'gpt-4.1-nano',
  'gpt-4.1-mini',
  'gpt-5-nano',
  'gpt-5-mini',
  'gpt-5.4-nano',
  'gpt-5.4-mini',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5-20250929',
]

// ── 1. プロバイダ構成 ──

describe('プロバイダ構成', () => {
  it('OpenAI / Gemini / ローカルAI の3つのみ', () => {
    expect(AI_PROVIDERS.map((p) => p.id)).toEqual(['openai', 'google', 'local'])
  })

  it('Anthropic(Claude) プロバイダは存在しない', () => {
    expect(AI_PROVIDERS.some((p) => p.id === 'anthropic')).toBe(false)
    expect(AI_PROVIDERS.some((p) => /claude/i.test(p.label))).toBe(false)
  })

  it('各プロバイダに必要なフィールドが揃っている', () => {
    for (const p of AI_PROVIDERS) {
      expect(p.label).toBeTruthy()
      expect(p.icon).toBeTruthy()
      expect(p.color).toMatch(/^#/)
      expect(p.models.length).toBeGreaterThan(0)
      expect(p.models.map((m) => m.id)).toContain(p.defaultModel)
    }
  })
})

// ── 2. OpenAI モデル定義 ──

describe('OpenAI モデル定義（GPT-5.6 Luna）', () => {
  const openai = AI_PROVIDERS.find((p) => p.id === 'openai')!

  it('モデルは gpt-5.6-luna の1つのみ', () => {
    expect(openai.models.map((m) => m.id)).toEqual([LUNA])
  })

  it('defaultModel が gpt-5.6-luna', () => {
    expect(openai.defaultModel).toBe(LUNA)
  })

  it('tier 1（サーバー共用キーで利用可能）', () => {
    expect(openai.models[0].tier).toBe(1)
    expect(openai.models[0].needsUserKey).toBeFalsy()
  })
})

// ── 3. 廃止モデルの排除 ──

describe('廃止モデルの排除', () => {
  it('旧モデルがどのプロバイダにも含まれない', () => {
    const allIds = AI_PROVIDERS.flatMap((p) => p.models.map((m) => m.id))
    for (const retired of RETIRED_MODELS) {
      expect(allIds).not.toContain(retired)
    }
  })

  it('MODEL_COSTS に旧モデルの定義が残っていない', () => {
    for (const retired of RETIRED_MODELS) {
      expect(MODEL_COSTS[retired]).toBeUndefined()
    }
  })
})

// ── 4. プロバイダルーティング ──

describe('プロバイダルーティング', () => {
  it('gpt-5.6-luna → openai', () => {
    expect(getProviderForModel(LUNA)).toBe('openai')
  })

  it('gemini-2.5-flash → google', () => {
    expect(getProviderForModel('gemini-2.5-flash')).toBe('google')
  })

  it('local-auto → local', () => {
    expect(getProviderForModel('local-auto')).toBe('local')
  })

  it('未知のモデル名は openai フォールバック', () => {
    for (const retired of RETIRED_MODELS) {
      expect(getProviderForModel(retired)).toBe('openai')
    }
  })
})

// ── 5. AI_MODELS（フラットリスト） ──

describe('AI_MODELS', () => {
  it('全プロバイダのモデルがフラット化されている', () => {
    const total = AI_PROVIDERS.reduce((sum, p) => sum + p.models.length, 0)
    expect(AI_MODELS).toHaveLength(total)
  })

  it('gpt-5.6-luna が含まれ、provider が付与されている', () => {
    const luna = AI_MODELS.find((m) => m.id === LUNA)
    expect(luna).toBeDefined()
    expect(luna!.provider).toBe('openai')
  })
})

// ── 6. コストとモデル選択 ──

describe('MODEL_COSTS / selectModel', () => {
  it('gpt-5.6-luna のコストが定義されている', () => {
    expect(MODEL_COSTS[LUNA]).toBeDefined()
    expect(MODEL_COSTS[LUNA].costYen).toBeGreaterThan(0)
  })

  it('複雑度に関わらず gpt-5.6-luna を選ぶ', () => {
    expect(selectModel('low')).toBe(LUNA)
    expect(selectModel('high')).toBe(LUNA)
  })
})

// ── 7. API パラメータ要件（route.ts のロジックを再現） ──

describe('OpenAI API パラメータ要件', () => {
  const buildOpenAITokenLimit = (model: string, requestedMax: number): number => {
    const isGpt5 = model.startsWith('gpt-5')
    const tokenLimit = isGpt5 && model.includes('nano') ? 4000 : isGpt5 ? 16000 : requestedMax
    return Math.min(requestedMax, tokenLimit)
  }
  const shouldAddReasoningEffort = (model: string): boolean => model.startsWith('gpt-5')
  const supportsTemperature = (model: string): boolean => !model.startsWith('gpt-5')

  it('gpt-5.6-luna: 最大 16000 トークン', () => {
    expect(buildOpenAITokenLimit(LUNA, 4000)).toBe(4000)
    expect(buildOpenAITokenLimit(LUNA, 16000)).toBe(16000)
    expect(buildOpenAITokenLimit(LUNA, 32000)).toBe(16000)
  })

  it('gpt-5.6-luna: reasoning_effort が必要', () => {
    expect(shouldAddReasoningEffort(LUNA)).toBe(true)
  })

  it('gpt-5.6-luna: temperature 指定不可', () => {
    expect(supportsTemperature(LUNA)).toBe(false)
  })

  it('非GPT-5系モデル: リクエスト値がそのまま、temperature 指定可', () => {
    expect(buildOpenAITokenLimit('gemini-2.5-flash', 8000)).toBe(8000)
    expect(shouldAddReasoningEffort('gemini-2.5-flash')).toBe(false)
    expect(supportsTemperature('gemini-2.5-flash')).toBe(true)
  })
})

// ── 8. 保存済みモデル名のマイグレーション ──

describe('保存済みモデル名のマイグレーション', () => {
  const allValidModels = AI_PROVIDERS.flatMap((p) => p.models.map((m) => m.id))
  const DEFAULT_MODEL = LUNA

  const migrateModel = (savedModel: string | null): string => {
    if (!savedModel) return DEFAULT_MODEL
    if (allValidModels.includes(savedModel)) return savedModel
    return DEFAULT_MODEL
  }

  it('null → デフォルト', () => {
    expect(migrateModel(null)).toBe(LUNA)
  })

  it('gpt-5.6-luna → そのまま維持', () => {
    expect(migrateModel(LUNA)).toBe(LUNA)
  })

  it('廃止モデル（旧GPT・Claude）→ デフォルトにリセット', () => {
    for (const retired of RETIRED_MODELS) {
      expect(migrateModel(retired)).toBe(LUNA)
    }
  })

  it('不明なモデル名 → デフォルトにリセット', () => {
    expect(migrateModel('unknown-xyz')).toBe(LUNA)
  })

  it('現行の他プロバイダモデルは維持される', () => {
    expect(migrateModel('gemini-2.5-flash')).toBe('gemini-2.5-flash')
    expect(migrateModel('local-auto')).toBe('local-auto')
  })
})

// ── 9. サーバー共用キーでのモデル制限（route.ts と同等） ──

describe('サーバー共用キーのモデル制限', () => {
  const isModelAllowedWithoutUserKey = (provider: string, model: string): boolean => {
    if (provider === 'openai' && model !== LUNA) return false
    return true
  }

  it('gpt-5.6-luna → 許可', () => {
    expect(isModelAllowedWithoutUserKey('openai', LUNA)).toBe(true)
  })

  it('OpenAIの他モデル → 拒否', () => {
    expect(isModelAllowedWithoutUserKey('openai', 'gpt-5.4-mini')).toBe(false)
  })

  it('Gemini / ローカルAI は別途 needsKey で制御', () => {
    expect(isModelAllowedWithoutUserKey('google', 'gemini-2.5-flash')).toBe(true)
    expect(isModelAllowedWithoutUserKey('local', 'local-auto')).toBe(true)
  })
})

// ── 10. 保存済みプロバイダのマイグレーション ──

describe('保存済みプロバイダのマイグレーション', () => {
  it('廃止済みの anthropic → openai', () => {
    expect(migrateProviderId('anthropic')).toBe('openai')
  })

  it('未設定・不明な値 → openai', () => {
    expect(migrateProviderId(null)).toBe('openai')
    expect(migrateProviderId(undefined)).toBe('openai')
    expect(migrateProviderId('unknown')).toBe('openai')
  })

  it('現行プロバイダはそのまま維持', () => {
    expect(migrateProviderId('openai')).toBe('openai')
    expect(migrateProviderId('google')).toBe('google')
    expect(migrateProviderId('local')).toBe('local')
  })

  it('{provider: anthropic, model: claude-*} から復元しても両方が有効値になる', () => {
    const allValidModels = AI_PROVIDERS.flatMap((p) => p.models.map((m) => m.id))
    const provider = migrateProviderId('anthropic')
    const savedModel = 'claude-sonnet-4-20250514'
    const model = allValidModels.includes(savedModel) ? savedModel : LUNA
    expect(provider).toBe('openai')
    expect(model).toBe(LUNA)
    expect(AI_PROVIDERS.some((p) => p.id === provider)).toBe(true)
    expect(allValidModels).toContain(model)
  })
})
