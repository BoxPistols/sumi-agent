'use client'

/**
 * Sumi のアプリ本体（ヘッダー・ステップバー・画面の切り替え・モーダル）
 *
 * 画面ごとの処理は src/components/redact/、検出・マスキング・取り込み・書き出しの
 * ロジックは src/lib/ にある。ここではエディション（Lite/Pro）と画面遷移の状態だけを持つ。
 */
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import s from './redact-pro.module.css'
import { StepFlowBar } from '@/components/StepFlowBar'
import { BatchErrorView, BatchProcessingView } from '@/components/redact/BatchViews'
import { ChatWidget } from '@/components/redact/ChatWidget'
import { EditorScreen } from '@/components/redact/EditorScreen'
import { FileTabBar } from '@/components/redact/FileTabBar'
import { HelpModal } from '@/components/redact/HelpModal'
import { SettingsModal } from '@/components/redact/SettingsModal'
import { ShortcutsModal } from '@/components/redact/ShortcutsModal'
import { UploadScreen } from '@/components/redact/UploadScreen'
import { Badge } from '@/components/redact/ui'
import { useBatchFiles } from '@/hooks/useBatchFiles'
import { usePersistedPreferences } from '@/hooks/usePersistedPreferences'
import { onRateLimitUpdate } from '@/lib/ai/client'
import type { AnalysisResult, Edition } from '@/lib/app-types'
import { AI_PROVIDERS } from '@/lib/constants'
import {
  FLOW_EVENT_ANALYZING,
  FLOW_EVENT_EXPORT_STATE,
  FLOW_EVENT_MODE_STATE,
  FLOW_EVENT_SET_EXPORT,
  FLOW_EVENT_SET_MODE,
  getCurrentFlowStep,
  type FlowStepId,
} from '@/lib/flow-steps'
import { storage } from '@/lib/storage'
import { C, T } from '@/lib/theme'
import { launchTour } from '@/lib/tour'
import type { MaskConfig } from '@/lib/ui-config'

/** サーバー共用キーの利用状況（GET /api/ai と AI 応答のヘッダーから更新） */
interface AiUsage {
  used: number
  limit: number
  remaining: number
  resetAt: number
}

export default function App() {
  const [data, setData] = useState<AnalysisResult | null>(null)
  const batchAddRef = useRef<HTMLInputElement>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const { edition, setEdition, isDark, setIsDark, settings, setSettings } =
    usePersistedPreferences()
  const isLite = edition === 'lite'
  const switchEdition = useCallback(
    (id: Edition) => {
      setEdition(id)
      try {
        localStorage.setItem('rp_edition', id)
      } catch {
        // 保存できなくても今の画面の切り替えは効く
      }
      if (id === 'pro') {
        const done = localStorage.getItem('rp_tour_pro_done')
        if (!done) {
          setTimeout(async () => {
            try {
              const { PRO_SWITCH_STEPS, LS_TOUR_PRO_DONE } = await import('@/lib/intro-steps')
              await launchTour(PRO_SWITCH_STEPS, LS_TOUR_PRO_DONE)
            } catch (e) {
              console.warn('pro tour failed:', e)
            }
          }, 500)
        }
      }
    },
    [setEdition],
  )
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null)
  useEffect(() => {
    fetch('/api/ai')
      .then((r) => r.json())
      .then((d: Partial<AiUsage>) => {
        if (typeof d.used === 'number') setAiUsage(d as AiUsage)
      })
      .catch(() => {})
    return onRateLimitUpdate((rl) =>
      setAiUsage((prev) => {
        const used = rl.limit - rl.remaining
        return prev
          ? { ...prev, used, remaining: rl.remaining, resetAt: rl.resetAt || prev.resetAt }
          : { used, limit: rl.limit, remaining: rl.remaining, resetAt: rl.resetAt || 0 }
      }),
    )
  }, [])
  const [showWelcome, setShowWelcome] = useState(false)

  // オンボーディングツアー（画面に応じてUpload/Editorを自動判定）
  const startTour = useCallback(() => {
    setTimeout(async () => {
      try {
        const mod = await import('@/lib/intro-steps')
        if (data) {
          const steps = isLite ? mod.EDITOR_STEPS_LITE : mod.EDITOR_STEPS_PRO
          await launchTour(steps, null)
        } else {
          const steps = isLite ? mod.UPLOAD_STEPS_LITE : mod.UPLOAD_STEPS_PRO
          await launchTour(steps, null)
        }
      } catch (e) {
        console.warn('intro.js tour failed:', e)
      }
    }, 400)
  }, [isLite, data])

  const handleWelcomeClose = useCallback(() => {
    setShowWelcome(false)
    try {
      localStorage.setItem('rp_onboarding_done', '1')
    } catch {
      // 記録できなくても次回ボタンから開くだけなので無視する
    }
  }, [])

  const handleWelcomeStartTour = useCallback(() => {
    setShowWelcome(false)
    try {
      localStorage.setItem('rp_onboarding_done', '1')
    } catch {
      // 同上
    }
    startTour()
  }, [startTour])

  // グローバルキーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 入力要素フォーカス中は無効
      const active = document.activeElement
      const tag = active?.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (active instanceof HTMLElement && active.isContentEditable)
      )
        return
      // モーダル表示中はEsc以外無効
      if (e.key === 'Escape') return // Escは各モーダルの独自ハンドラーに任せる
      if (showSettings || showHelp || showWelcome || showShortcuts) return
      // 修飾キー付きはブラウザのデフォルトに任せる
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case 'd':
        case 'D':
          e.preventDefault()
          setIsDark((p) => {
            const next = !p
            storage.set('rp_theme', next ? 'dark' : 'light')
            return next
          })
          break
        case '?':
          e.preventDefault()
          setShowHelp(true)
          break
        case ',':
          e.preventDefault()
          setShowSettings(true)
          break
        case 'k':
        case 'K':
          e.preventDefault()
          setShowShortcuts(true)
          break
        case 'e':
        case 'E':
          e.preventDefault()
          switchEdition(edition === 'lite' ? 'pro' : 'lite')
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showSettings, showHelp, showWelcome, showShortcuts, edition, switchEdition, setIsDark])

  const curProv = AI_PROVIDERS.find((p) => p.id === settings.provider) || AI_PROVIDERS[0]
  const curModel = curProv.models.find((m) => m.id === settings.model) || curProv.models[0]

  const {
    batchFiles,
    setBatchFiles,
    activeFileIdx,
    setActiveFileIdx,
    handleBatchSubmit,
    handleBatchExport,
  } = useBatchFiles(settings, isLite)

  const goHome = useCallback(() => {
    // Abort all in-progress batch processing
    for (const f of batchFiles) f.abortController?.abort()
    if (typeof window !== 'undefined') {
      window.location.assign('./')
      return
    }
    setData(null)
    setBatchFiles([])
    setActiveFileIdx(0)
  }, [batchFiles, setBatchFiles, setActiveFileIdx])

  const handleBatchAddFiles = useCallback(() => {
    batchAddRef.current?.click()
  }, [])

  const batchMode = batchFiles.length > 0
  const activeFile = batchFiles[activeFileIdx]

  // ── ステップフローバー連携 ──
  const [exportOpen, setExportOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [flowFormatMode, setFlowFormatMode] = useState(false)
  useEffect(() => {
    const onExportState = (e: Event) =>
      setExportOpen(!!(e as CustomEvent<{ open?: boolean }>).detail?.open)
    const onAnalyzing = (e: Event) =>
      setAnalyzing(!!(e as CustomEvent<{ active?: boolean }>).detail?.active)
    const onModeState = (e: Event) =>
      setFlowFormatMode((e as CustomEvent<{ mode?: string }>).detail?.mode === 'format')
    window.addEventListener(FLOW_EVENT_EXPORT_STATE, onExportState)
    window.addEventListener(FLOW_EVENT_ANALYZING, onAnalyzing)
    window.addEventListener(FLOW_EVENT_MODE_STATE, onModeState)
    return () => {
      window.removeEventListener(FLOW_EVENT_EXPORT_STATE, onExportState)
      window.removeEventListener(FLOW_EVENT_ANALYZING, onAnalyzing)
      window.removeEventListener(FLOW_EVENT_MODE_STATE, onModeState)
    }
  }, [])
  const hasFlowData = !!data || batchMode
  // バッチ処理中（編集画面が未表示）はエクスポートプレビューを開けない
  const canFlowExport = !!data || (batchMode && activeFile?.status === 'done' && !!activeFile?.data)
  const flowStep = getCurrentFlowStep({
    hasData: hasFlowData,
    exportOpen,
    formatMode: flowFormatMode,
  })
  const handleFlowStepClick = useCallback(
    (id: FlowStepId) => {
      if (id === 'input') {
        if (hasFlowData && window.confirm('最初からやり直しますか？現在の検出結果は破棄されます。'))
          goHome()
        return
      }
      if (!hasFlowData) return
      if ((id === 'format' || id === 'export') && !canFlowExport) return
      if (id === 'export') {
        window.dispatchEvent(new CustomEvent(FLOW_EVENT_SET_EXPORT, { detail: { open: true } }))
        return
      }
      // review / format: エクスポートを閉じて対象モードへ切替
      window.dispatchEvent(new CustomEvent(FLOW_EVENT_SET_EXPORT, { detail: { open: false } }))
      window.dispatchEvent(
        new CustomEvent(FLOW_EVENT_SET_MODE, {
          detail: { mode: id === 'format' ? 'format' : 'review' },
        }),
      )
    },
    [hasFlowData, canFlowExport, goHome],
  )

  const editions: { id: Edition; label: string; sub: string }[] = [
    { id: 'lite', label: 'Lite', sub: 'シンプル' },
    { id: 'pro', label: 'Pro', sub: '全機能' },
  ]

  return (
    <div
      data-theme={isDark ? 'dark' : 'light'}
      className={s['app-root']}
      style={{ fontFamily: T.font, background: T.bg, color: T.text }}
    >
      <header className={`rp-header ${s['app-header']}`}>
        <nav aria-label="グローバルナビゲーション" className={s['app-nav']}>
          <a href="./" aria-label="トップページへ戻る" className={s['app-logo-link']}>
            <div className={s['app-logo-icon']}>
              <div className={s['app-logo-bar1']} />
              <div className={s['app-logo-bar2']} />
            </div>
            <span className={s['app-logo-text']}>Sumi</span>
          </a>
          <div
            data-intro="header-edition-toggle"
            role="radiogroup"
            aria-label="エディション切替"
            className={s['app-edition-toggle']}
          >
            {editions.map((ed) => (
              <button
                key={ed.id}
                role="radio"
                aria-checked={edition === ed.id}
                onClick={() => switchEdition(ed.id)}
                onMouseEnter={(e) => {
                  if (edition !== ed.id) e.currentTarget.style.background = T.surfaceAlt
                }}
                onMouseLeave={(e) => {
                  if (edition !== ed.id) e.currentTarget.style.background = 'transparent'
                }}
                className={s['app-edition-btn']}
                style={{
                  background:
                    edition === ed.id ? (ed.id === 'pro' ? C.accent : T.text3) : 'transparent',
                  color: edition === ed.id ? '#fff' : T.text2,
                }}
              >
                {ed.label}
                <span
                  className={s['app-edition-sub']}
                  style={{ opacity: edition === ed.id ? 0.85 : 0.6 }}
                >
                  {ed.sub}
                </span>
              </button>
            ))}
          </div>
        </nav>
        <div className={s['app-header-right']}>
          <div className={`rp-header-badges ${s['app-header-badges']}`}>
            {(data || batchMode) && (
              <Badge color={T.accent} bg={T.accentDim}>
                検出{' '}
                {batchMode
                  ? `${batchFiles.reduce((sum, f) => sum + (f.data?.detections?.filter((d) => d.enabled).length || 0), 0)}件 (${batchFiles.filter((f) => f.status === 'done').length}/${batchFiles.length})`
                  : `${data?.detections.filter((d) => d.enabled).length}件`}
              </Badge>
            )}
            {/* AI関連バッジは Pro のみ（Lite は AI を使わない） */}
            {!isLite && settings.aiDetect && (
              <Badge
                color={C.purple}
                bg={C.purpleDim}
                style={{ cursor: 'help' }}
                title="AI検出がオンです。設定でオフにできます"
              >
                AI検出 ON
              </Badge>
            )}
            {!isLite && aiUsage && !settings.apiKey && (
              <Badge
                color={aiUsage.remaining <= 5 ? '#f59e0b' : T.text3}
                bg={aiUsage.remaining <= 5 ? '#f59e0b20' : T.surfaceAlt}
                style={{ cursor: 'help', fontVariantNumeric: 'tabular-nums' }}
                title={`サーバー共用AI: ${aiUsage.used}/${aiUsage.limit}回使用済み${aiUsage.resetAt ? `（リセット: ${new Date(aiUsage.resetAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）` : ''}\n自分のAPIキーを設定すると無制限に利用できます。`}
              >
                AI 残り{Math.max(0, aiUsage.remaining)}回
                {aiUsage.resetAt > 0 && aiUsage.used > 0 && (
                  <span style={{ opacity: 0.7, marginLeft: 4, fontSize: 10 }}>
                    {(() => {
                      const h = Math.max(0, Math.ceil((aiUsage.resetAt - Date.now()) / 3600000))
                      return h > 0 ? `${h}h後リセット` : 'リセット済'
                    })()}
                  </span>
                )}
              </Badge>
            )}
          </div>
          <button
            title="ダークモード切替"
            aria-label="ダークモード切替"
            onClick={() => {
              const next = !isDark
              setIsDark(next)
              storage.set('rp_theme', next ? 'dark' : 'light')
            }}
            className={s['app-icon-btn']}
            data-type="theme"
          >
            {isDark ? '☀️' : '🌙'}
          </button>
          <button
            title="キーボードショートカット"
            aria-label="キーボードショートカット一覧"
            onClick={() => setShowShortcuts(true)}
            className={s['app-icon-btn']}
            data-type="kbd"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h8" />
            </svg>
          </button>
          <button
            title="ヘルプ"
            aria-label="ヘルプを表示"
            onClick={() => setShowHelp(true)}
            className={s['app-icon-btn']}
            data-type="help"
          >
            ?
          </button>
          <button
            data-intro="settings-button"
            title="設定"
            aria-label="設定"
            onClick={() => setShowSettings(true)}
            className={s['app-settings-btn']}
          >
            {!isLite && (
              <span className={s['app-settings-dot']} style={{ background: curProv.color }} />
            )}
            <span>
              {isLite
                ? '設定'
                : settings.aiProfile === 'balanced'
                  ? 'Auto'
                  : curModel?.label || '設定'}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>
      <StepFlowBar
        current={flowStep}
        hasData={hasFlowData}
        analyzing={analyzing}
        canExport={canFlowExport}
        isLite={isLite}
        onStepClick={handleFlowStepClick}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!isLite && batchMode ? (
          <>
            <input
              aria-label="バッチファイル追加"
              ref={batchAddRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.xlsx,.xls,.ods,.csv,.txt,.tsv,.md,.markdown,.html,.htm,.rtf,.json,.odt"
              style={{ display: 'none' }}
              onChange={(e) => {
                const fl = e.target.files
                if (!fl || fl.length === 0) return
                let ck: string[] = []
                try {
                  const ckStr =
                    typeof window !== 'undefined' ? localStorage.getItem('rp_custom_keywords') : ''
                  if (ckStr) {
                    const parsed: unknown = JSON.parse(ckStr)
                    if (Array.isArray(parsed)) ck = parsed
                  }
                } catch {
                  // 壊れた保存値はキーワードなしとして扱う
                }
                handleBatchSubmit(
                  Array.from(fl),
                  (activeFile?.data?.maskOpts || {}) as MaskConfig,
                  ck,
                )
              }}
            />
            <FileTabBar
              files={batchFiles}
              activeIdx={activeFileIdx}
              onSelect={setActiveFileIdx}
              onRemove={(i) => {
                batchFiles[i]?.abortController?.abort()
                setBatchFiles((prev) => {
                  const n = [...prev]
                  n.splice(i, 1)
                  return n
                })
                if (activeFileIdx >= batchFiles.length - 1)
                  setActiveFileIdx(Math.max(0, batchFiles.length - 2))
              }}
              onBatchExport={handleBatchExport}
              onAddFiles={handleBatchAddFiles}
            />
            {activeFile?.status === 'done' && activeFile.data ? (
              <EditorScreen
                key={activeFile.id}
                data={activeFile.data}
                onReset={goHome}
                apiKey={settings.apiKey}
                model={settings.model}
              />
            ) : activeFile?.status === 'processing' ? (
              <BatchProcessingView file={activeFile} />
            ) : activeFile?.status === 'error' ? (
              <BatchErrorView file={activeFile} />
            ) : activeFile?.status === 'queued' ? (
              <BatchProcessingView file={{ ...activeFile, stage: '処理待機中...' }} />
            ) : null}
          </>
        ) : data ? (
          <EditorScreen
            data={data}
            onReset={goHome}
            apiKey={settings.apiKey}
            model={settings.model}
            isLite={isLite}
          />
        ) : (
          <UploadScreen
            onAnalyze={setData}
            onSubmitBatch={handleBatchSubmit}
            settings={settings}
            isLite={isLite}
            onSwitchPro={() => switchEdition('pro')}
            onShowVideo={() => setShowWelcome(true)}
          />
        )}
      </main>
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(next) => setSettings(next)}
          onClose={() => setShowSettings(false)}
          isDark={isDark}
          setIsDark={setIsDark}
          isLite={isLite}
          edition={edition}
          switchEdition={switchEdition}
        />
      )}
      {showHelp && (
        <HelpModal
          onClose={() => setShowHelp(false)}
          onStartTour={() => {
            setShowHelp(false)
            startTour()
          }}
          onShowVideo={() => {
            setShowHelp(false)
            setShowWelcome(true)
          }}
        />
      )}
      {showShortcuts && (
        <ShortcutsModal
          onClose={() => setShowShortcuts(false)}
          hasEditorContext={!!data || batchMode}
        />
      )}
      {!isLite && !data && !batchMode && <ChatWidget />}
      {showWelcome && (
        <WelcomeVideoModalWrapper
          onClose={handleWelcomeClose}
          onStartTour={handleWelcomeStartTour}
        />
      )}
      <footer className={s['app-footer']}>
        <span>© {new Date().getFullYear()} Sumi</span>
        <span>|</span>
        <span
          className={s['app-footer-privacy']}
          title="Lite版は個人情報をブラウザの外に出しません。Pro版ではAI機能と、文字を取り出しにくいPDFのサーバー抽出を使うときだけ送信します（保存はせず、一時ファイルは処理後に削除）。AIへ送った内容は各社のAPI利用規約によりトレーニングには使用されません。"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          個人情報はブラウザの外に出ません
        </span>
        <a
          href="https://github.com/BoxPistols/sumi-agent"
          target="_blank"
          rel="noopener noreferrer"
          className={s['app-footer-link']}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          GitHub
        </a>
      </footer>
    </div>
  )
}

interface WelcomeVideoModalProps {
  onClose: () => void
  onStartTour?: () => void
}

// WelcomeVideoModal を dynamic import でロード（SSR回避）
function WelcomeVideoModalWrapper({ onClose, onStartTour }: WelcomeVideoModalProps) {
  const [Comp, setComp] = useState<ComponentType<WelcomeVideoModalProps> | null>(null)
  useEffect(() => {
    import('@/components/remotion/WelcomeVideoModal').then((m) =>
      setComp(() => m.WelcomeVideoModal),
    )
  }, [])
  if (!Comp) return null
  return <Comp onClose={onClose} onStartTour={onStartTour} />
}
