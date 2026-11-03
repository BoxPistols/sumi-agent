'use client'

/**
 * ヘルプモーダル
 *
 * 左カラムに基本の使い方（クイックスタート・対応形式・検出カテゴリ等）、右カラムに Pro 機能のガイドを並べる。
 * ガイドツアー・紹介動画のボタンは、呼び出し側がハンドラを渡したときだけ出す。
 */
import { useEffect } from 'react'
import s from '@/app/redact-pro.module.css'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { C, T } from '@/lib/theme'

export interface HelpModalProps {
  onClose: () => void
  onStartTour?: () => void
  onShowVideo?: () => void
}

// C に blue / orange は定義されていないため、これらの点は元から色指定なし（文字色を継承）で描画される。
// 参照の形を残して、パレット側に色を足せばそのまま反映されるようにしている。
const C_LOOKUP: Record<string, string | undefined> = C

export function HelpModal({ onClose, onStartTour, onShowVideo }: HelpModalProps) {
  const trapRef = useFocusTrap()
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div
      className={s['modal-overlay']}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={trapRef}
        className={`rp-modal-inner ${s['modal-dialog']}`}
        role="dialog"
        aria-modal="true"
        aria-label="ヘルプ"
        style={{ maxWidth: 1100 }}
      >
        <div className={s['modal-header']}>
          <span className={s['modal-header-title']}>ヘルプ</span>
          <button onClick={onClose} aria-label="閉じる" className={s['modal-close-btn']}>
            ✕
          </button>
        </div>
        <div className={s['help-layout']}>
          {/* ===== 左カラム: 基本ヘルプ ===== */}
          <div className={s['help-col-left']}>
            <div className={s['help-col-title']}>基本</div>
            {/* ガイドツアー & 紹介動画 */}
            {(onStartTour || onShowVideo) && (
              <div className={s['help-actions']}>
                {onShowVideo && (
                  <button
                    onClick={() => {
                      onClose()
                      onShowVideo()
                    }}
                    className={`${s['help-action-btn']} ${s['help-video-btn']}`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    紹介動画を見る
                  </button>
                )}
                {onStartTour && (
                  <button
                    onClick={() => {
                      onClose()
                      onStartTour()
                    }}
                    className={`${s['help-action-btn']} ${s['help-tour-btn']}`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                    ガイドツアー
                  </button>
                )}
              </div>
            )}
            {/* クイックスタート */}
            <div className={s['help-section']}>
              <div className={s['help-heading']}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={T.accent}
                  strokeWidth="2"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                クイックスタート
              </div>
              <div className={s['help-steps-wrap']}>
                <div className={s['help-step']}>
                  <span className={s['help-step-num']}>1</span>
                  <span>
                    <strong>取り込む</strong>:
                    「ファイルを選択」またはドラッグ＆ドロップ（まずはサンプルでもOK）
                  </span>
                </div>
                <div className={s['help-step']}>
                  <span className={s['help-step-num']}>2</span>
                  <span>
                    <strong>確認する</strong>:
                    自動検出された個人情報を確認し、残したい項目はスイッチをオフに
                  </span>
                </div>
                <div className={s['help-step']}>
                  <span className={s['help-step-num']}>3</span>
                  <span>
                    <strong>整える</strong>:
                    A4プレビューで仕上がりを確認（Pro版はテキスト編集・AI整形も）
                  </span>
                </div>
                <div className={s['help-step']}>
                  <span className={s['help-step-num']}>4</span>
                  <span>
                    <strong>書き出す</strong>: テキスト・Word・PDFなど形式を選んで保存、またはコピー
                  </span>
                </div>
              </div>
            </div>

            {/* 対応ファイル形式 */}
            <div className={s['help-section']}>
              <div className={s['help-heading']}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={T.accent}
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                対応ファイル形式
              </div>
              <div className={s['help-badges-wrap']}>
                {[
                  'PDF',
                  'Word (.docx)',
                  'Excel (.xlsx)',
                  'CSV',
                  'Markdown',
                  'HTML',
                  'RTF',
                  'JSON',
                  'ODT',
                  'テキスト',
                ].map((f) => (
                  <span
                    key={f}
                    className={s['help-badge']}
                    style={{ color: T.text2, background: T.surfaceAlt }}
                  >
                    {f}
                  </span>
                ))}
              </div>
              <p className={s['help-note']}>URLからの読み込み（Wantedly, LinkedIn 等）にも対応</p>
            </div>

            {/* 検出カテゴリ */}
            <div className={s['help-section']}>
              <div className={s['help-heading']}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={T.accent}
                  strokeWidth="2"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                検出カテゴリ
              </div>
              <div className={s['help-grid-2']}>
                <div>
                  <span style={{ color: C.red }}>●</span> 氏名（辞書+AI）
                </div>
                <div>
                  <span style={{ color: C_LOOKUP.blue }}>●</span> 連絡先（メール・電話）
                </div>
                <div>
                  <span style={{ color: C_LOOKUP.orange }}>●</span> 住所・地名
                </div>
                <div>
                  <span style={{ color: C.purple }}>●</span> 個人情報（生年月日等）
                </div>
                <div>
                  <span style={{ color: C.cyan }}>●</span> URL
                </div>
                <div>
                  <span style={{ color: T.text3 }}>●</span> 組織名（オプション）
                </div>
              </div>
            </div>

            {/* マスクプリセット */}
            <div className={s['help-section']}>
              <div className={s['help-heading']}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={T.accent}
                  strokeWidth="2"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                マスクプリセット
              </div>
              <div className={s['help-presets-list']}>
                <div>
                  <strong>基本</strong> — 氏名・連絡先のみ
                </div>
                <div>
                  <strong>標準</strong> — + 住所・年月日・URL（推奨）
                </div>
                <div>
                  <strong>厳格</strong> — 組織名含む全項目
                </div>
              </div>
            </div>

            {/* エクスポート */}
            <div className={s['help-section']}>
              <div className={s['help-heading']}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={T.accent}
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                エクスポート
              </div>
              <div className={s['help-badges-wrap']}>
                {['テキスト', 'Markdown', 'CSV', 'Excel', 'PDF', 'Word'].map((f) => (
                  <span
                    key={f}
                    className={s['help-badge']}
                    style={{ color: T.text2, background: T.surfaceAlt }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>

            {/* キーボードショートカット */}
            <div className={s['help-section']}>
              <div className={s['help-heading']}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={T.accent}
                  strokeWidth="2"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="6" y1="8" x2="6" y2="8" />
                  <line x1="10" y1="8" x2="10" y2="8" />
                  <line x1="14" y1="8" x2="14" y2="8" />
                  <line x1="18" y1="8" x2="18" y2="8" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                キーボードショートカット
              </div>
              <p className={s['help-note']} style={{ marginBottom: 8, marginTop: 0 }}>
                テキスト入力中は無効。エディタ画面でのみ有効なキーがあります。
              </p>
              <div className={s['help-kbd-grid']}>
                <kbd className={s['help-kbd']}>Esc</kbd>
                <span>ダイアログを閉じる</span>
                <kbd className={s['help-kbd']}>?</kbd>
                <span>ヘルプを表示</span>
                <kbd className={s['help-kbd']}>K</kbd>
                <span>ショートカット一覧</span>
                <kbd className={s['help-kbd']}>,</kbd>
                <span>設定を開く</span>
                <kbd className={s['help-kbd']}>D</kbd>
                <span>ダーク/ライト切替</span>
                <kbd className={s['help-kbd']}>E</kbd>
                <span>Lite / Pro 切替</span>
              </div>
            </div>
          </div>

          {/* ===== 右カラム: Pro機能ガイド ===== */}
          <div className={s['help-col-right']}>
            <div className={s['help-col-title']}>Pro機能ガイド</div>

            {/* ビューモード */}
            <div className={s['help-feature']}>
              <div className={s['help-feature-title']}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M5 3v10M11 3v10M5 8h6"
                    stroke={T.accent}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M3 5L5 3l2 2M13 11l-2 2-2-2"
                    stroke={T.accent}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                ビューモード切替
              </div>
              <ul className={s['help-feature-desc']}>
                <li>
                  <strong>マスク後</strong> — マスキング済みテキストを表示
                </li>
                <li>
                  <strong>差分</strong> — 元テキストとマスク後を並べて比較
                </li>
                <li>
                  <strong>生テキスト</strong> — ファイルから抽出したままのテキスト
                </li>
                <li>
                  <strong>生テキストとの差分</strong> — 抽出したままのテキストとAI整形後の差分
                </li>
                <li>
                  <strong>AI整形</strong> — AIが読みやすく整形したテキスト
                </li>
                <li>
                  <strong>AI整形との差分</strong> — マスク結果とAI整形後の差分
                </li>
              </ul>
            </div>

            {/* AI検出 */}
            <div className={s['help-feature']}>
              <div className={s['help-feature-title']}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"
                    stroke={T.accent}
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                AI検出・AI整形
              </div>
              <ul className={s['help-feature-desc']}>
                <li>設定 → プロバイダ選択（OpenAI / ローカルAI）</li>
                <li>APIキーを入力して接続テスト → AI検出をON</li>
                <li>正規表現で見逃す文脈依存の個人情報を補完</li>
                <li>テキスト整形: PDFやOCR由来の崩れを自動修正</li>
              </ul>
            </div>

            {/* ローカルAI */}
            <div className={s['help-feature']}>
              <div className={s['help-feature-title']}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="2"
                    y="4"
                    width="12"
                    height="8"
                    rx="1.5"
                    stroke={T.accent}
                    strokeWidth="1.2"
                  />
                  <path
                    d="M5 4V2.5a1 1 0 011-1h4a1 1 0 011 1V4"
                    stroke={T.accent}
                    strokeWidth="1.2"
                  />
                  <circle cx="8" cy="8" r="1.5" stroke={T.accent} strokeWidth="1.2" />
                </svg>
                ローカルAI（Ollama / LM Studio）
              </div>
              <ul className={s['help-feature-desc']}>
                <li>Ollama・LM Studio・LocalAI等のOpenAI互換ローカルLLMに対応</li>
                <li>
                  <strong>データが外部に一切送信されません</strong> — 社内セキュリティ要件にも適合
                </li>
                <li>利用回数の制限なし・APIキー不要・完全無料</li>
                <li>
                  設定手順: 設定（<kbd className={s['help-kbd']}>,</kbd>）→
                  プロバイダ「ローカルAI」→ エンドポイント入力
                </li>
              </ul>
              <div style={{ paddingLeft: 22, fontSize: 12, color: T.text3, lineHeight: 1.7 }}>
                Ollama:{' '}
                <code style={{ fontFamily: 'var(--rp-mono)' }}>http://localhost:11434/v1</code>
                <br />
                LM Studio:{' '}
                <code style={{ fontFamily: 'var(--rp-mono)' }}>http://localhost:1234/v1</code>
              </div>
            </div>

            {/* AIアドバイザー */}
            <div className={s['help-feature']}>
              <div className={s['help-feature-title']}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="2"
                    y="2"
                    width="12"
                    height="10"
                    rx="2"
                    stroke={T.accent}
                    strokeWidth="1.2"
                  />
                  <path
                    d="M5 14l3-2 3 2"
                    stroke={T.accent}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M5 6h6M5 8.5h4"
                    stroke={T.accent}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                AIアドバイザー（右パネル）
              </div>
              <ul className={s['help-feature-desc']}>
                <li>
                  <strong>質問モード</strong> — 経歴書について自由に相談。経歴書は変更されない
                </li>
                <li>
                  <strong>指示モード</strong> — 改善指示を入力 → AIが経歴書を書き換え →
                  差分プレビューで確認・取り込み
                </li>
                <li>クイック分析: 強み分析・改善提案・要約などのプリセット</li>
                <li>求人票マッチング: 求人票を貼り付けて適合度を分析</li>
                <li>マスク済みテキストでの分析も可能（個人情報保護）</li>
              </ul>
            </div>

            {/* PDF編集 */}
            <div className={s['help-feature']}>
              <div className={s['help-feature-title']}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M11.5 2.5l2 2L5 13H3v-2z"
                    stroke={T.accent}
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  <path d="M9.5 4.5l2 2" stroke={T.accent} strokeWidth="1.2" />
                </svg>
                PDF編集・A4プレビュー
              </div>
              <ul className={s['help-feature-desc']}>
                <li>編集ボタンでMarkdownエディタを起動</li>
                <li>中央パネルにA4サイズのリアルタイムプレビュー</li>
                <li>ゴシック体/明朝体の切替、ズーム調整</li>
                <li>PDF印刷・HTML・Word出力に対応</li>
              </ul>
            </div>

            {/* URL取込 */}
            <div className={s['help-feature']}>
              <div className={s['help-feature-title']}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M6.5 9.5a3 3 0 004-4"
                    stroke={T.accent}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M9.5 6.5a3 3 0 00-4 4"
                    stroke={T.accent}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M4 12L2 14M12 4l2-2"
                    stroke={T.accent}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                URL取込
              </div>
              <ul className={s['help-feature-desc']}>
                <li>Wantedly・LinkedIn等のURLからテキストを自動取得</li>
                <li>取得したテキストに対して通常通りマスキング処理</li>
              </ul>
            </div>

            {/* バッチ処理 */}
            <div className={s['help-feature']}>
              <div className={s['help-feature-title']}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="2"
                    y="2"
                    width="5"
                    height="5"
                    rx="1"
                    stroke={T.accent}
                    strokeWidth="1.2"
                  />
                  <rect
                    x="9"
                    y="2"
                    width="5"
                    height="5"
                    rx="1"
                    stroke={T.accent}
                    strokeWidth="1.2"
                  />
                  <rect
                    x="2"
                    y="9"
                    width="5"
                    height="5"
                    rx="1"
                    stroke={T.accent}
                    strokeWidth="1.2"
                  />
                  <rect
                    x="9"
                    y="9"
                    width="5"
                    height="5"
                    rx="1"
                    stroke={T.accent}
                    strokeWidth="1.2"
                  />
                </svg>
                バッチ処理
              </div>
              <ul className={s['help-feature-desc']}>
                <li>複数ファイルを一括でマスキング処理</li>
                <li>処理結果をZIPでまとめてダウンロード</li>
                <li>各ファイルの検出結果を個別に確認・調整可能</li>
              </ul>
            </div>

            {/* カスタムキーワード */}
            <div className={s['help-feature']}>
              <div className={s['help-feature-title']}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M2 4h12M2 8h8M2 12h10"
                    stroke={T.accent}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                カスタムキーワード
              </div>
              <ul className={s['help-feature-desc']}>
                <li>任意のテキストをマスク対象に追加</li>
                <li>プロジェクト名・社内用語など自動検出されない固有名詞に有効</li>
              </ul>
            </div>

            {/* レイアウト */}
            <div className={s['help-feature']}>
              <div className={s['help-feature-title']}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="1"
                    y="1"
                    width="14"
                    height="14"
                    rx="2"
                    stroke={T.accent}
                    strokeWidth="1.2"
                  />
                  <line x1="6" y1="1" x2="6" y2="15" stroke={T.accent} strokeWidth="1.2" />
                  <line x1="11" y1="1" x2="11" y2="15" stroke={T.accent} strokeWidth="1.2" />
                </svg>
                パネルレイアウト
              </div>
              <ul className={s['help-feature-desc']}>
                <li>
                  5つのレイアウトプリセット（テキスト重視 / バランス / プレビュー重視 /
                  アドバイザー重視 / 集中）
                </li>
                <li>ドラッグでパネル幅を自由に調整</li>
                <li>左: テキスト / 中央: A4プレビュー / 右: 検出一覧 or AIアドバイザー</li>
              </ul>
            </div>

            {/* エディタ用ショートカット */}
            <div className={s['help-feature']}>
              <div className={s['help-feature-title']}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="1"
                    y="3"
                    width="14"
                    height="11"
                    rx="2"
                    stroke={T.accent}
                    strokeWidth="1.2"
                  />
                  <path
                    d="M4 6h1M7 6h1M10 6h1M5.5 9h5"
                    stroke={T.accent}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                エディタ用ショートカット
              </div>
              <div className={s['help-kbd-grid']} style={{ paddingLeft: 22 }}>
                <kbd className={s['help-kbd']}>1</kbd>
                <span>マスク後を表示</span>
                <kbd className={s['help-kbd']}>2</kbd>
                <span>差分を表示</span>
                <kbd className={s['help-kbd']}>3</kbd>
                <span>生テキストを表示</span>
                <kbd className={s['help-kbd']}>4</kbd>
                <span>生テキストとの差分を表示</span>
                <kbd className={s['help-kbd']}>5</kbd>
                <span>AI整形表示</span>
                <kbd className={s['help-kbd']}>6</kbd>
                <span>AI整形との差分を表示</span>
                <kbd className={s['help-kbd']}>M</kbd>
                <span>マスク / 元文 切替</span>
                <kbd className={s['help-kbd']}>P</kbd>
                <span>プレビュー表示切替</span>
                <kbd className={s['help-kbd']}>W</kbd>
                <span>編集モード切替</span>
                <kbd className={s['help-kbd']}>I</kbd>
                <span>PDF印刷</span>
                <kbd className={s['help-kbd']}>R</kbd>
                <span>検出結果パネル</span>
                <kbd className={s['help-kbd']}>A</kbd>
                <span>AIアドバイザーパネル</span>
                <kbd className={s['help-kbd']}>C</kbd>
                <span>テキストをコピー</span>
              </div>
            </div>
          </div>
        </div>
        {/* フッター */}
        <div className={s['help-footer']}>
          <span>Sumi v1.0</span>
          <a
            href="https://github.com/BoxPistols/sumi-agent"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
