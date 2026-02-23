/**
 * intro.js ステップ定義
 *
 * RedactPro のオンボーディングガイドツアーのステップを管理する。
 * 各ステップは data-intro-* 属性を持つ要素にアタッチされる。
 */

export interface IntroStep {
    element: string
    title: string
    intro: string
    position?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * Lite版 UploadScreen ステップ（5ステップ）
 */
export const UPLOAD_STEPS_LITE: IntroStep[] = [
    {
        element: '[data-intro="upload-zone"]',
        title: 'ファイルアップロード',
        intro: 'ファイルをドラッグ＆ドロップ、またはクリックして選択。PDF、Word、Excelなど多数の形式に対応しています。',
        position: 'bottom',
    },
    {
        element: '[data-intro="mask-presets"]',
        title: 'マスキングプリセット',
        intro: '「基本」「標準」「厳格」の3段階。用途に応じて検出の厳しさを選べます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="sample-demo"]',
        title: 'サンプルで試す',
        intro: 'まずはサンプルで試してみましょう。実際の検出・マスキング結果をすぐに確認できます。',
        position: 'top',
    },
    {
        element: '[data-intro="edition-toggle"]',
        title: 'Lite / Pro 切替',
        intro: 'Pro版に切り替えるとAI検出、URL取込、バッチ処理などが使えます。',
        position: 'bottom',
    },
]

/**
 * Pro版 UploadScreen ステップ（8ステップ）
 */
export const UPLOAD_STEPS_PRO: IntroStep[] = [
    {
        element: '[data-intro="upload-zone"]',
        title: 'ファイルアップロード',
        intro: 'ファイルをドラッグ＆ドロップ。複数ファイルでバッチ処理も可能です。',
        position: 'bottom',
    },
    {
        element: '[data-intro="input-tabs"]',
        title: '入力モード切替',
        intro: 'ファイル以外にURL取込やテキスト貼付にも対応しています。',
        position: 'bottom',
    },
    {
        element: '[data-intro="mask-presets"]',
        title: 'マスキングプリセット',
        intro: '基本・標準・厳格の3段階プリセット。',
        position: 'bottom',
    },
    {
        element: '[data-intro="category-toggles"]',
        title: 'カテゴリ別制御',
        intro: '氏名・連絡先・住所など、カテゴリごとにマスキングを制御できます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="detail-options"]',
        title: '詳細オプション',
        intro: '都道府県を残す、イニシャル化などの細かい設定。',
        position: 'bottom',
    },
    {
        element: '[data-intro="custom-keywords"]',
        title: 'カスタムキーワード',
        intro: '任意の文字列を追加でマスキング対象に指定できます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="settings-button"]',
        title: '設定',
        intro: 'AI検出の設定やAPIキーの管理はこちらから。',
        position: 'bottom',
    },
    {
        element: '[data-intro="sample-files"]',
        title: 'テストサンプル',
        intro: 'サンプルファイルで動作を確認できます。',
        position: 'top',
    },
]

/**
 * EditorScreen ステップ（共通）
 */
export const EDITOR_STEPS: IntroStep[] = [
    {
        element: '[data-intro="detection-list"]',
        title: '検出項目リスト',
        intro: '検出された個人情報の一覧。カテゴリ別にON/OFFを切り替えられます。',
        position: 'right',
    },
    {
        element: '[data-intro="view-tabs"]',
        title: '表示モード',
        intro: 'マスク済み・差分比較など、複数の表示モードを切り替えて確認できます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="export-buttons"]',
        title: 'エクスポート',
        intro: 'テキスト、Markdown、CSV、Excel、PDF、Wordの6形式でエクスポート可能。',
        position: 'top',
    },
]

/** intro.js 共通オプション */
export const INTRO_OPTIONS = {
    nextLabel: '次へ',
    prevLabel: '戻る',
    doneLabel: '完了',
    skipLabel: 'スキップ',
    showProgress: true,
    showBullets: false,
    exitOnOverlayClick: true,
    scrollToElement: true,
    disableInteraction: false,
} as const

/** localStorage キー */
export const LS_ONBOARDING_DONE = 'rp_onboarding_done'
export const LS_TOUR_UPLOAD_DONE = 'rp_tour_upload_done'
export const LS_TOUR_EDITOR_DONE = 'rp_tour_editor_done'
