/**
 * ブラウザの全サイトデータ（LocalStorage, SessionStorage, IndexedDB, Cache, Service Worker）を削除し
 * ページをリロードします。
 */
export const clearAllSiteData = async (): Promise<void> => {
  // LocalStorage と SessionStorage の削除
  localStorage.clear();
  sessionStorage.clear();

  // IndexedDB の削除
  if (window.indexedDB && indexedDB.databases) {
    const dbs = await indexedDB.databases();
    dbs.forEach((db) => {
      if (db.name) indexedDB.deleteDatabase(db.name);
    });
  }

  // キャッシュの削除
  if (window.caches) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  // Service Worker の登録解除
  if (navigator.serviceWorker) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }

  // 最後にリロードして状態を反映
  window.location.reload();
};
