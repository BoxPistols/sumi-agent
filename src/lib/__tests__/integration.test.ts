/**
 * 統合テスト: test-data/mock-resumes の各モックファイルを使って
 * detectAll → applyRedaction パイプラインを end-to-end で検証する。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { detectAll } from '../detection'
import { applyRedaction } from '../redaction'

const MOCK_DIR = path.resolve(__dirname, '../../../test-data/mock-resumes')

function loadMock(filename: string): string {
  return fs.readFileSync(path.join(MOCK_DIR, filename), 'utf-8')
}

type Det = ReturnType<typeof detectAll>[number]

/* ============================================================
 * 検出カバレッジ: 各ファイルで最低限検出すべきカテゴリ・値を検証
 * ============================================================ */

describe('統合テスト: 検出カバレッジ', () => {
  describe('01_ITエンジニア', () => {
    let dets: Det[]
    beforeAll(() => { dets = detectAll(loadMock('01_職務経歴書_ITエンジニア.txt')) })

    it('氏名を検出', () => {
      const names = dets.filter(d => d.category === 'name')
      expect(names.some(d => d.value.includes('山田'))).toBe(true)
    })
    it('メールアドレスを検出', () => {
      const emails = dets.filter(d => d.type === 'email')
      expect(emails.some(d => d.value === 'yamada.taro@example.com')).toBe(true)
    })
    it('電話番号を検出', () => {
      const phones = dets.filter(d => d.type === 'phone')
      expect(phones.some(d => d.value === '090-1234-5678')).toBe(true)
    })
    it('住所を検出', () => {
      const addrs = dets.filter(d => d.category === 'address')
      expect(addrs.some(d => d.value.includes('渋谷区'))).toBe(true)
    })
    it('生年月日を検出', () => {
      const bdays = dets.filter(d => d.type === 'birthday')
      expect(bdays.some(d => d.value.includes('1990年'))).toBe(true)
    })
    it('URLを検出', () => {
      const urls = dets.filter(d => d.category === 'web')
      expect(urls.length).toBeGreaterThanOrEqual(1)
    })
    it('上司名を検出', () => {
      const names = dets.filter(d => d.category === 'name')
      expect(names.some(d => d.value.includes('鈴木'))).toBe(true)
    })
  })

  describe('02_事務職', () => {
    let dets: Det[]
    beforeAll(() => { dets = detectAll(loadMock('02_履歴書_事務職.txt')) })

    it('氏名を検出（名前にスペース変種あり）', () => {
      const names = dets.filter(d => d.category === 'name')
      expect(names.some(d => d.value.includes('佐々木'))).toBe(true)
    })
    it('メール・電話を検出', () => {
      expect(dets.some(d => d.type === 'email')).toBe(true)
      expect(dets.some(d => d.type === 'phone')).toBe(true)
    })
    it('和暦の生年月日を検出', () => {
      const bdays = dets.filter(d => d.type === 'birthday')
      expect(bdays.some(d => d.value.includes('平成'))).toBe(true)
    })
  })

  describe('06_英文レジュメ', () => {
    let dets: Det[]
    beforeAll(() => { dets = detectAll(loadMock('06_英文レジュメ_PM.txt')) })

    it('英文メールを検出', () => {
      const emails = dets.filter(d => d.type === 'email')
      expect(emails.some(d => d.value === 'kenji.tanaka@protonmail.com')).toBe(true)
    })
    it('LinkedIn URLを検出', () => {
      const urls = dets.filter(d => d.category === 'web')
      expect(urls.some(d => d.value.includes('linkedin.com'))).toBe(true)
    })
  })

  describe('10_外国人（日本語）', () => {
    let dets: Det[]
    beforeAll(() => { dets = detectAll(loadMock('10_職務経歴書_外国人_日本語.txt')) })

    it('メール・電話を検出', () => {
      expect(dets.some(d => d.type === 'email' && d.value === 'nguyen.thuy@gmail.com')).toBe(true)
      expect(dets.some(d => d.type === 'phone')).toBe(true)
    })
    it('住所を検出', () => {
      expect(dets.some(d => d.category === 'address' && d.value.includes('新宿区'))).toBe(true)
    })
    it('Facebook URLを検出', () => {
      expect(dets.some(d => d.category === 'web' && d.value.includes('facebook.com'))).toBe(true)
    })
  })

  describe('15_社員名簿CSV', () => {
    let dets: Det[]
    beforeAll(() => { dets = detectAll(loadMock('15_社員名簿_CSV形式.txt')) })

    it('複数のメールアドレスを検出', () => {
      const emails = dets.filter(d => d.type === 'email')
      expect(emails.length).toBeGreaterThanOrEqual(5)
    })
    it('複数の電話番号を検出', () => {
      const phones = dets.filter(d => d.type === 'phone')
      expect(phones.length).toBeGreaterThanOrEqual(5)
    })
    it('URLを検出', () => {
      expect(dets.some(d => d.category === 'web' && d.value.includes('company-intra'))).toBe(true)
    })
  })

  describe('16_介護福祉士', () => {
    let dets: Det[]
    beforeAll(() => { dets = detectAll(loadMock('16_職務経歴書_介護福祉士.txt')) })

    it('利用者名（第三者個人名）を検出', () => {
      const names = dets.filter(d => d.category === 'name')
      // 利用者名が含まれていることを確認
      const allValues = names.map(d => d.value).join('|')
      expect(allValues).toContain('岡田')
    })
    it('緊急連絡先の電話番号を検出', () => {
      const phones = dets.filter(d => d.type === 'phone')
      expect(phones.some(d => d.value === '090-4567-8901')).toBe(true)
    })
  })
})

/* ============================================================
 * 偽陽性チェック: 検出してはいけないものが検出されていないことを検証
 * ============================================================ */

describe('統合テスト: 偽陽性チェック', () => {
  it('職種名・スキル名を氏名として検出しない', () => {
    const text = loadMock('01_職務経歴書_ITエンジニア.txt')
    const dets = detectAll(text)
    const nameValues = dets.filter(d => d.category === 'name').map(d => d.value)

    const falsePositives = [
      'エンジニア', 'マネージャー', 'リーダー', 'プログラマー',
      'React', 'TypeScript', 'Next.js', 'PostgreSQL',
    ]
    for (const fp of falsePositives) {
      expect(nameValues).not.toContain(fp)
    }
  })

  it('年号期間を電話番号として検出しない', () => {
    const text = loadMock('01_職務経歴書_ITエンジニア.txt')
    const dets = detectAll(text)
    const phoneValues = dets.filter(d => d.type === 'phone').map(d => d.value)
    // "2020年4月" のような年号は電話番号にならない
    for (const v of phoneValues) {
      expect(v).not.toMatch(/^20[0-2]\d/)
    }
  })

  it('会社名を氏名として検出しない', () => {
    const text = loadMock('04_職務経歴書_営業職.txt')
    const dets = detectAll(text)
    const nameValues = dets.filter(d => d.category === 'name').map(d => d.value)

    const orgNames = ['株式会社', '有限会社', 'トヨタ', 'リクルート']
    for (const org of orgNames) {
      expect(nameValues.some(n => n.includes(org))).toBe(false)
    }
  })

  it('資格取得年を生年月日として検出しない', () => {
    const text = loadMock('08_職務経歴書_会計士.txt')
    const dets = detectAll(text)
    const bdayValues = dets.filter(d => d.type === 'birthday').map(d => d.value)
    // 実際の生年月日は1つだけ検出されるべき
    // 「2010年取得」等が生年月日として検出されないこと
    for (const v of bdayValues) {
      expect(v).not.toContain('取得')
    }
  })
})

/* ============================================================
 * 氏名表記ゆらぎ対応: さまざまな氏名表記の検出を検証
 * ============================================================ */

describe('統合テスト: 氏名表記ゆらぎ', () => {
  it('全角スペース区切りの氏名を検出', () => {
    // 佐々木　美咲（全角スペース）
    const dets = detectAll(loadMock('02_履歴書_事務職.txt'))
    const names = dets.filter(d => d.category === 'name')
    expect(names.some(d => d.value.includes('佐々木'))).toBe(true)
  })

  it('半角スペース区切りの氏名を検出', () => {
    // 朝霧 遥（半角スペース）
    const dets = detectAll(loadMock('03_職務経歴書_デザイナー.txt'))
    const names = dets.filter(d => d.category === 'name')
    expect(names.some(d => d.value.includes('朝霧'))).toBe(true)
  })

  it('スペースなしの氏名を検出', () => {
    // 高橋翔太（スペースなし）
    const dets = detectAll(loadMock('04_職務経歴書_営業職.txt'))
    const names = dets.filter(d => d.category === 'name')
    expect(names.some(d => d.value.includes('高橋'))).toBe(true)
  })
})

/* ============================================================
 * マスキング適用: applyRedaction の end-to-end 検証
 * ============================================================ */

describe('統合テスト: マスキング適用', () => {
  it('メールアドレスがマスクされる', () => {
    const text = loadMock('01_職務経歴書_ITエンジニア.txt')
    const dets = detectAll(text)
    const masked = applyRedaction(text, dets)
    expect(masked).not.toContain('yamada.taro@example.com')
    expect(masked).toContain('[メール非公開]')
  })

  it('電話番号がマスクされる', () => {
    const text = loadMock('01_職務経歴書_ITエンジニア.txt')
    const dets = detectAll(text)
    const masked = applyRedaction(text, dets)
    expect(masked).not.toContain('090-1234-5678')
    expect(masked).toContain('[電話番号非公開]')
  })

  it('住所がマスクされる', () => {
    const text = loadMock('05_職務経歴書_看護師.txt')
    const dets = detectAll(text)
    const masked = applyRedaction(text, dets)
    expect(masked).not.toContain('住吉町8-15')
  })

  it('keepPrefecture オプションで都道府県を保持', () => {
    const text = loadMock('01_職務経歴書_ITエンジニア.txt')
    const dets = detectAll(text)
    const masked = applyRedaction(text, dets, { keepPrefecture: true })
    expect(masked).toContain('東京都')
    expect(masked).not.toContain('神宮前3-14-5')
  })

  it('CSV形式でも全メールがマスクされる', () => {
    const text = loadMock('15_社員名簿_CSV形式.txt')
    const dets = detectAll(text)
    const masked = applyRedaction(text, dets)
    // 個人メールアドレスが残っていないこと
    expect(masked).not.toMatch(/[a-z]+\.[a-z]+@company\.co\.jp/)
  })

  it('マスク後もドキュメント構造が維持される', () => {
    const text = loadMock('01_職務経歴書_ITエンジニア.txt')
    const dets = detectAll(text)
    const masked = applyRedaction(text, dets)
    // セクション見出しが残っていること
    expect(masked).toContain('職務経歴書')
    expect(masked).toContain('職務要約')
    expect(masked).toContain('■ 資格')
  })
})

/* ============================================================
 * 全ファイル横断: 最低限の検出が動作することを確認
 * ============================================================ */

describe('統合テスト: 全18ファイル横断チェック', () => {
  const files = [
    '01_職務経歴書_ITエンジニア.txt',
    '02_履歴書_事務職.txt',
    '03_職務経歴書_デザイナー.txt',
    '04_職務経歴書_営業職.txt',
    '05_職務経歴書_看護師.txt',
    '06_英文レジュメ_PM.txt',
    '07_職務経歴書_飲食店長.txt',
    '08_職務経歴書_会計士.txt',
    '09_アルバイト応募_大学生.txt',
    '10_職務経歴書_外国人_日本語.txt',
    '11_職務経歴書_建設現場監督.txt',
    '12_推薦書_人材紹介会社.txt',
    '13_スキルシート_SES.txt',
    '14_経歴書_クリエイティブ職.txt',
    '15_社員名簿_CSV形式.txt',
    '16_職務経歴書_介護福祉士.txt',
    '17_職務経歴書_教員.txt',
    '18_職務経歴書_薬剤師.txt',
  ]

  it.each(files)('%s: 最低3件以上の検出', (filename) => {
    const text = loadMock(filename)
    const dets = detectAll(text)
    expect(dets.length).toBeGreaterThanOrEqual(3)
  })

  it.each(files)('%s: メールアドレスを1件以上検出', (filename) => {
    const text = loadMock(filename)
    const dets = detectAll(text)
    const emails = dets.filter(d => d.type === 'email')
    expect(emails.length).toBeGreaterThanOrEqual(1)
  })

  it.each(files)('%s: 検出結果に重複なし', (filename) => {
    const text = loadMock(filename)
    const dets = detectAll(text)
    const keys = dets.map(d => `${d.category}:${d.value}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(files)('%s: マスキング後にメールアドレスが残らない', (filename) => {
    const text = loadMock(filename)
    const dets = detectAll(text)
    const masked = applyRedaction(text, dets)
    // @を含む文字列がメールパターンに見えないこと
    const remainingEmails = masked.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []
    expect(remainingEmails).toHaveLength(0)
  })
})
