import { describe, it, expect } from 'vitest'
import {
  buildConnectionOkMessage,
  getKeyPlaceholder,
  isRateInfo,
  maskApiKey,
  rateUsagePercent,
} from '../settings-helpers'

describe('isRateInfo', () => {
  it('used が数値なら利用状況として扱う', () => {
    expect(isRateInfo({ used: 3, limit: 50, remaining: 47 })).toBe(true)
    expect(isRateInfo({ used: 0 })).toBe(true)
  })

  it('used が数値でない・オブジェクトでない応答は無視する', () => {
    expect(isRateInfo({ used: '3', limit: 50 })).toBe(false)
    expect(isRateInfo({ error: 'x' })).toBe(false)
    expect(isRateInfo(null)).toBe(false)
    expect(isRateInfo(undefined)).toBe(false)
    expect(isRateInfo(42)).toBe(false)
  })
})

describe('maskApiKey', () => {
  it('先頭8文字と末尾4文字だけを見せる', () => {
    expect(maskApiKey('sk-proj-abcdefghijklmnop1234')).toBe('sk-proj-...1234')
  })

  it('未入力なら空文字', () => {
    expect(maskApiKey('')).toBe('')
  })

  it('短いキーでも slice の結果をそのまま連結する', () => {
    expect(maskApiKey('abc')).toBe('abc...abc')
  })
})

describe('getKeyPlaceholder', () => {
  it('プロバイダーごとに文言を出し分ける', () => {
    expect(getKeyPlaceholder('openai')).toBe('sk-proj-...（未入力ならサーバー環境変数）')
    expect(getKeyPlaceholder('google')).toBe('AIza...（必須）')
    expect(getKeyPlaceholder('local')).toBe('不要（ローカルAI）')
  })
})

describe('buildConnectionOkMessage', () => {
  const base = {
    provider: 'openai',
    providerLabel: 'OpenAI',
    model: 'gpt-6-luna',
    localEndpoint: 'http://localhost:11434/v1',
  }

  it('クラウドはモデル名と返答を示す', () => {
    expect(buildConnectionOkMessage({ ...base, reply: 'OK' })).toBe(
      '接続OK (OpenAI / gpt-6-luna) 返答: OK',
    )
  })

  it('返答の空白を詰めて48文字で切る', () => {
    const reply = `  a\n\n b  ${'x'.repeat(60)}`
    const msg = buildConnectionOkMessage({ ...base, reply })
    expect(msg).toBe(`接続OK (OpenAI / gpt-6-luna) 返答: ${`a b ${'x'.repeat(60)}`.slice(0, 48)}`)
  })

  it('返答が空・null なら返答部分を付けない', () => {
    expect(buildConnectionOkMessage({ ...base, reply: '   ' })).toBe('接続OK (OpenAI / gpt-6-luna)')
    expect(buildConnectionOkMessage({ ...base, reply: null })).toBe('接続OK (OpenAI / gpt-6-luna)')
  })

  it('ローカルAIは検証したエンドポイントを示し、空なら既定と書く', () => {
    const local = { ...base, provider: 'local', providerLabel: 'ローカルAI', reply: 'OK' }
    expect(
      buildConnectionOkMessage({ ...local, localEndpoint: ' http://localhost:1234/v1 ' }),
    ).toBe('接続OK (ローカルAI / http://localhost:1234/v1) 返答: OK')
    expect(buildConnectionOkMessage({ ...local, localEndpoint: '  ' })).toBe(
      '接続OK (ローカルAI / 既定のエンドポイント) 返答: OK',
    )
  })
})

describe('rateUsagePercent', () => {
  it('使用率を返し、上限超過は100で止める', () => {
    expect(rateUsagePercent({ used: 10, limit: 50, remaining: 40 })).toBe(20)
    expect(rateUsagePercent({ used: 50, limit: 50, remaining: 0 })).toBe(100)
    expect(rateUsagePercent({ used: 70, limit: 50, remaining: 0 })).toBe(100)
  })
})
