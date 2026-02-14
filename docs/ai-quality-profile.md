# AI品質プロファイル設計（速度 / バランス / 品質）

最終更新: 2026-02-15

## 目的

RedactPro の AI処理は複数のタスク（PDFテキスト再構成 / PII検出 / 再フォーマット 等）に分かれますが、**タスクごとに「品質・速度・コスト」の最適解が異なる**ため、単一モデル固定だと以下の問題が起きやすくなります。

- **PII検出**: 「速い」ことがUXに直結する一方、多少の品質低下は辞書・正規表現で補える
- **文章構造の再生成（再構成/再フォーマット）**: 「品質」を落とすと PDF 化や提出物の体裁が破綻しやすい
- **GPT-5 系の推論モデル**: `max_completion_tokens` が小さいと **可視テキストが空**になり得る（推論トークン消費が先行）

このドキュメントは、上記を踏まえて導入した **AI品質プロファイル**（速度/バランス/品質）と、**失敗時のみ上位モデルへフォールバック**するアルゴリズムを説明します。

## 非ゴール（この設計で「やらないこと」）

- タスクごとにUIで細かくモデルを選べる「完全なカスタムマッピング」
- すべてのプロバイダーで「Vision/OCR」を同一IFで保証する（能力差があるため）
- 分散環境で完全に厳密なレート制限（現状はインメモリ）

## 用語

- **provider**: `openai` / `anthropic` / `google`
- **model**: 例 `gpt-5-nano`, `gpt-5-mini`, `claude-sonnet-4-20250514`
- **tier**: 1=高速/低コスト、2=高品質寄り、3=さらに高精度（プロバイダー依存）
- **profile**: `speed` / `balanced` / `quality`
- **formatModel**: 文章整形・再構成・再フォーマットに使う主モデル
- **detectModel**: PII検出に使う主モデル
- **fallbackModel**: 失敗時にのみ再試行する上位モデル

## 全体フロー（どこで何のモデルが使われるか）

```mermaid
flowchart TD
  upload[Upload_or_Paste_or_URL] --> parse[Parse_Text]
  parse --> ocr{SparsePages?}
  ocr -->|Yes| aiOcr[AI_OCR(formatModel)]
  ocr -->|No| cleanup
  aiOcr --> cleanup[AI_Cleanup_Text(formatModel)]
  cleanup --> regexDict[Regex_and_Dict_Detect]
  regexDict --> aiDetect{AI_PII_Detect_On?}
  aiDetect -->|Yes| pii[AI_PII_Detect(detectModel)]
  aiDetect -->|No| done[Editor]
  pii --> mask[Merge_and_Mask]
  mask --> done
  done --> reformat[AI_Reformat(formatModel)]
```

補足:

- `balanced` プロファイルでは **検出= tier1**、**整形= tier2** を基本とします
- 失敗時のみ `fallbackModel` で再試行し、成功すればその結果を採用します

## プロファイル仕様

### 速度（`speed`）

- **detectModel**: tier1
- **formatModel**: tier1
- **フォールバック**: detect/format ともに失敗時のみ tier2 へ

用途:

- とにかく速く回したい（初回確認、粗いプレビュー）

### バランス（`balanced`）※デフォルト推奨

- **detectModel**: tier1（高速）
- **formatModel**: tier2（高品質）
- **フォールバック**:
  - detect: 失敗時のみ tier2
  - format: 通常 tier2 なのでフォールバック不要（tier1 を選んだ場合のみ tier2 へ）

用途:

- **マスキング精度・文章構造を高めに維持**しながら、全体の体感速度も落としすぎない

### 品質（`quality`）

- **detectModel**: tier2（存在する場合）
- **formatModel**: 最大 tier（例: Claude Sonnet 4.5 / Gemini 2.5 Pro 等）
- **フォールバック**: 基本不要（既に上位モデルを使うため）

用途:

- 仕上げ・提出物の最終形など、品質最優先

## モデル選択アルゴリズム（実装指針）

前提:

- `AI_PROVIDERS[].models[]` が `tier` を持つ
- tier は「相対的な品質/コスト段階」を表し、同一プロバイダー内で比較する

### 1) formatModel の決定（`pickFormatModelForProfile`）

概念:

- `speed` → tier1
- `balanced` → tier2（なければ tier1）
- `quality` → maxTier

### 2) detectModel の決定（`getModelsForRun`）

概念:

- `quality` のみ detect を tier2（なければ tier1）
- それ以外は detect を tier1

### 3) fallbackModel の決定

- detectFallbackModel: detectTier+1 が存在する場合に設定（例: tier1 → tier2）
- formatFallbackModel: **formatModel が tier1 の場合のみ** tier2 を設定

## フォールバック判定（「何を失敗」とみなすか）

タスクごとに「失敗」の定義が異なります。

### PII検出（`detectWithAI`）

失敗条件（代表例）:

- JSON配列が見つからない（`[...]` が抽出できない）
- JSON parse エラー
- 期待する配列構造でない

処理:

1. `detectModel` で1回実行
2. 失敗なら `detectFallbackModel` がある場合のみ再試行
3. それでも失敗なら「AI検出スキップ」として UI に反映（辞書/正規表現は残る）

### PDFテキスト再構成（`aiCleanupText`）

失敗条件:

- 出力が短すぎる / 行数が減りすぎる（情報損失の恐れ）

処理:

- バッチ単位で `formatModel` を実行し、**妥当性検証に落ちたら** `formatFallbackModel` がある場合のみ再試行
- 最終結果が全体として情報損失が大きい場合は `null` を返し、元テキストを維持

### AI再フォーマット（`AIPanel`）

失敗条件:

- 応答が空文字（UX上「何も起きない」を防ぐ）
- API例外

処理:

- `model`（formatModel相当）で実行
- tier1 の場合のみ `fallbackModel` を用意し、失敗/空なら再試行
- それでも空なら明示エラーを表示

## OpenAI GPT-5 の空レスポンス対策（reasoning_effort）

GPT-5 系（推論モデル）は、`max_completion_tokens` が小さいと **推論トークンを先に使い切り**、`message.content` が空のまま `finish_reason=length` になることがあります。

対応:

- サーバー側AIプロキシ（`/api/ai`）で、**`model` が `gpt-5*` の場合に `reasoning_effort: "minimal"` を付与**
- 目的は「短いテスト呼び出しや軽量処理で、空文字を返さない」こと

注意:

- 文章生成でより強い推論が必要なら、将来的に `profile` に応じて `reasoning_effort` を切り替える余地があります（例: `quality` は `low/medium`）。

## 汎用性（現状の評価）

強い点（汎用的）

- provider 追加は `AI_PROVIDERS` へ追記するだけで、tierベース選択が自動適用される
- `profile` は「タスク別に異なる最適化」を実現する抽象化として妥当（速度/品質の期待が直感的）
- フォールバックは「失敗時のみ」なので、回数制限/コストを守りやすい

弱い点（今後の拡張余地）

- OCR（PDF document 入力）はプロバイダー能力差が大きく、tierだけでは選び切れない
  - 将来的には `capabilities: { vision: true, document: true }` のような能力フラグを導入し、タスクごとに provider を選ぶ設計がより汎用的
- `AI_PROVIDERS` の tier 定義は「相対」なので、プロバイダー間の絶対比較（例: Claude tier2 vs OpenAI tier2）は保証しない
- レート制限がインメモリのため、複数インスタンス本番では精度が落ちる（Redis移行が望ましい）

## 追加・変更のガイド

### 新モデルを追加する

1. `AI_PROVIDERS` にモデル定義を追加
2. `tier` を付ける（1/2/3…）
3. `defaultModel`（任意）を更新

これだけで `speed/balanced/quality` の選択ロジックが追従します。

### 新しいAIタスクを追加する（例: 会社名NER強化）

推奨:

- `getModelsForRun(settings)` を起点に、**タスク別に detect/format のどちらを使うか**決める
- 失敗条件（空/構造不正/品質検証）を定義して、必要時のみフォールバック

## テスト観点（最小）

- `balanced` で **PII検出が tier1**、再フォーマットが tier2 を使うこと（UIステータスで確認）
- GPT-5 系で `maxTokens` が小さくても空になりにくいこと（接続テストで確認）
- フォールバックが「失敗時のみ」発動すること（JSONパース不可能ケースなど）
