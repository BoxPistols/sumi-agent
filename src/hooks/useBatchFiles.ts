import { useCallback, useState } from 'react'
import type { AppSettings, BatchFileEntry } from '@/lib/app-types'
import { buildBatchZip } from '@/lib/batch-export'
import { fileTimestamp } from '@/lib/export'
import { processFileEntry } from '@/lib/process-file-entry'
import type { MaskConfig } from '@/lib/ui-config'

/**
 * 複数ファイル取り込み（Pro）の状態と処理
 *
 * ファイルは 1 つずつ順番に解析する（AI の共用キーのレート制限に当たらないよう間隔も空ける）。
 * 各ファイルは AbortController を持ち、タブを閉じたりトップへ戻ったりしたら止める。
 */
export function useBatchFiles(settings: AppSettings, isLite: boolean) {
  const [batchFiles, setBatchFiles] = useState<BatchFileEntry[]>([])
  const [activeFileIdx, setActiveFileIdx] = useState(0)

  const patch = useCallback((id: string, updates: Partial<BatchFileEntry>) => {
    setBatchFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }, [])

  const handleBatchSubmit = useCallback(
    async (fileList: File[], maskConfig: MaskConfig, batchCustomKeywords: string[]) => {
      const entries: BatchFileEntry[] = fileList.map((file, i) => ({
        id: `bf_${Date.now()}_${i}`,
        file,
        fileName: file.name,
        status: 'queued',
        progress: 0,
        stage: '',
        error: null,
        data: null,
        abortController: new AbortController(),
      }))
      setBatchFiles(entries)
      setActiveFileIdx(0)
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        if (entry.abortController.signal.aborted) continue
        patch(entry.id, { status: 'processing', progress: 0 })
        // 最初に処理を始めたファイルを自動で選ぶ
        setActiveFileIdx((prev) => {
          const currentActive = entries[prev]
          if (!currentActive || currentActive.status === 'queued') return i
          return prev
        })
        try {
          const result = await processFileEntry(
            entry.file,
            maskConfig,
            settings,
            {
              onProgress: (pct) => patch(entry.id, { progress: pct }),
              onStage: (stage) => patch(entry.id, { stage }),
              signal: entry.abortController.signal,
              isLite,
            },
            batchCustomKeywords,
          )
          patch(entry.id, { status: 'done', data: result, progress: 100 })
          // 最初に解析が終わったファイルを自動で選ぶ
          setActiveFileIdx((prev) => {
            if (entries[prev]?.status !== 'done' && entries[prev]?.id !== entry.id) return i
            return prev
          })
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            patch(entry.id, { status: 'cancelled' })
          } else {
            patch(entry.id, {
              status: 'error',
              error: e instanceof Error ? e.message : undefined,
            })
          }
        }
        // Rate limit delay between files
        if (i < entries.length - 1 && settings?.aiDetect !== false)
          await new Promise((r) => setTimeout(r, 500))
      }
    },
    [settings, isLite, patch],
  )

  const handleBatchExport = useCallback(async () => {
    const zip = await buildBatchZip(batchFiles)
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `redacted_batch_${fileTimestamp()}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }, [batchFiles])

  return {
    batchFiles,
    setBatchFiles,
    activeFileIdx,
    setActiveFileIdx,
    handleBatchSubmit,
    handleBatchExport,
  }
}
