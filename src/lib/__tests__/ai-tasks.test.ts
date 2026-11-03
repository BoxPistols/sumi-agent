import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { callAI, type CallAIParams } from '@/lib/ai/client'
import {
  aiCleanupText,
  aiReformat,
  detectWithAI,
  ensureUniqueDetectionIds,
  mergeOcrResults,
  ocrSparsePages,
  parseAIDetectionJson,
} from '@/lib/ai/tasks'

vi.mock('@/lib/ai/client', () => ({ callAI: vi.fn() }))

const mockCallAI = vi.mocked(callAI)

function callArgs(n: number): CallAIParams {
  return mockCallAI.mock.calls[n][0]
}

function firstText(params: CallAIParams): string {
  const content = params.messages[0].content
  if (typeof content === 'string') return content
  const parts = content as { type: string; text?: string }[]
  return parts.find((p) => p.type === 'text')?.text ?? ''
}

beforeEach(() => {
  mockCallAI.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseAIDetectionJson', () => {
  it('素の JSON 配列を読む', () => {
    expect(parseAIDetectionJson('[{"type":"person_name","value":"山田太郎"}]')).toEqual({
      ok: true,
      items: [{ type: 'person_name', value: '山田太郎' }],
    })
  })

  it('コードブロックや前置きに囲まれた配列も読む', () => {
    const raw = '検出結果です。\n```json\n[{"type":"sns_account","value":"@taro"}]\n```\n以上'
    expect(parseAIDetectionJson(raw)).toEqual({
      ok: true,
      items: [{ type: 'sns_account', value: '@taro' }],
    })
  })

  it('空・非文字列は empty', () => {
    expect(parseAIDetectionJson('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseAIDetectionJson(null)).toEqual({ ok: false, reason: 'empty' })
    expect(parseAIDetectionJson(42)).toEqual({ ok: false, reason: 'empty' })
  })

  it('配列が無ければ no_json、壊れた配列は json_parse', () => {
    expect(parseAIDetectionJson('該当なし')).toEqual({ ok: false, reason: 'no_json' })
    expect(parseAIDetectionJson('[not json]')).toEqual({ ok: false, reason: 'json_parse' })
  })
})

describe('ensureUniqueDetectionIds', () => {
  it('重複 ID に連番を振り、欠けた ID は位置から作る', () => {
    const out = ensureUniqueDetectionIds([
      { id: 'a', v: 1 },
      { id: 'a', v: 2 },
      { id: 'a', v: 3 },
      { v: 4 },
      { id: '  ', v: 5 },
      { id: 7, v: 6 },
    ])
    expect(out.map((d) => d.id)).toEqual(['a', 'a__1', 'a__2', 'd_3', 'd_4', 'd_5'])
    expect(out.map((d) => d.v)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('元の配列・要素を書き換えない', () => {
    const input = [{ id: 'x' }, { id: 'x' }]
    ensureUniqueDetectionIds(input)
    expect(input).toEqual([{ id: 'x' }, { id: 'x' }])
  })
})

describe('mergeOcrResults', () => {
  const base = '--- Page 1 ---\nA\n--- Page 2 ---\nB\n--- Page 3 ---\nC'

  it('OCR 結果のあるページだけ差し替える', () => {
    expect(mergeOcrResults(base, { 2: 'OCR本文' })).toBe(
      '--- Page 1 ---\nA\n\n--- Page 2 ---\nOCR本文\n\n--- Page 3 ---\nC',
    )
  })

  it('結果が空・null ならそのまま返す', () => {
    expect(mergeOcrResults(base, {})).toBe(base)
    expect(mergeOcrResults(base, null)).toBe(base)
    expect(mergeOcrResults(base, undefined)).toBe(base)
  })

  it('ページ区切りの前にある前置きは残す', () => {
    expect(mergeOcrResults('前置き\n--- Page 1 ---\nA', { 1: 'X' })).toBe(
      '前置き\n\n--- Page 1 ---\nX\n',
    )
  })
})

describe('detectWithAI', () => {
  const text = '氏名：山田太郎\nTwitter: @taro_y\n連絡先は担当まで'

  it('本文に実在する人名・SNS だけを検出結果にする', async () => {
    mockCallAI.mockResolvedValueOnce(
      '```json\n' +
        JSON.stringify([
          { type: 'person_name', value: '山田太郎' },
          { type: 'person_name', value: '山田太郎' },
          { type: 'person_name', value: '鈴木花子' },
          { type: 'person_name', value: '山' },
          { type: 'sns_account', value: '@taro_y' },
          { type: 'email', value: '担当' },
          null,
          { value: '山田太郎' },
        ]) +
        '\n```',
    )
    const res = await detectWithAI(text, 'sk-test', 'gpt-6-luna', null)

    expect(res).toEqual({
      detections: [
        {
          id: 'ai_0',
          type: 'name_ai',
          label: '氏名（AI検出）',
          category: 'name',
          value: '山田太郎',
          source: 'ai',
          confidence: 0.95,
          enabled: true,
        },
        {
          id: 'ai_sns_1',
          type: 'sns_ai',
          label: 'SNSアカウント',
          category: 'contact',
          value: '@taro_y',
          source: 'ai',
          confidence: 0.9,
          enabled: true,
        },
      ],
      usedModel: 'gpt-6-luna',
      fallbackUsed: false,
    })
    expect(mockCallAI).toHaveBeenCalledTimes(1)
    const args = callArgs(0)
    expect(args).toMatchObject({
      provider: 'openai',
      model: 'gpt-6-luna',
      apiKey: 'sk-test',
      maxTokens: 1000,
    })
    expect(args.messages).toHaveLength(1)
    expect(args.messages[0].role).toBe('user')
    expect(firstText(args)).toContain('person_name')
    expect(firstText(args).endsWith(`テキスト：\n${text}`)).toBe(true)
  })

  it('本文は先頭 8000 文字だけを渡す', async () => {
    mockCallAI.mockResolvedValueOnce('[]')
    const long = 'あ'.repeat(9000)
    await detectWithAI(long, undefined, 'gpt-6-luna')
    const prompt = firstText(callArgs(0))
    expect(prompt.endsWith(`テキスト：\n${'あ'.repeat(8000)}`)).toBe(true)
  })

  it('一次モデルが不正な出力なら代替モデルで再試行する', async () => {
    mockCallAI
      .mockResolvedValueOnce('すみません、わかりません')
      .mockResolvedValueOnce('[{"type":"person_name","value":"山田太郎"}]')
    const onProgress = vi.fn()
    const res = await detectWithAI(text, undefined, 'gpt-6-luna', 'local-auto', onProgress)

    expect(res.usedModel).toBe('local-auto')
    expect(res.fallbackUsed).toBe(true)
    expect(res.error).toBeUndefined()
    expect(res.detections.map((d) => d.value)).toEqual(['山田太郎'])
    expect(onProgress).toHaveBeenCalledWith('AI PII検出: local-auto で再試行中...')
    expect(callArgs(1)).toMatchObject({ provider: 'local', model: 'local-auto' })
  })

  it('一次が例外・代替も不正なら一次の理由をエラーにする', async () => {
    mockCallAI.mockRejectedValueOnce(new Error('rate limited')).mockResolvedValueOnce('nope')
    const res = await detectWithAI(text, undefined, 'gpt-6-luna', 'local-auto')
    expect(res).toEqual({
      detections: [],
      usedModel: 'local-auto',
      fallbackUsed: true,
      error: 'AI検出失敗(gpt-6-luna→local-auto): rate limited',
    })
  })

  it('代替モデルも例外ならその理由をエラーにする', async () => {
    mockCallAI.mockResolvedValueOnce('nope').mockRejectedValueOnce(new Error('offline'))
    const res = await detectWithAI(text, undefined, 'gpt-6-luna', 'local-auto')
    expect(res.error).toBe('AI検出失敗(gpt-6-luna→local-auto): offline')
    expect(res.fallbackUsed).toBe(true)
  })

  it('代替モデルが無い・同じなら再試行しない', async () => {
    mockCallAI.mockResolvedValue('nope')
    const onProgress = vi.fn()
    const res = await detectWithAI(text, undefined, 'gpt-6-luna', 'gpt-6-luna', onProgress)
    expect(res).toEqual({
      detections: [],
      usedModel: 'gpt-6-luna',
      fallbackUsed: false,
      error: 'AI検出失敗(gpt-6-luna): no_json',
    })
    expect(mockCallAI).toHaveBeenCalledTimes(1)
    expect(onProgress).not.toHaveBeenCalled()
  })

  it('例外に message が無ければ error を理由にする', async () => {
    mockCallAI.mockRejectedValueOnce('string error')
    const res = await detectWithAI(text, undefined, 'gpt-6-luna')
    expect(res.error).toBe('AI検出失敗(gpt-6-luna): error')
  })
})

describe('ocrSparsePages', () => {
  const pdf = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer

  it('対象ページが無ければ何もしない', async () => {
    expect(await ocrSparsePages(pdf('%PDF'), [], undefined, 'gpt-6-luna')).toEqual({})
    expect(await ocrSparsePages(pdf('%PDF'), null, undefined, 'gpt-6-luna')).toEqual({})
    expect(mockCallAI).not.toHaveBeenCalled()
  })

  it('PDF データが無ければ進捗に出して空を返す', async () => {
    const onProgress = vi.fn()
    expect(
      await ocrSparsePages(new ArrayBuffer(0), [1], undefined, 'gpt-6-luna', onProgress),
    ).toEqual({})
    expect(onProgress).toHaveBeenCalledWith('OCR: PDFデータなし')
    expect(mockCallAI).not.toHaveBeenCalled()
  })

  it('PDF を Base64 で渡し、ページごとの本文を取り出す', async () => {
    mockCallAI.mockResolvedValueOnce(
      '--- Page 2 ---\nこんにちは 世界\n--- Page 3 ---\n[画像のみ]\n--- Page 4 ---\nab',
    )
    const onProgress = vi.fn()
    const res = await ocrSparsePages(pdf('%PDF-1.7 test'), [2, 3, 4], 'k', 'gpt-6-luna', onProgress)

    expect(res).toEqual({ 2: 'こんにちは 世界' })
    const args = callArgs(0)
    expect(args).toMatchObject({
      provider: 'openai',
      model: 'gpt-6-luna',
      apiKey: 'k',
      maxTokens: 8000,
    })
    const parts = args.messages[0].content as {
      type: string
      source?: { type: string; media_type: string; data: string }
    }[]
    expect(parts[0]).toEqual({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: Buffer.from('%PDF-1.7 test').toString('base64'),
      },
    })
    expect(firstText(args)).toContain('このPDFのページ 2, 3, 4 からテキストを抽出してください。')
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
      'OCR: PDF→Base64変換中...',
      'OCR: PDF 0.0MB — 3ページを解析中...',
      'OCR: 100% — Page 2, 3, 4 (3/3)',
      'OCR完了: 1/3ページからテキスト復元',
    ])
  })

  it('8192 バイトを超える非 ASCII バイト列も正しく Base64 化する', async () => {
    const bytes = new Uint8Array(20000)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 256
    mockCallAI.mockResolvedValueOnce('')
    await ocrSparsePages(bytes.buffer, [1], undefined, 'gpt-6-luna')
    const parts = callArgs(0).messages[0].content as { source?: { data: string } }[]
    expect(parts[0].source?.data).toBe(Buffer.from(bytes).toString('base64'))
  })

  it('6 ページずつに分けて送る', async () => {
    mockCallAI
      .mockResolvedValueOnce('--- Page 1 ---\npage one')
      .mockResolvedValueOnce('--- Page 7 ---\npage seven')
    const onProgress = vi.fn()
    const res = await ocrSparsePages(
      pdf('%PDF'),
      [1, 2, 3, 4, 5, 6, 7],
      undefined,
      'gpt-6-luna',
      onProgress,
    )
    expect(mockCallAI).toHaveBeenCalledTimes(2)
    expect(firstText(callArgs(1))).toContain('このPDFのページ 7 から')
    expect(res).toEqual({ 1: 'page one', 7: 'page seven' })
    expect(onProgress).toHaveBeenCalledWith('OCR: 86% — Page 1, 2, 3, 4, 5, 6 (6/7)')
    expect(onProgress).toHaveBeenCalledWith('OCR: 100% — Page 7 (7/7)')
  })

  it('1 ページだけのときは区切りが無い応答もそのページの本文にする', async () => {
    mockCallAI.mockResolvedValueOnce('区切りのない本文テキスト')
    const res = await ocrSparsePages(pdf('%PDF'), [5], undefined, '')
    expect(res).toEqual({ 5: '区切りのない本文テキスト' })
    expect(callArgs(0)).toMatchObject({ provider: 'openai', model: 'gpt-6-luna' })
  })

  it('通信エラーは進捗に出して次のバッチへ進む', async () => {
    mockCallAI
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('--- Page 8 ---\nrecovered')
    const onProgress = vi.fn()
    const res = await ocrSparsePages(
      pdf('%PDF'),
      [1, 2, 3, 4, 5, 6, 8],
      undefined,
      'gpt-6-luna',
      onProgress,
    )
    expect(res).toEqual({ 8: 'recovered' })
    expect(onProgress).toHaveBeenCalledWith('OCR通信エラー: boom')
    expect(console.error).toHaveBeenCalled()
  })
})

describe('aiCleanupText', () => {
  const raw =
    '--- Page 1 ---\n企 画 書\n株式会社サンプル\n--- Page 2 ---\nデ ザ イ ン\n担当：営業部'
  const fixed = '--- Page 1 ---\n企画書\n株式会社サンプル\n\n--- Page 2 ---\nデザイン\n担当：営業部'

  it('前置きを取り除いた整形結果を返す', async () => {
    mockCallAI.mockResolvedValueOnce(`整形しました。\n${fixed}`)
    const onProgress = vi.fn()
    const res = await aiCleanupText(raw, 'k', 'gpt-6-luna', onProgress)
    expect(res).toBe(fixed)
    expect(mockCallAI).toHaveBeenCalledTimes(1)
    const args = callArgs(0)
    expect(args).toMatchObject({
      provider: 'openai',
      model: 'gpt-6-luna',
      apiKey: 'k',
      maxTokens: 4000,
    })
    expect(firstText(args)).toContain(
      `テキスト：\n--- Page 1 ---\n企 画 書\n株式会社サンプル\n\n--- Page 2 ---\nデ ザ イ ン\n担当：営業部`,
    )
    expect(onProgress).toHaveBeenCalledWith('AI再構成: 100% (1/1バッチ)')
  })

  it('モデル未指定なら gpt-6-luna を使う', async () => {
    mockCallAI.mockResolvedValueOnce(fixed)
    await aiCleanupText(raw, undefined, undefined)
    expect(callArgs(0)).toMatchObject({ provider: 'openai', model: 'gpt-6-luna' })
  })

  it('一次の結果が短すぎれば代替モデルで再試行する', async () => {
    mockCallAI.mockResolvedValueOnce('短い').mockResolvedValueOnce(fixed)
    const onProgress = vi.fn()
    const res = await aiCleanupText(raw, undefined, 'gpt-6-luna', onProgress, 'local-auto')
    expect(res).toBe(fixed)
    expect(callArgs(1)).toMatchObject({ provider: 'local', model: 'local-auto' })
    expect(onProgress).toHaveBeenCalledWith('AI再構成: 100% — local-auto で再試行中...')
  })

  it('一次が例外なら代替モデルで再試行する', async () => {
    mockCallAI.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(fixed)
    const res = await aiCleanupText(raw, undefined, 'gpt-6-luna', undefined, 'local-auto')
    expect(res).toBe(fixed)
    expect(mockCallAI).toHaveBeenCalledTimes(2)
  })

  it('両方とも失敗したら元のバッチを残す', async () => {
    mockCallAI.mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('down'))
    const res = await aiCleanupText(raw, undefined, 'gpt-6-luna', undefined, 'local-auto')
    expect(res).toBe(
      '--- Page 1 ---\n企 画 書\n株式会社サンプル\n\n--- Page 2 ---\nデ ザ イ ン\n担当：営業部',
    )
  })

  it('一次が不正・代替が例外なら元のバッチを残す', async () => {
    mockCallAI.mockResolvedValueOnce('').mockRejectedValueOnce(new Error('down'))
    const res = await aiCleanupText(raw, undefined, 'gpt-6-luna', undefined, 'local-auto')
    expect(res).toContain('企 画 書')
  })

  it('代替モデルが一次と同じなら再試行しない', async () => {
    mockCallAI.mockResolvedValueOnce('')
    await aiCleanupText(raw, undefined, 'gpt-6-luna', undefined, 'gpt-6-luna')
    expect(mockCallAI).toHaveBeenCalledTimes(1)
  })

  it('本文がほぼ無いバッチは AI に送らない', async () => {
    const res = await aiCleanupText('--- Page 1 ---\n一行だけ', undefined, 'gpt-6-luna')
    expect(res).toBe('--- Page 1 ---\n一行だけ')
    expect(mockCallAI).not.toHaveBeenCalled()
  })

  it('約 5000 文字ごとにバッチを分ける', async () => {
    const page = (n: number) => `--- Page ${n} ---\n${'あ'.repeat(3000)}\n${'い'.repeat(10)}`
    const text = [page(1), page(2)].join('\n')
    mockCallAI.mockImplementation(async (p) => firstText(p).split('テキスト：\n')[1])
    const onProgress = vi.fn()
    const res = await aiCleanupText(text, undefined, 'gpt-6-luna', onProgress)
    expect(mockCallAI).toHaveBeenCalledTimes(2)
    expect(res).toBe(`${page(1)}\n\n${page(2)}`)
    expect(onProgress).toHaveBeenCalledWith('AI再構成: 50% (1/2バッチ)')
    expect(onProgress).toHaveBeenCalledWith('AI再構成: 100% (2/2バッチ)')
  })
})

describe('aiReformat', () => {
  it('指示とマスキング済みテキスト（先頭 6000 文字）を渡して結果をそのまま返す', async () => {
    mockCallAI.mockResolvedValueOnce('再構成結果')
    const redacted = '[氏名非公開]' + 'x'.repeat(7000)
    const out = await aiReformat(redacted, '箇条書きで', 'k', 'local-auto')
    expect(out).toBe('再構成結果')
    const args = callArgs(0)
    expect(args).toMatchObject({
      provider: 'local',
      model: 'local-auto',
      apiKey: 'k',
      maxTokens: 4000,
    })
    const prompt = firstText(args)
    expect(prompt).toContain(
      '【フォーマット指示】\n箇条書きで\n\n【マスキング済みテキスト】\n[氏名非公開]',
    )
    expect(prompt.endsWith(redacted.slice(0, 6000))).toBe(true)
    expect(prompt).not.toContain(redacted.slice(0, 6001))
  })

  it('モデルが空なら gpt-6-luna を使う', async () => {
    mockCallAI.mockResolvedValueOnce('')
    await aiReformat('t', 'i', undefined, '')
    expect(callArgs(0)).toMatchObject({ provider: 'openai', model: 'gpt-6-luna' })
  })

  it('AI の例外はそのまま投げる', async () => {
    mockCallAI.mockRejectedValueOnce(new Error('fail'))
    await expect(aiReformat('t', 'i', undefined, 'gpt-6-luna')).rejects.toThrow('fail')
  })
})
