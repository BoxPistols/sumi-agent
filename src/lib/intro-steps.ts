/**
 * intro.js ステップ定義
 *
 * RedactPro のオンボーディングガイドツアーのステップを管理する。
 * 各ステップは data-intro 属性を持つ要素にアタッチされる。
 */

export interface IntroStep {
    element: string
    title: string
    intro: string
    position?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * Lite版 UploadScreen ステップ
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
 * Pro版 UploadScreen ステップ
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
 * Lite版 EditorScreen ステップ
 */
export const EDITOR_STEPS_LITE: IntroStep[] = [
    {
        element: '[data-intro="view-tabs"]',
        title: '表示モード',
        intro: '「マスク」で置換後テキスト、「Diff」で変更前後の差分を確認できます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="category-filter"]',
        title: 'カテゴリフィルタ',
        intro: 'カテゴリをクリックして一括ON/OFF。不要な検出カテゴリをまとめて無効化できます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="detection-list"]',
        title: '検出結果リスト',
        intro: '検出された個人情報の一覧。各項目のトグルで個別にマスクのON/OFFを切り替えられます。',
        position: 'left',
    },
    {
        element: '[data-intro="export-buttons"]',
        title: 'エクスポート',
        intro: 'テキスト・Markdown・CSV・Excel・PDF・Wordの6形式で出力できます。',
        position: 'top',
    },
]

/**
 * Pro版 EditorScreen ステップ
 */
export const EDITOR_STEPS_PRO: IntroStep[] = [
    {
        element: '[data-intro="view-tabs"]',
        title: '表示モード',
        intro: '「マスク」「Diff」に加え、AI処理結果やAI Diffも確認できます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="mask-toggle"]',
        title: 'マスク / 元文 切替',
        intro: 'マスク済みテキストと元のテキストをワンクリックで切り替えて比較できます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="edit-button"]',
        title: 'テキスト編集',
        intro: 'マスキング結果を直接編集できます。A4プレビューにリアルタイム反映されます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="category-filter"]',
        title: 'カテゴリフィルタ',
        intro: 'カテゴリをクリックして一括ON/OFF。不要な検出カテゴリをまとめて無効化できます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="detection-list"]',
        title: '検出結果リスト',
        intro: '検出された個人情報の一覧。各項目のトグルで個別にマスクのON/OFFを切り替えられます。',
        position: 'left',
    },
    {
        element: '[data-intro="side-settings"]',
        title: 'マスキング設定',
        intro: 'プリセット変更やカスタムキーワード追加など、エディター上で設定を調整できます。',
        position: 'left',
    },
    {
        element: '[data-intro="advisor-tab"]',
        title: '経歴書アドバイザー',
        intro: 'AIが経歴書をレビューし、強みの発見・改善提案・求人票マッチングを支援します。',
        position: 'left',
    },
    {
        element: '[data-intro="ai-reformat"]',
        title: 'AI再フォーマット',
        intro: 'AIがマスキング済みテキストを推薦書やスキルシートなどの形式に自動整形します。',
        position: 'left',
    },
    {
        element: '[data-intro="pdf-edit"]',
        title: 'PDFプレビュー・編集',
        intro: 'A4レイアウトでプレビュー。テキストを直接編集してPDF出力できます。',
        position: 'left',
    },
    {
        element: '[data-intro="export-buttons"]',
        title: 'プレビュー / 保存',
        intro: 'マスキング結果のプレビュー表示やクリップボードコピーはこちらから。',
        position: 'top',
    },
    {
        element: '[data-intro="detection-report"]',
        title: '検出レポート',
        intro: '検出結果の詳細をCSV形式でレポート出力。監査や記録用に利用できます。',
        position: 'top',
    },
]


/**
 * PreviewModal ステップ（エクスポートプレビュー初回表示時）
 */
export const PREVIEW_MODAL_STEPS: IntroStep[] = [
    {
        element: '[data-intro="preview-tabs"]',
        title: '表示切替',
        intro: '「レイアウト」で書式付きプレビュー、「テキスト」でプレーンテキスト、「編集」で直接編集できます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="export-formats"]',
        title: '出力形式',
        intro: 'Text・Markdown・CSV・Excel・PDF（印刷）・Wordの6形式から選択。形式を切り替えるとプレビューも変わります。',
        position: 'top',
    },
    {
        element: '[data-intro="export-actions"]',
        title: '保存 / コピー',
        intro: '選択した形式でファイル保存、またはクリップボードにコピーできます。',
        position: 'top',
    },
]

/**
 * Pro切替時ステップ（Lite→Pro切替直後に表示）
 */
export const PRO_SWITCH_STEPS: IntroStep[] = [
    {
        element: '[data-intro="header-edition-toggle"]',
        title: 'Pro版に切り替えました',
        intro: 'すべての機能が利用可能です。いつでもLiteに戻せます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="input-tabs"]',
        title: 'URL取込 / テキスト貼付',
        intro: 'ファイル以外にURLやテキスト直接入力にも対応しています。',
        position: 'bottom',
    },
    {
        element: '[data-intro="category-toggles"]',
        title: 'カテゴリ別制御',
        intro: '検出カテゴリを個別にON/OFFできます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="custom-keywords"]',
        title: 'カスタムキーワード',
        intro: '任意の文字列をマスキング対象に追加できます。',
        position: 'bottom',
    },
    {
        element: '[data-intro="settings-button"]',
        title: 'AI設定',
        intro: 'AI検出プロバイダ（Claude / GPT / Gemini）の設定やAPIキーの管理。',
        position: 'bottom',
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
export const LS_TOUR_PRO_DONE = 'rp_tour_pro_done'
