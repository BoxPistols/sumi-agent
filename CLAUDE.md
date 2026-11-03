# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Sumi -- 経歴書の個人情報 自動検出・マスキングツール。個人情報はブラウザの外に出ない。Next.js 15 (App Router) + React 19 + TypeScript。Lite版（シンプル）とPro版（全機能）をランタイムstate切替で提供。

## 重要ルール

- **マージ・プッシュ・デプロイは必ずユーザーの明示的な承認を得てから実行する。** 勝手にマージ・本番デプロイしない
- **修正はローカルで検証してからプッシュする。** 未テストの変更をリモートに送らない
- ユーザーが「push」と言った場合: commit → push → （PRがあれば説明更新）を一連で完了する。ファイル編集だけで止めない
- PRレビュー時は現在のブランチの最新PRを自動で選択する。どのPRか聞かない
- 変更が意図通りか不明な場合、質問を繰り返すより先にコードを調査する

## コマンド

| コマンド          | 用途                                                       |
| ----------------- | ---------------------------------------------------------- |
| `pnpm dev`        | 開発サーバー（portless経由、`http://sumi.localhost:1355`） |
| `pnpm build`      | プロダクションビルド（distDir: `.next-build`）             |
| `pnpm test`       | Vitest テスト実行                                          |
| `pnpm test:watch` | Vitest ウォッチモード                                      |
| `pnpm lint`       | ESLint                                                     |
| `pnpm type-check` | `tsc --noEmit`                                             |

単一テストファイルの実行: `pnpm vitest run src/lib/__tests__/detection.test.ts`

## 検証フロー

コード変更後は以下の順で検証する:

1. `pnpm build` -- ビルドエラーがないこと
2. `pnpm test` -- 全テスト通過
3. UI変更の場合は `pnpm dev` でブラウザ確認を促す

## コードスタイル

- TypeScript strict モード。`@ts-nocheck` とファイル全体の `eslint-disable` は使わない（無効化は1行単位で理由を書く）
- 新規ファイルはTypeScriptで作成する
- ESLint は `eslint-config-next` を使用
- named export を優先（default export は Next.js の規約に従う場合のみ）
- CSS-in-JS は使わない -- CSS Custom Properties (`T` オブジェクト) + インラインスタイルで構成
- **UI・スタイル変更時は `docs/DESIGN.md` に従う**（カラートークン、コントラスト基準 4.5:1、ボタン階層、両テーマ検証）。`.claude/skills/design-system` に作業手順あり
- パスエイリアス: `@/*` = `./src/*`

## Git規約

- コミットメッセージは日本語で簡潔に
- 以下は含めない: 絵文字、`Generated with Claude Code`、`Co-Authored-By: Claude`、冗長な定量値
- force push、`--no-verify` は明示的指示がない限り使わない
- `git add .` よりも対象ファイルを明示する

## アーキテクチャ

```
src/
  app/
    page.tsx              -- エントリーポイント
    RedactPro.tsx         -- App（ヘッダー・ステップバー・画面切り替え・モーダルの開閉）
    api/ai/route.ts       -- AIプロキシ（レートリミット付き）
    api/scrape/route.ts   -- スクレイピングプロキシ（SSRF対策済み）
    api/pdf/extract/      -- サーバー側 PDF 文字抽出（Pro のみ使用）
  components/
    StepFlowBar.tsx       -- 4ステップの現在地バー（Lite/Proで説明文を出し分け）
    upload/               -- DropZone / SampleCard
    redact/               -- 画面とモーダル（UploadScreen, EditorScreen, PreviewModal, SettingsModal 等）と共通部品 ui.tsx
  hooks/                  -- usePersistedPreferences / useBatchFiles / useFocusTrap
  lib/
    redact-engine.ts      -- 画面が使う検出・マスキングエンジン
    detection.ts / redaction.ts -- 別系統の検出エンジン（画面は未使用。統合計画は docs/REFACTOR_PLAN.md）
    process-file-entry.ts -- 1ファイルの解析パイプライン（バッチ用）
    pdf-server-extract.ts -- サーバー PDF 抽出を使うかの判定（Lite は常に false）
    parsers/              -- ファイル形式ごとのテキスト抽出
    ai/                   -- /api/ai 呼び出し・モデル選択・AI 検出/OCR/整形
    url-import.ts         -- URL 取り込み（自前中継 → 直接 → 公開 CORS プロキシ）
    export.ts / batch-export.ts / resume-html.ts -- 書き出し
    theme.ts / ui-config.ts / app-types.ts       -- 配色トークン・画面の定義・画面間の型
    constants.ts / flow-steps.ts / intro-steps.ts
    __tests__/            -- Vitest テスト（components/__tests__・app/__tests__ にもあり）
```

モジュール構成と残課題は `docs/REFACTOR_PLAN.md` を参照。

### テーマシステム

- `C` -- ハードコードカラー定数（sumi, washi, stamp, green等）
- `T` -- CSS Custom Properties参照（`var(--rp-accent)`, `var(--rp-text)` 等）。ダーク/ライト切替で値が変わる
- `T.accent` -- ライトテーマ: `#1C1917`（墨黒）、ダークテーマ: `#E7E5E4`（和紙白）に自動反転
- `C.stamp` -- `#DC2626`（朱赤）ロゴ印鑑のみに使用、UIアクセントとは分離

### Lite/Pro版

`edition` state (`'lite'`|`'pro'`) で切替。`isLite` boolean propを各コンポーネントに伝播。

- Lite: ファイルアップロード＋自動検出＋プレビュー＋エクスポートのみ。**AIは一切使わない**（`UploadScreen` の `aiOn` は `!isLite` を条件に含む。信頼バッジ・設定モーダルの文言と一致させること）
- Pro: AI検出、URL取込、バッチ処理、カスタムキーワード、PDF編集、検出レポート、チャットウィジェット
- 共通コンポーネントを最大化し、`{!isLite && ...}` で機能を出し分ける

### 検出パイプライン

`normalizeText` → `detectRegex` → `detectJapaneseNames` → `detectAll`（統合）→ `mergeDetections`（AI結果マージ）→ `applyRedaction`

### next.config.ts

- `distDir`: dev時は `.next`、production buildは `.next-build`（同時実行時の衝突回避）
- `serverExternalPackages: ['mammoth']`（Node.js Buffer依存）

## デバッグ指針

- UI/スタイル修正は正しいコンポーネントとCSSセレクタを特定してから修正する。効かない場合は対象要素が間違っていないか先に確認
- 2回試しても直らない場合、別のアプローチを検討するか、原因分析を報告する
- 本番環境固有の問題はデプロイ設定（env, CSP, vercel.json等）を先に確認する

## 注意事項

- 画面に依存しない処理は `src/lib/` に純粋関数として置き、単体テストを付ける
- AIプロバイダのAPIキーはサーバーサイド（`/api/ai`）経由でのみ使用する。クライアントに露出させない
- `/api/scrape` はSSRF対策済み。プライベートIPレンジ・メタデータエンドポイントへのアクセスを遮断。変更時はセキュリティを維持すること
- 日本人名辞書 (`SURNAMES`, `GIVEN_NAMES`) と組織名除外辞書 (`NON_NAME_WORDS`) は画面用の `redact-engine.ts` と別系統の `detection.ts` の両方にある。画面の挙動を変えるなら `redact-engine.ts` を直し、`engine-divergence.test.ts` の差分表も更新すること
- 偽陽性フィルタ（年号文脈・文書日付の除外等）は `detectRegex` 内に実装。正規表現パターン変更時は必ず既存テストを通すこと
- モジュール分割計画は `docs/REFACTOR_PLAN.md` を参照
