/**
 * 設定・入力の保存先
 *
 * Next.js では localStorage を使う。Claude の Artifact 環境では localStorage が使えず
 * window.storage（非同期 API）が提供されるため、あればそちらを優先する。
 * どちらも失敗しうる（プライベートモード等）ので、読み込み失敗は null、書き込み失敗は警告に留める。
 */
interface ArtifactStorage {
  get(key: string): Promise<{ value?: string | null } | null | undefined>
  set(key: string, value: string): Promise<unknown>
  delete(key: string): Promise<unknown>
}

declare global {
  interface Window {
    storage?: ArtifactStorage
  }
}

function artifactStorage(): ArtifactStorage | undefined {
  return typeof window !== 'undefined' ? window.storage : undefined
}

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      const st = artifactStorage()
      if (st?.get) {
        const r = await st.get(key)
        return r?.value || null
      }
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  async set(key: string, val: string): Promise<void> {
    try {
      const st = artifactStorage()
      if (st?.set) {
        try {
          await st.delete(key)
        } catch {
          // 未保存のキーの削除失敗は無視してよい（set で上書きする）
        }
        await st.set(key, val)
        return
      }
      localStorage.setItem(key, val)
    } catch (e) {
      console.warn('storage set failed:', key, e)
    }
  },
  async del(key: string): Promise<void> {
    try {
      const st = artifactStorage()
      if (st?.delete) {
        await st.delete(key)
        return
      }
      localStorage.removeItem(key)
    } catch {
      // 削除できなくても次回の読み込みで古い値が返るだけなので握りつぶす
    }
  },
}

/**
 * ブラウザの全サイトデータ（LocalStorage, SessionStorage, IndexedDB, Cache, Service Worker）を削除し
 * ページをリロードします。
 */
export const clearAllSiteData = async (): Promise<void> => {
  // LocalStorage と SessionStorage の削除
  localStorage.clear()
  sessionStorage.clear()

  // IndexedDB の削除
  if (window.indexedDB && indexedDB.databases) {
    const dbs = await indexedDB.databases()
    dbs.forEach((db) => {
      if (db.name) indexedDB.deleteDatabase(db.name)
    })
  }

  // キャッシュの削除
  if (window.caches) {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }

  // Service Worker の登録解除
  if (navigator.serviceWorker) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
  }

  // 最後にリロードして状態を反映
  window.location.reload()
}
