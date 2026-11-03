'use client'

/**
 * 設定モーダル
 *
 * テーマ・エディション（Lite/Pro）・AI プロバイダー/モデル/品質プロファイル・API キー・
 * スクレイピング用プロキシ・ローカル AI エンドポイントを編集し、保存時に rp_* キーで永続化する。
 * Lite では AI 関連の設定欄を fieldset ごと無効化して表示する。
 */
import { useEffect, useState, type CSSProperties } from 'react'
import s from '@/app/redact-pro.module.css'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { callAI } from '@/lib/ai/client'
import { errorMessage } from '@/lib/ai/error-message'
import { pickFormatModelForProfile } from '@/lib/ai/models'
import type { AppSettings, Edition } from '@/lib/app-types'
import { AI_PROVIDERS } from '@/lib/constants'
import {
  buildConnectionOkMessage,
  getKeyPlaceholder,
  isRateInfo,
  maskApiKey,
  rateUsagePercent,
  type RateInfo,
} from '@/lib/settings-helpers'
import { clearAllSiteData, storage } from '@/lib/storage'
import { T } from '@/lib/theme'
import { Btn, Toggle } from '@/components/redact/ui'

export interface SettingsModalProps {
  settings: AppSettings
  onSave: (settings: AppSettings) => void
  onClose: () => void
  isDark: boolean
  setIsDark: (isDark: boolean) => void
  isLite: boolean
  edition: Edition
  switchEdition: (edition: Edition) => void
}

interface KeyTestResult {
  ok: boolean
  msg: string
}

const PROFILES = [
  { id: 'speed', label: '速度', desc: '最速・低コスト' },
  { id: 'balanced', label: 'バランス', desc: '検出は速く、整形は高品質' },
  { id: 'quality', label: '品質', desc: '高品質（遅め）' },
]

const EDITIONS: Edition[] = ['lite', 'pro']

/** CSS カスタムプロパティ（--provider-color）は CSSProperties の型に無いため、ここで広げて渡す */
function providerColorStyle(color: string, extra?: CSSProperties): CSSProperties {
  return { '--provider-color': color, ...extra } as CSSProperties
}

export function SettingsModal({
  settings,
  onSave,
  onClose,
  isDark,
  setIsDark,
  isLite,
  edition,
  switchEdition,
}: SettingsModalProps) {
  const trapRef = useFocusTrap()
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const [provider, setProvider] = useState(settings.provider || 'openai')
  const [model, setModel] = useState(settings.model || 'gpt-6-luna')
  const [apiKey, setApiKey] = useState(settings.apiKey || '')
  const [aiDetect, setAiDetect] = useState(settings.aiDetect !== false)
  const [aiProfile, setAiProfile] = useState(settings.aiProfile || 'balanced')
  const [proxyUrl, setProxyUrl] = useState(settings.proxyUrl || '')
  const [localEndpoint, setLocalEndpoint] = useState(
    settings.localEndpoint || 'http://localhost:11434/v1',
  )
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [keyTest, setKeyTest] = useState<KeyTestResult | null>(null)
  const [rateInfo, setRateInfo] = useState<RateInfo | null>(null)
  useEffect(() => {
    fetch('/api/ai')
      .then((r) => r.json())
      .then((d: unknown) => {
        if (isRateInfo(d)) setRateInfo(d)
      })
      .catch(() => {
        // 利用状況は補助表示なので、取れなければ「未設定時 50 回」の説明文にフォールバックする
      })
  }, [])
  const safeSet = async (key: string, val: string) => {
    await storage.set(key, val)
  }
  const handleSave = () => {
    onSave({ apiKey, model, aiDetect, aiProfile, provider, proxyUrl, localEndpoint })
    void (async () => {
      await safeSet('rp_api_key', apiKey)
      await safeSet('rp_model', model)
      await safeSet('rp_ai_detect', String(aiDetect))
      await safeSet('rp_ai_profile', aiProfile)
      await safeSet('rp_provider', provider)
      await safeSet('rp_proxy_url', proxyUrl)
      await safeSet('rp_local_endpoint', localEndpoint)
      await safeSet('rp_theme', isDark ? 'dark' : 'light')
    })()
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 600)
  }
  const curProv = AI_PROVIDERS.find((p) => p.id === provider) || AI_PROVIDERS[0]
  const masked = maskApiKey(apiKey)
  // When switching provider, auto-select default model
  const switchProvider = (pid: string) => {
    setProvider(pid)
    setModel(pickFormatModelForProfile(pid, aiProfile, !!apiKey.trim()) || 'gpt-6-luna')
  }
  const keyPlaceholder = getKeyPlaceholder(provider)
  const requiresKey = provider === 'google'
  useEffect(() => {
    setKeyTest(null)
  }, [provider, model, apiKey])
  useEffect(() => {
    const hasKey = !!apiKey.trim()
    // Provider list may change defaults; if current model isn't in provider, snap to profile default.
    if (!curProv.models.some((m) => m.id === model)) {
      setModel(pickFormatModelForProfile(provider, aiProfile, hasKey) || 'gpt-6-luna')
      return
    }
    // APIキー未入力で needsUserKey モデルが選択中ならデフォルトにフォールバック
    const cur = curProv.models.find((m) => m.id === model)
    if (cur?.needsUserKey && !hasKey) {
      setModel(
        pickFormatModelForProfile(provider, aiProfile, false) ||
          curProv.defaultModel ||
          'gpt-6-luna',
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- model の手動選択では走らせない（provider/プロファイル/キーが変わったときだけ整合を取る）
  }, [provider, aiProfile, apiKey])
  const testApiConnection = async () => {
    const key = apiKey.trim()
    if (requiresKey && !key) {
      setKeyTest({
        ok: false,
        msg: 'このプロバイダーはAPIキーが必須です。先にキーを入力してください。',
      })
      return
    }
    setTestingKey(true)
    setKeyTest(null)
    try {
      const text = await callAI({
        provider,
        model,
        apiKey: key || undefined,
        // ローカルAIは設定中のエンドポイントをそのまま検証する
        localEndpoint: provider === 'local' ? localEndpoint.trim() || undefined : undefined,
        maxTokens: 32,
        messages: [
          {
            role: 'user',
            content: '接続テストです。`OK` だけ返答してください。',
          },
        ],
      })
      setKeyTest({
        ok: true,
        msg: buildConnectionOkMessage({
          provider,
          providerLabel: curProv.label,
          model,
          localEndpoint,
          reply: text,
        }),
      })
    } catch (e: unknown) {
      setKeyTest({
        ok: false,
        msg: `接続失敗: ${errorMessage(e) || '不明なエラー'}`,
      })
    } finally {
      setTestingKey(false)
    }
  }
  return (
    <div
      className={s['modal-overlay']}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={trapRef}
        className={`rp-modal-inner ${s['settings-dialog']}`}
        role="dialog"
        aria-modal="true"
        aria-label="設定"
      >
        <div className={s['modal-header']}>
          <span className={s['modal-header-title']}>設定</span>
          <button onClick={onClose} aria-label="閉じる" className={s['modal-close-btn']}>
            ✕
          </button>
        </div>
        <div className={s['settings-body']}>
          {/* Theme */}
          <div className={s['settings-row']}>
            <div className={s['settings-row-left']}>
              <span style={{ fontSize: 16 }}>{isDark ? '🌙' : '☀️'}</span>
              <div>
                <div className={s['settings-label']}>テーマ</div>
                <div className={s['settings-sublabel']}>
                  {isDark ? 'ダークモード' : 'ライトモード（デフォルト）'}
                </div>
              </div>
            </div>
            <Toggle checked={isDark} onChange={() => setIsDark(!isDark)} size="sm" />
          </div>
          {/* エディション切替 */}
          <div className={s['settings-row']}>
            <div>
              <div className={s['settings-label']}>エディション</div>
              <div className={s['settings-sublabel-lh']}>
                {isLite
                  ? 'Lite — 基本的なマスキング機能'
                  : 'Pro — AI検出・アドバイザー・再フォーマット等を含む全機能'}
              </div>
              <div className={s['settings-edition-pro-note']}>
                Pro版は現在無料でご利用いただけます
              </div>
            </div>
            <div className={s['settings-edition-btns']}>
              {EDITIONS.map((ed) => (
                <button
                  key={ed}
                  onClick={() => switchEdition(ed)}
                  className={s['settings-edition-btn']}
                  data-active={edition === ed}
                >
                  {ed === 'lite' ? 'Lite' : 'Pro'}
                </button>
              ))}
            </div>
          </div>
          {/* ─── Pro版設定（Liteではdisabledで表示） ─── */}
          {isLite && (
            <div
              className={s['settings-lite-notice']}
              style={{ background: `${T.accent}10`, border: `1px solid ${T.accent}30` }}
            >
              以下のAI設定はPro版に切り替えると有効になります。
            </div>
          )}
          <fieldset disabled={isLite} className={s['settings-fieldset']} data-disabled={isLite}>
            {/* Provider */}
            <div>
              <div className={s['settings-section-title']}>AIプロバイダー</div>
              <div className={s['settings-section-desc']}>
                AI機能（PII検出・再フォーマット・アドバイザー）で使用するAIサービスを選択します。
              </div>
              <div className={s['settings-provider-grid']}>
                {AI_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => switchProvider(p.id)}
                    className={s['settings-provider-btn']}
                    data-active={provider === p.id}
                    style={providerColorStyle(p.color)}
                  >
                    <div
                      className={s['settings-provider-icon']}
                      data-active={provider === p.id}
                      style={provider === p.id ? { color: p.color } : undefined}
                    >
                      {p.icon}
                    </div>
                    <div
                      className={s['settings-provider-name']}
                      data-active={provider === p.id}
                      style={provider === p.id ? { color: p.color } : undefined}
                    >
                      {p.label}
                    </div>
                    {p.needsKey && <div className={s['settings-provider-note']}>要APIキー</div>}
                  </button>
                ))}
              </div>
            </div>
            {/* Models */}
            <div>
              <div className={s['settings-section-title']}>
                モデル <span style={{ fontWeight: 400, color: T.text3 }}>— {curProv.label}</span>
              </div>
              <div className={s['settings-section-desc-lg']}>
                {aiProfile === 'balanced' && (
                  <>再フォーマット/再構成はこのモデル。PII検出は高速モデルを自動選択します。</>
                )}
                {aiProfile === 'speed' && <>全て高速モデル寄りで実行します（品質より速度優先）。</>}
                {aiProfile === 'quality' && (
                  <>可能な限り高品質モデルで実行します（遅くなります）。</>
                )}
              </div>
              <div
                className="rp-settings-models"
                style={{
                  display: 'grid',
                  gridTemplateColumns: curProv.models.length <= 2 ? '1fr 1fr' : '1fr 1fr 1fr',
                  gap: 6,
                }}
              >
                {curProv.models.map((m) => {
                  const locked = m.needsUserKey && !apiKey.trim()
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        if (!locked) setModel(m.id)
                      }}
                      className={s['settings-model-btn']}
                      data-active={model === m.id}
                      disabled={locked}
                      title={locked ? 'APIキーを入力すると使用できます' : m.desc}
                      style={providerColorStyle(
                        curProv.color,
                        locked ? { opacity: 0.45, cursor: 'not-allowed' } : {},
                      )}
                    >
                      <div
                        className={s['settings-model-label']}
                        data-active={model === m.id}
                        style={model === m.id ? { color: curProv.color } : undefined}
                      >
                        {m.label}
                        {locked ? ' 🔒' : ''}
                      </div>
                      <div className={s['settings-model-desc']}>
                        {locked ? 'APIキー必須' : m.desc}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
            {/* AI profile */}
            <div>
              <div className={s['settings-section-title']}>AI品質プロファイル</div>
              <div className={s['settings-section-desc']}>
                AI処理の速度と品質のバランスを選択します。コスト（API利用料）に影響します。
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {PROFILES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setAiProfile(p.id)
                      setModel(pickFormatModelForProfile(provider, p.id, !!apiKey.trim()) || model)
                    }}
                    className={s['settings-profile-btn']}
                    data-active={aiProfile === p.id}
                    style={providerColorStyle(curProv.color)}
                  >
                    <div
                      className={s['settings-profile-label']}
                      data-active={aiProfile === p.id}
                      style={aiProfile === p.id ? { color: curProv.color } : undefined}
                    >
                      {p.label}
                    </div>
                    <div className={s['settings-profile-desc']}>{p.desc}</div>
                  </button>
                ))}
              </div>
              <div className={s['settings-profile-hint']}>
                バランス推奨: <span className={s['settings-mono']}>PII検出=高速</span> /{' '}
                <span className={s['settings-mono']}>再構成・再フォーマット=高品質</span>
                （例: OpenAIなら GPT-6 Luna を使用）
              </div>
            </div>
            {/* AI detect toggle */}
            <div className={s['settings-row']}>
              <div>
                <div className={s['settings-label']}>AI PII検出</div>
                <div className={s['settings-sublabel-lh']}>
                  アップロード時にAIで人名を追加検出。正規表現では拾えない名前をカバーします。無効にすると正規表現＋辞書のみで検出します。
                </div>
              </div>
              <Toggle checked={aiDetect} onChange={() => setAiDetect(!aiDetect)} size="sm" />
            </div>
            {/* API Key */}
            <div>
              <div className={s['settings-section-title']} style={{ marginBottom: 4 }}>
                API Key
              </div>
              <div className={s['settings-section-desc']}>
                {provider === 'openai'
                  ? '未入力時はサーバー共用キーを使用（24時間50回まで）。自分のAPIキーを入力すると無制限に利用できます。'
                  : provider === 'google'
                    ? 'APIキーが必須です。下のボタンで接続テストできます。'
                    : 'APIキー不要。ローカルAIサーバーへの接続を下のボタンでテストできます。'}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  aria-label="APIキー"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={keyPlaceholder}
                  className={s['settings-input-apikey']}
                />
                <button onClick={() => setShowKey(!showKey)} className={s['settings-show-key-btn']}>
                  {showKey ? '隠す' : '表示'}
                </button>
              </div>
              {apiKey && !showKey && <div className={s['settings-masked-key']}>{masked}</div>}
              <div className={s['settings-key-actions']}>
                <Btn
                  variant="ghost"
                  onClick={testApiConnection}
                  disabled={testingKey}
                  style={{ padding: '6px 12px', fontSize: 12, borderRadius: 7 }}
                >
                  {testingKey
                    ? '接続テスト中...'
                    : provider === 'local'
                      ? 'ローカルAI接続テスト'
                      : 'API接続テスト'}
                </Btn>
                <span aria-live="polite" aria-atomic="true">
                  {keyTest && (
                    <span
                      className={s['settings-key-result']}
                      style={{ color: keyTest.ok ? T.green : T.red }}
                    >
                      {keyTest.msg}
                    </span>
                  )}
                </span>
              </div>
            </div>
            {/* Proxy URL for URL scraping */}
            <div>
              <div className={s['settings-section-title']} style={{ marginBottom: 4 }}>
                スクレイピング用プロキシURL{' '}
                <span style={{ fontWeight: 400, color: T.text3 }}>(任意)</span>
              </div>
              <div className={s['settings-section-desc-lg']}>
                URLタブでWebページ本文を取るときに使う「中継サーバー」のURLです。
                <br />
                例:{' '}
                <span className={s['settings-mono']}>
                  https://your-proxy.example.com/fetch?url={'{url}'}
                </span>
                （<span className={s['settings-mono']}>{'{url}'}</span> は取得対象URLに自動置換）
                <br />
                通常はサーバー経由で自動取得されるため、設定不要です。独自の中継サーバーがある場合のみ入力してください。
              </div>
              <input
                aria-label="スクレイピングプロキシURL"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="https://your-proxy.example.com/fetch?url={url}"
                className={s['settings-input']}
              />
              {!proxyUrl && (
                <div className={s['settings-sublabel-lh']} style={{ marginTop: 6 }}>
                  未設定でOK — サーバー経由で自動取得します。
                </div>
              )}
              {proxyUrl && !proxyUrl.includes('{url}') && (
                <div style={{ fontSize: 12, color: T.red, marginTop: 6, lineHeight: 1.5 }}>
                  ⚠ プロキシURLに {'{url}'} がありません。対象URLを渡せないため正しく動作しません。
                </div>
              )}
            </div>
            {/* ローカルAI設定 */}
            {provider === 'local' && (
              <div>
                <div className={s['settings-section-title']} style={{ marginBottom: 4 }}>
                  ローカルAIエンドポイント
                </div>
                <div className={s['settings-section-desc-lg']}>
                  Ollama、LM Studio、LocalAI等のOpenAI互換APIエンドポイントを指定します。
                  ローカルで動作するためデータが外部に送信されず、利用回数の制限もありません。
                </div>
                <input
                  aria-label="ローカルAIエンドポイント"
                  value={localEndpoint}
                  onChange={(e) => setLocalEndpoint(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className={s['settings-input']}
                />
                <div
                  className={s['settings-section-desc-lg']}
                  style={{ marginTop: 6, marginBottom: 0 }}
                >
                  Ollama: <span className={s['settings-mono']}>http://localhost:11434/v1</span>
                  <br />
                  LM Studio: <span className={s['settings-mono']}>http://localhost:1234/v1</span>
                  <br />
                  モデル名はサーバー側で設定されたデフォルトが使用されます。
                </div>
              </div>
            )}
          </fieldset>
          {/* 利用制限 */}
          <div className={s['settings-card']}>
            <div className={s['settings-card-title']}>利用制限（サーバー共用キー）</div>
            {rateInfo && !apiKey ? (
              <div style={{ marginBottom: 6 }}>
                <div className={s['settings-rate-bar-wrap']}>
                  <div className={s['settings-rate-bar']}>
                    <div
                      style={{
                        width: `${rateUsagePercent(rateInfo)}%`,
                        height: '100%',
                        borderRadius: 3,
                        background:
                          rateInfo.used >= rateInfo.limit
                            ? T.red
                            : rateInfo.used >= rateInfo.limit * 0.8
                              ? '#f59e0b'
                              : T.accent,
                        transition: 'width .3s',
                      }}
                    />
                  </div>
                  <span
                    className={s['settings-rate-count']}
                    style={{ color: rateInfo.used >= rateInfo.limit ? T.red : T.text }}
                  >
                    {rateInfo.used} / {rateInfo.limit} 回使用
                  </span>
                </div>
                <div className={s['settings-sublabel-lh']}>
                  24時間あたり{rateInfo.limit}回まで（IP単位）。残り {rateInfo.remaining} 回
                </div>
              </div>
            ) : apiKey ? (
              <div className={s['settings-card-text']} style={{ color: T.green }}>
                自分のAPIキーを使用中 — 利用回数の制限はありません。
              </div>
            ) : (
              <div className={s['settings-card-text']}>
                APIキー未設定時: AI機能は24時間あたり50回まで（IP単位）。
              </div>
            )}
            {!apiKey && (
              <div className={s['settings-sublabel-lh']} style={{ marginTop: 4 }}>
                自分のAPIキーを設定すると無制限に利用できます。
              </div>
            )}
          </div>
          {/* プライバシー */}
          <div className={s['settings-card']}>
            <div className={s['settings-card-title']}>プライバシー</div>
            <div className={s['settings-card-text']}>
              Lite版はファイルの読み取りから検出・マスキングまでブラウザ内で完結し、サーバーに送信しません。Pro版はAI機能（検出・OCR・整形・アドバイザー）と、文字を取り出しにくいPDFの文字抽出のときだけサーバーへ送信します。サーバーやデータベースにデータは保存されません（各社AI
              APIは学習データとして使用しません）。
            </div>
          </div>
          <div className={s['settings-footer']}>
            <Btn
              variant="ghost"
              onClick={() => {
                if (
                  !confirm(
                    'すべての設定を初期値に戻しますか？\n（テーマ・AIプロバイダー・モデル・APIキー・プロファイルをデフォルトに戻します。アップロード済みのファイルデータには影響しません）',
                  )
                )
                  return
                setProvider('openai')
                setModel('gpt-6-luna')
                setApiKey('')
                setAiDetect(true)
                setAiProfile('balanced')
                setProxyUrl('')
                setLocalEndpoint('http://localhost:11434/v1')
              }}
              title="AIプロバイダー・モデル・APIキーなどの設定を初期値に戻します。ファイルデータには影響しません。"
              style={{ padding: '8px 16px', fontSize: 12, borderRadius: 8, color: T.red }}
            >
              設定リセット
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => {
                if (
                  !confirm(
                    'サイトデータを完全に消去して初期化しますか？\n\nLocalStorage・IndexedDB・キャッシュがすべて削除され、ページがリロードされます。\nAPIキー・テーマ設定・ツアー完了状態など、ブラウザに保存されたすべてのデータが消去されます。',
                  )
                )
                  return
                void clearAllSiteData()
              }}
              title="ブラウザに保存されたすべてのデータ（設定・APIキー・キャッシュ等）を完全に消去してページをリロードします。"
              style={{
                padding: '8px 16px',
                fontSize: 12,
                borderRadius: 8,
                marginRight: 'auto',
                color: T.red,
                border: `1px solid ${T.red}44`,
              }}
            >
              全データ削除
            </Btn>
            {apiKey && (
              <Btn
                variant="ghost"
                onClick={() => setApiKey('')}
                style={{ padding: '8px 16px', fontSize: 12, borderRadius: 8 }}
              >
                消去
              </Btn>
            )}
            <Btn
              variant={saved ? 'success' : 'primary'}
              onClick={handleSave}
              aria-live="polite"
              style={{ padding: '8px 20px', fontSize: 12, borderRadius: 8 }}
            >
              {saved ? '✓ 保存済' : '保存'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
