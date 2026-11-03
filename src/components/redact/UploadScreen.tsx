'use client'

/**
 * 取り込み画面（ファイル / URL / テキスト貼り付け / サンプル）
 *
 * 取り込んだテキストを「サーバー PDF 抽出 → AI OCR → AI 整形 → 正規表現・辞書検出 → AI 検出 → マスク設定の反映」
 * の順に処理し、解析結果（AnalysisResult）を onAnalyze で親へ渡す。
 * Lite は AI もサーバー抽出も使わず、ブラウザ内だけで完結させる。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import s from '@/app/redact-pro.module.css'
import { DropZone } from '@/components/upload/DropZone'
import { SampleCard, type SampleItem } from '@/components/upload/SampleCard'
import { Badge, Toggle } from '@/components/redact/ui'
import { errorMessage } from '@/lib/ai/error-message'
import { getModelsForRun } from '@/lib/ai/models'
import { aiCleanupText, detectWithAI, mergeOcrResults, ocrSparsePages } from '@/lib/ai/tasks'
import type { AnalysisResult, AppSettings } from '@/lib/app-types'
import { arrayBufferToBase64 } from '@/lib/export'
import { FLOW_EVENT_ANALYZING } from '@/lib/flow-steps'
import { formatDuration } from '@/lib/format'
import { parseFile } from '@/lib/parsers'
import type { XlSheetMeta } from '@/lib/parsers/types'
import { shouldUseServerPdfExtraction } from '@/lib/pdf-server-extract'
import { detectAll, mergeDetections } from '@/lib/redact-engine'
import { SAMPLES, type SampleDocument } from '@/lib/samples'
import { storage } from '@/lib/storage'
import { C, T } from '@/lib/theme'
import {
  CATEGORIES,
  DEFAULT_MASK,
  MASK_PRESETS,
  type CategoryId,
  type CategoryMeta,
  type MaskConfig,
} from '@/lib/ui-config'
import { extractTextFromHTML, scrapeURL } from '@/lib/url-import'

// ═══ Upload Screen ═══
// 「サンプルで試す」の一覧。Lite は先頭1件のみ表示
const SAMPLE_ITEMS: SampleItem[] = [
  {
    type: 'pdf',
    label: '経歴書サンプル（PDF）',
    desc: '2ページ・氏名や連絡先を含む',
    color: C.red,
  },
  { type: 'xlsx', label: '社員一覧サンプル（Excel）', desc: '5名分の名簿', color: C.green },
  { type: 'csv', label: '応募者リスト（CSV）', desc: '応募者の一覧表', color: C.amber },
  { type: 'text', label: '詳細経歴書（テキスト）', desc: '3社分の職務経歴', color: C.purple },
]

type InputMode = 'file' | 'url' | 'paste'

const INPUT_TABS: { id: InputMode; label: string }[] = [
  { id: 'file', label: 'ファイル' },
  { id: 'url', label: 'URLから取り込む' },
  { id: 'paste', label: 'テキストを貼り付け' },
]

/** /api/pdf/extract の応答（使う項目のみ） */
interface ServerPdfExtractResponse {
  text?: string
  pageCount?: number
}

/**
 * 検出カテゴリ（任意の文字列）でマスク設定を引く。
 * custom のように初期値に無いカテゴリは undefined になり、呼び出し側は `!== false` で「マスクする」とみなす
 */
function maskFlag(mask: MaskConfig, key: string): boolean | undefined {
  return (mask as Record<string, boolean | undefined>)[key]
}

export interface UploadScreenProps {
  onAnalyze: (result: AnalysisResult) => void
  /** Pro で複数ファイルが選ばれたときの一括処理 */
  onSubmitBatch: (files: File[], mask: MaskConfig, customKeywords: string[]) => void
  settings: AppSettings
  isLite: boolean
  onSwitchPro: () => void
  onShowVideo?: () => void
}

export function UploadScreen({
  onAnalyze,
  onSubmitBatch,
  settings,
  isLite,
  onSwitchPro,
  onShowVideo,
}: UploadScreenProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [stage, setStage] = useState(0)
  const [mask, setMask] = useState<MaskConfig>({ ...DEFAULT_MASK })
  const [customKeywords, setCustomKeywords] = useState<string[]>([])
  const [customInput, setCustomInput] = useState('')
  const kwLoadedRef = useRef(false)
  const [aiStatus, setAiStatus] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const startAtRef = useRef(0)
  const [showUrlHelp, setShowUrlHelp] = useState(false)
  const urlHelpTriggerRef = useRef<HTMLButtonElement>(null)
  const urlHelpCloseRef = useRef<HTMLButtonElement>(null)
  const activePreset = MASK_PRESETS.findIndex((p) =>
    Object.entries(p.mask).every(([k, v]) => maskFlag(mask, k) === v),
  )
  // Lite版はAIを使わない（ブラウザ内完結）。AI検出はPro版で有効化した場合のみ
  const aiOn = !isLite && settings?.aiDetect !== false
  const STAGES = [
    'ファイル読み込み',
    'テキスト抽出',
    aiOn ? 'AI OCR (画像ページ)' : '--',
    aiOn ? 'AI テキスト再構成' : '--',
    '正規表現マッチ',
    '日本人名辞書照合',
    aiOn ? 'AI PII検出' : '--',
    '完了',
  ]
  const lc = [null, T.green, T.amber, T.red]
  const closeUrlHelp = useCallback(() => {
    setShowUrlHelp(false)
    setTimeout(() => {
      if (urlHelpTriggerRef.current) urlHelpTriggerRef.current.focus()
    }, 0)
  }, [])
  useEffect(() => {
    if (!showUrlHelp) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeUrlHelp()
    }
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => {
      if (urlHelpCloseRef.current) urlHelpCloseRef.current.focus()
    }, 0)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [showUrlHelp, closeUrlHelp])

  useEffect(() => {
    if (!loading) return
    const id = setInterval(() => {
      if (!startAtRef.current) return
      setElapsedMs(Date.now() - startAtRef.current)
    }, 250)
    return () => clearInterval(id)
  }, [loading])

  // 解析中状態をステップフローバーへ通知
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(FLOW_EVENT_ANALYZING, { detail: { active: loading } }))
    return () => {
      window.dispatchEvent(new CustomEvent(FLOW_EVENT_ANALYZING, { detail: { active: false } }))
    }
  }, [loading])

  useEffect(() => {
    ;(async () => {
      try {
        const v = await storage.get('rp_custom_keywords')
        if (v) {
          const parsed: unknown = JSON.parse(v)
          if (Array.isArray(parsed)) setCustomKeywords(parsed as string[])
        }
      } catch {
        // 保存値が壊れていても、カスタムキーワード無しで始めればよい
      } finally {
        kwLoadedRef.current = true
      }
    })()
  }, [])
  useEffect(() => {
    if (kwLoadedRef.current) storage.set('rp_custom_keywords', JSON.stringify(customKeywords))
  }, [customKeywords])

  const processText = useCallback(
    async (
      text: string,
      name: string,
      format: string,
      pageCount: number | null,
      fileSize: string,
      rawText?: string,
      sparsePages?: number[],
      pdfData?: ArrayBuffer,
      xlMeta?: XlSheetMeta[],
    ) => {
      let workText = text
      let originalRaw = rawText || text
      const runModels = aiOn ? getModelsForRun(settings) : null

      // サーバーサイド pdftotext フォールバック（pdf.js CIDフォント問題対策）。
      // PDF全体を /api/pdf/extract に送るため、ブラウザ内完結を約束する Lite では使わない（Pro のみ）
      if (
        shouldUseServerPdfExtraction({
          isLite,
          format,
          hasPdfData: !!pdfData,
          sparsePageCount: sparsePages?.length || 0,
          pageCount: pageCount || 0,
        })
      ) {
        try {
          setAiStatus('サーバー側PDF抽出中（pdftotext）...')
          // hasPdfData を判定済みなので pdfData は必ずある
          const pdfB64 = arrayBufferToBase64(pdfData as ArrayBuffer)
          const res = await fetch('/api/pdf/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdfBase64: pdfB64 }),
          })
          if (res.ok) {
            const { text: serverText, pageCount: serverPages } =
              (await res.json()) as ServerPdfExtractResponse
            if (serverText && serverText.length > workText.length * 1.5) {
              workText = serverText
              originalRaw = serverText
              sparsePages = []
              if (serverPages) pageCount = serverPages
              setAiStatus(`pdftotext: ${serverPages || '?'}ページ抽出完了`)
            } else {
              setAiStatus('pdftotext: pdf.jsと同等（フォールバック不要）')
            }
          }
        } catch (e) {
          console.warn('pdftotext fallback failed:', e)
        }
      }
      // OCR fallback for image-heavy PDF pages
      if (aiOn && format === 'PDF' && sparsePages && sparsePages.length > 0) {
        setStage(2)
        setAiStatus(`OCR対象: ${sparsePages.length}/${pageCount || '?'}ページ (テキスト未検出)`)
        await new Promise((r) => setTimeout(r, 300))
        try {
          const ocrResults = await ocrSparsePages(
            pdfData,
            sparsePages,
            settings?.apiKey,
            runModels?.formatModel || settings?.model,
            (msg) => setAiStatus(msg),
          )
          const ocrCount = Object.keys(ocrResults).length
          if (ocrCount > 0) {
            originalRaw = workText
            workText = mergeOcrResults(workText, ocrResults)
            setAiStatus(`OCR完了: ${ocrCount}ページからテキスト復元`)
          } else {
            setAiStatus(`OCR: テキスト復元なし（${sparsePages.length}ページが画像のみ）`)
          }
        } catch (e) {
          setAiStatus(`OCRエラー: ${errorMessage(e) || '不明'}`)
          console.error('OCR failed:', e)
        }
      }

      // AI text cleanup for PDFs (garbled table/layout extraction)
      if (aiOn && format === 'PDF') {
        setStage(3)
        setAiStatus('AIテキスト再構成中...')
        try {
          const cleaned = await aiCleanupText(
            workText,
            settings?.apiKey,
            runModels?.formatModel || settings?.model,
            (msg) => setAiStatus(msg),
            runModels?.formatFallbackModel,
          )
          // Validate: AI result must retain substantial content
          const origNonEmpty = workText.split('\n').filter((l) => l.trim().length > 0).length
          const cleanNonEmpty = cleaned
            ? cleaned.split('\n').filter((l) => l.trim().length > 0).length
            : 0
          if (
            cleaned &&
            cleanNonEmpty >= origNonEmpty * 0.5 &&
            cleaned.length > workText.length * 0.4
          ) {
            if (!originalRaw || originalRaw === workText) originalRaw = workText
            workText = cleaned
            setAiStatus(`AI再構成完了（${cleanNonEmpty}行）`)
          } else {
            setAiStatus('AI再構成スキップ（情報損失の恐れ）')
          }
        } catch {
          // 整形は任意の工程。失敗しても抽出テキストのまま検出へ進める
          setAiStatus('AI再構成スキップ')
        }
      }

      setStage(aiOn ? 4 : 2)
      await new Promise((r) => setTimeout(r, 80))
      setStage(aiOn ? 5 : 3)
      const dets = detectAll(workText, customKeywords)

      // AI PII detection step
      let allDets = dets
      if (aiOn) {
        setStage(6)
        setAiStatus(`AI PII検出中... (${runModels?.detectModel || settings?.model})`)
        try {
          const aiRes = await detectWithAI(
            workText,
            settings?.apiKey,
            runModels?.detectModel || settings?.model,
            runModels?.detectFallbackModel,
            (msg) => setAiStatus(msg),
          )
          const aiDets = aiRes?.detections || []
          if (aiDets.length > 0) {
            allDets = mergeDetections(dets, aiDets)
            setAiStatus(
              `AI: ${aiDets.length}件追加検出${aiRes?.fallbackUsed ? `（再試行:${aiRes.usedModel}）` : ''}`,
            )
          } else if (aiRes?.error) {
            // aiOn のときは runModels が必ずある
            setAiStatus(`AI検出スキップ（${aiRes.usedModel || runModels?.detectModel}）`)
          } else {
            setAiStatus(
              `AI: 追加検出なし${aiRes?.fallbackUsed ? `（再試行:${aiRes.usedModel}）` : ''}`,
            )
          }
        } catch {
          // AI 検出は正規表現・辞書検出の上乗せ。失敗してもそれまでの検出結果で続ける
          setAiStatus('AI検出スキップ')
        }
      }

      const wm = allDets.map((d) => ({ ...d, enabled: maskFlag(mask, d.category) !== false }))
      await new Promise((r) => setTimeout(r, 200))
      setStage(aiOn ? 7 : 4)
      setTimeout(() => {
        const analysisMs = startAtRef.current ? Date.now() - startAtRef.current : 0
        onAnalyze({
          file_name: name,
          file_format: format,
          page_count: pageCount,
          text_preview: workText.slice(0, 8000),
          fullText: workText,
          rawText: originalRaw,
          sparsePageCount: sparsePages?.length || 0,
          detections: wm,
          stats: {
            total: wm.length,
            regex: wm.filter((d) => d.source === 'regex').length,
            dict: wm.filter((d) => d.source === 'dict').length,
            ai: wm.filter((d) => d.source === 'ai').length,
            heuristic: wm.filter((d) => d.source === 'heuristic').length,
          },
          fileSize,
          isDemo: fileSize === 'DEMO',
          analysis_ms: analysisMs,
          maskOpts: { keepPrefecture: !!mask.keepPrefecture, nameInitial: !!mask.nameInitial },
          xlMeta: xlMeta || null,
        })
      }, 200)
    },
    [onAnalyze, mask, settings, aiOn, customKeywords, isLite],
  )

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      startAtRef.current = Date.now()
      setElapsedMs(0)
      setAiStatus('')
      setLoading(true)
      setError(null)
      setFileName(file.name)
      setStage(0)
      try {
        setStage(1)
        const p = await parseFile(file, (msg) => setAiStatus(msg))
        await processText(
          p.text,
          file.name,
          p.format,
          p.pageCount,
          `${(file.size / 1024).toFixed(1)} KB`,
          p.text,
          p.sparsePages,
          p.pdfData,
          p.xlMeta,
        )
      } catch (e) {
        setError(errorMessage(e) ?? null)
        setLoading(false)
      }
    },
    [processText],
  )
  const handleDemo = useCallback(
    async (type: string) => {
      const s: SampleDocument | undefined = (SAMPLES as Partial<Record<string, SampleDocument>>)[
        type
      ]
      if (!s) return
      startAtRef.current = Date.now()
      setElapsedMs(0)
      setAiStatus('')
      setError(null)
      setLoading(true)
      setFileName(s.name)
      setStage(0)
      setTimeout(async () => {
        setStage(1)
        setTimeout(async () => {
          await processText(s.text, s.name, s.format, s.pageCount, 'DEMO')
        }, 80)
      }, 80)
    },
    [processText],
  )
  const [inputMode, setInputMode] = useState<InputMode>('file')
  const [urlValue, setUrlValue] = useState('')
  const [pasteValue, setPasteValue] = useState('')
  const [urlFetching, setUrlFetching] = useState(false)
  const handleURL = useCallback(
    async () => {
      const url = urlValue.trim()
      if (!url) return
      startAtRef.current = Date.now()
      setElapsedMs(0)
      setAiStatus('')
      setUrlFetching(true)
      setLoading(true)
      setError(null)
      setFileName(url)
      setStage(0)
      try {
        setStage(1)
        setAiStatus('URL取得中...')
        const result = await scrapeURL(url, (msg) => setAiStatus(msg), settings?.proxyUrl)
        setFileName(result.fileName)
        const size = `${(new Blob([result.text]).size / 1024).toFixed(1)} KB`
        await processText(
          result.text,
          result.fileName,
          result.format,
          result.pageCount,
          size,
          result.text,
        )
      } catch (e) {
        setError(errorMessage(e) ?? null)
        setLoading(false)
      }
      setUrlFetching(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settings は processText の依存に含まれ、変わると processText ごと作り直されるので古い proxyUrl は使われない
    [urlValue, processText],
  )
  const handlePaste = useCallback(async () => {
    const raw = pasteValue.trim()
    if (!raw) return
    startAtRef.current = Date.now()
    setElapsedMs(0)
    setAiStatus('')
    setLoading(true)
    setError(null)
    setStage(0)
    try {
      setStage(1)
      // Detect if input is HTML or plain text
      const isHTML = /<[a-z][\s\S]*>/i.test(raw)
      let text: string
      let format: string
      if (isHTML) {
        text = extractTextFromHTML(raw)
        format = 'HTML (ペースト)'
      } else {
        text = raw
        format = 'テキスト (ペースト)'
      }
      setFileName(`pasted_${Date.now()}.txt`)
      const size = `${(new Blob([text]).size / 1024).toFixed(1)} KB`
      await processText(text, `pasted_content.${isHTML ? 'html' : 'txt'}`, format, null, size, text)
    } catch (e) {
      setError(errorMessage(e) ?? null)
      setLoading(false)
    }
  }, [pasteValue, processText])
  const toggleCat = (cat: CategoryId) => setMask((p) => ({ ...p, [cat]: !p[cat] }))

  const visibleStages = STAGES.filter((s) => s !== '--')
  const lastStageIndex = Math.max(0, visibleStages.length - 1)
  const stageIdx = Math.min(Math.max(stage, 0), lastStageIndex)
  const pctMatch = aiStatus?.match(/(\d{1,3})\s*%/)
  const subPct = pctMatch ? Math.min(100, Math.max(0, parseInt(pctMatch[1], 10))) : null
  const progressPct =
    lastStageIndex === 0
      ? 100
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(((stageIdx + (subPct != null ? subPct / 100 : 0)) / lastStageIndex) * 100),
          ),
        )

  if (loading)
    return (
      <div className={s['up-loading']}>
        <div className={s['up-loading-inner']}>
          <div className={s['up-spinner']} />
          <h2 className={s['up-loading-name']}>{fileName}</h2>
          <p className={s['up-loading-sub']}>解析中...</p>
          <div className={s['up-progress-wrap']}>
            <div className={s['up-progress-header']}>
              <span className={s['up-progress-label']}>
                進捗（{Math.min(stageIdx + 1, visibleStages.length)}/{visibleStages.length}）
              </span>
              <span className={s['up-progress-pct']}>{progressPct}%</span>
            </div>
            <div className={s['up-progress-bar-bg']}>
              <div className={s['up-progress-bar-fill']} style={{ width: `${progressPct}%` }} />
            </div>
            <div className={s['up-progress-stage']}>
              現在: {visibleStages[stageIdx] || '処理中'}
              {subPct != null ? `（${subPct}%）` : ''}
            </div>
            <div className={s['up-progress-elapsed']}>経過: {formatDuration(elapsedMs)}</div>
          </div>
          {aiStatus && <div className={s['up-ai-status']}>{aiStatus}</div>}
          <div className={s['up-stages-list']}>
            {visibleStages.map((st, i) => (
              <div
                key={i}
                className={s['up-stage-item']}
                style={{
                  color: i < stage ? T.green : i === stage ? T.accent : T.text3,
                }}
              >
                <div
                  className={s['up-stage-dot']}
                  style={{
                    background: i < stage ? T.greenDim : i === stage ? T.accentDim : 'transparent',
                    border: `1.5px solid ${i < stage ? T.green : i === stage ? T.accent : T.text3}`,
                  }}
                >
                  {i < stage ? '\u2713' : i === stage ? '\u2022' : '\u25CB'}
                </div>
                <span
                  style={{
                    fontWeight: i === stage ? 600 : 400,
                  }}
                >
                  {st}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )

  return (
    <div className={s['up-root']}>
      <div
        className={s['up-hero']}
        style={{
          maxWidth: isLite ? 820 : 1200,
          margin: isLite ? '0 auto 20px' : '0 auto 16px',
        }}
      >
        <div className={s['up-logo']}>
          <div className={s['up-logo-icon']}>
            <div className={s['up-logo-bar1']} />
            <div className={s['up-logo-bar2']} />
          </div>
          <span className={s['up-logo-text']}>Sumi</span>
        </div>
        <h1 className={s['up-title']} style={{ fontSize: isLite ? 24 : 22 }}>
          {isLite ? (
            <>
              経歴書の個人情報を<span className={s['up-title-accent']}>自動マスキング</span>
            </>
          ) : (
            <>
              経歴書の<span className={s['up-title-accent']}>検出・マスキング・改善</span>を一括で
            </>
          )}
        </h1>
        <p className={s['up-subtitle']}>
          {isLite
            ? 'ファイルをアップロードするだけで個人情報を自動検出・マスキング'
            : '個人情報の自動検出 + AIアドバイザーで経歴書の壁打ち・ブラッシュアップまで'}
        </p>
        {/* セキュリティ根拠バッジ（文言は実装と一致させる: LiteはAI不使用） */}
        <div className={s['up-badges']}>
          {[
            {
              text: 'ブラウザ内で処理',
              tip: 'ファイルの読み取りと個人情報の検出はブラウザ内で行います。Lite版はサーバーに一切送信しません。Pro版ではAI機能と、文字を取り出しにくいPDFのサーバー抽出を使うときだけ送信します',
            },
            {
              text: 'サーバー保存なし',
              tip: 'データベースには保存しません。処理結果はブラウザのメモリ上にだけ存在し、タブを閉じると消えます。Pro版のサーバー抽出で使う一時ファイルも処理後に削除されます',
            },
            {
              text: 'AIは任意（Pro版）',
              tip: 'AI検出・AI整形はPro版で有効にした場合のみ動作します。Lite版はAIを使いません',
            },
            {
              text: 'AI学習に不使用',
              tip: 'AI利用時のみテキストをAPIに送信しますが、各社の規約によりモデルの学習には使われません',
            },
          ].map((b, i) => (
            <span key={i} title={b.tip} className={s['up-trust-badge']}>
              <span className={s['up-trust-badge-icon']} aria-hidden="true">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              {b.text}
            </span>
          ))}
        </div>
        {onShowVideo && (
          <button
            type="button"
            onClick={onShowVideo}
            aria-label="紹介動画（25秒）"
            className={s['up-video-btn']}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            紹介動画（25秒）
          </button>
        )}
      </div>
      <div className={isLite ? s['up-main-lite'] : s['up-main-pro']}>
        <div className={s['up-card']}>
          <div className={s['up-card-title']}>
            マスクする項目{' '}
            <span className={s['up-card-title-sub']}>
              迷ったら「標準」のままでOK。あとから確認画面でも個別に変えられます
            </span>
          </div>
          <div
            data-intro="mask-presets"
            className={s['up-presets']}
            role="group"
            aria-label="マスクの強さ"
          >
            {MASK_PRESETS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={activePreset === i}
                onClick={() => setMask({ ...p.mask })}
                className={s['up-preset-btn']}
                style={{
                  border: `1.5px solid ${activePreset === i ? T.accent : T.border}`,
                  background: activePreset === i ? T.accentDim : 'transparent',
                }}
              >
                <div
                  className={s['up-preset-name']}
                  style={{
                    color: activePreset === i ? T.accent : T.text,
                  }}
                >
                  <span
                    className={s['up-preset-dot']}
                    style={{ background: lc[p.level] ?? undefined }}
                  />
                  {p.label}
                  {activePreset === i && (
                    <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: 12 }}>
                      ✓
                    </span>
                  )}
                </div>
                <div className={s['up-preset-desc']}>{p.desc}</div>
              </button>
            ))}
          </div>
          {!isLite && (
            <div data-intro="category-toggles" className={s['up-cat-grid']}>
              {(Object.entries(CATEGORIES) as [CategoryId, CategoryMeta][])
                .filter(([k]) => k !== 'photo')
                .map(([key, meta]) => (
                  <div
                    key={key}
                    className={s['up-cat-row']}
                    style={{
                      background: mask[key] ? `${meta.color}08` : 'transparent',
                      border: `1px solid ${mask[key] ? `${meta.color}20` : 'transparent'}`,
                    }}
                  >
                    <span
                      className={s['up-cat-label']}
                      style={{ color: mask[key] ? T.text : T.text3 }}
                    >
                      {meta.label}
                    </span>
                    <Toggle
                      // custom は初期マスク設定に無く undefined のまま渡る（元の挙動を維持）
                      checked={mask[key] as boolean}
                      onChange={() => toggleCat(key)}
                      size="sm"
                    />
                  </div>
                ))}
            </div>
          )}
          {/* Advanced options */}
          {!isLite && (
            <div data-intro="detail-options" className={s['up-detail-section']}>
              <div className={s['up-detail-title']}>詳細オプション</div>
              <div className={s['up-detail-col']}>
                <div className={s['up-detail-row']}>
                  <div>
                    <div
                      className={s['up-detail-name']}
                      style={{
                        color: mask.address ? T.text : T.text3,
                      }}
                    >
                      都道府県を残す
                    </div>
                    <div className={s['up-detail-desc']}>住所マスク時に在住エリアだけ公開</div>
                  </div>
                  <Toggle
                    checked={mask.keepPrefecture as boolean}
                    onChange={() =>
                      setMask((p) => ({
                        ...p,
                        keepPrefecture: !p.keepPrefecture,
                      }))
                    }
                    size="sm"
                    disabled={!mask.address}
                  />
                </div>
                <div className={s['up-detail-row']}>
                  <div>
                    <div
                      className={s['up-detail-name']}
                      style={{ color: mask.name ? T.text : T.text3 }}
                    >
                      氏名イニシャル化
                    </div>
                    <div className={s['up-detail-desc']}>田中太郎 → T.T.（フリガナから変換）</div>
                  </div>
                  <Toggle
                    checked={mask.nameInitial as boolean}
                    onChange={() =>
                      setMask((p) => ({
                        ...p,
                        nameInitial: !p.nameInitial,
                      }))
                    }
                    size="sm"
                    disabled={!mask.name}
                  />
                </div>
              </div>
            </div>
          )}
          {/* カスタムキーワード */}
          {!isLite && (
            <div data-intro="custom-keywords" className={s['up-kw-section']}>
              <div className={s['up-kw-title']}>カスタムキーワード</div>
              <div className={s['up-kw-desc']}>任意の文字列を指定してマスキング対象に追加</div>
              <div className={s['up-kw-input-row']}>
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customInput.trim()) {
                      e.preventDefault()
                      const kw = customInput.trim()
                      if (!customKeywords.includes(kw)) {
                        setCustomKeywords((p) => [...p, kw])
                      }
                      setCustomInput('')
                    }
                  }}
                  placeholder="マスクしたい文字列を入力"
                  aria-label="カスタムキーワード入力"
                  className={s['up-kw-input']}
                />
                <button
                  type="button"
                  onClick={() => {
                    const kw = customInput.trim()
                    if (kw && !customKeywords.includes(kw)) {
                      setCustomKeywords((p) => [...p, kw])
                    }
                    setCustomInput('')
                  }}
                  disabled={!customInput.trim()}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: 'none',
                    background: customInput.trim() ? CATEGORIES.custom.color : 'transparent',
                    color: customInput.trim() ? '#fff' : T.text3,
                    cursor: customInput.trim() ? 'pointer' : 'default',
                    transition: 'all .2s',
                  }}
                >
                  追加
                </button>
              </div>
              {customKeywords.length > 0 && (
                <div className={s['up-kw-tags']}>
                  {customKeywords.map((kw, i) => (
                    <span
                      key={i}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        fontSize: 11,
                        borderRadius: 12,
                        background: CATEGORIES.custom.bg,
                        color: CATEGORIES.custom.color,
                        border: `1px solid ${CATEGORIES.custom.color}20`,
                      }}
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={() => setCustomKeywords((p) => p.filter((_, j) => j !== i))}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: CATEGORIES.custom.color,
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 13,
                          lineHeight: 1,
                        }}
                        aria-label={`${kw}を削除`}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomKeywords([])}
                    style={{
                      fontSize: 11,
                      color: T.text3,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '3px 6px',
                    }}
                  >
                    全削除
                  </button>
                </div>
              )}
            </div>
          )}
          {!isLite && (
            <div className={s['up-badge-wrap']}>
              {Object.entries(mask)
                .filter(([, v]) => v)
                .map(([k]) => {
                  // keepPrefecture / nameInitial はカテゴリではないので m が無く、表示しない
                  const m = (CATEGORIES as Partial<Record<string, CategoryMeta>>)[k]
                  return m ? (
                    <Badge key={k} color={m.color} bg={m.bg}>
                      {m.label}
                    </Badge>
                  ) : null
                })}
              {mask.keepPrefecture && mask.address && (
                <Badge color={CATEGORIES.address.color} bg={CATEGORIES.address.bg}>
                  都道府県残す
                </Badge>
              )}
              {mask.nameInitial && mask.name && (
                <Badge color={CATEGORIES.name.color} bg={CATEGORIES.name.bg}>
                  イニシャル化
                </Badge>
              )}
            </div>
          )}
        </div>
        {/* Lite: Pro版への誘導は設定カードの外に控えめに置く（設定項目と混同させない） */}
        {isLite && (
          <div data-intro="edition-toggle" className={s['up-pro-hint']}>
            <span>AI検出・URLからの取り込み・複数ファイルの一括処理が必要なら</span>
            <button
              type="button"
              onClick={() => {
                if (onSwitchPro) onSwitchPro()
              }}
              className={s['up-pro-link']}
              aria-label="Pro版に切り替える"
            >
              Pro版に切り替える &rarr;
            </button>
          </div>
        )}
        {/* Right Column: Input + Samples */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, order: isLite ? -1 : 0 }}>
          <div>
            {!isLite && (
              <div
                data-intro="input-tabs"
                role="tablist"
                aria-label="取り込み方法"
                className={`rp-input-tabs ${s['up-input-tabs']}`}
              >
                {INPUT_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={inputMode === tab.id}
                    onClick={() => setInputMode(tab.id)}
                    className={s['up-input-tab']}
                    data-active={inputMode === tab.id}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
            <div
              className={isLite ? undefined : s['up-input-body']}
              role={isLite ? undefined : 'tabpanel'}
              data-top={isLite ? 'none' : 'file'}
              style={isLite ? undefined : { borderTop: 'none' }}
            >
              {(isLite || inputMode === 'file') && (
                <DropZone
                  multiple={!isLite}
                  size={isLite ? 'lg' : 'md'}
                  embedded={!isLite}
                  privacyNote={
                    isLite
                      ? undefined
                      : 'AI機能や、文字を取り出しにくいPDFの抽出ではサーバーに送信しますが、保存はしません。'
                  }
                  onFiles={(files) => {
                    if (!isLite && files.length > 1 && onSubmitBatch) {
                      onSubmitBatch(files, mask, customKeywords)
                      return
                    }
                    handleFile(files[0])
                  }}
                />
              )}
              {inputMode === 'url' && (
                <div className={s['up-section-pad']}>
                  <div className={s['up-section-title']}>URLから取り込む</div>
                  <p className={s['up-section-desc']} style={{ marginBottom: 10 }}>
                    Webページの職務経歴書・ポートフォリオをそのまま取得してマスキングします
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <button
                      ref={urlHelpTriggerRef}
                      onClick={() => setShowUrlHelp(true)}
                      aria-haspopup="dialog"
                      aria-expanded={showUrlHelp}
                      title="URL取得の注意とヒントを表示"
                      className={s['up-guide-help-btn']}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={T.text2}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="10" x2="12" y2="16" />
                        <line x1="12" y1="7" x2="12.01" y2="7" />
                      </svg>
                      補足ガイド
                    </button>
                  </div>
                  <div className={s['up-url-row']} style={{ marginBottom: 12 }}>
                    <input
                      aria-label="URLを入力"
                      value={urlValue}
                      onChange={(e) => setUrlValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && urlValue.trim()) handleURL()
                      }}
                      placeholder="https://example.com/resume"
                      className={s['up-url-input']}
                    />
                    <button
                      onClick={handleURL}
                      disabled={!urlValue.trim() || urlFetching}
                      className={s['up-url-submit']}
                      style={{
                        background: urlValue.trim() ? T.accent : T.border,
                        color: urlValue.trim() ? T.bg : T.text3,
                        cursor: urlValue.trim() ? 'pointer' : 'default',
                        opacity: urlFetching ? 0.6 : 1,
                      }}
                    >
                      {urlFetching ? '取得中...' : '取得＆解析'}
                    </button>
                  </div>
                  {showUrlHelp && (
                    <div
                      className={s['up-guide-overlay']}
                      onClick={(e) => {
                        if (e.target === e.currentTarget) closeUrlHelp()
                      }}
                    >
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="URLスクレイピングのガイド"
                        className={s['up-guide-dialog']}
                      >
                        <div className={s['up-guide-header']}>
                          <div className={s['up-guide-title']}>URLスクレイピング ガイド</div>
                          <button
                            ref={urlHelpCloseRef}
                            onClick={closeUrlHelp}
                            aria-label="閉じる"
                            className={s['modal-close-btn']}
                          >
                            ×
                          </button>
                        </div>
                        <div className={s['up-guide-body']}>
                          <div>
                            <div className={s['up-guide-section-title']}>対象外/非推奨</div>
                            <div className={s['up-guide-section-text']}>
                              SNS/テックブログ系のURLは情報が断片的で、マスク後に内容がほぼ残らないためURLスクレイピングは非推奨です。必要に応じて「テキスト/HTML貼付」やPDFでの取り込みをご利用ください。
                            </div>
                          </div>
                          <div>
                            <div className={s['up-guide-section-title']}>取得の安定化</div>
                            <div className={s['up-guide-section-text']}>
                              {settings?.proxyUrl ? (
                                <>自前プロキシ設定済。URL取得は安定して動作します。</>
                              ) : (
                                <>
                                  サーバー経由で自動取得します。取得できない場合はテキスト貼付をお試しください。
                                </>
                              )}
                            </div>
                            <div className={s['up-guide-tip']}>
                              Tip:
                              取得失敗時は「テキスト/HTML貼付」タブへ。Ctrl+U→ソースコピーで確実に取り込めます。
                            </div>
                          </div>
                          <div>
                            <div className={s['up-guide-section-title']}>非対応サイト</div>
                            <div className={s['up-guide-section-text']}>
                              Canva / Figma / Notion / Google Docs はSPAのため取得不可。PDF保存
                              →「ファイル」タブからアップロードしてください。
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {inputMode === 'paste' && (
                <div className={s['up-section-pad']}>
                  <div className={s['up-section-title']}>テキストを貼り付けて取り込む</div>
                  <p className={s['up-section-desc']} style={{ marginBottom: 14 }}>
                    職務経歴書のテキストをコピー＆ペースト、またはHTMLソースを貼り付けてください
                  </p>
                  <textarea
                    aria-label="職務経歴書のテキストを貼り付け"
                    value={pasteValue}
                    onChange={(e) => setPasteValue(e.target.value)}
                    placeholder={
                      'ここにテキストまたはHTMLを貼り付け...\n\n例:\n・職務経歴書のテキスト全文\n・Ctrl+U でコピーしたHTMLソース\n・Wantedlyプロフィールのコピー'
                    }
                    className={s['up-paste-textarea']}
                  />
                  <div className={s['up-paste-footer']}>
                    <div className={s['up-paste-meta']}>
                      {pasteValue.trim() ? (
                        <>
                          {/<[a-z][\s\S]*>/i.test(pasteValue) ? (
                            <span
                              style={{
                                color: T.cyan,
                              }}
                            >
                              HTML検出
                            </span>
                          ) : (
                            <span
                              style={{
                                color: T.green,
                              }}
                            >
                              テキスト
                            </span>
                          )}{' '}
                          / {(new Blob([pasteValue]).size / 1024).toFixed(1)} KB
                        </>
                      ) : (
                        '入力待ち...'
                      )}
                    </div>
                    <button
                      onClick={handlePaste}
                      disabled={!pasteValue.trim()}
                      className={s['up-paste-submit']}
                      style={{
                        background: pasteValue.trim() ? T.accent : T.border,
                        color: pasteValue.trim() ? T.bg : T.text3,
                        cursor: pasteValue.trim() ? 'pointer' : 'default',
                      }}
                    >
                      解析開始
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {error && <div className={s['up-error']}>! {error}</div>}
          <SampleCard
            introId={isLite ? 'sample-demo' : 'sample-files'}
            items={isLite ? SAMPLE_ITEMS.slice(0, 1) : SAMPLE_ITEMS}
            onPick={handleDemo}
            zipHref={isLite ? undefined : '/mock-resumes.zip'}
          />
        </div>
        {/* end right column */}
      </div>
      {/* end grid */}
    </div>
  )
}
