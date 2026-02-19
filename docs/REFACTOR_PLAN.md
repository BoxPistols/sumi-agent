# リファクタリング計画

`RedactPro.tsx` のモノリス構成を段階的にモジュール分割する計画。

---

## 現状

`src/app/RedactPro.tsx` にUI・ロジック・定数が同居している。
`// @ts-nocheck` で型チェックをバイパス中。

### 分割済み

| モジュール     | ファイル                      | 内容                                                       |
| -------------- | ----------------------------- | ---------------------------------------------------------- |
| 定数・設定     | `src/lib/constants.ts`        | AIプロバイダ、カテゴリ、マスクプリセット、エクスポート形式 |
| 検出エンジン   | `src/lib/detection.ts`        | 正規表現パターン、日本人名辞書、検出関数群                 |
| マスキング     | `src/lib/redaction.ts`        | プレースホルダー定義、マスキング関数                       |
| AIプロキシ     | `src/app/api/ai/route.ts`     | サーバーサイドAI中継（OpenAI / Claude / Gemini）           |
| スクレイピング | `src/app/api/scrape/route.ts` | URLフェッチプロキシ（SSRF対策済み）                        |
| テスト         | `src/lib/__tests__/`          | detection.test.ts, redaction.test.ts                       |

---

## Phase 1: 型安全化

### 1-1. 型定義の集約

```
src/types/index.ts          # Detection, AppSettings, ParseResult 等
```

### 1-2. RedactPro.tsx から定数を削除

`RedactPro.tsx` 内に残っている定数定義を `src/lib/constants.ts` のインポートに置換する。
テーマ定数 (`C`, `T`) も含む。

---

## Phase 2: ロジック分離

### 2-1. テーマ

```
src/lib/theme.ts            # CSS Custom Properties、ダーク/ライト変数
```

### 2-2. AI呼び出し

```
src/lib/ai/
  call.ts                   # callAI() -- 統一プロバイダルーティング
  detect.ts                 # detectWithAI() -- AI経由PII検出
  reformat.ts               # aiReformat() -- テキスト整形
  ocr.ts                    # ocrSparsePages(), aiCleanupText()
```

### 2-3. ファイルパーサー

```
src/lib/parsers/
  encoding.ts               # detectEncoding(), decodeText()
  pdf.ts                    # parsePDF()
  docx.ts                   # parseDOCX() (mammoth)
  xlsx.ts                   # parseXLSX()
  csv.ts                    # parseCSV()
  text.ts                   # parseTXT(), parseMD()
  html.ts                   # parseHTML(), extractTextFromHTML()
  rtf.ts                    # parseRTF()
  json.ts                   # parseJSON()
  odt.ts                    # parseODT()
  index.ts                  # parseFile() -- ルーター
```

### 2-4. URLスクレイピング（クライアント側）

```
src/lib/scraper/
  proxies.ts                # CORSプロキシ定義、fetchURL()
  scrape.ts                 # scrapeURL()
```

---

## Phase 3: コンポーネント分離

```
src/components/
  ui/
    Badge.tsx
    Button.tsx
    Toggle.tsx
    Pill.tsx
  SettingsModal.tsx
  PreviewModal.tsx
  DiffView.tsx
  UploadScreen.tsx
  EditorScreen.tsx
  AIPanel.tsx
```

---

## Phase 4: Hook化

```
src/hooks/
  useStorage.ts             # localStorage/window.storage 互換
  useTheme.ts               # ダーク/ライト切替 + CSS変数注入
  useDetection.ts           # 検出ロジック統合
```

---

## Phase 5: テスト拡充

```
src/lib/__tests__/
  parsers/
    pdf.test.ts
    csv.test.ts
  ai/
    call.test.ts
```

---

## 分割の原則

1. **型から始める** -- 型定義を先に確定することでインターフェースが明確になる
2. **辞書・定数を先に** -- 依存がなく、最も安全に分離できる
3. **純粋関数を優先** -- パーサーや検出は入出力が明確でテストしやすい
4. **コンポーネントは最後** -- props型が確定してから分割する
5. **各段階で `@ts-nocheck` の範囲を狭める** -- 最終的に完全撤去
