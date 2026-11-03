import { describe, it, expect, vi, afterEach } from 'vitest'
import { getModelsForRun, pickFormatModelForProfile, getProviderMaxTier } from '../ai/models'
import { callAI, onRateLimitUpdate } from '../ai/client'

describe('getModelsForRun', () => {
  it('OpenAI の既定設定では整形・検出とも gpt-6-luna を使う（tier が1つしかないので整形の予備も同じモデル）', () => {
    const r = getModelsForRun({ provider: 'openai', model: 'gpt-6-luna', aiProfile: 'balanced' })
    expect(r).toEqual({
      providerId: 'openai',
      profile: 'balanced',
      detectModel: 'gpt-6-luna',
      detectFallbackModel: null,
      formatModel: 'gpt-6-luna',
      formatFallbackModel: 'gpt-6-luna',
    })
  })

  it('provider 未設定ならモデル名から推定し、ローカルAIを選ぶ', () => {
    const r = getModelsForRun({ model: 'local-auto' })
    expect(r.providerId).toBe('local')
    expect(r.detectModel).toBe('local-auto')
  })

  it('設定がなくても既定モデルで動く', () => {
    const r = getModelsForRun(undefined)
    expect(r.providerId).toBe('openai')
    expect(r.formatModel).toBe('gpt-6-luna')
  })
})

describe('pickFormatModelForProfile', () => {
  it('対象 tier のモデルがなければ下位 tier・既定モデルへ順に落とす', () => {
    expect(getProviderMaxTier('openai')).toBe(1)
    expect(pickFormatModelForProfile('openai', 'quality', false)).toBe('gpt-6-luna')
    expect(pickFormatModelForProfile('unknown', 'speed', false)).toBeNull()
  })
})

describe('callAI', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('/api/ai に POST し、残り回数を購読者へ通知する', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'ok', remaining: 3, limit: 50, resetAt: 99 }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const listener = vi.fn()
    const off = onRateLimitUpdate(listener)

    const text = await callAI({
      provider: 'openai',
      model: 'gpt-6-luna',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(text).toBe('ok')
    expect(fetchMock).toHaveBeenCalledWith('/api/ai', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.maxTokens).toBe(4000)
    expect(listener).toHaveBeenCalledWith({ remaining: 3, limit: 50, resetAt: 99 })
    off()
  })

  it('エラー応答のメッセージをそのまま投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '上限' }), { status: 429 })),
    )
    await expect(callAI({ provider: 'openai', model: 'x', messages: [] })).rejects.toThrow('上限')
  })
})
