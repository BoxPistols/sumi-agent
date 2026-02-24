# コントリビューションガイド

Sumi へのコントリビューションを歓迎します。

## 開発環境のセットアップ

**Node.js 20 以上** と **pnpm** が必要です。

```bash
git clone https://github.com/BoxPistols/sumi.git
cd sumi
pnpm install
pnpm dev         # 開発サーバー起動
pnpm build       # ビルド確認
pnpm test        # テスト実行
pnpm lint        # Lint
pnpm type-check  # 型チェック
```

## ブランチとPRの流れ

1. リポジトリをフォークする
2. フィーチャーブランチを作成する（`feat/機能名`、`fix/修正内容` など）
3. 変更をコミットする
4. フォーク先にプッシュし、Pull Request を作成する
5. PR の説明に変更内容と動作確認方法を記載する

`main` ブランチへの直接プッシュは行わないでください。

## コミットメッセージ

Conventional Commits 形式を使用してください。メッセージは日本語で簡潔に記述します。

```
feat: バッチ処理に進捗表示を追加
fix: PDF解析時の文字化けを修正
refactor: 検出エンジンのパフォーマンス改善
docs: API設定手順を追記
```

- 絵文字は使用しない
- 1行目は50文字以内を目安に

## コードスタイル

- **TypeScript strict モード** で記述する（`Sumi.tsx` は例外として `@ts-nocheck`）
- **ESLint** + **Prettier** でフォーマット統一（`pnpm fix` で自動修正可能）
- パスエイリアス `@/*` は `src/*` に対応
- named export を優先する（default export は Next.js の規約に従う場合のみ）
- CSS-in-JS は使わない。CSS Custom Properties + インラインスタイルで構成
- 新規コードは `src/lib/` 配下に型安全なモジュールとして作成する

## テスト

- テストフレームワークは **Vitest**
- 検出ロジック（`src/lib/`）の変更時はテストの追加・更新を行う
- PR 提出前に以下が通ることを確認する:
  - `pnpm build`
  - `pnpm test`
  - `pnpm lint`
  - `pnpm type-check`

## セキュリティに関する注意

- API キーはサーバーサイド（`/api/ai`）経由でのみ使用し、クライアントに露出させない
- `/api/scrape` の SSRF 対策を維持すること

## 質問・相談

Issue や Discussion で気軽にどうぞ。
