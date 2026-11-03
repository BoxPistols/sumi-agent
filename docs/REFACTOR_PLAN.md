# リファクタリング計画

7,500 行・`// @ts-nocheck`・`/* eslint-disable */` だった `src/app/RedactPro.tsx` を、
画面コンポーネント・フック・純粋関数のモジュールに分割した。この文書は現在の構成と、残っている課題をまとめる。

---

## 現在の構成

`@ts-nocheck` とファイル全体の `eslint-disable` はどこにも残っていない。ESLint・Prettier の対象からの除外もない。

### アプリ本体

| ファイル                               | 内容                                                        |
| -------------------------------------- | ----------------------------------------------------------- |
| `src/app/RedactPro.tsx`                | ヘッダー・ステップバー・画面切り替え・モーダルの開閉（App） |
| `src/hooks/usePersistedPreferences.ts` | エディション・テーマ・AI 設定の読み込み（`rp_*`）           |
| `src/hooks/useBatchFiles.ts`           | 複数ファイル取り込み（Pro）の状態・順次解析・ZIP 書き出し   |
| `src/hooks/useFocusTrap.ts`            | モーダル内のフォーカス閉じ込め                              |

### 画面コンポーネント（`src/components/redact/`）

| ファイル                                                                                        | 内容                                                 |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `UploadScreen.tsx`                                                                              | 取り込む（ファイル / URL / 貼り付け / サンプル）     |
| `EditorScreen.tsx`                                                                              | 確認する・整える（検出一覧、差分、A4、アドバイザー） |
| `PreviewModal.tsx` / `DesignExportModal.tsx`                                                    | 書き出す（形式選択・印刷・PDF 編集）                 |
| `A4PreviewPanel.tsx` / `DiffView.tsx` / `detection-anchors.tsx`                                 | 確認画面の表示部品                                   |
| `SettingsModal.tsx` / `HelpModal.tsx` / `ShortcutsModal.tsx` / `ChatWidget.tsx` / `AIPanel.tsx` | モーダル類                                           |
| `FileTabBar.tsx` / `BatchViews.tsx`                                                             | 複数ファイル取り込みのタブと進捗                     |
| `ui.tsx`                                                                                        | Badge / Btn / Toggle / Pill / LayoutIcon             |

### ロジック（`src/lib/`、すべて単体テストあり）

| ファイル                                           | 内容                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `redact-engine.ts`                                 | 画面が使う検出・マスキング・注釈分割                                      |
| `process-file-entry.ts`                            | 1 ファイルの解析パイプライン（抽出 → OCR/整形 → 検出 → AI 検出 → マスク） |
| `pdf-server-extract.ts`                            | サーバー PDF 抽出を使うかの判定（Lite は常に使わない）                    |
| `parsers/`                                         | PDF / Word / Excel / CSV / テキスト類の抽出、文字コード判定               |
| `ai/client.ts` / `ai/models.ts` / `ai/tasks.ts`    | `/api/ai` 呼び出し、モデル選択、AI 検出・OCR・整形                        |
| `url-import.ts`                                    | URL 取り込み（自前中継 → 直接 → 公開 CORS プロキシ）                      |
| `export.ts` / `batch-export.ts` / `resume-html.ts` | 書き出し形式の生成、ZIP、A4 用 HTML                                       |
| `theme.ts` / `ui-config.ts` / `app-types.ts`       | 配色トークン、カテゴリ・プリセット定義、画面間の型                        |

---

## 残っている課題

### 1. 検出エンジンが 2 つある（最優先）

画面が使うのは `src/lib/redact-engine.ts`。`src/lib/detection.ts` / `redaction.ts` は以前に切り出された別系統で、
SNS アカウントのパターンなどが追加されている一方、`GitHub Actions` の `Actions` を GitHub ID として拾うなどの誤検出がある。
差分は `src/lib/__tests__/engine-divergence.test.ts` でモック経歴書ごとに固定している。

進め方:

1. `detection.ts` 側の SNS パターンの誤検出を直す（テストを先に書く）
2. 差分テストの期待値を「差分なし」に更新できる状態にしてから、画面を `detection.ts` に寄せる
3. `redact-engine.ts` を削除し、`integration.test.ts` などの既存テストが画面の挙動を直接守るようにする

同様に `src/lib/constants.ts` の `CATEGORIES` / `DEFAULT_MASK` / `MASK_PRESETS` / `EXPORT_FORMATS` と
`src/lib/ui-config.ts` が重複している（差分は `ui-config.ts` の冒頭に記載）。

### 2. 大きいコンポーネントの分割

`EditorScreen.tsx` と `UploadScreen.tsx` は型付けを優先して 1 コンポーネントのまま移した。次の単位で分けられる。

- `UploadScreen`: `processText`（取り込み後の解析）は `process-file-entry.ts` とほぼ同じ処理なので、
  進捗表示のコールバックを受け取る形に揃えて共通化する
- `EditorScreen`: 検出一覧サイドバー、アドバイザー、A4 整形ビュー、キーボードショートカットのフック

### 3. 分割中に見つかった既存の不具合（挙動を変えないため未修正）

- PDF 解析の残り時間が 0 になると、以降の段階でタイムアウトが外れる（`parsers/pdf.ts` の `cap`）
- 画像だけのページが OCR 対象にならない（テキスト項目 0 件のページを sparse 判定する前に飛ばしている）
- 設定リセットの確認文はテーマも戻すと書いているが、テーマは戻らない（`SettingsModal.tsx`）
- PDF 書き出しの「出力日時」行で `**` が残る（`export.ts` → `mdToHTML` の処理順）
- バッチのタブを閉じるボタンがない（`FileTabBar` は `onRemove` を受け取るが UI がない）

---

## 分割の原則（今後も同じ）

1. 1 回の変更で 1 つの単位だけ動かし、挙動を変えない（不具合修正は別コミット）
2. 純粋関数は `src/lib/` に置き、単体テストを付ける
3. 画面の文言・`aria-*`・`data-intro` は e2e とガイドツアーが参照するので変えない
4. `any` で型エラーを消さない。`eslint-disable` は 1 行単位で理由を書く
