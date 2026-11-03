'use client'

/**
 * AI 再フォーマットパネル
 *
 * マスキング済みテキストをプリセット／自由指示で AI に組み直させる。
 * 低ティアのモデルで空応答や失敗になったときは、同じプロバイダーの上位ティアで 1 回だけ再試行する。
 */
import { useState } from 'react'
import s from '@/app/redact-pro.module.css'
import { errorMessage } from '@/lib/ai/error-message'
import { getModelTier, getPreferredTierModel, getProviderMaxTier } from '@/lib/ai/models'
import { aiReformat } from '@/lib/ai/tasks'
import { AI_MODELS, getProviderForModel } from '@/lib/constants'
import { fileTimestamp } from '@/lib/export'
import { Btn } from '@/components/redact/ui'
import { PreviewModal } from '@/components/redact/PreviewModal'

export interface AIPanelProps {
  redactedText: string
  apiKey: string
  model: string
  onApply: (text: string) => void
  onClose: () => void
}

const PRESETS = [
  {
    label: '推薦書フォーマット',
    prompt:
      '人材紹介会社が企業に提出する推薦書フォーマットに変換。(1)職務要約（3行）(2)スキルセット (3)職務経歴（直近3社）(4)強み・適性',
  },
  {
    label: 'スキルシート',
    prompt:
      'IT業界のスキルシート形式に変換。(1)基本情報 (2)技術スキル（言語/FW/DB/OS）(3)プロジェクト経歴（期間・規模・役割・環境・工程）',
  },
  {
    label: '英語翻訳',
    prompt: '英語に翻訳。マスキング部分は[Name Redacted]等に変換。欧米式レジュメ形式で。',
  },
  { label: '300字要約', prompt: '300字以内で要約。経験年数、主要スキル、直近の実績を簡潔に。' },
]

export function AIPanel({ redactedText, apiKey, model, onApply, onClose }: AIPanelProps) {
  const [instruction, setInstruction] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const gen = async (p?: string) => {
    const q = p || instruction
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    setResult('')

    const providerId = getProviderForModel(model)
    const tier = getModelTier(providerId, model) || 1
    const maxTier = getProviderMaxTier(providerId)
    const hasKey = !!apiKey
    const fallbackModel =
      tier <= 1 ? getPreferredTierModel(providerId, Math.min(2, maxTier), hasKey) : null

    try {
      const out = await aiReformat(redactedText, q, apiKey, model)
      const trimmed = (out || '').trim()
      if (trimmed) {
        setResult(trimmed)
        return
      }

      if (fallbackModel && fallbackModel !== model) {
        const fbOut = await aiReformat(redactedText, q, apiKey, fallbackModel)
        const fbTrim = (fbOut || '').trim()
        if (fbTrim) {
          setResult(fbTrim)
          return
        }
      }
      setError('AIの応答が空でした。モデルを変更するか、指示を短くして再実行してください。')
    } catch (e: unknown) {
      if (fallbackModel && fallbackModel !== model) {
        try {
          const fbOut = await aiReformat(redactedText, q, apiKey, fallbackModel)
          const fbTrim = (fbOut || '').trim()
          if (fbTrim) {
            setResult(fbTrim)
            return
          }
        } catch {
          // フォールバックも失敗したら、利用者には最初のエラーを見せる
        }
      }
      setError(errorMessage(e) ?? null)
    } finally {
      setLoading(false)
    }
  }
  const curModel = AI_MODELS.find((m) => m.id === model) || AI_MODELS[1]
  return (
    <>
      <div className={s['ai-overlay']}>
        <div className={s['ai-dialog']}>
          <div className={s['ai-header']}>
            <div>
              <div className={s['ai-title']}>AI 再フォーマット</div>
              <div className={s['ai-model-info']}>
                Model: {curModel.label} -- マスキング維持のまま形式変換
              </div>
            </div>
            <button onClick={onClose} className={s['modal-close-btn']}>
              x
            </button>
          </div>
          <div className={s['ai-body']}>
            <div className={s['ai-label']}>プリセット</div>
            <div className={s['ai-presets']}>
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInstruction(p.prompt)
                    void gen(p.prompt)
                  }}
                  className={s['ai-preset-btn']}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className={s['ai-label']}>カスタム指示</div>
            <div className={s['ai-custom-row']}>
              <textarea
                aria-label="カスタム指示"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="例: 箇条書きで技術スキルを整理し..."
                className={s['ai-textarea']}
              />
              <Btn
                onClick={() => void gen()}
                disabled={loading || !instruction.trim()}
                style={{
                  alignSelf: 'flex-end',
                  borderRadius: 10,
                }}
              >
                生成
              </Btn>
            </div>
            {error && <div className={s['ai-error']}>! {error}</div>}
            {loading && (
              <div className={s['ai-loading']}>
                <div className={s['ai-loading-spinner']} />
                <p className={s['ai-loading-text']}>AIが再フォーマット中... ({curModel.label})</p>
              </div>
            )}
            {result && !loading && (
              <div>
                <div className={s['ai-result-header']}>
                  <span className={s['ai-result-title']}>生成結果</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn
                      variant="ghost"
                      onClick={() => setShowPreview(true)}
                      style={{
                        padding: '5px 12px',
                        fontSize: 12,
                        borderRadius: 7,
                      }}
                    >
                      プレビュー / 保存
                    </Btn>
                    <Btn
                      variant="success"
                      onClick={() => onApply(result)}
                      style={{
                        padding: '5px 12px',
                        fontSize: 12,
                        borderRadius: 7,
                      }}
                    >
                      適用して閉じる
                    </Btn>
                  </div>
                </div>
                <pre className={s['ai-result-pre']}>{result}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
      {showPreview && (
        <PreviewModal
          title="AI 整形結果"
          content={result}
          baseName={`ai_formatted_${fileTimestamp()}`}
          onClose={() => setShowPreview(false)}
          onContentChange={(newText: string) => {
            setResult(newText)
          }}
        />
      )}
    </>
  )
}
