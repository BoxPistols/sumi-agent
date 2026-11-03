import { useEffect, useState } from 'react'
import { pickFormatModelForProfile } from '@/lib/ai/models'
import type { AppSettings, Edition } from '@/lib/app-types'
import { AI_PROVIDERS, migrateProviderId } from '@/lib/constants'
import { storage } from '@/lib/storage'

const INITIAL_SETTINGS: AppSettings = {
  apiKey: '',
  model: pickFormatModelForProfile('openai', 'balanced', false) || 'gpt-6-luna',
  aiDetect: true,
  aiProfile: 'balanced',
  provider: 'openai',
  proxyUrl: '',
}

/**
 * エディション・テーマ・AI 設定を保存先（rp_*）から読み込む
 *
 * 読み込みは非同期なので、初回描画は既定値（Lite・ライト・OpenAI）で行い、読めたものから順に反映する。
 */
export function usePersistedPreferences() {
  const [edition, setEdition] = useState<Edition>('lite')
  const [isDark, setIsDark] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS)

  useEffect(() => {
    ;(async () => {
      const ed = await storage.get('rp_edition')
      if (ed) setEdition(ed as Edition)
      const k = await storage.get('rp_api_key')
      if (k) setSettings((p) => ({ ...p, apiKey: k }))
      const m = await storage.get('rp_model')
      if (m) {
        const allModels = AI_PROVIDERS.flatMap((p) => p.models)
        const found = allModels.find((x) => x.id === m)
        if (found && (!found.needsUserKey || k)) {
          setSettings((p) => ({ ...p, model: m }))
        } else {
          // 廃止済み・キー必須のモデルが保存されていたら既定モデルに戻す
          await storage.set('rp_model', 'gpt-6-luna')
          setSettings((p) => ({ ...p, model: 'gpt-6-luna' }))
        }
      }
      const ad = await storage.get('rp_ai_detect')
      if (ad) setSettings((p) => ({ ...p, aiDetect: ad !== 'false' }))
      const ap = await storage.get('rp_ai_profile')
      if (ap) setSettings((p) => ({ ...p, aiProfile: ap }))
      const prov = await storage.get('rp_provider')
      if (prov) {
        const migrated = migrateProviderId(prov)
        if (migrated !== prov) await storage.set('rp_provider', migrated)
        // 外したGeminiのキーをOpenAIへ送らないよう消す（未入力ならサーバー共用キーを使う）
        if (prov === 'google' && migrated !== prov) {
          await storage.del('rp_api_key')
          setSettings((p) => ({ ...p, apiKey: '' }))
        }
        setSettings((p) => ({ ...p, provider: migrated }))
      }
      const px = await storage.get('rp_proxy_url')
      if (px) setSettings((p) => ({ ...p, proxyUrl: px }))
      const le = await storage.get('rp_local_endpoint')
      if (le) setSettings((p) => ({ ...p, localEndpoint: le }))
      const th = await storage.get('rp_theme')
      if (th) setIsDark(th !== 'light')
      // 初回訪問でも取り込み画面には何も重ねない。案内は確認画面の初回ツアー1つに絞り、紹介動画とヘルプはボタンから開く
      const visited = await storage.get('rp_visited')
      if (!visited) await storage.set('rp_visited', '1')
    })()
  }, [])

  return { edition, setEdition, isDark, setIsDark, settings, setSettings }
}
