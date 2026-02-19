import { describe, it, expect } from 'vitest'
import { applyRedaction, PLACEHOLDERS, PLACEHOLDER_RE } from '../redaction'
import type { Detection } from '../detection'

function makeDet(
  overrides: Partial<Detection> & { value: string; type: string; category: string },
): Detection {
  return {
    id: 'test_' + Math.random().toString(36).slice(2),
    label: 'test',
    source: 'regex',
    confidence: 0.95,
    enabled: true,
    ...overrides,
  }
}

describe('applyRedaction', () => {
  it('replaces email addresses', () => {
    const text = '連絡先: tanaka@example.com'
    const dets = [makeDet({ type: 'email', category: 'contact', value: 'tanaka@example.com' })]
    const result = applyRedaction(text, dets)
    expect(result).toBe('連絡先: [メール非公開]')
    expect(result).not.toContain('tanaka@example.com')
  })

  it('replaces phone numbers', () => {
    const text = '電話：090-1234-5678'
    const dets = [makeDet({ type: 'phone', category: 'contact', value: '090-1234-5678' })]
    const result = applyRedaction(text, dets)
    expect(result).toBe('電話：[電話番号非公開]')
  })

  it('replaces names', () => {
    const text = '担当：田中 太郎（開発部長）'
    const dets = [makeDet({ type: 'name_dict', category: 'name', value: '田中 太郎' })]
    const result = applyRedaction(text, dets)
    expect(result).toBe('担当：[氏名非公開]（開発部長）')
  })

  it('replaces multiple detections', () => {
    const text = '田中太郎 090-1234-5678 tanaka@test.com'
    const dets = [
      makeDet({ type: 'name_dict', category: 'name', value: '田中太郎' }),
      makeDet({ type: 'phone', category: 'contact', value: '090-1234-5678' }),
      makeDet({ type: 'email', category: 'contact', value: 'tanaka@test.com' }),
    ]
    const result = applyRedaction(text, dets)
    expect(result).toBe('[氏名非公開] [電話番号非公開] [メール非公開]')
  })

  it('skips disabled detections', () => {
    const text = '田中太郎 090-1234-5678'
    const dets = [
      makeDet({ type: 'name_dict', category: 'name', value: '田中太郎', enabled: false }),
      makeDet({ type: 'phone', category: 'contact', value: '090-1234-5678' }),
    ]
    const result = applyRedaction(text, dets)
    expect(result).toContain('田中太郎') // name not redacted
    expect(result).toContain('[電話番号非公開]') // phone redacted
  })

  it('replaces longer values first to avoid partial matches', () => {
    const text = '住所：東京都渋谷区神宮前3-14-5\n電話：03-1234-5678'
    const dets = [
      makeDet({ type: 'address', category: 'address', value: '東京都渋谷区神宮前3-14-5' }),
      makeDet({ type: 'phone', category: 'contact', value: '03-1234-5678' }),
    ]
    const result = applyRedaction(text, dets)
    expect(result).toContain('[住所非公開]')
    expect(result).toContain('[電話番号非公開]')
  })

  it('replaces all occurrences of same value', () => {
    const text = '田中太郎が発表。田中太郎の意見。'
    const dets = [makeDet({ type: 'name_dict', category: 'name', value: '田中太郎' })]
    const result = applyRedaction(text, dets)
    expect(result).toBe('[氏名非公開]が発表。[氏名非公開]の意見。')
  })
})

describe('applyRedaction with keepPrefecture', () => {
  it('keeps prefecture when keepPrefecture is true', () => {
    const text = '住所：東京都渋谷区神宮前3-14-5'
    const dets = [
      makeDet({ type: 'address', category: 'address', value: '東京都渋谷区神宮前3-14-5' }),
    ]
    const result = applyRedaction(text, dets, { keepPrefecture: true })
    expect(result).toContain('東京都')
    expect(result).toContain('[住所詳細非公開]')
    expect(result).not.toContain('渋谷区')
  })

  it('masks entire address when keepPrefecture is false', () => {
    const text = '東京都渋谷区神宮前3-14-5'
    const dets = [
      makeDet({ type: 'address', category: 'address', value: '東京都渋谷区神宮前3-14-5' }),
    ]
    const result = applyRedaction(text, dets, { keepPrefecture: false })
    expect(result).toBe('[住所非公開]')
  })
})

describe('applyRedaction with nameInitial', () => {
  it('converts name to initials using reading map', () => {
    const text = '氏名：田中 太郎\nフリガナ：タナカ タロウ'
    const dets = [makeDet({ type: 'name_dict', category: 'name', value: '田中 太郎' })]
    const result = applyRedaction(text, dets, { nameInitial: true })
    expect(result).toContain('T.T.')
    expect(result).not.toContain('田中 太郎')
  })

  it('falls back to kanji initials when no reading available', () => {
    const text = '佐藤 花子'
    const dets = [makeDet({ type: 'name_dict', category: 'name', value: '佐藤 花子' })]
    const result = applyRedaction(text, dets, { nameInitial: true })
    expect(result).toBe('佐.花.')
  })
})

describe('PLACEHOLDER_RE', () => {
  it('matches all standard placeholders', () => {
    const placeholders = [
      '[メール非公開]',
      '[URL非公開]',
      '[電話番号非公開]',
      '[郵便番号非公開]',
      '[年月日非公開]',
      '[住所非公開]',
      '[氏名非公開]',
      '[番号非公開]',
      '[SNS非公開]',
      '[組織名非公開]',
      '[顔写真削除]',
      '[非公開]',
    ]
    for (const ph of placeholders) {
      const re = new RegExp(PLACEHOLDER_RE.source, 'g')
      expect(re.test(ph), `Should match: ${ph}`).toBe(true)
    }
  })

  it('does not match arbitrary bracket text', () => {
    const re = new RegExp(PLACEHOLDER_RE.source, 'g')
    expect(re.test('[普通のテキスト]')).toBe(false)
  })
})

describe('PLACEHOLDERS', () => {
  it('has mappings for all detection types', () => {
    const expectedTypes = [
      'email',
      'url',
      'phone',
      'postal',
      'birthday',
      'address',
      'name_label',
      'name_dict',
      'name_context',
      'name_ai',
      'name_kana',
      'sns_ai',
      'mynumber',
    ]
    for (const type of expectedTypes) {
      expect(PLACEHOLDERS[type], `Missing placeholder for type: ${type}`).toBeDefined()
    }
  })
})
