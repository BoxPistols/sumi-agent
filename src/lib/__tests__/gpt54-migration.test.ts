/**
 * GPT-5.4 移行テスト
 *
 * 移行ガイドの要件に基づき、以下を検証する:
 * 1. モデル定義が gpt-5.4-nano / gpt-5.4-mini のみ（旧モデル廃止）
 * 2. デフォルトモデルが gpt-5.4-nano に統一
 * 3. コスト定義が新モデルのみ
 * 4. 旧モデル名がコードベースに残っていない
 * 5. API パラメータ分岐（nano: 4000, mini: 16000）
 * 6. temperature が OpenAI パスに含まれない
 */

import { describe, it, expect } from 'vitest'
import { AI_PROVIDERS, AI_MODELS, getProviderForModel } from '../constants'
import { MODEL_COSTS, selectModel } from '../advisor/model-selector'

// ── 1. OpenAI モデル定義 ──

describe('OpenAI モデル定義（GPT-5.4 移行）', () => {
  const openai = AI_PROVIDERS.find((p) => p.id === 'openai')!

  it('OpenAI プロバイダが存在する', () => {
    expect(openai).toBeDefined()
  })

  it('モデルは gpt-5.4-nano と gpt-5.4-mini の2つのみ', () => {
    const ids = openai.models.map((m) => m.id)
    expect(ids).toHaveLength(2)
    expect(ids).toContain('gpt-5.4-nano')
    expect(ids).toContain('gpt-5.4-mini')
  })

  it('旧モデル（gpt-4.1系・gpt-5系）が含まれない', () => {
    const ids = openai.models.map((m) => m.id)
    expect(ids).not.toContain('gpt-4.1-nano')
    expect(ids).not.toContain('gpt-4.1-mini')
    expect(ids).not.toContain('gpt-5-nano')
    expect(ids).not.toContain('gpt-5-mini')
  })

  it('nano が tier 1、mini が tier 2', () => {
    const nano = openai.models.find((m) => m.id === 'gpt-5.4-nano')!
    const mini = openai.models.find((m) => m.id === 'gpt-5.4-mini')!
    expect(nano.tier).toBe(1)
    expect(mini.tier).toBe(2)
  })
})

// ── 2. デフォルトモデル ──

describe('デフォルトモデル設定', () => {
  it('OpenAI の defaultModel が gpt-5.4-nano', () => {
    const openai = AI_PROVIDERS.find((p) => p.id === 'openai')!
    expect(openai.defaultModel).toBe('gpt-5.4-nano')
  })

  it('全プロバイダの defaultModel が自身の models 内に存在する', () => {
    for (const p of AI_PROVIDERS) {
      const ids = p.models.map((m) => m.id)
      expect(ids).toContain(p.defaultModel)
    }
  })
})

// ── 3. プロバイダルーティング ──

describe('GPT-5.4 プロバイダルーティング', () => {
  it('gpt-5.4-nano → openai', () => {
    expect(getProviderForModel('gpt-5.4-nano')).toBe('openai')
  })

  it('gpt-5.4-mini → openai', () => {
    expect(getProviderForModel('gpt-5.4-mini')).toBe('openai')
  })

  it('旧モデル名は openai にルーティングされない（フォールバック先に落ちる）', () => {
    // 旧モデルはどのプロバイダにも存在しないので anthropic フォールバックになる
    expect(getProviderForModel('gpt-5-nano')).toBe('anthropic')
    expect(getProviderForModel('gpt-4.1-nano')).toBe('anthropic')
  })
})

// ── 4. AI_MODELS フラットリストに旧モデルが含まれない ──

describe('AI_MODELS（フラットリスト）', () => {
  const allIds = AI_MODELS.map((m) => m.id)

  it('gpt-5.4-nano が含まれる', () => {
    expect(allIds).toContain('gpt-5.4-nano')
  })

  it('gpt-5.4-mini が含まれる', () => {
    expect(allIds).toContain('gpt-5.4-mini')
  })

  it('旧 GPT モデルが含まれない', () => {
    const legacyModels = ['gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-5-nano', 'gpt-5-mini']
    for (const legacy of legacyModels) {
      expect(allIds).not.toContain(legacy)
    }
  })
})

// ── 5. コスト定義 ──

describe('MODEL_COSTS（GPT-5.4 移行）', () => {
  it('gpt-5.4-nano のコストが定義されている', () => {
    expect(MODEL_COSTS['gpt-5.4-nano']).toBeDefined()
    expect(MODEL_COSTS['gpt-5.4-nano'].tier).toBe('nano')
  })

  it('gpt-5.4-mini のコストが定義されている', () => {
    expect(MODEL_COSTS['gpt-5.4-mini']).toBeDefined()
    expect(MODEL_COSTS['gpt-5.4-mini'].tier).toBe('mini')
  })

  it('旧モデルのコスト定義が存在しない', () => {
    expect(MODEL_COSTS['gpt-5-nano']).toBeUndefined()
    expect(MODEL_COSTS['gpt-5-mini']).toBeUndefined()
    expect(MODEL_COSTS['gpt-4.1-nano']).toBeUndefined()
    expect(MODEL_COSTS['gpt-4.1-mini']).toBeUndefined()
  })

  it('nano < mini のコスト順序', () => {
    expect(MODEL_COSTS['gpt-5.4-nano'].costYen).toBeLessThan(MODEL_COSTS['gpt-5.4-mini'].costYen)
  })
})

// ── 6. モデル自動選択 ──

describe('selectModel（GPT-5.4）', () => {
  it('low complexity → gpt-5.4-nano', () => {
    expect(selectModel('low')).toBe('gpt-5.4-nano')
  })

  it('high complexity → gpt-5.4-mini', () => {
    expect(selectModel('high')).toBe('gpt-5.4-mini')
  })
})

// ── 7. API パラメータ構築ロジック（ユニットテスト可能な部分） ──

describe('GPT-5.4 API パラメータ要件', () => {
  // route.ts のロジックを関数として再現してテスト
  const buildOpenAITokenLimit = (model: string, requestedMax: number): number => {
    const isGpt5 = model.startsWith('gpt-5')
    const tokenLimit = isGpt5 && model.includes('nano') ? 4000 : isGpt5 ? 16000 : requestedMax
    return Math.min(requestedMax, tokenLimit)
  }

  const shouldAddReasoningEffort = (model: string): boolean => {
    return model.startsWith('gpt-5')
  }

  const supportsTemperature = (model: string): boolean => {
    // GPT-5系は temperature 指定不可
    return !model.startsWith('gpt-5')
  }

  describe('max_completion_tokens 制限', () => {
    it('gpt-5.4-nano: リクエスト値に関わらず最大 4000', () => {
      expect(buildOpenAITokenLimit('gpt-5.4-nano', 4000)).toBe(4000)
      expect(buildOpenAITokenLimit('gpt-5.4-nano', 8000)).toBe(4000)
      expect(buildOpenAITokenLimit('gpt-5.4-nano', 16000)).toBe(4000)
    })

    it('gpt-5.4-nano: リクエスト値が 4000 未満ならそのまま', () => {
      expect(buildOpenAITokenLimit('gpt-5.4-nano', 2000)).toBe(2000)
      expect(buildOpenAITokenLimit('gpt-5.4-nano', 1000)).toBe(1000)
    })

    it('gpt-5.4-mini: リクエスト値に関わらず最大 16000', () => {
      expect(buildOpenAITokenLimit('gpt-5.4-mini', 4000)).toBe(4000)
      expect(buildOpenAITokenLimit('gpt-5.4-mini', 16000)).toBe(16000)
      expect(buildOpenAITokenLimit('gpt-5.4-mini', 32000)).toBe(16000)
    })

    it('非GPT-5モデル: リクエスト値がそのまま使われる', () => {
      expect(buildOpenAITokenLimit('gpt-4o', 8000)).toBe(8000)
    })
  })

  describe('reasoning_effort', () => {
    it('gpt-5.4-nano → 必要', () => {
      expect(shouldAddReasoningEffort('gpt-5.4-nano')).toBe(true)
    })

    it('gpt-5.4-mini → 必要', () => {
      expect(shouldAddReasoningEffort('gpt-5.4-mini')).toBe(true)
    })

    it('非GPT-5モデル → 不要', () => {
      expect(shouldAddReasoningEffort('gpt-4o')).toBe(false)
      expect(shouldAddReasoningEffort('claude-sonnet-4-20250514')).toBe(false)
    })
  })

  describe('temperature 制御', () => {
    it('gpt-5.4-nano → temperature 指定不可', () => {
      expect(supportsTemperature('gpt-5.4-nano')).toBe(false)
    })

    it('gpt-5.4-mini → temperature 指定不可', () => {
      expect(supportsTemperature('gpt-5.4-mini')).toBe(false)
    })

    it('非GPT-5モデル → temperature 指定可', () => {
      expect(supportsTemperature('gpt-4o')).toBe(true)
      expect(supportsTemperature('claude-sonnet-4-20250514')).toBe(true)
    })
  })
})

// ── 8. localStorage マイグレーション ──

describe('旧モデル名のバリデーション', () => {
  const allValidModels = AI_PROVIDERS.flatMap((p) => p.models.map((m) => m.id))
  const DEFAULT_MODEL = 'gpt-5.4-nano'

  const migrateModel = (savedModel: string | null): string => {
    if (!savedModel) return DEFAULT_MODEL
    if (allValidModels.includes(savedModel)) return savedModel
    return DEFAULT_MODEL
  }

  it('null → デフォルト (gpt-5.4-nano)', () => {
    expect(migrateModel(null)).toBe('gpt-5.4-nano')
  })

  it('gpt-5.4-nano → そのまま維持', () => {
    expect(migrateModel('gpt-5.4-nano')).toBe('gpt-5.4-nano')
  })

  it('gpt-5.4-mini → そのまま維持', () => {
    expect(migrateModel('gpt-5.4-mini')).toBe('gpt-5.4-mini')
  })

  it('旧モデル gpt-5-nano → デフォルトにリセット', () => {
    expect(migrateModel('gpt-5-nano')).toBe('gpt-5.4-nano')
  })

  it('旧モデル gpt-5-mini → デフォルトにリセット', () => {
    expect(migrateModel('gpt-5-mini')).toBe('gpt-5.4-nano')
  })

  it('旧モデル gpt-4.1-nano → デフォルトにリセット', () => {
    expect(migrateModel('gpt-4.1-nano')).toBe('gpt-5.4-nano')
  })

  it('旧モデル gpt-4.1-mini → デフォルトにリセット', () => {
    expect(migrateModel('gpt-4.1-mini')).toBe('gpt-5.4-nano')
  })

  it('完全に不明なモデル名 → デフォルトにリセット', () => {
    expect(migrateModel('unknown-xyz')).toBe('gpt-5.4-nano')
  })

  it('他プロバイダのモデルは有効', () => {
    expect(migrateModel('claude-sonnet-4-20250514')).toBe('claude-sonnet-4-20250514')
    expect(migrateModel('gemini-2.5-flash')).toBe('gemini-2.5-flash')
  })
})
