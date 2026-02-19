# RedactPro

日本語履歴書・職務経歴書のPII自動検出・マスキングツール。Next.js 15 (App Router) + React 19 + TypeScript。

## コードスタイル

- TypeScript strict モード (`tsconfig.json`)
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
- コミットメッセージは日本語で簡潔に。以下は含めない:
  - 絵文字
  - `Generated with Claude Code`
  - `Co-Authored-By: Claude`
  - 冗長な定量値（変更ファイル数等）
