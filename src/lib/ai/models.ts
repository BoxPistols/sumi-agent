/**
 * AI モデルの選び分け
 *
 * 設定の「品質プロファイル」（speed / balanced / quality）とユーザーキーの有無から、
 * 整形用・検出用それぞれのモデルとフォールバック先を決める。
 */
import { AI_PROVIDERS, getProviderForModel, type AIProvider } from '@/lib/constants'

export type AIProfile = 'speed' | 'balanced' | 'quality'

/** モデル選択に必要な設定だけを抜き出した形（画面の設定 state はこれを満たす） */
export interface AIModelSettings {
  provider?: string
  model?: string
  aiProfile?: string
  apiKey?: string
}

export interface ModelsForRun {
  providerId: string
  profile: string
  detectModel: string
  detectFallbackModel: string | null
  formatModel: string
  formatFallbackModel: string | null
}

export function getProviderConfig(providerId: string): AIProvider | null {
  return AI_PROVIDERS.find((p) => p.id === providerId) || null
}

export function getProviderMaxTier(providerId: string): number {
  const prov = getProviderConfig(providerId)
  if (!prov || prov.models.length === 0) return 1
  return Math.max(...prov.models.map((m) => m.tier || 1))
}

export function getPreferredTierModel(
  providerId: string,
  tier: number,
  hasKey: boolean,
): string | null {
  const prov = getProviderConfig(providerId)
  if (!prov || prov.models.length === 0) return null
  const candidates = prov.models.filter(
    (m) => (m.tier || 1) === tier && (hasKey !== false || !m.needsUserKey),
  )
  if (candidates.length === 0) return null
  return candidates[candidates.length - 1].id
}

export function getModelTier(providerId: string, modelId: string): number | null {
  const prov = getProviderConfig(providerId)
  const m = prov?.models.find((mm) => mm.id === modelId)
  return m?.tier || null
}

export function pickFormatModelForProfile(
  providerId: string,
  profile: string,
  hasKey: boolean,
): string | null {
  const prov = getProviderConfig(providerId)
  if (!prov || prov.models.length === 0) return null
  const maxTier = getProviderMaxTier(providerId)
  const targetTier = profile === 'speed' ? 1 : profile === 'balanced' ? 2 : maxTier
  return (
    getPreferredTierModel(providerId, targetTier, hasKey) ||
    getPreferredTierModel(providerId, Math.min(2, maxTier), hasKey) ||
    getPreferredTierModel(providerId, 1, hasKey) ||
    prov.defaultModel ||
    null
  )
}

export function getModelsForRun(settings: AIModelSettings | null | undefined): ModelsForRun {
  const providerId = settings?.provider || getProviderForModel(settings?.model ?? '')
  const profile = settings?.aiProfile || 'balanced'
  const hasKey = !!settings?.apiKey
  const maxTier = getProviderMaxTier(providerId)
  const formatModel =
    settings?.model || pickFormatModelForProfile(providerId, profile, hasKey) || 'gpt-6-luna'
  const formatTier = getModelTier(providerId, formatModel) || 1
  const formatFallbackModel =
    formatTier <= 1 ? getPreferredTierModel(providerId, Math.min(2, maxTier), hasKey) : null
  const detectTier = profile === 'quality' ? Math.min(2, maxTier) : 1
  const detectModel =
    getPreferredTierModel(providerId, detectTier, hasKey) ||
    getPreferredTierModel(providerId, 1, hasKey) ||
    formatModel
  const detectFallbackModel =
    detectTier < maxTier ? getPreferredTierModel(providerId, detectTier + 1, hasKey) : null
  return {
    providerId,
    profile,
    detectModel,
    detectFallbackModel,
    formatModel,
    formatFallbackModel,
  }
}
