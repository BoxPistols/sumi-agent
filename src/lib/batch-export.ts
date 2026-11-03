/**
 * 複数ファイル取り込み（Pro）の一括書き出し
 *
 * 解析が終わったファイルごとにマスク済みテキスト（.txt）と印刷用 HTML（.html）を入れ、
 * 一覧を batch_summary.csv にまとめた ZIP を作る。
 */
import type JSZip from 'jszip'
import type { BatchFileEntry } from '@/lib/app-types'
import { applyRedaction } from '@/lib/redact-engine'
import { generatePDFHTML } from '@/lib/resume-html'

type DoneEntry = BatchFileEntry & { data: NonNullable<BatchFileEntry['data']> }

function isDone(f: BatchFileEntry): f is DoneEntry {
  return f.status === 'done' && !!f.data
}

/** Excel で文字化けしないよう BOM 付きにする */
export function buildBatchSummaryCsv(files: BatchFileEntry[]): string {
  const header = 'ファイル名,形式,検出数,マスク数,処理時間(ms)\n'
  const rows = files
    .filter(isDone)
    .map((f) => {
      const d = f.data
      return `${d.file_name},${d.file_format},${d.stats.total},${d.detections.filter((x) => x.enabled).length},${d.analysis_ms}`
    })
    .join('\n')
  return '\uFEFF' + header + rows
}

export async function buildBatchZip(files: BatchFileEntry[]): Promise<JSZip> {
  const JSZipCtor = (await import('jszip')).default
  const zip = new JSZipCtor()
  for (const f of files) {
    if (!isDone(f)) continue
    const redacted = applyRedaction(
      f.data.fullText || f.data.text_preview,
      f.data.detections.filter((d) => d.enabled),
      f.data.maskOpts,
    )
    const base = f.data.file_name.replace(/\.[^.]+$/, '') + `_redacted`
    zip.file(`${base}.txt`, redacted)
    zip.file(`${base}.html`, generatePDFHTML(redacted, 'gothic'))
  }
  zip.file('batch_summary.csv', buildBatchSummaryCsv(files))
  return zip
}
