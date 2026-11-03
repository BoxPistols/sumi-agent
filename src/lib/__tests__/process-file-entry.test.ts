import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ParsedFile } from '../parsers/types'

const parseFile = vi.fn<(file: File) => Promise<ParsedFile>>()
vi.mock('@/lib/parsers', () => ({ parseFile: (file: File) => parseFile(file) }))

const detectWithAI = vi.fn()
const ocrSparsePages = vi.fn()
const aiCleanupText = vi.fn()
vi.mock('@/lib/ai/tasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/tasks')>()
  return {
    ...actual,
    detectWithAI: (...a: unknown[]) => detectWithAI(...a),
    ocrSparsePages: (...a: unknown[]) => ocrSparsePages(...a),
    aiCleanupText: (...a: unknown[]) => aiCleanupText(...a),
  }
})

const { processFileEntry } = await import('../process-file-entry')

const RESUME = '氏名：山田 太郎\nメール：taro@example.com\n電話：090-1234-5678\n'
const file = new File([RESUME], 'resume.pdf')

function sparsePdf(): ParsedFile {
  return {
    text: RESUME,
    format: 'PDF',
    pageCount: 2,
    sparsePages: [1, 2],
    pdfData: new Uint8Array([37, 80, 68, 70]).buffer,
  }
}

const proSettings = { provider: 'openai', model: 'gpt-6-luna', aiDetect: true, apiKey: '' }

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  parseFile.mockReset()
  detectWithAI.mockReset().mockResolvedValue({ detections: [] })
  ocrSparsePages.mockReset().mockResolvedValue({})
  aiCleanupText.mockReset().mockResolvedValue(null)
  fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ text: RESUME.repeat(3), pageCount: 2 }), { status: 200 }),
    )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

describe('processFileEntry', () => {
  it('Lite では文字を取り出しにくいPDFでもサーバーにもAIにも送らない', async () => {
    parseFile.mockResolvedValue(sparsePdf())

    const r = await processFileEntry(file, { name: true, contact: true }, proSettings, {
      isLite: true,
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(ocrSparsePages).not.toHaveBeenCalled()
    expect(aiCleanupText).not.toHaveBeenCalled()
    expect(detectWithAI).not.toHaveBeenCalled()
    expect(r.detections.map((d) => d.value)).toEqual(
      expect.arrayContaining(['taro@example.com', '090-1234-5678']),
    )
  })

  it('Pro では PDF をサーバー抽出に送り、長く取れたテキストを使う', async () => {
    parseFile.mockResolvedValue(sparsePdf())

    const r = await processFileEntry(file, {}, proSettings, { isLite: false })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pdf/extract',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(r.fullText).toBe(RESUME.repeat(3))
    expect(r.sparsePageCount).toBe(0)
    expect(detectWithAI).toHaveBeenCalledTimes(1)
  })

  it('Pro でも AI 検出を切っていれば AI を呼ばない', async () => {
    parseFile.mockResolvedValue({ text: RESUME, format: 'Text (utf-8)', pageCount: null })
    await processFileEntry(file, {}, { ...proSettings, aiDetect: false }, { isLite: false })
    expect(detectWithAI).not.toHaveBeenCalled()
    expect(aiCleanupText).not.toHaveBeenCalled()
  })

  it('AI の検出結果をルールベースの結果に重複なくマージする', async () => {
    parseFile.mockResolvedValue({ text: RESUME, format: 'Text (utf-8)', pageCount: null })
    detectWithAI.mockResolvedValue({
      detections: [
        {
          id: 'ai_1',
          type: 'name_ai',
          label: '氏名',
          category: 'name',
          value: '山田 太郎',
          source: 'ai',
          confidence: 0.9,
          enabled: true,
        },
        {
          id: 'ai_2',
          type: 'email',
          label: 'メール',
          category: 'contact',
          value: 'taro@example.com',
          source: 'ai',
          confidence: 0.9,
          enabled: true,
        },
      ],
    })

    const r = await processFileEntry(file, { contact: false }, proSettings, { isLite: false })

    const emails = r.detections.filter((d) => d.value === 'taro@example.com')
    expect(emails).toHaveLength(1)
    // マスク設定で contact を切ったので無効、それ以外は有効
    expect(emails[0].enabled).toBe(false)
    expect(r.stats.total).toBe(r.detections.length)
  })

  it('開始前に中断されていれば AbortError を投げる', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(
      processFileEntry(file, {}, proSettings, { signal: ac.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(parseFile).not.toHaveBeenCalled()
  })
})
