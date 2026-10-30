/**
 * ガイドツアー定義（intro-steps.ts）と実装の整合性テスト。
 *
 * ツアーは `[data-intro="..."]` セレクタで画面の要素を指す。
 * UI を組み替えたときに対象要素が消えるとそのステップは黙って抜け落ちるため、
 * 参照している data-intro 値がソースコード上に存在することを検証する。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  UPLOAD_STEPS_LITE,
  UPLOAD_STEPS_PRO,
  EDITOR_STEPS_LITE,
  EDITOR_STEPS_PRO,
  PREVIEW_MODAL_STEPS,
  PRO_SWITCH_STEPS,
  INTRO_OPTIONS,
  LS_ONBOARDING_DONE,
  LS_TOUR_UPLOAD_DONE,
  LS_TOUR_EDITOR_DONE,
  LS_TOUR_PRO_DONE,
  type IntroStep,
} from '../intro-steps'

const ALL_TOURS: Record<string, IntroStep[]> = {
  UPLOAD_STEPS_LITE,
  UPLOAD_STEPS_PRO,
  EDITOR_STEPS_LITE,
  EDITOR_STEPS_PRO,
  PREVIEW_MODAL_STEPS,
  PRO_SWITCH_STEPS,
}

/** src 配下の .tsx を再帰的に読み、連結したソース文字列を返す */
function readAllTsx(dir: string): string {
  let out = ''
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      out += readAllTsx(p)
    } else if (name.endsWith('.tsx')) {
      out += readFileSync(p, 'utf8') + '\n'
    }
  }
  return out
}

const SRC = readAllTsx(join(process.cwd(), 'src'))

function dataIntroValue(selector: string): string | null {
  const m = selector.match(/^\[data-intro="([a-z0-9-]+)"\]$/)
  return m ? m[1] : null
}

describe('intro-steps: セレクタの形式', () => {
  it('すべてのステップが [data-intro="..."] 形式のセレクタを持つ', () => {
    for (const [name, steps] of Object.entries(ALL_TOURS)) {
      for (const step of steps) {
        expect(dataIntroValue(step.element), `${name}: ${step.element}`).not.toBeNull()
      }
    }
  })

  it('各ステップにタイトルと説明がある', () => {
    for (const steps of Object.values(ALL_TOURS)) {
      for (const step of steps) {
        expect(step.title.length).toBeGreaterThan(0)
        expect(step.intro.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('intro-steps: 参照先の要素が実装に存在する', () => {
  const allValues = new Set<string>()
  for (const steps of Object.values(ALL_TOURS)) {
    for (const step of steps) {
      const v = dataIntroValue(step.element)
      if (v) allValues.add(v)
    }
  }

  for (const value of allValues) {
    it(`data-intro="${value}" を持つ要素（または introId で渡す箇所）がソースにある`, () => {
      // 直接の属性指定、または SampleCard の introId のように文字列として渡す箇所
      const direct = new RegExp(`data-intro=["']${value}["']`)
      const asString = new RegExp(`["']${value}["']`)
      expect(direct.test(SRC) || asString.test(SRC), value).toBe(true)
    })
  }
})

describe('intro-steps: 文言が画面の表記と揃っている', () => {
  const allIntroText = Object.values(ALL_TOURS)
    .flat()
    .map((s) => `${s.title} ${s.intro}`)
    .join('\n')

  it('画面から消した旧表記（DEMO / Diff / スクレイピング）をツアーで使わない', () => {
    expect(allIntroText).not.toMatch(/DEMO/)
    expect(allIntroText).not.toMatch(/「Diff」/)
    expect(allIntroText).not.toMatch(/スクレイピング/)
  })

  it('取り込むステップでは主ボタン「ファイルを選択」に言及する', () => {
    const upload = [...UPLOAD_STEPS_LITE, ...UPLOAD_STEPS_PRO].find(
      (s) => s.element === '[data-intro="upload-zone"]',
    )
    expect(upload?.intro).toContain('ファイルを選択')
  })

  it('検出結果リストの説明は「オンの項目がマスクされる」ことを伝える', () => {
    for (const steps of [EDITOR_STEPS_LITE, EDITOR_STEPS_PRO]) {
      const list = steps.find((s) => s.element === '[data-intro="detection-list"]')
      expect(list?.intro).toContain('マスクされます')
    }
  })
})

describe('intro-steps: オプションと保存キー', () => {
  it('進捗表示が有効で、日本語のボタンラベルを持つ', () => {
    expect(INTRO_OPTIONS.showProgress).toBe(true)
    expect(INTRO_OPTIONS.nextLabel).toBe('次へ')
    expect(INTRO_OPTIONS.doneLabel).toBe('完了')
  })

  it('localStorage キーは rp_ 接頭辞で重複しない', () => {
    const keys = [LS_ONBOARDING_DONE, LS_TOUR_UPLOAD_DONE, LS_TOUR_EDITOR_DONE, LS_TOUR_PRO_DONE]
    expect(keys.every((k) => k.startsWith('rp_'))).toBe(true)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
