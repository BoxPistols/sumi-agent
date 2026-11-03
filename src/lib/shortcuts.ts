/**
 * キーボードショートカット定義・OS判定ユーティリティ
 * - Mac/Windows のキー表記を自動切替
 * - 入力要素フォーカス中は無効化
 */

// OS判定
export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

// 修飾キー表記
export const MOD_KEY = isMac ? '⌘' : 'Ctrl'
export const ALT_KEY = isMac ? '⌥' : 'Alt'
export const SHIFT_KEY = isMac ? '⇧' : 'Shift'

/** ショートカット定義 */
export interface ShortcutDef {
  /** ショートカットID */
  id: string
  /** 表示キー名（OS依存の表記を含む） */
  label: string
  /** 機能の説明 */
  desc: string
  /** カテゴリ */
  category: 'global' | 'editor' | 'view'
  /** マッチ判定 */
  match: (e: KeyboardEvent) => boolean
  /** Pro限定か */
  proOnly?: boolean
}

/** 入力要素にフォーカスしているかチェック */
export function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

/** ショートカット一覧を定義 */
export const SHORTCUTS: ShortcutDef[] = [
  // === グローバル ===
  {
    id: 'toggle-dark',
    label: 'D',
    desc: 'ダーク/ライト切替',
    category: 'global',
    match: (e) => e.key === 'd' || e.key === 'D',
  },
  {
    id: 'help',
    label: '?',
    desc: 'ヘルプを表示',
    category: 'global',
    match: (e) => e.key === '?',
  },
  {
    id: 'settings',
    label: ',',
    desc: '設定を開く',
    category: 'global',
    match: (e) => e.key === ',',
  },
  {
    id: 'toggle-edition',
    label: 'E',
    desc: 'Lite / Pro 切替',
    category: 'global',
    match: (e) => e.key === 'e' || e.key === 'E',
  },

  // === ビュー切替 ===
  {
    id: 'view-mask',
    label: '1',
    desc: 'マスク表示',
    category: 'view',
    match: (e) => e.key === '1',
  },
  {
    id: 'view-diff',
    label: '2',
    desc: 'Diff 表示',
    category: 'view',
    match: (e) => e.key === '2',
  },
  {
    id: 'view-raw',
    label: '3',
    desc: 'Raw 表示',
    category: 'view',
    match: (e) => e.key === '3',
    proOnly: true,
  },
  {
    id: 'view-raw-diff',
    label: '4',
    desc: 'Raw Diff 表示',
    category: 'view',
    match: (e) => e.key === '4',
    proOnly: true,
  },
  {
    id: 'view-ai',
    label: '5',
    desc: 'AI整形 表示',
    category: 'view',
    match: (e) => e.key === '5',
    proOnly: true,
  },
  {
    id: 'view-ai-diff',
    label: '6',
    desc: 'AI Diff 表示',
    category: 'view',
    match: (e) => e.key === '6',
    proOnly: true,
  },

  // === エディタ操作 ===
  {
    id: 'toggle-mask',
    label: 'M',
    desc: 'マスク / 元文 切替',
    category: 'editor',
    match: (e) => e.key === 'm' || e.key === 'M',
    proOnly: true,
  },
  {
    id: 'toggle-preview',
    label: 'P',
    desc: 'プレビュー表示切替',
    category: 'editor',
    match: (e) => e.key === 'p' || e.key === 'P',
    proOnly: true,
  },
  {
    id: 'toggle-edit',
    label: 'W',
    desc: '編集モード切替',
    category: 'editor',
    match: (e) => e.key === 'w' || e.key === 'W',
    proOnly: true,
  },
  {
    id: 'print-pdf',
    label: 'I',
    desc: 'PDF印刷',
    category: 'editor',
    match: (e) => e.key === 'i' || e.key === 'I',
    proOnly: true,
  },
  {
    id: 'tab-detections',
    label: 'R',
    desc: '検出結果パネル',
    category: 'editor',
    match: (e) => e.key === 'r' || e.key === 'R',
    proOnly: true,
  },
  {
    id: 'tab-advisor',
    label: 'A',
    desc: 'AIアドバイザーパネル',
    category: 'editor',
    match: (e) => e.key === 'a' || e.key === 'A',
    proOnly: true,
  },
  {
    id: 'copy-text',
    label: 'C',
    desc: 'テキストをコピー',
    category: 'editor',
    match: (e) => e.key === 'c' && !e.metaKey && !e.ctrlKey,
  },
]

/** カテゴリ別にグループ化 */
export function groupByCategory(shortcuts: ShortcutDef[]): Record<string, ShortcutDef[]> {
  const groups: Record<string, ShortcutDef[]> = {}
  for (const sc of shortcuts) {
    if (!groups[sc.category]) groups[sc.category] = []
    groups[sc.category].push(sc)
  }
  return groups
}

/** カテゴリ名の日本語ラベル */
export const CATEGORY_LABELS: Record<string, string> = {
  global: '全般',
  view: 'ビュー切替',
  editor: 'エディタ操作',
}
