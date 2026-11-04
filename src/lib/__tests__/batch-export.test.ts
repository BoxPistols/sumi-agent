import { describe, it, expect } from 'vitest'
import type { AnalysisResult, BatchFileEntry } from '../app-types'
import { buildBatchSummaryCsv, buildBatchZip } from '../batch-export'

function result(name: string, text: string): AnalysisResult {
  return {
    file_name: name,
    file_format: 'Text (utf-8)',
    page_count: null,
    text_preview: text,
    fullText: text,
    rawText: text,
    sparsePageCount: 0,
    detections: [
      {
        id: 'd1',
        type: 'email',
        label: 'メール',
        category: 'contact',
        value: 'taro@example.com',
        source: 'regex',
        confidence: 0.95,
        enabled: true,
      },
      {
        id: 'd2',
        type: 'phone',
        label: '電話',
        category: 'contact',
        value: '090-0234-5678',
        source: 'regex',
        confidence: 0.9,
        enabled: false,
      },
    ],
    stats: { total: 2, regex: 2, dict: 0, ai: 0, heuristic: 0 },
    fileSize: '1.0 KB',
    isDemo: false,
    analysis_ms: 12,
    maskOpts: { keepPrefecture: false, nameInitial: false },
  }
}

function entry(
  id: string,
  status: BatchFileEntry['status'],
  data: AnalysisResult | null,
): BatchFileEntry {
  return {
    id,
    file: new File(['x'], `${id}.txt`),
    fileName: `${id}.txt`,
    status,
    stage: '',
    progress: 0,
    data,
    error: null,
    abortController: new AbortController(),
  }
}

const TEXT = 'メール：taro@example.com\n電話：090-0234-5678'

describe('buildBatchSummaryCsv', () => {
  it('完了したファイルだけを BOM 付き CSV に並べ、マスク数は有効な検出だけ数える', () => {
    const csv = buildBatchSummaryCsv([
      entry('a', 'done', result('a.txt', TEXT)),
      entry('b', 'error', null),
    ])
    expect(csv).toBe(
      '\uFEFFファイル名,形式,検出数,マスク数,処理時間(ms)\na.txt,Text (utf-8),2,1,12',
    )
  })
})

describe('buildBatchZip', () => {
  it('ファイルごとにマスク済みテキストと HTML を入れ、無効にした検出は残す', async () => {
    const zip = await buildBatchZip([
      entry('a', 'done', result('resume.pdf', TEXT)),
      entry('b', 'processing', null),
    ])
    expect(Object.keys(zip.files).sort()).toEqual([
      'batch_summary.csv',
      'resume_redacted.html',
      'resume_redacted.txt',
    ])
    const txt = await zip.file('resume_redacted.txt')!.async('string')
    expect(txt).not.toContain('taro@example.com')
    expect(txt).toContain('090-0234-5678')
  })
})
