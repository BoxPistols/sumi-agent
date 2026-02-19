# RedactPro

日本語の履歴書・職務経歴書に含まれる個人情報（PII）を自動検出・マスキングするWebアプリケーション。

[English version](docs/README_EN.md)

---

## コンセプト

転職活動や人材紹介の現場では、候補者の職務経歴書を社外に共有する前に個人情報を除去する作業が日常的に発生する。しかし手作業によるマスキングには見落としのリスクがあり、特に日本語文書では氏名・住所・電話番号などが多様な表記で出現するため、漏れなく処理するのは困難である。

RedactPro はこの課題を解決するために、以下の設計思想で構築されている。

### 日本語文書に特化した検出

汎用的なPII検出ツールは英語圏向けに設計されたものが多く、日本語特有の表記揺れ（全角/半角、元号、フリガナ、住所体系）に十分対応できない。RedactPro は日本語文書のパターンを前提とした検出ロジックを独自に実装している。

### 4層ハイブリッド検出

単一の手法では検出精度に限界がある。RedactPro は正規表現・辞書照合・ヒューリスティクス・AI の4層を組み合わせ、それぞれの弱点を補完する設計としている。

### ブラウザ完結のプライバシー

個人情報を扱うツールだからこそ、データの外部送信を最小限にする設計が重要である。正規表現・辞書・ヒューリスティクスによる検出はすべてブラウザ上で完結する。AIによる補完検出はオプションであり、使用しなくても基本的な検出は十分に機能する。

---

## 主な機能

### 入力

- **ファイル読み込み** -- PDF, Word (.docx), Excel (.xlsx/.ods), CSV, Markdown, HTML, RTF, JSON, ODT, テキストファイルに対応
- **URLスクレイピング** -- Wantedly, LinkedIn, LAPRAS 等の公開プロフィールページからHTML取得（サーバーサイドプロキシによりCORS回避）
- **テキスト/HTML直接貼付** -- スクレイピング不可のSPAサイト向けフォールバック

### 検出

- **正規表現** -- メールアドレス、電話番号、郵便番号、住所、生年月日、URL、マイナンバー等
- **日本人名辞書** -- 姓・名の辞書照合（空白あり/なし両対応）
- **ラベル近傍推定** -- 「氏名：」「担当：」等のラベル直後の文字列から名前を推定
- **AI補完** -- Claude / OpenAI / Gemini による追加検出とマージ

### マスキング

- カテゴリ別ON/OFF（氏名、連絡先、住所、個人情報、URL、組織名）
- 3段階プリセット（基本 / 標準 / 厳格）
- 都道府県の残留オプション（住所を「東京都[住所詳細非公開]」のように部分マスキング）
- 氏名イニシャル変換（フリガナからローマ字イニシャルを生成）

### 出力

- テキスト / Markdown / CSV / Excel / PDF / Word 形式でエクスポート
- diff表示（マスキング前後の比較）
- ダーク/ライトテーマ切替

---

## アーキテクチャ

### 全体構成

```
                          +--------------------+
  ファイル/テキスト/URL → | クライアント (React) | → マスキング結果
                          +--------+-----------+
                                   |
             +---------------------+---------------------+
             |                     |                     |
     正規表現検出            辞書+ヒューリスティクス    (オプション)
     detectRegex()          detectJapaneseNames()     AI補完検出
             |                     |                     |
             +---------------------+---------------------+
                                   |
                            detectAll()
                            重複排除・統合
                                   |
                            mergeDetections()
                            AI結果をマージ
                                   |
                            applyRedaction()
                            プレースホルダー置換
```

### 検出パイプライン

入力テキストは以下の順に処理される。

1. **正規化** (`normalizeText`) -- 全角英数字・記号を半角に変換し、表記揺れを吸収する
2. **正規表現検出** (`detectRegex`) -- メール、電話番号、郵便番号、住所、生年月日、URL、マイナンバー、フリガナ等を検出する。偽陽性フィルタ（年号文脈の数字列除外、文書日付と生年月日の区別等）を内蔵している
3. **日本人名検出** (`detectJapaneseNames`) -- 3段階のアプローチで名前を検出する
   - **辞書照合**: 姓辞書 + 名辞書の組み合わせでフルネームを特定
   - **ラベル近傍**: 「氏名：」等のラベル直後にある姓辞書ヒットから名前を推定
   - **ヒューリスティクス**: ラベル近傍の漢字列を名前候補として抽出（信頼度を下げて提示）
4. **統合** (`detectAll`) -- 正規表現と名前検出の結果を統合し、カテゴリ+値の重複を排除する
5. **AI補完** (`mergeDetections`) -- AIが返した検出結果を既存の結果にマージする（重複は除外）
6. **マスキング** (`applyRedaction`) -- 有効な検出項目をプレースホルダーに置換する。長い文字列から優先的に置換することで、部分一致による誤置換を防いでいる

### 検出結果の型

すべての検出結果は `Detection` 型で統一管理される。

```typescript
interface Detection {
  id: string // 一意識別子
  type: string // 検出パターンID (email, phone, name_dict 等)
  label: string // 表示用ラベル
  category: string // カテゴリ (name, contact, address, personal, web, organization)
  value: string // 検出された文字列
  source: 'regex' | 'dict' | 'ai' | 'heuristic' // 検出手法
  confidence: number // 信頼度 (0-1)
  enabled: boolean // ユーザーによるON/OFF
}
```

各検出にはカテゴリ・信頼度・ソースが付与されており、ユーザーが個別にON/OFFを切り替えられる。

### 偽陽性対策

日本語文書では数字列が電話番号・郵便番号・年月日のいずれにもマッチしうる。RedactPro は以下のフィルタを実装している。

- **年号文脈の除外** -- 「2020年4月-2023年3月」のような期間表記に含まれる数字を電話番号やマイナンバーと誤検出しない
- **文書日付の区別** -- 「作成日：2024年1月15日」のようなラベルが直前にある場合、生年月日と判定しない
- **組織名辞書による除外** -- 「株式会社」「エンジニア」等の職種・組織名は名前として検出しない

### セキュリティ

#### APIキーの保護

AIプロバイダへのリクエストはサーバーサイドのAPI Route (`/api/ai`) を経由する。APIキーはサーバー環境変数にのみ存在し、クライアントには一切露出しない。

#### スクレイピングプロキシのSSRF対策

`/api/scrape` エンドポイントは以下の多層防御を実装している。

- プライベートIPレンジ (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x) へのアクセスを遮断
- クラウドメタデータエンドポイント (metadata.google.internal 等) をブロック
- リダイレクト先URLの再検証（リダイレクトによるSSRF回避を防止）
- URL内の認証情報を拒否
- レスポンスサイズ上限 5MB / Content-Type制限 (text/html)
- IPあたりのレートリミット（環境変数で設定可能）

---

## セットアップ

### 前提条件

- Node.js 20 以上
- pnpm 9 以上

### インストール

```bash
git clone https://github.com/BoxPistols/redact-pro.git
cd redact-pro
pnpm install
```

### 環境変数

`.env.local` を作成する。

```bash
cp .env.example .env.local
```

```env
# AI APIキー（サーバーサイドでのみ使用）
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_AI_API_KEY=AIza...

# スクレイピング設定
SCRAPE_ENABLED=true
SCRAPE_RATE_LIMIT=30
```

> APIキーはサーバーサイドAPI Route (`/api/ai`) 経由で使用されるため、クライアントには露出しない。

### 開発サーバー

```bash
pnpm dev
```

http://localhost:3000 で起動する。

---

## プロジェクト構成

```
redact-pro/
  src/
    app/
      page.tsx              -- エントリーポイント
      layout.tsx            -- Root Layout（メタデータ、フォント）
      RedactPro.tsx         -- メインアプリケーション
      api/
        ai/route.ts         -- AIプロキシ（OpenAI / Claude / Gemini）
        scrape/route.ts     -- URLスクレイピングプロキシ
    lib/
      constants.ts          -- AIプロバイダ設定、カテゴリ、プリセット
      detection.ts          -- PII検出エンジン（正規表現、辞書、ヒューリスティクス）
      redaction.ts          -- マスキングエンジン（プレースホルダー置換）
      __tests__/
        detection.test.ts   -- 検出エンジンのテスト
        redaction.test.ts   -- マスキングエンジンのテスト
  docs/
    README_EN.md            -- 英語版README
    REFACTOR_PLAN.md        -- モジュール分割ロードマップ
  vitest.config.ts
  next.config.ts
  tsconfig.json
  package.json
```

### モジュール分割の現状

現在 `RedactPro.tsx` にUIとロジックが同居するモノリス構成から、段階的にモジュール分割を進めている。

分割済み:

- `src/lib/constants.ts` -- 定数・設定・型定義
- `src/lib/detection.ts` -- 検出エンジン（正規表現、辞書、ヒューリスティクス）
- `src/lib/redaction.ts` -- マスキングエンジン
- `src/app/api/ai/route.ts` -- AIプロキシ（レートリミット付き）
- `src/app/api/scrape/route.ts` -- スクレイピングプロキシ（SSRF対策済み）

今後の計画は [docs/REFACTOR_PLAN.md](docs/REFACTOR_PLAN.md) を参照。

---

## API Routes

### `POST /api/ai`

AIプロバイダへのリクエストをサーバーサイドで中継する。

- レートリミット: IPあたり60リクエスト/分
- 対応プロバイダ: OpenAI, Anthropic (Claude), Google (Gemini)
- リクエスト形式: `{ provider, model, messages, maxTokens?, system? }`

### `GET /api/scrape?url=...`

指定URLのHTMLをサーバーサイドでfetchして返す。

- SSRF対策: プライベートIPレンジ・クラウドメタデータエンドポイントへのアクセスを遮断
- リダイレクト先URLの再検証
- レスポンスサイズ上限: 5MB
- Content-Type制限: text/html のみ
- レートリミット: IPあたり30リクエスト/分（環境変数で設定可能）

---

## テスト

Vitest を使用。

```bash
# テスト実行
pnpm test

# ウォッチモード
pnpm test:watch
```

テスト対象:

- テキスト正規化 (`normalizeText`)
- 都道府県抽出 (`extractPrefecture`)
- 名前イニシャル変換 (`nameToInitial`, `buildReadingMap`)
- 正規表現検出 (`detectRegex`) -- メール、URL、電話番号、郵便番号、生年月日、住所、マイナンバー、偽陽性フィルタ
- 日本人名検出 (`detectJapaneseNames`) -- 辞書照合、ラベル近傍、組織名除外
- 統合検出 (`detectAll`, `mergeDetections`)
- マスキング (`applyRedaction`) -- 基本置換、都道府県保持、イニシャル変換、無効化検出のスキップ
- プレースホルダー正規表現 (`PLACEHOLDER_RE`)

---

## コマンド一覧

| コマンド          | 説明                          |
| ----------------- | ----------------------------- |
| `pnpm dev`        | 開発サーバー起動（Turbopack） |
| `pnpm build`      | プロダクションビルド          |
| `pnpm start`      | プロダクションサーバー起動    |
| `pnpm test`       | テスト実行                    |
| `pnpm test:watch` | テスト（ウォッチモード）      |
| `pnpm lint`       | ESLint 実行                   |
| `pnpm type-check` | TypeScript 型チェック         |

---

## デプロイ

### Vercel

```bash
pnpm i -g vercel
vercel
```

環境変数（`OPENAI_API_KEY` 等）はVercelのダッシュボードで設定する。

### Docker

```dockerfile
FROM node:20-slim AS base
RUN corepack enable pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
```

---

## 技術スタック

| 領域           | 技術                                                |
| -------------- | --------------------------------------------------- |
| フレームワーク | Next.js 15 (App Router)                             |
| UI             | React 19                                            |
| 言語           | TypeScript 5                                        |
| テスト         | Vitest                                              |
| パッケージ管理 | pnpm                                                |
| ファイル解析   | mammoth (docx), xlsx, papaparse (csv)               |
| AI             | OpenAI API, Anthropic API, Google Generative AI API |

---

## ライセンス

MIT
