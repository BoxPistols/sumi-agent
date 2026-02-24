# Claude Code 包括ガイド

Claude Code の設定体系・設計思想・実践的な運用ノウハウを、初めて触る人にも分かるようにまとめたドキュメント。

---

## 目次

1. [Claude Code とは](#1-claude-code-とは)
2. [設定ファイルの階層構造](#2-設定ファイルの階層構造)
3. [CLAUDE.md — AIへの指示書](#3-claudemd--aiへの指示書)
4. [settings.json — 権限とプラグイン](#4-settingsjson--権限とプラグイン)
5. [Skills — カスタムスラッシュコマンド](#5-skills--カスタムスラッシュコマンド)
6. [Hooks — 自動実行トリガー](#6-hooks--自動実行トリガー)
7. [MCP サーバー — 外部ツール連携](#7-mcp-サーバー--外部ツール連携)
8. [Memory — セッション間の記憶](#8-memory--セッション間の記憶)
9. [Plans — 実装計画の管理](#9-plans--実装計画の管理)
10. [権限モデル](#10-権限モデル)
11. [本プロジェクトの設定解説](#11-本プロジェクトの設定解説)
12. [Insights レポートから学んだベストプラクティス](#12-insights-レポートから学んだベストプラクティス)

---

## 1. Claude Code とは

Claude Code は Anthropic が提供する **CLI ベースの AI コーディングアシスタント**。
ターミナルから直接起動し、以下を対話的に実行できる:

- ファイルの読み書き・編集
- Bash コマンド実行（git, npm, テスト等）
- コードベース全体の検索・解析
- Web 検索・ページ取得
- GitHub CLI 連携（PR作成・レビュー・マージ）

### VS Code / Cursor との違い

|              | Claude Code (CLI)          | Cursor / Copilot (IDE) |
| ------------ | -------------------------- | ---------------------- |
| **動作環境** | ターミナル                 | エディタ内             |
| **操作単位** | プロジェクト全体           | 開いているファイル中心 |
| **自律性**   | 複数ファイル横断で自律作業 | 補完・部分修正が中心   |
| **Git操作**  | commit/push/PR作成まで一貫 | 別途ターミナルが必要   |
| **設定方式** | CLAUDE.md + settings.json  | .cursorrules 等        |

### 基本的な使い方

```bash
# プロジェクトルートで起動
cd /path/to/project
claude

# ワンショット実行（非対話モード）
claude -p "全テストを実行して結果を報告"

# 特定のモデルを指定
claude --model claude-sonnet-4-6
```

---

## 2. 設定ファイルの階層構造

Claude Code の設定は **3 層の階層** で管理される。下位が上位を上書きする:

```
[1] グローバル設定     ~/.claude/
[2] プロジェクト設定   <repo>/.claude/ + <repo>/CLAUDE.md
[3] ランタイム設定     ~/.claude/projects/<hash>/
```

### ディレクトリ構造の全体像

```
~/.claude/                              # グローバル設定ルート
├── CLAUDE.md                           # 全プロジェクト共通の指示書
├── settings.json                       # プラグイン有効化等
├── settings.local.json                 # ローカル専用設定（git管理外）
├── skills/                             # カスタムスキル（スラッシュコマンド）
│   └── ui-ux-pro-max/
│       ├── SKILL.md                    # スキル定義
│       ├── scripts/                    # 実行スクリプト
│       └── data/                       # データファイル
├── plugins/                            # インストール済みプラグイン
│   ├── installed_plugins.json
│   └── blocklist.json
├── projects/                           # プロジェクト別ランタイムデータ
│   └── -Users-ai-dev-26Apps-sumi/
│       └── memory/
│           └── MEMORY.md               # プロジェクト固有の記憶
├── plans/                              # 実装計画ファイル
├── todos/                              # タスク管理データ
├── tasks/                              # 構造化タスク
├── history.jsonl                       # 会話履歴
└── usage-data/                         # Insights レポート
    └── report.html

<repo>/                                 # プロジェクトルート
├── CLAUDE.md                           # プロジェクト固有の指示書（git管理）
├── .claude/
│   └── settings.local.json             # プロジェクト固有の権限設定
└── docs/
    └── REFACTOR_PLAN.md                # CLAUDE.md から参照可能
```

### 設定の優先順位

```
プロジェクト CLAUDE.md  >  グローバル CLAUDE.md
.claude/settings.local.json は各レベルでマージされる
```

**重要**: `CLAUDE.md` はリポジトリにコミットしてチーム共有できる。
`settings.local.json` はローカル専用（`.gitignore` 推奨）。

---

## 3. CLAUDE.md — AIへの指示書

**CLAUDE.md は Claude Code の最も重要な設定ファイル。** AI が作業する際のルール・制約・コンテキストを自然言語で記述する。

### 配置場所と読み込み順

| 場所                  | 用途                                  | git管理 |
| --------------------- | ------------------------------------- | ------- |
| `~/.claude/CLAUDE.md` | 全プロジェクト共通ルール              | No      |
| `<repo>/CLAUDE.md`    | プロジェクト固有ルール                | Yes     |
| `<repo>/docs/*.md`    | CLAUDE.md から `@docs/FILE.md` で参照 | Yes     |

### 効果的な CLAUDE.md の書き方

#### やるべきこと

```markdown
## 重要ルール

- マージ・デプロイは必ず承認を得てから実行する ← 具体的な禁止事項
- 「push」と言ったら commit→push を一連で完了 ← 期待する動作を明示

## コマンド

| `pnpm test` | テスト実行 | ← よく使うコマンドを表にする

## デバッグ指針

- 2回失敗したら別アプローチを検討 ← 判断基準を数値で示す
```

#### 避けるべきこと

```markdown
- 曖昧な指示: 「良い感じにして」「適切に判断して」
- 長文の散文: Claude は箇条書きやテーブルの方が正確に従う
- 実装詳細: CLAUDE.md はルールと方針、コードは別ファイル
- ゴミデータ: git ログや作業メモのコピペ（実際に起きた問題）
```

### 本プロジェクトの CLAUDE.md 構成

```
CLAUDE.md
├── 重要ルール        ← 最上部に配置（最も優先度が高い）
├── コードスタイル    ← TypeScript, CSS方針等
├── コマンド          ← pnpm dev/build/test/lint
├── 検証フロー        ← build→test→ブラウザ確認
├── Git規約           ← コミットメッセージ形式
├── デバッグ指針      ← 失敗時の方針
├── アーキテクチャ    ← ディレクトリ構造
└── 注意事項          ← セキュリティ・辞書変更のルール
```

---

## 4. settings.json — 権限とプラグイン

### ファイルの種類

| ファイル                             | 場所         | 用途               |
| ------------------------------------ | ------------ | ------------------ |
| `~/.claude/settings.json`            | グローバル   | プラグイン有効化   |
| `~/.claude/settings.local.json`      | グローバル   | MCP設定等          |
| `<repo>/.claude/settings.local.json` | プロジェクト | コマンド許可リスト |

### 権限設定の例（本プロジェクト）

```jsonc
// .claude/settings.local.json
{
  "permissions": {
    "allow": [
      "Bash(pnpm build:*)", // ビルド実行を許可
      "Bash(pnpm test:*)", // テスト実行を許可
      "Bash(git add:*)", // git add を許可
      "Bash(git commit:*)", // git commit を許可
      "Bash(git push:*)", // git push を許可
      "Bash(gh pr create:*)", // PR作成を許可
      "Bash(gh pr diff:*)", // PR差分取得を許可
      "Bash(python3:*)", // Python実行を許可
      "WebFetch(domain:example.com)", // 特定ドメインのfetch許可
    ],
  },
}
```

### 権限の書式

```
"Bash(コマンド:引数パターン)"     # 特定コマンドを許可
"Bash(git push:*)"               # git push を任意引数で許可
"WebFetch(domain:example.com)"   # 特定ドメインへのアクセス許可
```

`*` はワイルドカード。許可されていないコマンドは実行前にユーザーに確認が入る。

### グローバル settings.json

```jsonc
// ~/.claude/settings.json
{
  "enabledPlugins": {
    "coderabbit@claude-plugins-official": true, // CodeRabbit プラグイン有効
  },
}
```

---

## 5. Skills — カスタムスラッシュコマンド

Skills は `/command` で呼び出せるカスタムプロンプト。繰り返すワークフローを自動化する。

### ディレクトリ構造

```
~/.claude/skills/
└── my-skill/
    ├── SKILL.md          # スキル定義（必須）
    ├── scripts/          # 実行スクリプト（任意）
    └── data/             # データファイル（任意）
```

### SKILL.md の書き方

```markdown
# スキル名

ここにスキルの説明を書く。
Claude はこのプロンプトに従って動作する。

## 手順

1. `git status` で状態確認
2. 変更をステージング
3. コミットメッセージを生成
4. プッシュ
```

### 実例: このプロジェクトで使っている ui-ux-pro-max

```bash
# 呼び出し方
/ui-ux-pro-max

# できること
- 50種のUIスタイル（glassmorphism, minimalism等）からデザイン提案
- 21色のカラーパレット生成
- 8つのフレームワーク向けガイドライン
- Python スクリプトでデータベース検索
```

### 自作スキルの作成例

```bash
# PRレビュースキル
mkdir -p ~/.claude/skills/review
cat > ~/.claude/skills/review/SKILL.md << 'SKILL'
# PRレビュー

1. 現在のブランチの最新PRを `gh pr list` で特定
2. `gh pr diff` で差分取得
3. バグ、ロジックエラー、エッジケース漏れを分析
4. 構造化レビューを出力: 概要 / 問題点 / 提案
SKILL
```

---

## 6. Hooks — 自動実行トリガー

Hooks はツール実行の前後に自動でシェルコマンドを走らせる仕組み。

### 設定場所

`.claude/settings.json` または `.claude/settings.local.json` に記述:

```jsonc
{
  "hooks": {
    // ファイル編集・作成後に自動で型チェック
    "postToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "npx tsc --noEmit --pretty 2>&1 | head -20",
      },
    ],
    // コミット前にlint実行
    "preToolUse": [
      {
        "matcher": "Bash(git commit:*)",
        "command": "pnpm lint --quiet",
      },
    ],
  },
}
```

### 利用可能なフック

| フック        | タイミング   | 用途例               |
| ------------- | ------------ | -------------------- |
| `preToolUse`  | ツール実行前 | lint, 型チェック     |
| `postToolUse` | ツール実行後 | テスト, フォーマット |

### Insights レポートからの推奨

> 「buggy_code が11件」→ **Edit/Write 後に型チェックを自動実行** することで
> コミット前にエラーを検知できる。

---

## 7. MCP サーバー — 外部ツール連携

MCP (Model Context Protocol) は Claude が外部ツール・APIと連携するためのプロトコル。

### 設定方法

プロジェクトルートに `.mcp.json` を配置:

```jsonc
{
  "mcpServers": {
    "figma": {
      "type": "url",
      "url": "https://figma.com/mcp",
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
    },
  },
}
```

### 利用可能な主要MCPサーバー

| サーバー       | 用途                                           |
| -------------- | ---------------------------------------------- |
| **Figma**      | デザインからコード生成、スクリーンショット取得 |
| **GitHub**     | Issue/PR操作の拡張                             |
| **Playwright** | ブラウザ自動テスト                             |
| **Supabase**   | データベース操作                               |
| **MUI**        | MUIコンポーネントのドキュメント参照            |

### 本プロジェクトの状態

```jsonc
// ~/.claude/settings.local.json
{
  "enableAllProjectMcpServers": false, // MCPサーバーは手動有効化
}
```

---

## 8. Memory — セッション間の記憶

Memory は Claude がセッションを跨いで情報を保持する仕組み。

### 仕組み

```
~/.claude/projects/<project-hash>/memory/
└── MEMORY.md       # 自動で system prompt に注入される
```

`MEMORY.md` は **毎回のセッション開始時に自動読み込み** される。
200行を超えると切り詰められるため、簡潔に保つ。

### 記録すべきこと

- ユーザーの作業スタイル・好み
- 過去の摩擦パターンと回避策
- プロジェクト固有の重要メモ（例: 「7000行超のモノリスファイルがある」）
- 繰り返し使う設定値やパターン

### 記録すべきでないこと

- 一時的な作業状態（現在のタスク進捗等）
- 推測や未検証の結論
- CLAUDE.md と重複する内容

### 本プロジェクトの MEMORY.md

```markdown
## ユーザーの作業スタイル

- タスク指向で高速。commit→push を一連で期待
- 間違ったアプローチへの許容度が低い

## 過去の摩擦パターン

- wrong_approach が最多: 表面的修正の繰り返しが最悪パターン
- 無断マージ・デプロイ: 絶対にやらない

## プロジェクト固有メモ

- RedactPro.tsx は @ts-nocheck モノリス（7000行超）
- pnpm を使用（npm/yarn ではない）
```

---

## 9. Plans — 実装計画の管理

Plans は複雑なタスクの実装計画を構造化して管理する機能。

### 使い方

1. Claude が `EnterPlanMode` で計画モードに入る
2. コードベースを調査して計画を作成
3. `~/.claude/plans/<name>.md` に保存
4. ユーザーが承認後、実装開始

### 計画モードが有効な場面

- 新機能の追加（複数ファイルにまたがる変更）
- アーキテクチャの変更
- 複数の実装アプローチが考えられる場合
- リファクタリング

### 計画モードが不要な場面

- 1ファイルの軽微な修正
- タイポ修正
- 明確な指示がある単純タスク

---

## 10. 権限モデル

Claude Code は **安全性を重視した権限モデル** を採用している。

### 自動許可される操作

- ファイル読み取り（Read, Grep, Glob）
- Web検索
- MCP リソース読み取り

### 確認が必要な操作（デフォルト）

- ファイル書き込み（Write, Edit）
- Bash コマンド実行
- WebFetch
- MCP ツール実行

### 許可の永続化

`settings.local.json` の `permissions.allow` に追加すると、
そのコマンドは以降確認なしで実行される:

```jsonc
{
  "permissions": {
    "allow": [
      "Bash(pnpm test:*)", // pnpm test は常に許可
    ],
    "deny": [
      "Bash(rm -rf:*)", // rm -rf は常に拒否
    ],
  },
}
```

### 実行時の許可フロー

```
コマンド実行要求
    │
    ├─ allow リストに一致 → 即実行
    ├─ deny リストに一致 → 拒否
    └─ どちらでもない → ユーザーに確認プロンプト
         ├─ 許可 → 実行（一時的）
         ├─ 常に許可 → 実行 + allow に追加
         └─ 拒否 → 実行しない
```

---

## 11. 本プロジェクトの設定解説

### ファイル一覧

| ファイル                      | 役割                                           |
| ----------------------------- | ---------------------------------------------- |
| `CLAUDE.md`                   | プロジェクトルール（チーム共有、git管理）      |
| `.claude/settings.local.json` | コマンド許可リスト（ローカル専用）             |
| `docs/REFACTOR_PLAN.md`       | CLAUDE.md から `@docs/REFACTOR_PLAN.md` で参照 |

### 許可済みコマンド

```
pnpm build/test          ビルド・テスト
git add/commit/push      Git操作
gh pr/issue              GitHub CLI
python3                  スクリプト実行
curl, ls, zip            ユーティリティ
```

### 使用プラグイン

- **CodeRabbit**: PRの自動レビュー・コメント生成

### 参照ドキュメント構成

```
CLAUDE.md           → 日常の作業ルール（初めに読む）
docs/REFACTOR_PLAN.md → RedactPro.tsx の分割計画
docs/ai-quality-profile.md → AI検出品質の基準
docs/pdf-export-architecture.md → PDF出力の設計
```

---

## 12. Insights レポートから学んだベストプラクティス

134セッション・1,230メッセージの分析から得られた教訓。

### 最大の摩擦: 間違ったアプローチ（28件）

**問題**: 正しい原因を特定する前に表面的な修正を繰り返す

**対策（CLAUDE.md に反映済み）**:

```markdown
- 2回試しても直らない場合、別のアプローチを検討するか、原因分析を報告する
- UI/スタイル修正は正しいコンポーネントとCSSセレクタを特定してから修正する
```

### 無断デプロイ（複数回）

**問題**: Claude が確認なしにマージ・プッシュ・デプロイを実行

**対策（CLAUDE.md に反映済み）**:

```markdown
- マージ・プッシュ・デプロイは必ずユーザーの明示的な承認を得てから実行する
```

### ファイル編集だけで止まる

**問題**: 「push」と言ったのにファイル編集だけで完了報告

**対策（CLAUDE.md に反映済み）**:

```markdown
- ユーザーが「push」と言った場合: commit → push →（PRがあれば説明更新）を一連で完了する
```

### 推奨する追加設定

#### 1. Hooks で型チェック自動化

```jsonc
// .claude/settings.local.json に追加
{
  "hooks": {
    "postToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "pnpm type-check 2>&1 | head -20",
      },
    ],
  },
}
```

#### 2. カスタムスキルでGitワークフロー効率化

```bash
# ~/.claude/skills/push/SKILL.md
# 「/push」で commit→push→PR更新を一発実行
```

#### 3. 制約付きプロンプトテンプレート

効率的な指示の出し方:

```
[バグ名] を修正。制約:
1. ローカルで検証してからプッシュ
2. 関係ないファイルは変更しない
3. コミット前に修正内容を見せて
```

---

## 付録: よく使うコマンド一覧

### Claude Code CLI

```bash
claude                          # 対話モードで起動
claude -p "指示"                # ワンショット実行
claude --model claude-opus-4-6  # モデル指定
claude /help                    # ヘルプ
claude /compact                 # コンテキスト圧縮
claude /clear                   # 会話リセット
claude /review                  # PRレビュー
claude /insights                # 使用状況レポート
```

### セッション内コマンド

| コマンド         | 機能                     |
| ---------------- | ------------------------ |
| `/help`          | ヘルプ表示               |
| `/compact`       | 会話履歴を要約して圧縮   |
| `/clear`         | 会話履歴をクリア         |
| `/review`        | PRレビューを実行         |
| `/commit`        | 変更をコミット           |
| `/insights`      | 使用状況レポート生成     |
| `/ui-ux-pro-max` | UIデザインスキル呼び出し |

---

## 付録: トラブルシューティング

### 「許可が求められすぎる」

→ `.claude/settings.local.json` の `permissions.allow` によく使うコマンドを追加

### 「前回の文脈を覚えていない」

→ `~/.claude/projects/<hash>/memory/MEMORY.md` に重要情報を記録

### 「CLAUDE.md が読み込まれない」

→ ファイルがプロジェクトルート直下にあるか確認。サブディレクトリの CLAUDE.md は自動読み込みされない

### 「コマンドがタイムアウトする」

→ Bash ツールのデフォルトタイムアウトは120秒。長い処理は `timeout` パラメータを指定するか、バックグラウンド実行を依頼
