import { describe, it, expect } from 'vitest'
import {
  AI_PROVIDERS,
  AI_MODELS,
  getProviderForModel,
  CATEGORIES,
  MASK_PRESETS,
  EXPORT_FORMATS,
} from '../constants'

// ── AI_PROVIDERS ──

describe('AI_PROVIDERS', () => {
  it('4つのプロバイダがある（anthropic, openai, google, local）', () => {
    expect(AI_PROVIDERS).toHaveLength(4)
    const ids = AI_PROVIDERS.map((p) => p.id)
    expect(ids).toContain('anthropic')
    expect(ids).toContain('openai')
    expect(ids).toContain('google')
    expect(ids).toContain('local')
  })

  it('各プロバイダにid, label, icon, color, models, defaultModelがある', () => {
    for (const p of AI_PROVIDERS) {
      expect(p.id).toBeTruthy()
      expect(p.label).toBeTruthy()
      expect(p.icon).toBeTruthy()
      expect(p.color).toMatch(/^#/)
      expect(p.models.length).toBeGreaterThan(0)
      expect(p.defaultModel).toBeTruthy()
    }
  })

  it('defaultModelが自身のmodels内に存在する', () => {
    for (const p of AI_PROVIDERS) {
      const modelIds = p.models.map((m) => m.id)
      expect(modelIds).toContain(p.defaultModel)
    }
  })

  it('モデルIDが全プロバイダで重複しない', () => {
    const allIds = AI_PROVIDERS.flatMap((p) => p.models.map((m) => m.id))
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('各モデルにtier(1-3)がある', () => {
    for (const p of AI_PROVIDERS) {
      for (const m of p.models) {
        expect(m.tier).toBeGreaterThanOrEqual(1)
        expect(m.tier).toBeLessThanOrEqual(3)
      }
    }
  })
})

// ── AI_MODELS (flatMap) ──

describe('AI_MODELS', () => {
  it('全プロバイダのモデルがフラット化されている', () => {
    const totalModels = AI_PROVIDERS.reduce((sum, p) => sum + p.models.length, 0)
    expect(AI_MODELS).toHaveLength(totalModels)
  })

  it('各モデルにproviderが付与されている', () => {
    for (const m of AI_MODELS) {
      expect(m.provider).toBeTruthy()
    }
  })
})

// ── getProviderForModel ──

describe('getProviderForModel', () => {
  it('Claudeモデル → anthropic', () => {
    expect(getProviderForModel('claude-sonnet-4-20250514')).toBe('anthropic')
    expect(getProviderForModel('claude-haiku-4-5-20251001')).toBe('anthropic')
  })

  it('GPTモデル → openai', () => {
    expect(getProviderForModel('gpt-5-nano')).toBe('openai')
    expect(getProviderForModel('gpt-5-mini')).toBe('openai')
    expect(getProviderForModel('gpt-4.1-nano')).toBe('openai')
  })

  it('Geminiモデル → google', () => {
    expect(getProviderForModel('gemini-2.5-flash')).toBe('google')
    expect(getProviderForModel('gemini-2.5-pro')).toBe('google')
  })

  it('local-auto → local', () => {
    expect(getProviderForModel('local-auto')).toBe('local')
  })

  it('local-プレフィックス → local', () => {
    expect(getProviderForModel('local-llama3')).toBe('local')
    expect(getProviderForModel('local-custom')).toBe('local')
  })

  it('不明モデル → anthropic (フォールバック)', () => {
    expect(getProviderForModel('unknown-model')).toBe('anthropic')
  })
})

// ── CATEGORIES ──

describe('CATEGORIES', () => {
  it('8カテゴリが定義されている', () => {
    expect(Object.keys(CATEGORIES)).toHaveLength(8)
  })

  it('各カテゴリにlabel, color, bgがある', () => {
    for (const [, meta] of Object.entries(CATEGORIES)) {
      expect(meta.label).toBeTruthy()
      expect(meta.color).toBeTruthy()
      expect(meta.bg).toBeTruthy()
    }
  })

  const expectedCats = [
    'name',
    'contact',
    'address',
    'personal',
    'web',
    'organization',
    'custom',
    'photo',
  ]
  for (const cat of expectedCats) {
    it(`カテゴリ「${cat}」が存在する`, () => {
      expect(CATEGORIES[cat]).toBeDefined()
    })
  }
})

// ── MASK_PRESETS ──

describe('MASK_PRESETS', () => {
  it('3つのプリセット（basic, std, strict）', () => {
    expect(MASK_PRESETS).toHaveLength(3)
    expect(MASK_PRESETS.map((p) => p.id)).toEqual(['basic', 'std', 'strict'])
  })

  it('levelが1, 2, 3の昇順', () => {
    expect(MASK_PRESETS[0].level).toBe(1)
    expect(MASK_PRESETS[1].level).toBe(2)
    expect(MASK_PRESETS[2].level).toBe(3)
  })

  it('strictは全カテゴリtrue', () => {
    const strict = MASK_PRESETS.find((p) => p.id === 'strict')!
    expect(strict.mask.name).toBe(true)
    expect(strict.mask.contact).toBe(true)
    expect(strict.mask.address).toBe(true)
    expect(strict.mask.personal).toBe(true)
    expect(strict.mask.web).toBe(true)
    expect(strict.mask.organization).toBe(true)
  })

  it('basicはname + contactのみtrue', () => {
    const basic = MASK_PRESETS.find((p) => p.id === 'basic')!
    expect(basic.mask.name).toBe(true)
    expect(basic.mask.contact).toBe(true)
    expect(basic.mask.address).toBe(false)
    expect(basic.mask.personal).toBe(false)
    expect(basic.mask.web).toBe(false)
    expect(basic.mask.organization).toBe(false)
  })
})

// ── EXPORT_FORMATS ──

describe('EXPORT_FORMATS', () => {
  it('6つのフォーマットがある', () => {
    expect(EXPORT_FORMATS).toHaveLength(6)
  })

  it('各フォーマットの拡張子が.で始まる', () => {
    for (const f of EXPORT_FORMATS) {
      expect(f.ext).toMatch(/^\./)
    }
  })
})
