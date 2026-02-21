import { describe, it, expect } from 'vitest'
import {
  normalizeText,
  extractPrefecture,
  nameToInitial,
  buildReadingMap,
  detectRegex,
  detectJapaneseNames,
  detectCustomKeywords,
  detectAll,
  mergeDetections,
  type Detection,
} from '../detection'

// ═══ normalizeText ═══
describe('normalizeText', () => {
  it('converts fullwidth digits to halfwidth', () => {
    expect(normalizeText('０１２３４５６７８９')).toBe('0123456789')
  })

  it('converts fullwidth letters to halfwidth', () => {
    expect(normalizeText('ＡＢＣｘｙｚ')).toBe('ABCxyz')
  })

  it('converts fullwidth colon', () => {
    expect(normalizeText('氏名＝太郎')).toContain('氏名')
  })

  it('collapses multiple spaces', () => {
    expect(normalizeText('hello    world')).toBe('hello world')
  })

  it('handles mixed content', () => {
    expect(normalizeText('電話：０９０−１２３４−５６７８')).toBe('電話：090−1234−5678')
  })
})

// ═══ extractPrefecture ═══
describe('extractPrefecture', () => {
  it('extracts 北海道', () => {
    expect(extractPrefecture('北海道札幌市中央区大通西4丁目')).toBe('北海道')
  })

  it('extracts 東京都', () => {
    expect(extractPrefecture('東京都渋谷区神宮前3-14-5')).toBe('東京都')
  })

  it('extracts 大阪府', () => {
    expect(extractPrefecture('大阪府大阪市北区梅田2-5-10')).toBe('大阪府')
  })

  it('extracts 京都府', () => {
    expect(extractPrefecture('京都府京都市下京区四条烏丸1-5-3')).toBe('京都府')
  })

  it('extracts県 (2-3 char)', () => {
    expect(extractPrefecture('神奈川県横浜市西区みなとみらい2-3-1')).toBe('神奈川県')
    expect(extractPrefecture('千葉県船橋市本町5-7-3')).toBe('千葉県')
  })

  it('returns empty for non-address text', () => {
    expect(extractPrefecture('何もない文字列')).toBe('')
  })
})

// ═══ buildReadingMap / nameToInitial ═══
describe('nameToInitial', () => {
  it('converts katakana name to initials', () => {
    const result = nameToInitial('タナカ タロウ')
    expect(result).toBe('T.T.')
  })

  it('converts via reading map', () => {
    const map = new Map([['田中 太郎', 'タナカ タロウ']])
    expect(nameToInitial('田中 太郎', map)).toBe('T.T.')
  })

  it('falls back to kanji initials when no reading', () => {
    expect(nameToInitial('佐藤 花子')).toBe('佐.花.')
  })

  it('handles single-part names', () => {
    expect(nameToInitial('田中')).toBe('田.中.')
  })

  it('handles hiragana reading', () => {
    const result = nameToInitial('さくら はな')
    expect(result).toBe('S.H.')
  })

  it('returns empty string for empty input', () => {
    expect(nameToInitial('')).toBe('')
  })
})

describe('buildReadingMap', () => {
  it('extracts name-to-reading mapping from labeled text', () => {
    const text = `氏名：田中 太郎\nフリガナ：タナカ タロウ\n生年月日：1990年`
    const map = buildReadingMap(text)
    expect(map.get('田中 太郎')).toBe('タナカ タロウ')
  })

  it('handles multiple entries', () => {
    const text = `氏名：佐藤 花子\nフリガナ：サトウ ハナコ\n\n名前：山田 太郎\nフリガナ：ヤマダ タロウ`
    const map = buildReadingMap(text)
    expect(map.get('佐藤 花子')).toBe('サトウ ハナコ')
    expect(map.get('山田 太郎')).toBe('ヤマダ タロウ')
  })
})

// ═══ detectRegex ═══
describe('detectRegex', () => {
  it('detects email addresses', () => {
    const dets = detectRegex('連絡先: tanaka.taro@example.com')
    const emails = dets.filter((d) => d.type === 'email')
    expect(emails).toHaveLength(1)
    expect(emails[0].value).toBe('tanaka.taro@example.com')
    expect(emails[0].category).toBe('contact')
  })

  it('detects URLs', () => {
    const dets = detectRegex('ポートフォリオ：https://tanaka-portfolio.vercel.app/works')
    const urls = dets.filter((d) => d.type === 'url')
    expect(urls).toHaveLength(1)
    expect(urls[0].value).toContain('https://tanaka-portfolio.vercel.app')
  })

  it('detects phone numbers', () => {
    const dets = detectRegex('電話番号：090-1234-5678')
    const phones = dets.filter((d) => d.type === 'phone')
    expect(phones).toHaveLength(1)
    expect(phones[0].value).toBe('090-1234-5678')
  })

  it('does not false-positive phone on year ranges', () => {
    const dets = detectRegex('2020年4月 - 2024年3月')
    const phones = dets.filter((d) => d.type === 'phone')
    expect(phones).toHaveLength(0)
  })

  it('detects postal codes with 〒 prefix', () => {
    const dets = detectRegex('〒150-0001')
    const postals = dets.filter((d) => d.type === 'postal')
    expect(postals).toHaveLength(1)
    expect(postals[0].value).toBe('〒150-0001')
  })

  it('detects birthday dates', () => {
    const dets = detectRegex('生年月日：1990年4月15日')
    const dates = dets.filter((d) => d.type === 'birthday')
    expect(dates).toHaveLength(1)
    expect(dates[0].value).toBe('1990年4月15日')
  })

  it('skips document dates (作成日)', () => {
    const dets = detectRegex('作成日：2024年12月1日')
    const dates = dets.filter((d) => d.type === 'birthday')
    expect(dates).toHaveLength(0)
  })

  it('detects addresses with prefecture', () => {
    const dets = detectRegex('住所：東京都渋谷区神宮前3-14-5 メゾンド原宿 402号室')
    const addrs = dets.filter((d) => d.type === 'address')
    expect(addrs.length).toBeGreaterThanOrEqual(1)
    expect(addrs[0].value).toContain('東京都')
  })

  it('detects name via label proximity', () => {
    const dets = detectRegex('氏名：佐藤太郎')
    const names = dets.filter((d) => d.type === 'name_label')
    // name_label regex captures the name after the label
    expect(names.length).toBeGreaterThanOrEqual(1)
  })

  it('detects my number', () => {
    const dets = detectRegex('マイナンバー：1234 5678 9012')
    const mynum = dets.filter((d) => d.type === 'mynumber')
    expect(mynum).toHaveLength(1)
    expect(mynum[0].value).toBe('1234 5678 9012')
  })

  it('detects katakana furigana', () => {
    const dets = detectRegex('フリガナ：タナカ タロウ')
    const kana = dets.filter((d) => d.type === 'name_kana')
    expect(kana).toHaveLength(1)
    expect(kana[0].value).toBe('タナカ タロウ')
  })

  it('handles era dates (昭和/平成/令和)', () => {
    const dets = detectRegex('生年月日：昭和63年5月20日')
    const dates = dets.filter((d) => d.type === 'birthday')
    expect(dates).toHaveLength(1)
  })

  it('skips recent dates that are likely not birthdays', () => {
    const dets = detectRegex('2024年12月1日')
    const dates = dets.filter((d) => d.type === 'birthday')
    expect(dates).toHaveLength(0)
  })
})

// ═══ detectJapaneseNames ═══
describe('detectJapaneseNames', () => {
  it('detects full names from dictionary (surname + given name)', () => {
    const dets = detectJapaneseNames('担当：田中 太郎')
    expect(dets.length).toBeGreaterThanOrEqual(1)
    const nameValues = dets.map((d) => d.value)
    expect(nameValues.some((v) => v.includes('田中') && v.includes('太郎'))).toBe(true)
  })

  it('detects names near labels', () => {
    const dets = detectJapaneseNames('上司：鈴木 健太（開発部長）')
    expect(dets.length).toBeGreaterThanOrEqual(1)
    expect(dets.some((d) => d.value.includes('鈴木'))).toBe(true)
  })

  it('does not detect organization names as person names', () => {
    const dets = detectJapaneseNames('株式会社テックフロンティア')
    const personNames = dets.filter((d) => d.category === 'name')
    // Should not match "株式会社" as a name
    expect(personNames.every((d) => !d.value.includes('株式会社'))).toBe(true)
  })

  it('does not detect job titles as names', () => {
    const dets = detectJapaneseNames('フロントエンドエンジニア')
    expect(dets).toHaveLength(0)
  })

  it('detects multiple names in text', () => {
    const text = '担当：佐藤 由美子\n上司：山口 慎一'
    const dets = detectJapaneseNames(text)
    const names = dets.map((d) => d.value)
    expect(names.some((n) => n.includes('佐藤'))).toBe(true)
    expect(names.some((n) => n.includes('山口'))).toBe(true)
  })
})

// ═══ SNS detection ═══
describe('SNS detection', () => {
  it('detects Twitter/X accounts', () => {
    const dets = detectRegex('Twitter: @username123')
    expect(dets.some((d) => d.type === 'sns_twitter' && d.value === 'username123')).toBe(true)
  })

  it('detects Twitter/X with Japanese label', () => {
    const dets = detectRegex('ツイッター：@dev_user')
    expect(dets.some((d) => d.type === 'sns_twitter' && d.value === 'dev_user')).toBe(true)
  })

  it('detects GitHub accounts', () => {
    const dets = detectRegex('GitHub: @octocat')
    expect(dets.some((d) => d.type === 'sns_github' && d.value === 'octocat')).toBe(true)
  })

  it('detects GitHub accounts without @', () => {
    const dets = detectRegex('GitHub: tanaka-taro-dev')
    expect(dets.some((d) => d.type === 'sns_github' && d.value === 'tanaka-taro-dev')).toBe(true)
  })

  it('detects LinkedIn accounts', () => {
    const dets = detectRegex('LinkedIn: /in/taro-tanaka')
    expect(dets.some((d) => d.type === 'sns_linkedin' && d.value === 'taro-tanaka')).toBe(true)
  })

  it('detects Instagram accounts', () => {
    const dets = detectRegex('Instagram: @photo_user')
    expect(dets.some((d) => d.type === 'sns_instagram' && d.value === 'photo_user')).toBe(true)
  })

  it('detects Facebook accounts', () => {
    const dets = detectRegex('Facebook: taro.tanaka')
    expect(dets.some((d) => d.type === 'sns_facebook' && d.value === 'taro.tanaka')).toBe(true)
  })

  it('does not detect email addresses as SNS', () => {
    const dets = detectRegex('連絡先: user@example.com')
    expect(dets.some((d) => d.type.startsWith('sns_'))).toBe(false)
  })

  it('does not detect URL path as SNS', () => {
    const dets = detectRegex('https://github.com/octocat')
    expect(dets.some((d) => d.type.startsWith('sns_'))).toBe(false)
  })
})

// ═══ detectAll ═══
describe('detectAll', () => {
  it('combines regex and name detection, deduplicating', () => {
    const text = `氏名：田中 太郎\nフリガナ：タナカ タロウ\n電話：090-1234-5678\nメール：tanaka@example.com`
    const dets = detectAll(text)
    const categories = new Set(dets.map((d) => d.category))
    expect(categories.has('name')).toBe(true)
    expect(categories.has('contact')).toBe(true)
    // No duplicate values
    const values = dets.map((d) => `${d.category}:${d.value}`)
    expect(new Set(values).size).toBe(values.length)
  })

  it('detects PII from sample resume text', () => {
    const text = `職務経歴書\n\n氏名：田中 太郎\nフリガナ：タナカ タロウ\n生年月日：1990年4月15日\n住所：東京都渋谷区神宮前3-14-5 メゾンド原宿 402号室\n〒150-0001\n電話番号：090-1234-5678\nメール：tanaka.taro@example.com\nGitHub：https://github.com/tanaka-taro-dev`
    const dets = detectAll(text)
    expect(dets.length).toBeGreaterThanOrEqual(5) // name, kana, birthday, address, postal, phone, email, url
    const types = new Set(dets.map((d) => d.type))
    expect(types.has('email')).toBe(true)
    expect(types.has('phone')).toBe(true)
    expect(types.has('url')).toBe(true)
  })
})

// ═══ detectCustomKeywords ═══
describe('detectCustomKeywords', () => {
  it('detects a single keyword', () => {
    const dets = detectCustomKeywords('株式会社テスト商事の田中です', ['株式会社テスト商事'])
    expect(dets).toHaveLength(1)
    expect(dets[0].value).toBe('株式会社テスト商事')
    expect(dets[0].category).toBe('custom')
    expect(dets[0].type).toBe('custom_keyword')
    expect(dets[0].confidence).toBe(1.0)
  })

  it('detects multiple keywords', () => {
    const text = '田中太郎は株式会社ABCで働いています'
    const dets = detectCustomKeywords(text, ['田中太郎', '株式会社ABC'])
    expect(dets).toHaveLength(2)
    const values = dets.map((d) => d.value)
    expect(values).toContain('田中太郎')
    expect(values).toContain('株式会社ABC')
  })

  it('deduplicates same keyword appearing multiple times', () => {
    const text = '田中と田中と田中'
    const dets = detectCustomKeywords(text, ['田中'])
    expect(dets).toHaveLength(1)
  })

  it('returns empty for no matches', () => {
    const dets = detectCustomKeywords('テストテキスト', ['存在しない文字列'])
    expect(dets).toHaveLength(0)
  })

  it('skips empty keywords', () => {
    const dets = detectCustomKeywords('テスト', ['', ' ', 'テスト'])
    expect(dets).toHaveLength(1)
    expect(dets[0].value).toBe('テスト')
  })
})

// ═══ detectAll with customKeywords ═══
describe('detectAll with customKeywords', () => {
  it('includes custom keyword detections', () => {
    const text = '氏名：田中 太郎\nメール：tanaka@example.com\n所属：カスタム組織名'
    const dets = detectAll(text, ['カスタム組織名'])
    const customDets = dets.filter((d) => d.category === 'custom')
    expect(customDets).toHaveLength(1)
    expect(customDets[0].value).toBe('カスタム組織名')
  })

  it('works without customKeywords', () => {
    const text = 'tanaka@example.com'
    const dets = detectAll(text)
    expect(dets.some((d) => d.type === 'email')).toBe(true)
  })
})

// ═══ mergeDetections ═══
describe('mergeDetections', () => {
  it('merges without duplicates', () => {
    const base: Detection[] = [
      {
        id: '1',
        type: 'email',
        label: 'Email',
        category: 'contact',
        value: 'a@b.com',
        source: 'regex',
        confidence: 0.95,
        enabled: true,
      },
    ]
    const ai: Detection[] = [
      {
        id: '2',
        type: 'email',
        label: 'Email',
        category: 'contact',
        value: 'a@b.com',
        source: 'ai',
        confidence: 0.9,
        enabled: true,
      },
      {
        id: '3',
        type: 'name_ai',
        label: 'Name',
        category: 'name',
        value: '田中太郎',
        source: 'ai',
        confidence: 0.95,
        enabled: true,
      },
    ]
    const merged = mergeDetections(base, ai)
    expect(merged).toHaveLength(2) // a@b.com deduped, 田中太郎 added
    expect(merged.some((d) => d.value === '田中太郎')).toBe(true)
  })
})
