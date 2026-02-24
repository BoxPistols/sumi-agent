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
| `pnpm test`       | Vitest テスト実行（359テスト）                             |
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

- TypeScript strict モード（ただし `RedactPro.tsx` は `@ts-nocheck`）
- 新規ファイルはTypeScriptで作成する
- ESLint は `eslint-config-next` を使用
- named export を優先（default export は Next.js の規約に従う場合のみ）
- CSS-in-JS は使わない -- CSS Custom Properties (`T` オブジェクト) + インラインスタイルで構成
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
    RedactPro.tsx         -- メインUI（~8400行モノリス、@ts-nocheck）
    api/ai/route.ts       -- AIプロキシ（レートリミット付き）
    api/scrape/route.ts   -- スクレイピングプロキシ（SSRF対策済み）
  lib/
    constants.ts          -- 定数・型定義・AIプロバイダ設定
    detection.ts          -- PII検出エンジン（正規表現 + 辞書 + ヒューリスティクス）
    redaction.ts          -- マスキングエンジン
    __tests__/            -- Vitest テスト（9ファイル）
```

### RedactPro.tsx 内部構造（主要コンポーネント）

モノリスだが内部は論理的に分割されている。変更時は行番号のずれに注意。

- **storage** (~行10): localStorage/window.storage互換レイヤー
- **callAI** (~行184): 統一AIプロバイダルーティング（OpenAI/Claude/Gemini）
- **ファイルパーサー群**: parsePDF, parseDOCX, parseXLSX等（~行700-1400）
- **generateExport** (~行1737): エクスポート形式生成（txt/md/csv/xlsx/pdf/docx）
- **mdToHTML** (~行3175): Markdown→HTML変換（履歴書向けヒューリスティクス付き）
- **generatePDFHTML** (~行3290): A4 PDF用HTML生成
- **A4PreviewPanel** (~行3318): インラインA4プレビュー（React）
- **PreviewModal** (~行3932): エクスポートプレビューモーダル
- **ChatWidget** (~行1971): FAQ チャットウィジェット
- **UploadScreen** (~行4791): ファイルアップロード画面（`isLite` prop対応）
- **EditorScreen** (~行6610): 検出結果編集画面（`isLite` prop対応）
- **SettingsModal** (~行2306): 設定モーダル（`isLite` prop対応）
- **App** (~行7984): メインコンポーネント（edition state管理）

### テーマシステム

- `C` -- ハードコードカラー定数（sumi, washi, stamp, green等）
- `T` -- CSS Custom Properties参照（`var(--rp-accent)`, `var(--rp-text)` 等）。ダーク/ライト切替で値が変わる
- `T.accent` -- ライトテーマ: `#1C1917`（墨黒）、ダークテーマ: `#E7E5E4`（和紙白）に自動反転
- `C.stamp` -- `#DC2626`（朱赤）ロゴ印鑑のみに使用、UIアクセントとは分離

### Lite/Pro版

`edition` state (`'lite'`|`'pro'`) で切替。`isLite` boolean propを各コンポーネントに伝播。

- Lite: ファイルアップロード＋自動検出＋プレビュー＋エクスポートのみ
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

- `RedactPro.tsx` は `@ts-nocheck` 付き。新規コードは `src/lib/` 配下に型安全なモジュールとして切り出すこと
- AIプロバイダのAPIキーはサーバーサイド（`/api/ai`）経由でのみ使用する。クライアントに露出させない
- `/api/scrape` はSSRF対策済み。プライベートIPレンジ・メタデータエンドポイントへのアクセスを遮断。変更時はセキュリティを維持すること
- 日本人名辞書 (`SURNAMES`, `GIVEN_NAMES`) と組織名除外辞書 (`NON_NAME_WORDS`) は `detection.ts` にある。辞書の変更はテストで検証すること
- 偽陽性フィルタ（年号文脈・文書日付の除外等）は `detectRegex` 内に実装。正規表現パターン変更時は必ず既存テストを通すこと
- モジュール分割計画は `docs/REFACTOR_PLAN.md` を参照
