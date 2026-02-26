import { describe, it, expect } from 'vitest'
import {
  isAllowedLocalEndpoint,
  buildLocalChatUrl,
  buildLocalMessages,
  buildLocalRequestBody,
} from '../local-ai'

// ── isAllowedLocalEndpoint（SSRF防止） ──

describe('isAllowedLocalEndpoint', () => {
  // 許可されるホスト
  it.each([
    ['http://localhost:11434/v1', 'localhost'],
    ['http://localhost:1234/v1', 'localhost (LM Studio)'],
    ['http://127.0.0.1:11434/v1', '127.0.0.1'],
    ['http://127.0.0.1:8080/v1', '127.0.0.1 別ポート'],
    ['http://[::1]:8080/v1', 'IPv6 localhost'],
    ['http://0.0.0.0:11434/v1', '0.0.0.0'],
    ['https://localhost:11434/v1', 'HTTPS localhost'],
  ])('%s → true (%s)', (endpoint) => {
    expect(isAllowedLocalEndpoint(endpoint)).toBe(true)
  })

  // 拒否されるホスト
  it.each([
    ['http://evil.com/v1', '外部ドメイン'],
    ['http://192.168.1.1/v1', 'プライベートIP'],
    ['http://10.0.0.1/v1', 'プライベートIP (10.x)'],
    ['http://172.16.0.1/v1', 'プライベートIP (172.16.x)'],
    ['http://169.254.169.254/latest/meta-data', 'クラウドメタデータ'],
    ['http://localhost.evil.com/v1', 'サブドメイン偽装'],
    ['not-a-url', '不正URL'],
    ['', '空文字'],
  ])('%s → false (%s)', (endpoint) => {
    expect(isAllowedLocalEndpoint(endpoint)).toBe(false)
  })
})

// ── buildLocalChatUrl ──

describe('buildLocalChatUrl', () => {
  it('末尾スラッシュなしの場合 /chat/completions を追加', () => {
    expect(buildLocalChatUrl('http://localhost:11434/v1')).toBe(
      'http://localhost:11434/v1/chat/completions',
    )
  })

  it('末尾スラッシュありの場合も正規化', () => {
    expect(buildLocalChatUrl('http://localhost:11434/v1/')).toBe(
      'http://localhost:11434/v1/chat/completions',
    )
  })

  it('複数の末尾スラッシュを正規化', () => {
    expect(buildLocalChatUrl('http://localhost:11434/v1///')).toBe(
      'http://localhost:11434/v1/chat/completions',
    )
  })

  it('LM Studio エンドポイント', () => {
    expect(buildLocalChatUrl('http://localhost:1234/v1')).toBe(
      'http://localhost:1234/v1/chat/completions',
    )
  })
})

// ── buildLocalMessages ──

describe('buildLocalMessages', () => {
  it('テキストのみメッセージ → そのまま', () => {
    const msgs = [{ role: 'user', content: 'こんにちは' }]
    const result = buildLocalMessages(msgs)
    expect(result).toEqual([{ role: 'user', content: 'こんにちは' }])
  })

  it('system メッセージを先頭に挿入', () => {
    const msgs = [{ role: 'user', content: 'テスト' }]
    const result = buildLocalMessages(msgs, 'あなたはアシスタントです')
    expect(result).toEqual([
      { role: 'system', content: 'あなたはアシスタントです' },
      { role: 'user', content: 'テスト' },
    ])
  })

  it('system なしの場合は先頭にsystem挿入しない', () => {
    const msgs = [{ role: 'user', content: 'テスト' }]
    const result = buildLocalMessages(msgs)
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('user')
  })

  it('ContentBlock[] → テキストのみ抽出', () => {
    const msgs = [
      {
        role: 'user',
        content: [
          { type: 'text', text: '画像について教えて' },
          { type: 'image', source: { media_type: 'image/png', data: 'base64...' } },
          { type: 'text', text: '特にこの部分' },
        ],
      },
    ]
    const result = buildLocalMessages(msgs)
    expect(result).toEqual([{ role: 'user', content: '画像について教えて\n特にこの部分' }])
  })

  it('ContentBlock内にテキストがない場合は空文字', () => {
    const msgs = [
      {
        role: 'user',
        content: [{ type: 'image', source: { media_type: 'image/png', data: 'base64...' } }],
      },
    ]
    const result = buildLocalMessages(msgs)
    expect(result).toEqual([{ role: 'user', content: '' }])
  })

  it('複数メッセージの変換', () => {
    const msgs = [
      { role: 'user', content: '質問1' },
      { role: 'assistant', content: '回答1' },
      { role: 'user', content: '質問2' },
    ]
    const result = buildLocalMessages(msgs)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ role: 'user', content: '質問1' })
    expect(result[1]).toEqual({ role: 'assistant', content: '回答1' })
    expect(result[2]).toEqual({ role: 'user', content: '質問2' })
  })
})

// ── buildLocalRequestBody ──

describe('buildLocalRequestBody', () => {
  it('local-auto → model フィールド省略', () => {
    const body = buildLocalRequestBody('local-auto', [{ role: 'user', content: 'テスト' }], 4000)
    expect(body.model).toBeUndefined()
    expect(body.max_tokens).toBe(4000)
    expect(body.messages).toBeDefined()
  })

  it('カスタムモデル名 → model フィールド設定', () => {
    const body = buildLocalRequestBody('llama3.2', [{ role: 'user', content: 'テスト' }], 2000)
    expect(body.model).toBe('llama3.2')
    expect(body.max_tokens).toBe(2000)
  })

  it('system メッセージを含むリクエスト構築', () => {
    const body = buildLocalRequestBody(
      'local-auto',
      [{ role: 'user', content: '質問' }],
      4000,
      'あなたはアシスタントです',
    )
    const msgs = body.messages as Array<{ role: string; content: string }>
    expect(msgs[0]).toEqual({ role: 'system', content: 'あなたはアシスタントです' })
    expect(msgs[1]).toEqual({ role: 'user', content: '質問' })
  })

  it('ContentBlock メッセージのテキスト抽出', () => {
    const body = buildLocalRequestBody(
      'local-auto',
      [
        {
          role: 'user',
          content: [{ type: 'text', text: 'テキスト部分' }, { type: 'document' }],
        },
      ],
      4000,
    )
    const msgs = body.messages as Array<{ role: string; content: string }>
    expect(msgs[0].content).toBe('テキスト部分')
  })
})
