# RedactPro

日本語履歴書・職務経歴書のPII自動検出・マスキングツール。Next.js 15 (App Router) + React 19 + TypeScript。

## 重要ルール

- **マージ・プッシュ・デプロイは必ずユーザーの明示的な承認を得てから実行する。** 勝手にマージ・本番デプロイしない
- **修正はローカルで検証してからプッシュする。** 未テストの変更をリモートに送らない
- ユーザーが「push」と言った場合: commit → push → （PRがあれば説明更新）を一連で完了する。ファイル編集だけで止めない
- PRレビュー時は現在のブランチの最新PRを自動で選択する。どのPRか聞かない
- 変更が意図通りか不明な場合、質問を繰り返すより先にコードを調査する

## コードスタイル

- TypeScript strict モード (`tsconfig.json`)
- 新規ファイルはTypeScriptで作成する
- ESLint は `eslint-config-next` を使用
- named export を優先（default export は Next.js の規約に従う場合のみ）
- CSS-in-JS は使わない -- CSS Custom Properties + インラインスタイルで構成
- パスエイリアス: `@/*` = `./src/*`

## コマンド

| コマンド          | 用途                      |
| ----------------- | ------------------------- |
| `pnpm dev`        | 開発サーバー（Turbopack） |
| `pnpm build`      | プロダクションビルド      |
| `pnpm test`       | Vitest テスト実行         |
| `pnpm test:watch` | Vitest ウォッチモード     |
| `pnpm lint`       | ESLint                    |
| `pnpm type-check` | `tsc --noEmit`            |

## 検証フロー

コード変更後は以下の順で検証する:

1. `pnpm build` -- ビルドエラーがないこと
2. `pnpm test` -- 全テスト通過
3. UI変更の場合は `pnpm dev` でブラウザ確認を促す

## Git規約

- コミットメッセージは日本語で簡潔に
- 以下は含めない:
  - 絵文字
  - `Generated with Claude Code`
  - `Co-Authored-By: Claude`
  - 冗長な定量値（変更ファイル数等）
- force push、`--no-verify` は明示的指示がない限り使わない
- `git add .` よりも対象ファイルを明示する

## デバッグ指針

- UI/スタイル修正は正しいコンポーネントとCSSセレクタを特定してから修正する。効かない場合は対象要素が間違っていないか先に確認
- 2回試しても直らない場合、別のアプローチを検討するか、原因分析を報告する
- 本番環境固有の問題はデプロイ設定（env, CSP, vercel.json等）を先に確認する

## アーキテクチャ

```
src/
  app/
    page.tsx            -- エントリーポイント
    RedactPro.tsx       -- メインUI（モノリス、段階的に分割中）
    api/ai/route.ts     -- AIプロキシ（レートリミット付き）
    api/scrape/route.ts -- スクレイピングプロキシ（SSRF対策済み）
  lib/
    constants.ts        -- 定数・型定義・AIプロバイダ設定
    detection.ts        -- PII検出エンジン（正規表現 + 辞書 + ヒューリスティクス）
    redaction.ts        -- マスキングエンジン
    __tests__/          -- Vitest テスト
```

### 検出パイプライン

`normalizeText` → `detectRegex` → `detectJapaneseNames` → `detectAll`（統合）→ `mergeDetections`（AI結果マージ）→ `applyRedaction`

### リファクタリング状況

`RedactPro.tsx` は `@ts-nocheck` 付きのモノリス。分割計画は @docs/REFACTOR_PLAN.md を参照。

## 注意事項

- `RedactPro.tsx` は `@ts-nocheck` が付いている。新規コードを追加する場合は `src/lib/` 配下に型安全なモジュールとして切り出すこと
- AIプロバイダのAPIキーはサーバーサイド（`/api/ai`）経由でのみ使用する。クライアントに露出させない
- `/api/scrape` はSSRF対策済み。プライベートIPレンジ・メタデータエンドポイントへのアクセスを遮断している。変更時はセキュリティを維持すること
- 日本人名辞書 (`SURNAMES`, `GIVEN_NAMES`) と組織名除外辞書 (`NON_NAME_WORDS`) は `detection.ts` にある。辞書の変更はテストで検証すること
- 偽陽性フィルタ（年号文脈・文書日付の除外等）は `detectRegex` 内に実装されている。正規表現パターンを変更する場合は必ず既存テストを通すこと
