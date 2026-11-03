// 画面が使う検出エンジン（@/lib/redact-engine）と、別系統の @/lib/detection の差分を固定する特性テスト。
// 2 つのエンジンは既に乖離しており、統合は別タスク。ここで現在の差分を明示的に列挙しておくことで、
// どちらかの検出結果が変わったとき（＝統合や片側だけの修正）にこのテストが落ち、
// 差分の変化をレビューした上で意図的に期待値を更新する運用にする。
// 比較キーは `category|type|value`。モック経歴書（.txt / .md / .csv）すべてを対象にする。

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectAll as detectAllLib } from '@/lib/detection'
import { detectAll as detectAllApp } from '@/lib/redact-engine'

const MOCK_DIR = path.resolve(process.cwd(), 'test-data/mock-resumes')

interface Divergence {
  /** 画面側エンジンだけが検出するもの */
  onlyApp: string[]
  /** detection.ts だけが検出するもの */
  onlyLib: string[]
}

const NONE: Divergence = { onlyApp: [], onlyLib: [] }

// 現状の差分は detection.ts 側にしかない SNS ハンドル検出によるものだけ
const EXPECTED: Record<string, Divergence> = {
  '01_職務経歴書_ITエンジニア.txt': {
    onlyApp: [],
    onlyLib: ['contact|sns_github|Actions', 'contact|sns_github|https'],
  },
  '02_履歴書_事務職.txt': NONE,
  '03_職務経歴書_デザイナー.md': {
    onlyApp: [],
    onlyLib: ['contact|sns_dribbble|https', 'contact|sns_github|Actions'],
  },
  '03_職務経歴書_デザイナー.txt': {
    onlyApp: [],
    onlyLib: ['contact|sns_dribbble|https', 'contact|sns_github|Actions'],
  },
  '04_職務経歴書_営業職.txt': NONE,
  '05_職務経歴書_看護師.txt': NONE,
  '06_英文レジュメ_PM.txt': { onlyApp: [], onlyLib: ['contact|sns_github|https'] },
  '07_職務経歴書_飲食店長.txt': NONE,
  '08_職務経歴書_会計士.txt': NONE,
  '09_アルバイト応募_大学生.txt': {
    onlyApp: [],
    onlyLib: ['contact|sns_github|https', 'contact|sns_line|ren_suzuki_03'],
  },
  '10_職務経歴書_外国人_日本語.txt': NONE,
  '11_職務経歴書_建設現場監督.txt': NONE,
  '12_推薦書_人材紹介会社.txt': { onlyApp: [], onlyLib: ['contact|sns_github|Actions'] },
  '13_スキルシート_SES.txt': { onlyApp: [], onlyLib: ['contact|sns_github|Actions'] },
  '14_経歴書_クリエイティブ職.txt': NONE,
  '15_社員名簿.csv': NONE,
  '15_社員名簿_CSV形式.txt': NONE,
  '16_職務経歴書_介護福祉士.txt': NONE,
  '17_職務経歴書_教員.txt': NONE,
  '18_職務経歴書_薬剤師.txt': NONE,
}

const key = (d: { category: string; type: string; value: string }) =>
  `${d.category}|${d.type}|${d.value}`

function diff(text: string): Divergence {
  const app = new Set(detectAllApp(text).map(key))
  const lib = new Set(detectAllLib(text).map(key))
  return {
    onlyApp: [...app].filter((k) => !lib.has(k)).sort(),
    onlyLib: [...lib].filter((k) => !app.has(k)).sort(),
  }
}

const files = fs
  .readdirSync(MOCK_DIR)
  .filter((f) => /\.(txt|md|csv)$/.test(f))
  .sort()

describe('redact-engine と detection.ts の乖離（特性テスト）', () => {
  it('対象ファイル一覧が期待値表と一致する（モック追加時は期待値も追加する）', () => {
    expect(files).toEqual(Object.keys(EXPECTED).sort())
  })

  it.each(files)('%s', (file) => {
    const text = fs.readFileSync(path.join(MOCK_DIR, file), 'utf8')
    expect(diff(text)).toEqual(EXPECTED[file])
  })
})
