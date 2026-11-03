'use client'

// ═══ 確認・整える画面（EditorScreen） ═══
// 解析結果（AnalysisResult）を受け取り、検出結果のオン/オフ・本文の確認（マスク後/差分/生テキスト/AI整形）・
// A4 プレビュー・アドバイザーチャット（Pro）・書き出しプレビューを 1 画面で扱う。
// ステップフローバーとは window の CustomEvent（FLOW_EVENT_*）で連携する。

import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import s from '@/app/redact-pro.module.css'
import { A4PreviewPanel } from '@/components/redact/A4PreviewPanel'
import { AIPanel } from '@/components/redact/AIPanel'
import { DesignExportModal } from '@/components/redact/DesignExportModal'
import { DiffView } from '@/components/redact/DiffView'
import { PreviewModal, type PreviewMeta } from '@/components/redact/PreviewModal'
import { renderTextWithDetectionAnchors } from '@/components/redact/detection-anchors'
import { Badge, Btn, LayoutIcon, Pill, Toggle } from '@/components/redact/ui'
import { ADVISOR_PRESETS } from '@/lib/advisor/prompts'
import type { AdvisorMessage, AdvisorPreset } from '@/lib/advisor/types'
import type { CostAlert } from '@/lib/advisor/model-selector'
import { notifyRateLimit, onRateLimitUpdate, type RateLimitInfo } from '@/lib/ai/client'
import { ensureUniqueDetectionIds } from '@/lib/ai/tasks'
import type { AnalysisResult } from '@/lib/app-types'
import { fileTimestamp } from '@/lib/export'
import {
  FLOW_EVENT_EXPORT_STATE,
  FLOW_EVENT_MODE_STATE,
  FLOW_EVENT_SET_EXPORT,
  FLOW_EVENT_SET_MODE,
} from '@/lib/flow-steps'
import { formatDuration } from '@/lib/format'
import { PH_RE, applyRedaction, type AppDetection } from '@/lib/redact-engine'
import { generatePDFHTML, type FontType } from '@/lib/resume-html'
import { simpleMarkdown } from '@/lib/simple-markdown'
import { C, T } from '@/lib/theme'
import { launchTour } from '@/lib/tour'
import { CATEGORIES, LAYOUT_PRESETS, type CategoryMeta, type LayoutPreset } from '@/lib/ui-config'

export interface EditorScreenProps {
  data: AnalysisResult
  onReset: () => void
  apiKey: string
  model: string
  /** 一括取り込み（Pro）のタブ表示からは渡されない */
  isLite?: boolean
}

/** 本文エリアの表示切替（1〜6 キーに対応） */
type ViewMode = 'original' | 'diff' | 'raw' | 'raw-diff' | 'ai' | 'ai-diff'
type RightTab = 'detections' | 'advisor'
/** ステップフロー上の位置: 確認する(review) / 整える(format) */
type FlowMode = 'review' | 'format'
type AdvisorModelMode = 'auto' | 'manual'
type AdvisorInputMode = 'question' | 'rewrite'
type LayoutPresetId = LayoutPreset['id']

interface AdvisorCost {
  daily: number
  session: number
  count: number
}

interface CategoryCount {
  total: number
  enabled: number
}

/** PreviewModal（書き出しプレビュー / 検出レポート）に渡す内容 */
interface EditorPreviewState {
  title: string
  content: string
  baseName: string
  editable?: boolean
  meta?: PreviewMeta
  onContentChange?: (content: string) => void
}

/** CATEGORIES は CategoryId でしか引けないので、検出結果の category（任意の文字列）で引くための見方 */
const CATEGORY_BY_ID: Readonly<Record<string, CategoryMeta | undefined>> = CATEGORIES

/** catch した値の message（Error 以外が投げられた場合は undefined） */
function errorMessageOf(e: unknown): unknown {
  return typeof e === 'object' && e !== null && 'message' in e ? e.message : undefined
}

/** window の CustomEvent の detail をオブジェクトとして取り出す（それ以外は undefined） */
function eventDetail(e: Event): Record<string, unknown> | undefined {
  if (!(e instanceof CustomEvent)) return undefined
  const d: unknown = e.detail
  return typeof d === 'object' && d !== null ? (d as Record<string, unknown>) : undefined
}

// ═══ Editor Screen ═══
export function EditorScreen({ data, onReset, apiKey, model, isLite }: EditorScreenProps) {
  const [detections, setDetections] = useState<AppDetection[]>(
    ensureUniqueDetectionIds(data.detections),
  )
  const [showRedacted, setShowRedacted] = useState(true)
  const [copied, setCopied] = useState(false)
  const [filterCat, setFilterCat] = useState<string>('all')
  const [filterSrc, setFilterSrc] = useState<string>('all')
  const [showAI, setShowAI] = useState(false)
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('original')
  const [preview, setPreview] = useState<EditorPreviewState | null>(null)
  const [showDesign, setShowDesign] = useState(false)
  const [focusDetId, setFocusDetId] = useState<string | null>(null)
  const [focusPulse, setFocusPulse] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // アドバイザーチャット（Pro版のみ）
  const [rightTab, setRightTab] = useState<RightTab>('detections')
  const [advisorMessages, setAdvisorMessages] = useState<AdvisorMessage[]>([])
  const [advisorInput, setAdvisorInput] = useState('')
  const [advisorLoading, setAdvisorLoading] = useState(false)
  const [jobDescription, setJobDescription] = useState('')
  const [showJobInput] = useState(false)
  const [advisorModelMode, setAdvisorModelMode] = useState<AdvisorModelMode>('auto')
  const [advisorUseRedacted, setAdvisorUseRedacted] = useState(false)
  const [advisorCost, setAdvisorCost] = useState<AdvisorCost>({ daily: 0, session: 0, count: 0 })
  const [advisorLastModel, setAdvisorLastModel] = useState('')
  const [advisorCostAlert, setAdvisorCostAlert] = useState<CostAlert>('none')
  const [advisorDraft, setAdvisorDraft] = useState<string | null>(null) // AI改善テキスト
  const [advisorDraftLoading, setAdvisorDraftLoading] = useState(false)
  const [advisorInputMode, setAdvisorInputMode] = useState<AdvisorInputMode>('question')
  const [aiRateLimit, setAiRateLimit] = useState<RateLimitInfo | null>(null)
  useEffect(() => onRateLimitUpdate((rl) => setAiRateLimit(rl)), [])
  const advisorEndRef = useRef<HTMLDivElement>(null)
  // EditorScreen 初回ツアー
  useEffect(() => {
    const done = localStorage.getItem('rp_tour_editor_done')
    if (done) return
    const timer = setTimeout(async () => {
      try {
        const { EDITOR_STEPS_LITE, EDITOR_STEPS_PRO, LS_TOUR_EDITOR_DONE } =
          await import('@/lib/intro-steps')
        await launchTour(isLite ? EDITOR_STEPS_LITE : EDITOR_STEPS_PRO, LS_TOUR_EDITOR_DONE)
      } catch (e) {
        console.warn('editor tour failed:', e)
      }
    }, 800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ツアーはマウント時に 1 回だけ。isLite の切替で再起動しない
  }, [])
  const [editMode, setEditMode] = useState(false)
  const [editedText, setEditedText] = useState<string | null>(null)
  // 確認ステップはテキスト+検出リストに集中させる（A4プレビューは「整える」ステップが主役）
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewFontType, setPreviewFontType] = useState<FontType>('gothic')
  const [previewZoom, setPreviewZoom] = useState(1)
  // Draggable panel widths (percentages of total width)
  const [leftPct, setLeftPct] = useState<number | null>(null)
  const [rightPct, setRightPct] = useState<number | null>(null)
  // Layout presets
  const [, setLayoutPreset] = useState<LayoutPresetId | null>('balanced')
  const presetTransRef = useRef(false)
  const applyLayoutPreset = useCallback((id: LayoutPresetId) => {
    setLayoutPreset(id)
    setLeftPct(null)
    setRightPct(null)
    presetTransRef.current = true
    setTimeout(() => {
      presetTransRef.current = false
    }, 300)
    switch (id) {
      case 'text':
        setPreviewVisible(false)
        setSidebarCollapsed(false)
        break
      case 'balanced':
        setPreviewVisible(true)
        setSidebarCollapsed(false)
        break
      case 'preview':
        setPreviewVisible(true)
        setSidebarCollapsed(false)
        // defer leftPct set after state updates
        setTimeout(() => setLeftPct(30), 0)
        break
      case 'advisor':
        setPreviewVisible(false)
        setSidebarCollapsed(false)
        setTimeout(() => setRightPct(55), 0)
        break
      case 'focus':
        setPreviewVisible(false)
        setSidebarCollapsed(true)
        break
    }
  }, [])
  const activePreset = useMemo<LayoutPresetId | null>(() => {
    if (rightPct !== null) return null
    if (!previewVisible && sidebarCollapsed && leftPct === null) return 'focus'
    if (!previewVisible && !sidebarCollapsed && leftPct === null) return 'text'
    if (previewVisible && !sidebarCollapsed && leftPct === null) return 'balanced'
    if (previewVisible && !sidebarCollapsed && leftPct === 30) return 'preview'
    return null
  }, [previewVisible, sidebarCollapsed, leftPct, rightPct])
  const hasRawText =
    data.rawText && data.rawText !== data.fullText && data.rawText !== data.text_preview

  const [editorCustomInput, setEditorCustomInput] = useState('')
  const addCustomKeyword = (kw: string) => {
    if (!kw || kw.length < 1) return
    const text = data.fullText || data.text_preview
    if (!text.includes(kw)) return
    const exists = detections.some((d) => d.type === 'custom_keyword' && d.value === kw)
    if (exists) return
    const newDet: AppDetection = {
      id: `ck_ed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'custom_keyword',
      label: 'カスタム指定',
      category: 'custom',
      value: kw,
      source: 'regex',
      confidence: 1.0,
      enabled: true,
    }
    setDetections((p) => [...p, newDet])
    // localStorageにも保存
    try {
      const raw = localStorage.getItem('rp_custom_keywords')
      // 配列でない値が保存されていた場合は includes/push が投げて下の catch で無視される
      const arr: unknown[] = raw ? JSON.parse(raw) : []
      if (!arr.includes(kw)) {
        arr.push(kw)
        localStorage.setItem('rp_custom_keywords', JSON.stringify(arr))
      }
    } catch {
      /* 保存できなくても今回の検出追加は済んでいるので無視する */
    }
  }
  // Pro: 詳細なマスキング設定は既定で畳む（初見では検出一覧に集中させる）
  const [sideSettingsOpen, setSideSettingsOpen] = useState(false)
  // 初回だけ表示する「スイッチの意味」の案内（閉じたら記憶）
  const [showReviewHint, setShowReviewHint] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('rp_hint_review_done') !== '1'
    } catch {
      return true
    }
  })
  const dismissReviewHint = () => {
    setShowReviewHint(false)
    try {
      localStorage.setItem('rp_hint_review_done', '1')
    } catch {
      /* 記憶できなくても今回は閉じられているので無視する */
    }
  }
  const [closedCats, setClosedCats] = useState<Set<string>>(new Set())
  const toggleCatAccordion = (cat: string) =>
    setClosedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  // アップロード画面のカスタムキーワードを引き継ぐ
  useEffect(() => {
    try {
      const raw = localStorage.getItem('rp_custom_keywords')
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || !parsed.length) return
      // rp_custom_keywords は取り込み画面と addCustomKeyword が文字列配列として書き込む
      const keywords: string[] = parsed
      const text = data.fullText || data.text_preview
      setDetections((prev) => {
        const add: AppDetection[] = []
        for (const kw of keywords) {
          if (!kw || !text.includes(kw)) continue
          if (prev.some((d) => d.type === 'custom_keyword' && d.value === kw)) continue
          add.push({
            id: `ck_load_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'custom_keyword',
            label: 'カスタム指定',
            category: 'custom',
            value: kw,
            source: 'regex',
            confidence: 1.0,
            enabled: true,
          })
        }
        return add.length ? [...prev, ...add] : prev
      })
    } catch {
      /* 保存値が壊れていても引き継ぎを諦めるだけでよい */
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- マウント時に 1 回だけ引き継ぐ（data が変わるときは key で再マウントされる）

  const toggle = (id: string) =>
    setDetections((p) => p.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d)))
  const setCatEnabled = (cat: string, en: boolean) =>
    setDetections((p) => p.map((d) => (d.category === cat ? { ...d, enabled: en } : d)))
  const enableAll = () => setDetections((p) => p.map((d) => ({ ...d, enabled: true })))
  const disableAll = () => setDetections((p) => p.map((d) => ({ ...d, enabled: false })))
  const enabledCount = detections.filter((d) => d.enabled).length
  const filtered = detections.filter((d) => {
    if (filterCat !== 'all' && d.category !== filterCat) return false
    if (filterSrc !== 'all' && d.source !== filterSrc) return false
    return true
  })
  const redacted = useMemo(
    () => applyRedaction(data.fullText || data.text_preview, detections, data.maskOpts),
    [data, detections],
  )
  const displayText =
    viewMode === 'ai' && aiResult
      ? aiResult
      : viewMode === 'raw' && hasRawText
        ? data.rawText
        : showRedacted
          ? applyRedaction(data.text_preview, detections, data.maskOpts)
          : data.text_preview
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 毎レンダー作り直し、ショートカットの effect も毎回最新のハンドラへ張り替える（useCallback にすると依存の取りこぼしで古い本文をコピーしうる）
  const handleCopy = () => {
    navigator.clipboard.writeText(viewMode === 'ai' && aiResult ? aiResult : redacted)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const baseName = data.file_name.replace(/\.[^.]+$/, '') + '_redacted_' + fileTimestamp()

  // ── アドバイザーチャット ──
  const [advisorPresets] = useState<AdvisorPreset[]>(() => ADVISOR_PRESETS)

  const buildCtx = useCallback(async (): Promise<string> => {
    try {
      const { buildAdvisorContext } = await import('@/lib/advisor/context')
      return buildAdvisorContext({
        originalText: data.fullText || data.text_preview,
        redactedText: redacted,
        detections,
        fileName: data.file_name,
        // AnalysisResult は format を持たない（形式名は file_format）ので、常に既定の 'text' になる
        format: 'text',
        pageCount: data.page_count ?? undefined,
        useRedacted: advisorUseRedacted,
      })
    } catch {
      return `【経歴書テキスト】\n${(advisorUseRedacted ? redacted : data.fullText || data.text_preview).slice(0, 6000)}`
    }
  }, [data, detections, redacted, advisorUseRedacted])

  const handleAdvisorSend = useCallback(
    async (overridePrompt?: string, presetId?: string) => {
      const text = typeof overridePrompt === 'string' ? overridePrompt : advisorInput.trim()
      if (!text || advisorLoading) return
      const userMsg: AdvisorMessage = { role: 'user', content: text, timestamp: Date.now() }
      setAdvisorMessages((prev) => [...prev, userMsg])
      if (typeof overridePrompt !== 'string') setAdvisorInput('')
      setAdvisorLoading(true)
      try {
        const { callAdvisor } = await import('@/lib/advisor/call')
        const ctx = await buildCtx()
        const allMsgs = await new Promise<AdvisorMessage[]>((resolve) =>
          setAdvisorMessages((prev) => {
            resolve([...prev])
            return prev
          }),
        )
        const result = await callAdvisor({
          messages: allMsgs,
          context: ctx,
          apiKey,
          model,
          modelMode: advisorModelMode,
          presetId,
          jobDescription: jobDescription.trim() || undefined,
        })
        setAdvisorLastModel(result.modelLabel)
        setAdvisorMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result.text, timestamp: Date.now() },
        ])
        if (result.rateLimit) {
          setAiRateLimit(result.rateLimit)
          notifyRateLimit(result.rateLimit)
        }
        // コスト更新
        const { getCostRecord, checkCostAlert } = await import('@/lib/advisor/model-selector')
        const rec = getCostRecord()
        setAdvisorCost({ daily: rec.dailyTotal, session: rec.sessionTotal, count: rec.callCount })
        setAdvisorCostAlert(checkCostAlert(rec))
      } catch (e: unknown) {
        setAdvisorMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `エラー: ${errorMessageOf(e) || 'AI呼び出しに失敗しました'}`,
            timestamp: Date.now(),
          },
        ])
      } finally {
        setAdvisorLoading(false)
      }
    },
    [advisorInput, advisorLoading, buildCtx, apiKey, model, advisorModelMode, jobDescription],
  )

  const handleAdvisorPreset = useCallback(
    (preset: AdvisorPreset) => {
      let prompt = preset.prompt
      if (preset.id === 'job-match' && jobDescription.trim()) {
        prompt += `\n\n【求人票】\n${jobDescription.trim()}`
      }
      handleAdvisorSend(prompt, preset.id)
    },
    [handleAdvisorSend, jobDescription],
  )

  useEffect(() => {
    advisorEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [advisorMessages])

  // アドバイザー: 改善テキスト全文を生成（userInstruction: ユーザーの自由入力指示）
  const handleAdvisorRewriteFull = useCallback(
    async (userInstruction?: string) => {
      if (advisorDraftLoading) return
      setAdvisorDraftLoading(true)
      try {
        const { callAdvisor } = await import('@/lib/advisor/call')
        const ctx = await buildCtx()
        const prompt = userInstruction
          ? `以下の指示に従って経歴書テキストを改善してください:\n\n【指示】\n${userInstruction}\n\n【経歴書テキスト】\n${redacted}`
          : `以下のマスキング済み経歴書テキストを改善してください:\n\n${redacted}`
        const userMsg: AdvisorMessage = { role: 'user', content: prompt, timestamp: Date.now() }
        const result = await callAdvisor({
          messages: [userMsg],
          context: ctx,
          apiKey,
          model,
          modelMode: advisorModelMode,
          presetId: 'rewrite-full',
        })
        setAdvisorLastModel(result.modelLabel)
        setAdvisorDraft(result.text)
        if (result.rateLimit) {
          setAiRateLimit(result.rateLimit)
          notifyRateLimit(result.rateLimit)
        }
        const { getCostRecord, checkCostAlert } = await import('@/lib/advisor/model-selector')
        const rec = getCostRecord()
        setAdvisorCost({ daily: rec.dailyTotal, session: rec.sessionTotal, count: rec.callCount })
        setAdvisorCostAlert(checkCostAlert(rec))
      } catch (e: unknown) {
        setAdvisorMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `改善テキスト生成エラー: ${errorMessageOf(e) || 'AI呼び出しに失敗しました'}`,
            timestamp: Date.now(),
          },
        ])
      } finally {
        setAdvisorDraftLoading(false)
      }
    },
    [advisorDraftLoading, buildCtx, redacted, apiKey, model, advisorModelMode],
  )

  // アドバイザー: 改善テキストを取り込み（編集モードに移行）
  const handleAdvisorDraftApply = useCallback(() => {
    if (!advisorDraft) return
    setEditedText(advisorDraft)
    setEditMode(true)
    setPreviewVisible(true)
    setAdvisorDraft(null)
  }, [advisorDraft])

  // アドバイザー: 改善テキストを却下
  const handleAdvisorDraftReject = useCallback(() => {
    setAdvisorDraft(null)
  }, [])

  // エクスポートプレビューを開く（フッターのボタンとステップフローバーの両方から呼ばれる）
  const openExportPreview = useCallback(() => {
    setPreview({
      title: 'マスキング済みテキスト',
      content: editedText ?? (viewMode === 'ai' && aiResult ? aiResult : redacted),
      baseName,
      editable: true,
      meta: {
        fileName: data.file_name,
        maskCount: enabledCount,
        xlMeta: data.xlMeta?.map((sh) => ({
          sheetName: sh.sheetName,
          aoa: sh.aoa.map((r) =>
            r.map((c) => applyRedaction(String(c ?? ''), detections, data.maskOpts)),
          ),
        })),
      },
      onContentChange: (newContent: string) => {
        setPreview((prev) => (prev ? { ...prev, content: newContent } : null))
      },
    })
  }, [editedText, viewMode, aiResult, redacted, baseName, data, enabledCount, detections])
  // ステップフローバーからのエクスポート開閉指示
  useEffect(() => {
    const handler = (e: Event) => {
      if (eventDetail(e)?.open) openExportPreview()
      else setPreview(null)
    }
    window.addEventListener(FLOW_EVENT_SET_EXPORT, handler)
    return () => window.removeEventListener(FLOW_EVENT_SET_EXPORT, handler)
  }, [openExportPreview])
  // エクスポートプレビューの開閉状態をステップフローバーへ通知（アンマウント時はクローズ扱い）
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(FLOW_EVENT_EXPORT_STATE, { detail: { open: !!preview } }))
    return () => {
      window.dispatchEvent(new CustomEvent(FLOW_EVENT_EXPORT_STATE, { detail: { open: false } }))
    }
  }, [preview])
  // ── ステップフロー: 確認する(review) / 整える(format) のモード切替 ──
  const [flowMode, setFlowMode] = useState<FlowMode>('review')
  useEffect(() => {
    const handler = (e: Event) => {
      const m = eventDetail(e)?.mode
      if (m === 'review' || m === 'format') setFlowMode(m)
    }
    window.addEventListener(FLOW_EVENT_SET_MODE, handler)
    return () => window.removeEventListener(FLOW_EVENT_SET_MODE, handler)
  }, [])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(FLOW_EVENT_MODE_STATE, { detail: { mode: flowMode } }))
    return () => {
      window.dispatchEvent(new CustomEvent(FLOW_EVENT_MODE_STATE, { detail: { mode: 'review' } }))
    }
  }, [flowMode])
  const goFormat = useCallback(() => setFlowMode('format'), [])
  const goReview = useCallback(() => setFlowMode('review'), [])
  const buildCsv = () =>
    '種類,カテゴリ,検出値,検出方法,確信度,マスク有無\n' +
    detections
      .map(
        (d) =>
          `"${d.label}","${d.category}","${d.value}","${d.source}","${d.confidence || ''}","${d.enabled ? 'マスク済' : '未マスク'}"`,
      )
      .join('\n')

  // A4プレビュー用 memoized HTML
  const previewSrcText = editedText ?? redacted
  const previewHtml = useMemo(
    () => (editMode ? generatePDFHTML(previewSrcText, previewFontType) : ''),
    [editMode, previewSrcText, previewFontType],
  )

  // 共通エクスポートヘルパー
  const exportPrintPDF = useCallback(() => {
    const src = editedText ?? redacted
    const html = generatePDFHTML(src, previewFontType)
    const printHTML = html.replace(
      '</body>',
      `<script>window.onload=function(){window.print();setTimeout(()=>{window.close()},1000)}</script></body>`,
    )
    const blob = new Blob([printHTML], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }, [editedText, redacted, previewFontType])

  const exportHTML = useCallback(() => {
    const src = editedText ?? redacted
    const html = generatePDFHTML(src, previewFontType)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const a = document.createElement('a')
    const url = URL.createObjectURL(blob)
    a.href = url
    a.download = baseName + '.html'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [editedText, redacted, previewFontType, baseName])

  // エディタ用キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement
      const tag = active?.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (active instanceof HTMLElement && active.isContentEditable)
      )
        return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const hasRaw =
        data.rawText && data.rawText !== data.fullText && data.rawText !== data.text_preview

      switch (e.key) {
        case '1':
          e.preventDefault()
          setViewMode('original')
          break
        case '2':
          e.preventDefault()
          setViewMode('diff')
          break
        case '3':
          if (!isLite && hasRaw) {
            e.preventDefault()
            setViewMode('raw')
          }
          break
        case '4':
          if (!isLite && hasRaw) {
            e.preventDefault()
            setViewMode('raw-diff')
          }
          break
        case '5':
          if (!isLite && aiResult) {
            e.preventDefault()
            setViewMode('ai')
          }
          break
        case '6':
          if (!isLite && aiResult) {
            e.preventDefault()
            setViewMode('ai-diff')
          }
          break
        case 'm':
        case 'M':
          if (!isLite) {
            e.preventDefault()
            setShowRedacted((p) => !p)
          }
          break
        case 'p':
        case 'P':
          if (!isLite) {
            e.preventDefault()
            setPreviewVisible((p) => !p)
          }
          break
        case 'w':
        case 'W':
          if (!isLite) {
            e.preventDefault()
            setEditMode((p) => {
              if (!p) {
                setEditedText(viewMode === 'ai' && aiResult ? aiResult : redacted)
                setPreviewVisible(true)
                return true
              }
              setEditedText(null)
              return false
            })
          }
          break
        case 'i':
        case 'I':
          if (!isLite) {
            e.preventDefault()
            exportPrintPDF()
          }
          break
        case 'r':
        case 'R':
          if (!isLite) {
            e.preventDefault()
            setRightTab('detections')
          }
          break
        case 'a':
        case 'A':
          if (!isLite) {
            e.preventDefault()
            setRightTab('advisor')
          }
          break
        case 'c':
        case 'C':
          e.preventDefault()
          handleCopy()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isLite, aiResult, data, viewMode, redacted, exportPrintPDF, handleCopy])

  const exportWord = useCallback(() => {
    const src = editedText ?? redacted
    const html = generatePDFHTML(src, previewFontType)
    const wordHTML = html
      .replace('<!DOCTYPE html>', '')
      .replace(
        '<html lang="ja">',
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ja">',
      )
      .replace(
        '<head>',
        '<head><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->',
      )
    const blob = new Blob(['\uFEFF' + wordHTML], { type: 'application/msword;charset=utf-8' })
    const a = document.createElement('a')
    const url = URL.createObjectURL(blob)
    a.href = url
    a.download = baseName + '.docx'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [editedText, redacted, previewFontType, baseName])

  const focusDetection = useCallback((id: string) => {
    setFocusDetId(id)
    setFocusPulse((p) => p + 1)
    setViewMode('original')
    setEditMode(false)
  }, [])

  useEffect(() => {
    if (!focusDetId) return
    // Wait for the text to render (viewMode or showRedacted may have changed)
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-det-id="${focusDetId}"]`)
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [focusDetId, focusPulse, viewMode, showRedacted])

  function renderText(text: string): ReactNode {
    if (!showRedacted && viewMode !== 'ai') return text
    const parts: ReactNode[] = []
    let last = 0
    let m: RegExpExecArray | null
    const re = new RegExp(PH_RE.source, 'g')
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(<span key={`t${last}`}>{text.slice(last, m.index)}</span>)
      parts.push(
        <span
          key={`r${m.index}`}
          style={{
            background: T.redDim,
            color: T.red,
            padding: '1px 6px',
            borderRadius: 4,
            fontWeight: 600,
            fontSize: '0.92em',
          }}
        >
          {m[0]}
        </span>,
      )
      last = m.index + m[0].length
    }
    if (last < text.length) parts.push(<span key={`e${last}`}>{text.slice(last)}</span>)
    return parts.length ? parts : text
  }

  const grouped: Record<string, AppDetection[]> = {}
  for (const d of filtered) {
    const c = d.category || 'other'
    if (!grouped[c]) grouped[c] = []
    grouped[c].push(d)
  }
  const allCats = [...new Set(detections.map((d) => d.category))]
  const allSrcs = [...new Set(detections.map((d) => d.source))]
  const catCounts = useMemo(() => {
    const c: Record<string, CategoryCount> = {}
    for (const d of detections) {
      if (!c[d.category]) c[d.category] = { total: 0, enabled: 0 }
      c[d.category].total++
      if (d.enabled) c[d.category].enabled++
    }
    return c
  }, [detections])

  const showDiff = viewMode === 'diff'
  const showAiDiff = viewMode === 'ai-diff'

  const startDrag = useCallback(
    (divider: 'left' | 'right') => (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      const wrap = e.target instanceof Element ? e.target.closest('.rp-editor-wrap') : null
      if (!wrap) return
      const totalW = wrap.getBoundingClientRect().width
      const startX = e.clientX
      const leftEl = wrap.querySelector('.rp-editor-left')
      const rightEl = wrap.querySelector('.rp-editor-right')
      const initLeftW = leftEl ? leftEl.getBoundingClientRect().width : 0
      const initRightW = rightEl ? rightEl.getBoundingClientRect().width : 0

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX
        setLayoutPreset(null)
        if (divider === 'left') {
          const newLeft = Math.max(160, Math.min(totalW * 0.65, initLeftW + dx))
          setLeftPct((newLeft / totalW) * 100)
        } else {
          const newRight = Math.max(200, Math.min(totalW * 0.55, initRightW - dx))
          setRightPct((newRight / totalW) * 100)
        }
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [],
  )

  // A4 プレビュー iframe の高さを中身に合わせる（同一オリジン sandbox なので読める）
  const fitIframeHeight = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const h = e.currentTarget.contentDocument?.documentElement?.scrollHeight
      if (h && h > 842) e.currentTarget.style.height = h + 'px'
    } catch {
      /* 読めない場合は既定の高さ（842px）のまま表示する */
    }
  }

  // CSS Grid列定義: 左パネルは常に1fr（残りスペースすべて）
  const centerCol = `minmax(280px,min(${Math.round(595 * previewZoom) + 48}px,42%))`
  const gridCols = useMemo(() => {
    const d = '5px'
    if (isLite) {
      // Lite: テキスト + サイドバー の2カラム（子要素2つ）
      if (sidebarCollapsed) return '1fr 40px'
      const r = rightPct ? `${rightPct}%` : '280px'
      return `1fr ${r}`
    }
    if (previewVisible && !sidebarCollapsed) {
      const l = leftPct ? `${leftPct}%` : '1fr',
        c = leftPct ? '1fr' : centerCol,
        r = rightPct ? `${rightPct}%` : '260px'
      return `${l} ${d} ${c} ${d} ${r}`
    }
    if (!previewVisible && !sidebarCollapsed) {
      const r = rightPct ? `${rightPct}%` : '300px'
      return `1fr 36px ${d} ${r}`
    }
    if (previewVisible && sidebarCollapsed) {
      const l = leftPct ? `${leftPct}%` : '1fr',
        c = leftPct ? '1fr' : centerCol
      return `${l} ${d} ${c} 40px`
    }
    return '1fr 36px 40px'
  }, [isLite, previewVisible, sidebarCollapsed, leftPct, rightPct, centerCol])

  // ── 整えるステップ: A4プレビューを主役にした専用ビュー（Lite/Pro共通） ──
  if (flowMode === 'format') {
    return (
      <div
        className="rp-editor-wrap"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 52px - 40px - 36px)',
          minHeight: 0,
          fontFamily: T.font,
          background: T.bg,
        }}
      >
        <div className={s['ed-preview-toolbar']}>
          <span className={s['ed-preview-label']}>A4 プレビュー</span>
          {!isLite && (
            <button
              onClick={() => {
                if (!editMode) {
                  setEditedText(viewMode === 'ai' && aiResult ? aiResult : redacted)
                  setEditMode(true)
                } else {
                  setEditMode(false)
                  setEditedText(null)
                }
              }}
              title="テキストを直接編集してA4プレビューに反映"
              className={s['ed-small-btn']}
              style={{
                border: `1px solid ${editMode ? T.accent : T.border}`,
                background: editMode ? T.accentDim : 'transparent',
                color: editMode ? T.accent : T.text3,
                fontWeight: editMode ? 600 : 400,
              }}
            >
              {editMode ? '編集を終了' : 'テキストを編集'}
            </button>
          )}
          {!isLite && editMode && (
            <>
              <button
                onClick={() => setPreviewFontType('gothic')}
                title="ゴシック体に切替"
                className={s['ed-small-btn']}
                style={{
                  border: `1px solid ${previewFontType === 'gothic' ? T.accent : T.border}`,
                  background: previewFontType === 'gothic' ? T.accentDim : 'transparent',
                  color: previewFontType === 'gothic' ? T.accent : T.text3,
                  fontWeight: previewFontType === 'gothic' ? 600 : 400,
                }}
              >
                ゴシック
              </button>
              <button
                onClick={() => setPreviewFontType('mincho')}
                title="明朝体に切替"
                className={s['ed-small-btn']}
                style={{
                  border: `1px solid ${previewFontType === 'mincho' ? T.accent : T.border}`,
                  background: previewFontType === 'mincho' ? T.accentDim : 'transparent',
                  color: previewFontType === 'mincho' ? T.accent : T.text3,
                  fontWeight: previewFontType === 'mincho' ? 600 : 400,
                }}
              >
                明朝
              </button>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
            <button
              onClick={() => setPreviewZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))}
              title="縮小"
              aria-label="縮小"
              className={s['ed-zoom-btn']}
            >
              &minus;
            </button>
            <button
              onClick={() => setPreviewZoom(1)}
              title="ズームをリセット"
              aria-label="ズームをリセット"
              className={s['ed-zoom-label']}
            >
              {Math.round(previewZoom * 100)}%
            </button>
            <button
              onClick={() => setPreviewZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
              title="拡大"
              aria-label="拡大"
              className={s['ed-zoom-btn']}
            >
              +
            </button>
          </div>
          <span style={{ flex: 1 }} />
          {!isLite && (
            <button
              onClick={() => setShowAI(true)}
              title="AIで推薦書・スキルシート等の形式に自動整形"
              className={s['ed-small-btn']}
              style={{ border: `1px solid ${T.border}`, background: 'transparent', color: T.text2 }}
            >
              AI で再フォーマット
            </button>
          )}
          {!isLite && (
            <button
              onClick={() => setShowDesign(true)}
              title="全画面編集"
              aria-label="全画面編集"
              className={s['ed-small-icon-btn']}
            >
              &#x2197;
            </button>
          )}
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            background: '#e5e7eb',
            overflow: 'hidden',
          }}
        >
          {!isLite && editMode && (
            <div
              style={{
                width: '38%',
                minWidth: 280,
                display: 'flex',
                flexDirection: 'column',
                borderRight: `1px solid ${T.border}`,
                background: T.bg,
                minHeight: 0,
              }}
            >
              <div className={s['ed-edit-hint']}>
                <span style={{ fontWeight: 600, color: T.text2 }}>記法: </span>
                <code className={s['ed-edit-code']}>**太字**</code>
                <code className={s['ed-edit-code']} style={{ marginLeft: 6 }}>
                  # 見出し
                </code>
                <span style={{ opacity: 0.6, marginLeft: 8 }}>A4プレビューに即反映</span>
              </div>
              <textarea
                aria-label="Markdown編集"
                value={editedText ?? ''}
                onChange={(e) => setEditedText(e.target.value)}
                spellCheck={false}
                className={s['ed-edit-textarea']}
              />
            </div>
          )}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {!isLite && editMode ? (
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  display: 'flex',
                  justifyContent: 'center',
                  padding: 16,
                }}
              >
                <div style={{ width: Math.round(595 * previewZoom), flexShrink: 0 }}>
                  <div
                    style={{
                      width: 595,
                      minHeight: 842,
                      background: '#fff',
                      boxShadow: '0 4px 24px rgba(0,0,0,.12)',
                      borderRadius: 4,
                      transform: `scale(${previewZoom})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <iframe
                      srcDoc={previewHtml}
                      sandbox="allow-same-origin"
                      style={{
                        width: '100%',
                        minHeight: 842,
                        border: 'none',
                        pointerEvents: 'none',
                      }}
                      title="A4 Preview"
                      onLoad={fitIframeHeight}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <A4PreviewPanel
                text={aiResult || data.fullText || data.text_preview}
                detections={detections}
                maskOpts={data.maskOpts}
                focusDetId={focusDetId}
                focusPulse={focusPulse}
                onFocusDet={focusDetection}
                zoom={previewZoom}
              />
            )}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '10px 14px',
            borderTop: `1px solid ${T.border}`,
            background: T.bg2,
            flexShrink: 0,
            alignItems: 'center',
          }}
        >
          <Btn
            variant="ghost"
            onClick={goReview}
            aria-label="確認に戻る"
            title="検出結果の確認に戻る"
            style={{ borderRadius: 10, fontSize: 13 }}
          >
            &larr; 確認に戻る
          </Btn>
          <span style={{ flex: 1, fontSize: 12, color: T.text3 }}>
            仕上がりを確認できたら書き出しへ
          </span>
          <Btn
            onClick={openExportPreview}
            aria-label="次へ: 書き出す"
            title="マスキング結果を確認して書き出す"
            style={{ borderRadius: 10, fontSize: 13, background: T.accent, padding: '11px 22px' }}
          >
            次へ: 書き出す
          </Btn>
        </div>
        {showAI && (
          <AIPanel
            redactedText={redacted}
            apiKey={apiKey}
            model={model}
            onApply={(t) => {
              setAiResult(t)
              setViewMode('ai')
              setShowAI(false)
            }}
            onClose={() => setShowAI(false)}
          />
        )}
        {showDesign && (
          <DesignExportModal
            text={
              editMode
                ? (editedText ?? redacted)
                : viewMode === 'ai' && aiResult
                  ? aiResult
                  : redacted
            }
            apiKey={apiKey}
            model={model}
            baseName={baseName}
            onClose={() => setShowDesign(false)}
          />
        )}
        {preview && (
          <PreviewModal
            title={preview.title}
            content={preview.content}
            baseName={preview.baseName}
            editable={preview.editable}
            meta={preview.meta}
            onClose={() => setPreview(null)}
            onContentChange={preview.onContentChange}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className="rp-editor-wrap"
      style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        height: 'calc(100vh - 52px - 40px - 36px)',
        fontFamily: T.font,
        transition: presetTransRef.current ? 'grid-template-columns .2s ease' : undefined,
      }}
    >
      <div
        className="rp-editor-left"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <div className={s['ed-toolbar']}>
          <div className={s['ed-file-info']}>
            <span className={s['ed-file-name']}>{data.file_name}</span>
            <Badge color={T.text3} bg={T.surfaceAlt}>
              {data.file_format}
            </Badge>
            {data.page_count && (
              <Badge color={T.text3} bg={T.surfaceAlt}>
                {data.page_count}p
              </Badge>
            )}
            {typeof data.analysis_ms === 'number' && data.analysis_ms > 0 && (
              <Badge color={T.text3} bg={T.surfaceAlt}>
                解析 {formatDuration(data.analysis_ms)}
              </Badge>
            )}
            {data.isDemo && (
              <Badge color={C.amber} bg={C.amberDim}>
                サンプル
              </Badge>
            )}
            {data.stats?.ai > 0 && (
              <Badge color={C.purple} bg={C.purpleDim}>
                AI +{data.stats.ai}
              </Badge>
            )}
            {hasRawText && (
              <Badge color={C.cyan} bg={C.cyanDim}>
                AI再構成済
              </Badge>
            )}
            {data.sparsePageCount > 0 && (
              <Badge color={C.amber} bg={C.amberDim}>
                OCR {data.sparsePageCount}p
              </Badge>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <div
              data-intro="view-tabs"
              className="rp-view-tabs"
              style={{
                display: 'flex',
                borderRadius: 8,
                overflow: 'hidden',
                border: `1px solid ${T.border}`,
              }}
            >
              <button
                type="button"
                title="マスク後: 個人情報を隠した結果を表示"
                aria-label="マスク後: 個人情報を隠した結果を表示"
                aria-pressed={viewMode === 'original'}
                onClick={() => setViewMode('original')}
                className={s['ed-view-tab']}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: viewMode === 'original' ? T.accentDim : 'transparent',
                  color: viewMode === 'original' ? T.accent : T.text3,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M8 1.5C5.5 1.5 3.3 3 2 5.5L1.5 6.5C1.2 7.1 1.2 7.9 1.5 8.5L2 9.5C3.3 12 5.5 13.5 8 13.5C10.5 13.5 12.7 12 14 9.5L14.5 8.5C14.8 7.9 14.8 7.1 14.5 6.5L14 5.5C12.7 3 10.5 1.5 8 1.5Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <circle cx="8" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <span>マスク後</span>
              </button>
              <button
                type="button"
                title="差分: 元テキストとマスク後の違いを並べて比較"
                aria-label="差分: 元テキストとマスク後の違いを並べて比較"
                aria-pressed={viewMode === 'diff'}
                onClick={() => setViewMode('diff')}
                className={s['ed-view-tab']}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: viewMode === 'diff' ? T.amberDim : 'transparent',
                  color: viewMode === 'diff' ? T.amber : T.text3,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M5 3v10M11 3v10M5 8h6"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M3 5L5 3l2 2M13 11l-2 2-2-2"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>差分</span>
              </button>
              {!isLite && hasRawText && (
                <>
                  <button
                    type="button"
                    title="生テキスト: ファイルから抽出したままのテキストを表示"
                    aria-label="生テキスト: ファイルから抽出したままのテキストを表示"
                    aria-pressed={viewMode === 'raw'}
                    onClick={() => setViewMode('raw')}
                    className={s['ed-view-tab']}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      background: viewMode === 'raw' ? T.redDim : 'transparent',
                      color: viewMode === 'raw' ? T.red : T.text3,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M4 1.5h5l4 4v9H4a1 1 0 01-1-1v-11a1 1 0 011-1z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M9 1.5v4h4"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>生テキスト</span>
                  </button>
                  <button
                    type="button"
                    title="生テキストとの差分: 抽出したままのテキストとAI整形後を並べて比較"
                    aria-label="生テキストとの差分: 抽出したままのテキストとAI整形後を並べて比較"
                    aria-pressed={viewMode === 'raw-diff'}
                    onClick={() => setViewMode('raw-diff')}
                    className={s['ed-view-tab']}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      background: viewMode === 'raw-diff' ? 'rgba(240,86,86,0.15)' : 'transparent',
                      color: viewMode === 'raw-diff' ? T.red : T.text3,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3 1.5h4l3 3v4H3a1 1 0 01-1-1v-5a1 1 0 011-1z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M7 1.5v3h3"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M11 8v5a1 1 0 01-1 1H4"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M13 10l-2 2-2-2"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>生テキストとの差分</span>
                  </button>
                </>
              )}
              {!isLite && aiResult && (
                <>
                  <button
                    type="button"
                    title="AI整形: AIが読みやすく整形したテキストを表示"
                    aria-label="AI整形: AIが読みやすく整形したテキストを表示"
                    aria-pressed={viewMode === 'ai'}
                    onClick={() => setViewMode('ai')}
                    className={s['ed-view-tab']}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      background: viewMode === 'ai' ? T.purpleDim : 'transparent',
                      color: viewMode === 'ai' ? T.purple : T.text3,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>AI整形</span>
                  </button>
                  <button
                    type="button"
                    title="AI整形との差分: マスク結果とAI整形後を並べて比較"
                    aria-label="AI整形との差分: マスク結果とAI整形後を並べて比較"
                    aria-pressed={viewMode === 'ai-diff'}
                    onClick={() => setViewMode('ai-diff')}
                    className={s['ed-view-tab']}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      background: viewMode === 'ai-diff' ? T.cyanDim : 'transparent',
                      color: viewMode === 'ai-diff' ? T.cyan : T.text3,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M6 2l1 3L10 6l-3 1L6 10 5 7 2 6l3-1z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M11 8v5a1 1 0 01-1 1H4"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M13 10l-2 2-2-2"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>AI整形との差分</span>
                  </button>
                </>
              )}
            </div>
            {!isLite && !showDiff && !showAiDiff && viewMode !== 'raw-diff' && !editMode && (
              <button
                data-intro="mask-toggle"
                type="button"
                title={
                  showRedacted
                    ? '元のテキストを表示する（マスクを一時的に外して見比べる）'
                    : 'マスク済みテキストに戻す'
                }
                aria-label="元文を表示"
                aria-pressed={!showRedacted}
                onClick={() => setShowRedacted(!showRedacted)}
                className={s['ed-view-tab']}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: showRedacted ? T.redDim : 'transparent',
                  color: showRedacted ? T.red : T.text3,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                }}
              >
                {showRedacted ? (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 2l12 12"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                    <path d="M6.5 6.5a2.5 2.5 0 003 3" stroke="currentColor" strokeWidth="1.2" />
                    <path
                      d="M2 7.5C3.3 5 5.5 3.5 8 3.5c1 0 1.9.2 2.8.6M14 7.5c-.6 1.2-1.4 2.2-2.4 3"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 3.5C5.5 3.5 3.3 5 2 7.5c1.3 2.5 3.5 4 6 4s4.7-1.5 6-4c-1.3-2.5-3.5-4-6-4z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <circle cx="8" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                )}
                <span>元文を表示</span>
              </button>
            )}
            {!isLite && (
              <button
                data-intro="edit-button"
                type="button"
                title="編集: テキストを直接編集してA4プレビューに即反映"
                aria-label={editMode ? '編集を終了' : '編集'}
                aria-pressed={editMode}
                onClick={() => {
                  if (!editMode) {
                    setEditedText(viewMode === 'ai' && aiResult ? aiResult : redacted)
                    setEditMode(true)
                    setPreviewVisible(true)
                  } else {
                    setEditMode(false)
                    setEditedText(null)
                  }
                }}
                className={s['ed-view-tab']}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: editMode ? T.accentDim : 'transparent',
                  color: editMode ? T.accent : T.text3,
                  borderRadius: 8,
                  border: `1px solid ${editMode ? T.accent : T.border}`,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M11.5 2.5l2 2L5 13H3v-2z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  <path d="M9.5 4.5l2 2" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <span>{editMode ? '編集を終了' : '編集'}</span>
              </button>
            )}
            {!isLite && (
              <>
                <div
                  style={{
                    width: 1,
                    height: 20,
                    background: T.border,
                    marginLeft: 4,
                    marginRight: 2,
                    flexShrink: 0,
                  }}
                />
                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  {LAYOUT_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      title={p.label}
                      aria-label={p.label}
                      onClick={() => applyLayoutPreset(p.id)}
                      style={{
                        padding: 3,
                        borderRadius: 4,
                        cursor: 'pointer',
                        border: `1px solid ${activePreset === p.id ? T.accent : 'transparent'}`,
                        background: activePreset === p.id ? T.accentDim : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <LayoutIcon cols={p.cols} active={activePreset === p.id} color={T.accent} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {/* 画像PDF警告（APIキー未設定でOCRスキップ時） */}
        {data.sparsePageCount > 0 &&
          data.page_count !== null &&
          data.page_count > 0 &&
          data.sparsePageCount / data.page_count >= 0.5 &&
          !apiKey && (
            <div
              style={{
                padding: '8px 14px',
                background: '#78350f18',
                borderBottom: `1px solid #92400e40`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: T.amber || '#f59e0b',
              }}
            >
              <span style={{ fontSize: 16 }}>&#9888;</span>
              <span>
                {data.sparsePageCount}/{data.page_count}
                ページがテキスト未検出（画像PDF）。
                {isLite ? 'Pro版に切り替えてAPIキーを登録すると' : '設定でAPIキーを登録すると'}
                AI OCRで画像からテキストを抽出できます。
              </span>
            </div>
          )}
        {/* カテゴリ別クイックトグル */}
        {viewMode === 'original' && !editMode && allCats.length > 0 && (
          <div
            data-intro="category-filter"
            style={{
              padding: '4px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              borderBottom: `1px solid ${T.border}`,
              background: T.bg2,
              flexWrap: 'wrap',
              flexShrink: 0,
            }}
          >
            <span
              style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginRight: 4 }}
              title="種類ごとにマスクをまとめてON/OFFできます"
            >
              カテゴリごとにマスク
            </span>
            {allCats.map((cat) => {
              const meta = CATEGORY_BY_ID[cat] || { label: cat, color: T.text2 }
              const cc = catCounts[cat] || { total: 0, enabled: 0 }
              const allOn = cc.enabled === cc.total
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={allOn}
                  title={
                    allOn
                      ? `${meta.label}のマスクをまとめて外す`
                      : `${meta.label}をまとめてマスクする`
                  }
                  onClick={() => setCatEnabled(cat, !allOn)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 5,
                    border: `1px solid ${allOn ? `${meta.color}30` : T.border}`,
                    background: allOn ? `${meta.color}14` : 'transparent',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: allOn ? 600 : 400,
                    fontFamily: T.font,
                    color: allOn ? meta.color : T.text3,
                    transition: 'all .15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      background: meta.color,
                      display: 'inline-block',
                    }}
                  />
                  {meta.label}
                  <span style={{ fontSize: 10, opacity: 0.7 }}>
                    ({cc.enabled}/{cc.total})
                  </span>
                </button>
              )
            })}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              title="すべての検出を有効にする"
              aria-label="すべてON"
              onClick={enableAll}
              style={{
                padding: '2px 8px',
                borderRadius: 5,
                border: `1px solid ${T.border}`,
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: T.font,
                color: T.text3,
              }}
            >
              すべてON
            </button>
            <button
              type="button"
              title="すべての検出を無効にする"
              aria-label="すべてOFF"
              onClick={disableAll}
              style={{
                padding: '2px 8px',
                borderRadius: 5,
                border: `1px solid ${T.border}`,
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: T.font,
                color: T.text3,
              }}
            >
              すべてOFF
            </button>
          </div>
        )}
        {advisorDraft ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <DiffView
              original={redacted}
              modified={advisorDraft}
              label="アドバイザー改善提案"
              modifiedLabel="改善提案"
            />
            <div
              style={{
                padding: '8px 14px',
                borderTop: `1px solid ${T.border}`,
                background: T.bg2,
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
                flexShrink: 0,
              }}
            >
              <button
                onClick={handleAdvisorDraftReject}
                style={{
                  padding: '6px 16px',
                  fontSize: 12,
                  fontWeight: 500,
                  color: T.text2,
                  background: 'transparent',
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: T.font,
                }}
              >
                却下
              </button>
              <button
                onClick={handleAdvisorDraftApply}
                style={{
                  padding: '6px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#fff',
                  background: T.green || '#22c55e',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: T.font,
                }}
              >
                取り込み
              </button>
            </div>
          </div>
        ) : showDiff ? (
          <DiffView
            original={data.text_preview}
            modified={applyRedaction(data.text_preview, detections, data.maskOpts)}
            label="マスキング変更"
          />
        ) : viewMode === 'raw-diff' && hasRawText ? (
          <DiffView
            original={data.rawText.slice(0, 8000)}
            modified={data.text_preview}
            label="AI テキスト再構成（抽出したまま → 整形後）"
          />
        ) : showAiDiff && aiResult ? (
          <DiffView
            original={applyRedaction(data.text_preview, detections, data.maskOpts)}
            modified={aiResult}
            label="AI整形変更"
          />
        ) : editMode ? (
          <div className={s['ed-edit-wrap']}>
            <div className={s['ed-edit-hint']}>
              <span style={{ fontWeight: 600, color: T.text2 }}>記法: </span>
              <code className={s['ed-edit-code']}>**太字**</code>
              <code className={s['ed-edit-code']} style={{ marginLeft: 6 }}>
                # 見出し
              </code>
              <code className={s['ed-edit-code']} style={{ marginLeft: 6 }}>
                ## 小見出し
              </code>
              <span style={{ opacity: 0.6, marginLeft: 8 }}>Markdown記法でA4プレビューに反映</span>
            </div>
            <textarea
              aria-label="Markdown編集"
              value={editedText ?? ''}
              onChange={(e) => setEditedText(e.target.value)}
              spellCheck={false}
              className={s['ed-edit-textarea']}
            />
          </div>
        ) : (
          <div className={s['ed-text-view']}>
            <pre className={s['ed-text-pre']}>
              {viewMode === 'original'
                ? renderTextWithDetectionAnchors(
                    data.text_preview,
                    detections,
                    data.maskOpts,
                    showRedacted,
                    focusDetId,
                    focusPulse,
                  )
                : renderText(displayText)}
            </pre>
          </div>
        )}
      </div>
      {/* Divider: Left ↔ Center */}
      {!isLite && previewVisible && (
        <div
          onMouseDown={startDrag('left')}
          role="separator"
          aria-label="ドラッグでパネル幅を調整"
          title="ドラッグでパネル幅を調整"
          className={s['ed-divider']}
        />
      )}
      {/* Center: A4 Preview Panel */}
      {!isLite &&
        (previewVisible ? (
          <div
            className="rp-editor-center"
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              background: '#e5e7eb',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* Preview toolbar */}
            <div className={s['ed-preview-toolbar']}>
              <span className={s['ed-preview-label']}>A4</span>
              {editMode && (
                <>
                  <button
                    onClick={() => setPreviewFontType('gothic')}
                    title="ゴシック体に切替"
                    aria-label="ゴシック体に切替"
                    className={s['ed-small-btn']}
                    style={{
                      border: `1px solid ${previewFontType === 'gothic' ? T.accent : T.border}`,
                      background: previewFontType === 'gothic' ? T.accentDim : 'transparent',
                      color: previewFontType === 'gothic' ? T.accent : T.text3,
                      fontWeight: previewFontType === 'gothic' ? 600 : 400,
                    }}
                  >
                    ゴシック
                  </button>
                  <button
                    onClick={() => setPreviewFontType('mincho')}
                    title="明朝体に切替"
                    aria-label="明朝体に切替"
                    className={s['ed-small-btn']}
                    style={{
                      border: `1px solid ${previewFontType === 'mincho' ? T.accent : T.border}`,
                      background: previewFontType === 'mincho' ? T.accentDim : 'transparent',
                      color: previewFontType === 'mincho' ? T.accent : T.text3,
                      fontWeight: previewFontType === 'mincho' ? 600 : 400,
                    }}
                  >
                    明朝
                  </button>
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
                <button
                  onClick={() => setPreviewZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))}
                  title="縮小"
                  aria-label="縮小"
                  className={s['ed-zoom-btn']}
                >
                  &minus;
                </button>
                <button
                  onClick={() => setPreviewZoom(1)}
                  title="ズームをリセット"
                  aria-label="ズームをリセット"
                  className={s['ed-zoom-label']}
                >
                  {Math.round(previewZoom * 100)}%
                </button>
                <button
                  onClick={() => setPreviewZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
                  title="拡大"
                  aria-label="拡大"
                  className={s['ed-zoom-btn']}
                >
                  +
                </button>
              </div>
              <span style={{ flex: 1 }} />
              {editMode && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={exportPrintPDF}
                    title="PDFとして印刷"
                    aria-label="PDFとして印刷"
                    className={s['ed-small-btn']}
                  >
                    PDF印刷
                  </button>
                  <button
                    onClick={exportHTML}
                    title="HTML形式でダウンロード"
                    aria-label="HTML形式でダウンロード"
                    className={s['ed-small-btn']}
                  >
                    HTML
                  </button>
                  <button
                    onClick={exportWord}
                    title="Word形式でダウンロード"
                    aria-label="Word形式でダウンロード"
                    className={s['ed-small-btn']}
                  >
                    Word
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowDesign(true)}
                title="全画面編集"
                aria-label="全画面編集"
                className={s['ed-small-icon-btn']}
              >
                &#x2197;
              </button>
              <button
                onClick={() => {
                  setPreviewVisible(false)
                  setLeftPct(null)
                  setRightPct(null)
                }}
                title="プレビューを閉じる"
                aria-label="プレビューを閉じる"
                className={s['ed-small-icon-btn']}
              >
                &#x276F;
              </button>
            </div>
            {/* Preview content */}
            {editMode ? (
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  display: 'flex',
                  justifyContent: 'center',
                  padding: 16,
                }}
              >
                <div style={{ width: Math.round(595 * previewZoom), flexShrink: 0 }}>
                  <div
                    style={{
                      width: 595,
                      minHeight: 842,
                      background: '#fff',
                      boxShadow: '0 4px 24px rgba(0,0,0,.12)',
                      borderRadius: 4,
                      transform: `scale(${previewZoom})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <iframe
                      srcDoc={previewHtml}
                      sandbox="allow-same-origin"
                      style={{
                        width: '100%',
                        minHeight: 842,
                        border: 'none',
                        pointerEvents: 'none',
                      }}
                      title="A4 Preview"
                      onLoad={fitIframeHeight}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <A4PreviewPanel
                text={aiResult || data.fullText || data.text_preview}
                detections={detections}
                maskOpts={data.maskOpts}
                focusDetId={focusDetId}
                focusPulse={focusPulse}
                onFocusDet={focusDetection}
                zoom={previewZoom}
              />
            )}
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label="A4プレビューを表示"
            onClick={() => {
              setPreviewVisible(true)
              setLeftPct(null)
              setRightPct(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setPreviewVisible(true)
                setLeftPct(null)
                setRightPct(null)
              }
            }}
            className={s['ed-collapsed-btn']}
            style={{ borderRight: `1px solid ${T.border}` }}
            title="A4プレビューを表示"
          >
            <span className={s['ed-collapsed-label']}>A4</span>
            <span style={{ fontSize: 14, color: T.text3, marginTop: 4 }}>&#x276E;</span>
          </div>
        ))}
      {/* Divider: Center ↔ Right (Pro only when A4 visible) */}
      {!isLite && !sidebarCollapsed && (
        <div
          onMouseDown={startDrag('right')}
          role="separator"
          aria-label="ドラッグでパネル幅を調整"
          title="ドラッグでパネル幅を調整"
          className={s['ed-divider']}
        />
      )}
      {/* Collapsed sidebar indicator */}
      {sidebarCollapsed && (
        <div
          role="button"
          tabIndex={0}
          aria-label="サイドバーを展開"
          onClick={() => {
            setSidebarCollapsed(false)
            setLeftPct(null)
            setRightPct(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setSidebarCollapsed(false)
              setLeftPct(null)
              setRightPct(null)
            }
          }}
          className={s['ed-collapsed-btn']}
          style={{ borderLeft: `1px solid ${T.border}` }}
          title="サイドバーを展開"
        >
          <span className={s['ed-collapsed-label']}>検出結果</span>
          <Badge
            color={enabledCount > 0 ? T.green : T.amber}
            bg={enabledCount > 0 ? T.greenDim : T.amberDim}
            style={{ writingMode: 'horizontal-tb', fontSize: 11, padding: '2px 6px' }}
          >
            {enabledCount}/{detections.length}
          </Badge>
          <span style={{ fontSize: 16, color: T.text3, marginTop: 4 }}>&#x276E;</span>
        </div>
      )}
      <div
        className={`rp-editor-right ${s['ed-sidebar']}`}
        style={{ display: sidebarCollapsed ? 'none' : 'flex' }}
      >
        {/* タブバー（Pro版: 検出結果 / アドバイザー） */}
        {!isLite && (
          <div
            style={{
              display: 'flex',
              borderBottom: `1px solid ${T.border}`,
              background: T.bg2,
              flexShrink: 0,
            }}
          >
            {(
              [
                {
                  id: 'detections',
                  label: '検出結果',
                  icon: '\u{1F4CB}',
                  badge: `${enabledCount}/${detections.length}`,
                },
                {
                  id: 'advisor',
                  label: 'アドバイザー',
                  icon: '\u{1F4AC}',
                  badge:
                    advisorMessages.length > 0
                      ? `${advisorMessages.filter((m) => m.role === 'assistant').length}`
                      : '',
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                data-intro={tab.id === 'advisor' ? 'advisor-tab' : undefined}
                onClick={() => setRightTab(tab.id)}
                className={s['ed-right-tab']}
                data-active={rightTab === tab.id ? 'true' : 'false'}
              >
                <span style={{ fontSize: 14 }}>{tab.icon}</span>
                {tab.label}
                {tab.badge && (
                  <span
                    className={s['ed-right-tab-badge']}
                    style={{
                      background: rightTab === tab.id ? T.accentDim : T.surface,
                      color: rightTab === tab.id ? T.accent : T.text3,
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
            {!isLite && (
              <button
                onClick={() => {
                  setSidebarCollapsed(true)
                  setLeftPct(null)
                  setRightPct(null)
                }}
                title="サイドバーを折りたたむ"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: T.text3,
                  fontSize: 14,
                  padding: '0 8px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                &#x276F;
              </button>
            )}
          </div>
        )}
        {/* 検出結果タブ */}
        <div
          style={{
            display: rightTab === 'detections' || isLite ? 'flex' : 'none',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <div className={s['ed-det-header']}>
            <div className={s['ed-det-top']} style={{ marginBottom: isLite ? 8 : 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isLite && (
                  <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>検出結果</span>
                )}
                <span style={{ fontSize: 13, color: T.text2, fontVariantNumeric: 'tabular-nums' }}>
                  {detections.length}件
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Badge
                  color={enabledCount > 0 ? T.green : T.amber}
                  bg={enabledCount > 0 ? T.greenDim : T.amberDim}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {enabledCount > 0 ? `${enabledCount}件をマスク` : 'マスクなし'}
                </Badge>
                {isLite && (
                  <button
                    onClick={() => {
                      setSidebarCollapsed(true)
                      setLeftPct(null)
                      setRightPct(null)
                    }}
                    title="サイドバーを折りたたむ"
                    aria-label="サイドバーを折りたたむ"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: T.text3,
                      fontSize: 16,
                      padding: '2px 4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    &#x276F;
                  </button>
                )}
              </div>
            </div>
            {showReviewHint && (
              <div className={s['ed-review-hint']} role="note">
                <span>
                  スイッチがオンの項目がマスクされます。残したい情報はオフにしてください。項目をクリックすると本文の該当箇所へ移動します。
                </span>
                <button
                  type="button"
                  onClick={dismissReviewHint}
                  aria-label="この案内を閉じる"
                  title="この案内を閉じる"
                  className={s['ed-review-hint-close']}
                >
                  ✕
                </button>
              </div>
            )}
            {isLite && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Btn
                  title="すべての検出を有効にする"
                  aria-label="すべてON"
                  variant="ghost"
                  onClick={enableAll}
                  style={{ padding: '3px 10px', fontSize: 12, borderRadius: 7 }}
                >
                  すべてON
                </Btn>
                <Btn
                  title="すべての検出を無効にする"
                  aria-label="すべてOFF"
                  variant="ghost"
                  onClick={disableAll}
                  style={{ padding: '3px 10px', fontSize: 12, borderRadius: 7 }}
                >
                  すべてOFF
                </Btn>
              </div>
            )}
            {!isLite && (
              <div
                data-intro="side-settings"
                role="button"
                tabIndex={0}
                onClick={() => setSideSettingsOpen((p) => !p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSideSettingsOpen((p) => !p)
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  margin: '8px -18px 8px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  background: sideSettingsOpen ? T.surface : 'transparent',
                  borderTop: `1px solid ${T.border}`,
                  borderBottom: `1px solid ${T.border}`,
                  transition: 'background .15s',
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: T.text,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      lineHeight: 1,
                      transition: 'transform .2s',
                      transform: sideSettingsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      display: 'inline-block',
                    }}
                  >
                    &#9654;
                  </span>
                  マスキング設定
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: sideSettingsOpen ? 'transparent' : T.accentDim,
                    border: sideSettingsOpen ? 'none' : `1px solid ${T.accent}40`,
                    color: sideSettingsOpen ? T.text3 : T.accent,
                    fontWeight: 500,
                  }}
                >
                  {sideSettingsOpen ? '閉じる' : '開く'}
                </span>
              </div>
            )}
            {!isLite && sideSettingsOpen && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: T.text3,
                      marginBottom: 6,
                      letterSpacing: 0.3,
                    }}
                  >
                    カテゴリ別マスキング
                  </div>
                  <div
                    className="rp-cat-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr',
                      gap: 4,
                    }}
                  >
                    {allCats.map((cat) => {
                      const meta = CATEGORY_BY_ID[cat] || {
                        label: cat,
                        color: T.text2,
                      }
                      const cc = catCounts[cat] || {
                        total: 0,
                        enabled: 0,
                      }
                      const allOn = cc.enabled === cc.total
                      return (
                        <div
                          key={cat}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: 8,
                            background: allOn ? `${meta.color}0A` : 'transparent',
                            border: `1px solid ${allOn ? `${meta.color}18` : 'transparent'}`,
                            transition: 'all .2s',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                background: meta.color,
                                display: 'inline-block',
                              }}
                            />
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                color: allOn ? T.text : T.text3,
                              }}
                            >
                              {meta.label}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: T.text3,
                              }}
                            >
                              ({cc.enabled}/{cc.total})
                            </span>
                          </div>
                          <Toggle
                            checked={allOn}
                            onChange={() => setCatEnabled(cat, !allOn)}
                            size="sm"
                            title={allOn ? 'このカテゴリを無効にする' : 'このカテゴリを有効にする'}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    flexWrap: 'wrap',
                    marginBottom: 6,
                  }}
                >
                  <Pill active={filterCat === 'all'} onClick={() => setFilterCat('all')}>
                    全て
                  </Pill>
                  {allCats.map((c) => {
                    const m = CATEGORY_BY_ID[c]
                    return m ? (
                      <Pill
                        key={c}
                        active={filterCat === c}
                        onClick={() => setFilterCat(c)}
                        color={m.color}
                      >
                        {m.label}
                      </Pill>
                    ) : null
                  })}
                </div>
                {allSrcs.length > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 4,
                      flexWrap: 'wrap',
                      marginBottom: 6,
                    }}
                  >
                    <Pill active={filterSrc === 'all'} onClick={() => setFilterSrc('all')}>
                      全ソース
                    </Pill>
                    {allSrcs.map((src) => (
                      <Pill key={src} active={filterSrc === src} onClick={() => setFilterSrc(src)}>
                        {src === 'regex'
                          ? '正規表現'
                          : src === 'dict'
                            ? '辞書'
                            : src === 'ai'
                              ? 'AI'
                              : src === 'heuristic'
                                ? '推定'
                                : 'NER'}
                      </Pill>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn
                    title="すべての検出を有効にする"
                    aria-label="すべてON"
                    variant="ghost"
                    onClick={enableAll}
                    style={{
                      padding: '3px 10px',
                      fontSize: 12,
                      borderRadius: 7,
                    }}
                  >
                    すべてON
                  </Btn>
                  <Btn
                    title="すべての検出を無効にする"
                    aria-label="すべてOFF"
                    variant="ghost"
                    onClick={disableAll}
                    style={{
                      padding: '3px 10px',
                      fontSize: 12,
                      borderRadius: 7,
                    }}
                  >
                    すべてOFF
                  </Btn>
                </div>
              </>
            )}
            {!isLite && (
              <div style={{ marginTop: 4, padding: '6px 0', borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                  <input
                    type="text"
                    value={editorCustomInput}
                    onChange={(e) => setEditorCustomInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editorCustomInput.trim()) {
                        e.preventDefault()
                        addCustomKeyword(editorCustomInput.trim())
                        setEditorCustomInput('')
                      }
                    }}
                    placeholder="+ カスタムキーワード追加"
                    aria-label="カスタムキーワード追加"
                    style={{
                      flex: 1,
                      padding: '5px 10px',
                      fontSize: 12,
                      borderRadius: 6,
                      border: `1px solid ${T.border}`,
                      background: 'transparent',
                      color: T.text,
                      outline: 'none',
                      minWidth: 0,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editorCustomInput.trim()) {
                        addCustomKeyword(editorCustomInput.trim())
                        setEditorCustomInput('')
                      }
                    }}
                    disabled={!editorCustomInput.trim()}
                    style={{
                      padding: '5px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: 'none',
                      background: editorCustomInput.trim()
                        ? CATEGORIES.custom.color
                        : 'transparent',
                      color: editorCustomInput.trim() ? '#fff' : T.text3,
                      cursor: editorCustomInput.trim() ? 'pointer' : 'default',
                      transition: 'all .2s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    追加
                  </button>
                </div>
                {(() => {
                  const ckws = detections.filter((d) => d.type === 'custom_keyword')
                  return ckws.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {ckws.map((d) => (
                        <span
                          key={d.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            background: d.enabled ? `${CATEGORIES.custom.color}18` : 'transparent',
                            color: d.enabled ? CATEGORIES.custom.color : T.text3,
                            border: `1px solid ${d.enabled ? `${CATEGORIES.custom.color}30` : T.border}`,
                            cursor: 'pointer',
                            transition: 'all .15s',
                          }}
                          onClick={() => toggle(d.id)}
                          title={d.enabled ? 'クリックで無効' : 'クリックで有効'}
                        >
                          {d.value}
                          <span style={{ fontSize: 8, opacity: 0.7 }}>{d.enabled ? '●' : '○'}</span>
                        </span>
                      ))}
                    </div>
                  ) : null
                })()}
              </div>
            )}
          </div>
          <div data-intro="detection-list" className={s['ed-det-list']}>
            {filtered.length === 0 ? (
              <div className={s['ed-det-empty']}>
                <p style={{ fontSize: 12 }}>該当する検出結果がありません</p>
              </div>
            ) : (
              Object.entries(grouped).map(([cat, items], gi) => {
                const meta = CATEGORY_BY_ID[cat] || {
                  label: cat,
                  color: T.text2,
                }
                const catOpen = !closedCats.has(cat)
                return (
                  <div
                    key={cat}
                    style={{
                      marginBottom: 4,
                      animation: `slideIn .25s ease ${gi * 0.03}s both`,
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleCatAccordion(cat)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleCatAccordion(cat)
                        }
                      }}
                      className={s['ed-cat-header']}
                      style={{ color: meta.color }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          transition: 'transform .15s',
                          transform: catOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                          display: 'inline-block',
                          lineHeight: 1,
                        }}
                      >
                        &#9654;
                      </span>
                      <span className={s['ed-cat-dot']} style={{ background: meta.color }} />
                      {meta.label} ({items.length})
                    </div>
                    {catOpen &&
                      items.map((item) => (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => focusDetection(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              focusDetection(item.id)
                            }
                          }}
                          aria-label={`${item.value} - 本文の該当箇所へジャンプ`}
                          title="クリックで本文の該当箇所へジャンプ"
                          className={s['ed-det-item']}
                          style={{
                            background: item.enabled ? `${meta.color}0D` : 'transparent',
                            border: `1px solid ${item.enabled ? `${meta.color}1A` : 'transparent'}`,
                            boxShadow:
                              focusDetId === item.id
                                ? '0 0 0 2px rgba(76,133,246,.35), 0 0 0 8px rgba(76,133,246,.10)'
                                : 'none',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                marginBottom: 1,
                              }}
                            >
                              {item.source === 'dict' && (
                                <Badge
                                  color={T.red}
                                  bg={T.redDim}
                                  style={{
                                    fontSize: 12,
                                    padding: '0px 5px',
                                  }}
                                >
                                  辞書
                                </Badge>
                              )}
                              {item.source === 'ai' && (
                                <Badge
                                  color={T.purple}
                                  bg={T.purpleDim}
                                  style={{
                                    fontSize: 12,
                                    padding: '0px 5px',
                                  }}
                                >
                                  AI
                                </Badge>
                              )}
                              {item.source === 'heuristic' && (
                                <Badge
                                  color={T.amber}
                                  bg={T.amberDim}
                                  style={{
                                    fontSize: 12,
                                    padding: '0px 5px',
                                  }}
                                >
                                  推定
                                </Badge>
                              )}
                              {/* 確度は「要確認」のときだけ示す（高確度の印は情報量が無いので出さない） */}
                              {item.confidence && item.confidence < 0.9 && (
                                <Badge
                                  color={T.warn}
                                  bg={T.amberDim}
                                  style={{
                                    fontSize: 11,
                                    padding: '0px 5px',
                                  }}
                                >
                                  要確認
                                </Badge>
                              )}
                            </div>
                            <div
                              className={s['ed-det-value']}
                              data-enabled={item.enabled ? 'true' : 'false'}
                              style={{ color: item.enabled ? T.text : T.text3 }}
                            >
                              {item.value}
                            </div>
                          </div>
                          <Toggle
                            checked={item.enabled}
                            onChange={() => toggle(item.id)}
                            size="sm"
                            title={item.enabled ? 'この検出を無効にする' : 'この検出を有効にする'}
                          />
                        </div>
                      ))}
                  </div>
                )
              })
            )}
          </div>
          <div data-intro="export-buttons" className={s['ed-footer']}>
            <div className={s['ed-btn-row']}>
              <Btn
                data-intro="go-format"
                aria-label="次へ: 整える"
                title={
                  isLite
                    ? 'A4プレビューで仕上がりを確認する'
                    : 'A4プレビューでレイアウトを整える（AI整形・PDF編集もこちら）'
                }
                onClick={goFormat}
                style={{ flex: 1, borderRadius: 10, fontSize: 13, background: T.accent }}
              >
                次へ: 整える
              </Btn>
              <Btn
                title="マスク済みテキストをクリップボードにコピー"
                aria-label="コピー"
                variant="ghost"
                onClick={handleCopy}
                aria-live="polite"
                style={{
                  borderRadius: 10,
                  padding: '11px 18px',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? '\u2713 コピー済み' : 'コピー'}
              </Btn>
            </div>
            <div className={s['ed-btn-row']}>
              {!isLite && (
                <Btn
                  data-intro="detection-report"
                  title="検出結果の詳細レポートを表示"
                  variant="ghost"
                  onClick={() =>
                    setPreview({
                      title: '検出レポート',
                      content: buildCsv(),
                      baseName: `pii_report_${fileTimestamp()}`,
                    })
                  }
                  style={{
                    flex: 1,
                    fontSize: 13,
                    padding: '9px 12px',
                    borderRadius: 8,
                  }}
                >
                  検出レポート
                </Btn>
              )}
              <Btn
                title="ファイル選択画面に戻る（現在の検出結果は破棄されます）"
                aria-label="最初からやり直す"
                variant="ghost"
                onClick={() => {
                  if (window.confirm('最初からやり直しますか？現在の検出結果は破棄されます。'))
                    onReset()
                }}
                style={{
                  fontSize: 13,
                  padding: '9px 12px',
                  borderRadius: 8,
                }}
              >
                最初からやり直す
              </Btn>
            </div>
          </div>
        </div>
        {/* /検出結果タブ */}
        {/* アドバイザータブ（Pro版のみ） */}
        {!isLite && rightTab === 'advisor' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* プライバシー注意 */}
            {advisorMessages.length === 0 && (
              <div
                style={{
                  padding: '8px 14px',
                  background: T.accentDim,
                  borderBottom: `1px solid ${T.border}`,
                  fontSize: 11,
                  color: T.text2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 13 }}>&#8505;</span>
                <span>AI APIに送信されますが、各社の規約により学習データには使用されません。</span>
              </div>
            )}
            {/* コストアラート */}
            {advisorCostAlert === 'daily-warn' && (
              <div
                style={{
                  padding: '8px 14px',
                  background: '#dc262618',
                  borderBottom: `1px solid #dc262640`,
                  fontSize: 11,
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 14 }}>&#x26D4;</span>
                <span>
                  本日の利用コストが{advisorCost.daily.toFixed(1)}
                  円に達しました（上限目安:
                  50円）。引き続き利用する場合は設定画面で自身のAPIキーを登録してください。
                </span>
              </div>
            )}
            {advisorCostAlert === 'daily-alert' && (
              <div
                style={{
                  padding: '8px 14px',
                  background: '#78350f18',
                  borderBottom: `1px solid #92400e40`,
                  fontSize: 11,
                  color: T.amber || '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 14 }}>&#9888;</span>
                <span>
                  本日の利用コスト: {advisorCost.daily.toFixed(1)}円 /
                  50円（日次上限に近づいています）
                </span>
              </div>
            )}
            {/* モデルモード切替 + コスト表示 */}
            <div
              style={{
                padding: '6px 14px',
                borderBottom: `1px solid ${T.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: T.text3,
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>モデル:</span>
                {(['auto', 'manual'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setAdvisorModelMode(m)}
                    title={
                      m === 'auto'
                        ? '質問内容に応じてモデルを自動選択'
                        : '使用するモデルを手動で固定'
                    }
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: advisorModelMode === m ? 600 : 400,
                      color: advisorModelMode === m ? T.accent : T.text3,
                      background: advisorModelMode === m ? T.accentDim : 'transparent',
                      border: `1px solid ${advisorModelMode === m ? T.accent + '40' : T.border}`,
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {m === 'auto' ? 'Auto' : '固定'}
                  </button>
                ))}
                {advisorModelMode === 'auto' && advisorLastModel && (
                  <span style={{ color: T.text2 }}>{advisorLastModel}</span>
                )}
              </div>
              {advisorCost.count > 0 && (
                <span style={{ color: T.text3 }}>
                  {advisorCost.count}回 約{advisorCost.session.toFixed(1)}円
                </span>
              )}
              {aiRateLimit && !apiKey && (
                <span
                  style={{ color: aiRateLimit.remaining <= 5 ? '#f59e0b' : T.text3 }}
                  title={`サーバー共用キーの利用状況（24時間で${aiRateLimit.limit}回まで）。自身のAPIキーを設定すると無制限。`}
                >
                  {aiRateLimit.limit - aiRateLimit.remaining}/{aiRateLimit.limit}回使用
                </span>
              )}
            </div>
            {/* プリセット質問 */}
            {advisorMessages.length === 0 && (
              <>
                {/* クイック分析（スクロール領域） */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {/* マスク済み送信トグル */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      padding: '4px 0',
                    }}
                  >
                    <span
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: 32,
                        height: 18,
                        borderRadius: 9,
                        background: advisorUseRedacted ? T.green || '#059669' : T.surfaceAlt,
                        transition: 'background .2s',
                        flexShrink: 0,
                      }}
                      onClick={(e) => {
                        e.preventDefault()
                        setAdvisorUseRedacted((p) => !p)
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: 2,
                          left: advisorUseRedacted ? 16 : 2,
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          background: '#fff',
                          transition: 'left .2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                        }}
                      />
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>
                      マスク済みテキストで分析
                    </span>
                  </label>
                  <div style={{ fontSize: 10, color: T.text3, lineHeight: 1.4 }}>
                    {advisorUseRedacted
                      ? 'ON: 個人情報をマスクしてAIに送信（フリーランス向け）'
                      : 'OFF: 元テキストで高精度分析（正社員紹介向け）'}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: T.text,
                      marginTop: 4,
                      marginBottom: 2,
                    }}
                  >
                    クイック分析
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {(advisorPresets || [])
                      .filter((p) => p.id !== 'job-match' && p.id !== 'rewrite-full')
                      .map((p) => (
                        <button
                          key={p.id}
                          disabled={advisorLoading}
                          onClick={() => handleAdvisorPreset(p)}
                          title={p.desc}
                          style={{
                            padding: '6px 8px',
                            fontSize: 11,
                            fontWeight: 500,
                            color: T.text,
                            background: T.surface,
                            border: `1px solid ${T.border}`,
                            borderRadius: 6,
                            cursor: advisorLoading ? 'wait' : 'pointer',
                            textAlign: 'left',
                            transition: 'all .15s',
                            opacity: advisorLoading ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                          onMouseEnter={(e) => {
                            if (!advisorLoading) e.currentTarget.style.borderColor = T.accent
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = T.border
                          }}
                        >
                          {p.icon && (
                            <span style={{ fontSize: 13, opacity: 0.7, flexShrink: 0 }}>
                              {p.icon}
                            </span>
                          )}
                          {p.label}
                        </button>
                      ))}
                  </div>
                  {/* 求人票マッチング展開 */}
                  {showJobInput && (
                    <div style={{ marginTop: 4 }}>
                      <div
                        style={{ fontSize: 10, color: T.text3, lineHeight: 1.4, marginBottom: 4 }}
                      >
                        求人票テキストを貼り付けて、経歴書との適合度を分析します。
                      </div>
                      <textarea
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        placeholder="求人票のテキストを貼り付け..."
                        style={{
                          width: '100%',
                          minHeight: 60,
                          maxHeight: 120,
                          padding: '6px 8px',
                          fontSize: 11,
                          color: T.text,
                          background: T.surface,
                          border: `1px solid ${T.border}`,
                          borderRadius: 6,
                          resize: 'vertical',
                          fontFamily: 'inherit',
                          lineHeight: 1.5,
                        }}
                      />
                      <button
                        onClick={() => {
                          const jm = (advisorPresets || []).find((p) => p.id === 'job-match')
                          if (jm) handleAdvisorPreset(jm)
                        }}
                        disabled={advisorLoading || !jobDescription.trim()}
                        style={{
                          marginTop: 4,
                          width: '100%',
                          padding: '5px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          color: !jobDescription.trim() ? T.text3 : '#fff',
                          background: !jobDescription.trim() ? T.surface : T.accent,
                          border: `1px solid ${!jobDescription.trim() ? T.border : T.accent}`,
                          borderRadius: 6,
                          cursor:
                            !jobDescription.trim() || advisorLoading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        マッチング分析を実行
                      </button>
                      <div style={{ fontSize: 9, color: T.text3, lineHeight: 1.4, marginTop: 4 }}>
                        {advisorUseRedacted
                          ? '個人情報はマスク済みでAIに送信されます。求人票はそのまま送信されます。'
                          : '経歴書は元テキストのまま送信されます。個人情報を保護する場合は上のトグルをONに。'}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            {/* チャット履歴 */}
            <div
              style={{
                flex: advisorMessages.length > 0 || advisorLoading ? 1 : 0,
                overflowY: 'auto',
                padding: advisorMessages.length > 0 || advisorLoading ? '12px 14px' : '0 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {advisorMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    fontSize: 13,
                    lineHeight: 1.7,
                    background: msg.role === 'user' ? T.accentDim : T.surface,
                    color: T.text,
                    border: `1px solid ${msg.role === 'user' ? T.accent + '30' : T.border}`,
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '95%',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.role === 'user' ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(msg.content) }} />
                  )}
                </div>
              ))}
              {advisorLoading && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    fontSize: 13,
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    color: T.text2,
                    alignSelf: 'flex-start',
                  }}
                >
                  <span style={{ display: 'inline-block', animation: 'pulse 1.5s infinite' }}>
                    分析中...
                  </span>
                </div>
              )}
              <div ref={advisorEndRef} />
            </div>
            {advisorDraft && (
              <div
                style={{
                  fontSize: 10,
                  color: '#22c55e',
                  fontWeight: 500,
                  textAlign: 'center',
                  padding: '0 14px 4px',
                  borderTop: `1px solid ${T.border}`,
                }}
              >
                差分プレビューを左パネルに表示中
              </div>
            )}
            {/* モード切替タブ + 入力欄 */}
            <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, background: T.bg2 }}>
              <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}` }}>
                {(
                  [
                    {
                      id: 'question',
                      label: '質問',
                      icon: '\u{1F4AC}',
                      desc: 'AIアドバイザーに相談（経歴書は変更されません）',
                    },
                    {
                      id: 'rewrite',
                      label: '指示 → 経歴書に反映',
                      icon: '\u270F\uFE0F',
                      desc: '指示を元にAIが経歴書を改善 → 差分プレビューで確認',
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    title={tab.desc}
                    onClick={() => setAdvisorInputMode(tab.id)}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      fontSize: 11,
                      fontWeight: advisorInputMode === tab.id ? 700 : 500,
                      color:
                        advisorInputMode === tab.id
                          ? tab.id === 'rewrite'
                            ? '#22c55e'
                            : T.accent
                          : T.text3,
                      background: advisorInputMode === tab.id ? T.bg : 'transparent',
                      border: 'none',
                      borderBottom:
                        advisorInputMode === tab.id
                          ? `2px solid ${tab.id === 'rewrite' ? '#22c55e' : T.accent}`
                          : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'all .15s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
              <div
                style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-end' }}
              >
                <textarea
                  rows={2}
                  value={advisorInput}
                  onChange={(e) => setAdvisorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      if (advisorInputMode === 'rewrite') {
                        handleAdvisorRewriteFull(advisorInput.trim() || undefined)
                        setAdvisorInput('')
                      } else {
                        handleAdvisorSend()
                      }
                    }
                  }}
                  placeholder={
                    advisorInputMode === 'rewrite'
                      ? '改善の指示を入力...（例: 技術スタックを最新に絞る）'
                      : '質問を入力...（例: この経歴書の強みは？）'
                  }
                  disabled={advisorLoading || advisorDraftLoading}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: T.text,
                    background: T.surface,
                    border: `1px solid ${advisorInputMode === 'rewrite' ? '#22c55e40' : T.border}`,
                    borderRadius: 8,
                    outline: 'none',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    minHeight: 48,
                    lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={() => {
                    if (advisorInputMode === 'rewrite') {
                      handleAdvisorRewriteFull(advisorInput.trim() || undefined)
                      setAdvisorInput('')
                    } else {
                      handleAdvisorSend()
                    }
                  }}
                  disabled={
                    advisorInputMode === 'rewrite'
                      ? advisorDraftLoading
                      : advisorLoading || !advisorInput.trim()
                  }
                  title={
                    advisorInputMode === 'rewrite'
                      ? '経歴書を改善（差分プレビューで確認）'
                      : '質問を送信'
                  }
                  style={{
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#fff',
                    background:
                      advisorInputMode === 'rewrite'
                        ? advisorDraftLoading
                          ? T.text3
                          : '#15803d'
                        : !advisorInput.trim() || advisorLoading
                          ? T.text3
                          : C.green,
                    border: 'none',
                    borderRadius: 8,
                    cursor: (
                      advisorInputMode === 'rewrite'
                        ? advisorDraftLoading
                        : advisorLoading || !advisorInput.trim()
                    )
                      ? 'not-allowed'
                      : 'pointer',
                  }}
                >
                  {advisorInputMode === 'rewrite'
                    ? advisorDraftLoading
                      ? '生成中...'
                      : '改善'
                    : '送信'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* /.rp-editor-right */}
      {showAI && (
        <AIPanel
          redactedText={redacted}
          apiKey={apiKey}
          model={model}
          onApply={(t) => {
            setAiResult(t)
            setViewMode('ai')
            setShowAI(false)
          }}
          onClose={() => setShowAI(false)}
        />
      )}
      {showDesign && (
        <DesignExportModal
          text={
            editMode
              ? (editedText ?? redacted)
              : viewMode === 'ai' && aiResult
                ? aiResult
                : redacted
          }
          apiKey={apiKey}
          model={model}
          baseName={baseName}
          onClose={() => setShowDesign(false)}
        />
      )}
      {preview && (
        <PreviewModal
          title={preview.title}
          content={preview.content}
          baseName={preview.baseName}
          editable={preview.editable}
          meta={preview.meta}
          onClose={() => setPreview(null)}
          onContentChange={preview.onContentChange}
        />
      )}
    </div>
  )
}
