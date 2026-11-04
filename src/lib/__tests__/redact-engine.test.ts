import { describe, expect, it } from 'vitest'
import {
  PH,
  PH_RE,
  applyRedaction,
  buildAnnotations,
  buildNonOverlappingMatches,
  buildReadingMap,
  detectAll,
  detectCustomKeywords,
  detectRegex,
  extractPrefecture,
  mergeDetections,
  nameToInitial,
  normalizeText,
  type AppDetection,
  type Span,
} from '../redact-engine'

const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000)

const det = (over: Partial<AppDetection> & Pick<AppDetection, 'value' | 'type' | 'category'>) =>
  ({
    id: `t_${over.type}_${over.value}`,
    label: over.type,
    source: 'regex',
    confidence: 0.9,
    enabled: true,
    ...over,
  }) satisfies AppDetection

const summarize = (ds: AppDetection[]) => ds.map((d) => `${d.type}|${d.value}`)

const RESUME = [
  '職務経歴書',
  '氏名：山田 花子',
  'フリガナ：ヤマダ ハナコ',
  '生年月日：1990年4月15日',
  '〒150-0001',
  '住所：東京都渋谷区神宮前3-14-5',
  '電話番号：090-0234-5678',
  'メール：hanako@example.com',
].join('\n')

// ═══ normalizeText ═══
describe('normalizeText', () => {
  it('全角英数字を半角にする', () => {
    expect(normalizeText('ＴＥＬ０９０ａｂｃ')).toBe('TEL090abc')
  })

  it('連続する半角スペース・タブを 1 つに潰す', () => {
    expect(normalizeText('a  \t b')).toBe('a b')
  })

  it('全角スペースや全角ハイフンはそのまま残す', () => {
    expect(normalizeText(`山田${IDEOGRAPHIC_SPACE}花子－`)).toBe(`山田${IDEOGRAPHIC_SPACE}花子－`)
  })
})

// ═══ detectAll ═══
describe('detectAll', () => {
  it('経歴書の断片から氏名・電話・メール・郵便番号・住所・生年月日を検出する', () => {
    expect(summarize(detectAll(RESUME))).toEqual([
      'email|hanako@example.com',
      'phone|090-0234-5678',
      'postal|〒150-0001',
      'birthday|1990年4月15日',
      'address|東京都渋谷区神宮前3-14-5',
      'name_label|山田 花子',
      'name_kana|ヤマダ ハナコ',
    ])
  })

  it('生成直後の検出は enabled:true・regex 由来は confidence 0.95', () => {
    const ds = detectAll(RESUME)
    expect(ds.every((d) => d.enabled === true)).toBe(true)
    const email = ds.find((d) => d.type === 'email')
    expect(email).toMatchObject({
      label: 'メールアドレス',
      category: 'contact',
      source: 'regex',
      confidence: 0.95,
    })
    expect(email?.id).toMatch(/^re_email_\d+$/)
  })

  it('全角で書かれた電話番号も正規化してから検出する', () => {
    expect(summarize(detectAll('連絡先：０３０２３４５６７８'))).toEqual(['phone|0302345678'])
  })

  it('辞書に載った姓名をラベルなしでも検出する', () => {
    expect(summarize(detectAll('上司 田中 太郎'))).toEqual(['name_dict|田中 太郎'])
  })

  it('category+value が同じ検出は最初の 1 件だけ残す', () => {
    // 「山田 花子」は name_label と name_dict の両方で拾われるが 1 件になる
    const names = detectAll('氏名：山田 花子').filter((d) => d.category === 'name')
    expect(summarize(names)).toEqual(['name_label|山田 花子'])
  })

  it('職種名や会社名は氏名として扱わない', () => {
    expect(detectAll('プロジェクトマネージャー')).toEqual([])
    expect(detectAll('氏名：テック株式会社')).toEqual([])
  })

  it('customKeywords を渡すとカスタム指定語も含める', () => {
    const ds = detectAll('社内コード名は BlueFox です', ['BlueFox'])
    expect(summarize(ds)).toEqual(['custom_keyword|BlueFox'])
  })
})

// ═══ 年号・日付の偽陽性フィルタ ═══
describe('detectRegex の偽陽性フィルタ', () => {
  it('ラベル付きの電話番号は検出する（基準ケース）', () => {
    expect(summarize(detectRegex('TEL 03-0234-5678'))).toEqual(['phone|03-0234-5678'])
  })

  it('直後に「2020〜現在」のような年範囲がある番号は捨てる', () => {
    expect(detectRegex('TEL 03-0234-5678 2020〜現在')).toEqual([])
  })

  it('年で始まる職歴行の番号は捨てるが、電話ラベルが直前にあれば残す', () => {
    expect(detectRegex('2019年4月 0120-123-456 入社')).toEqual([])
    expect(summarize(detectRegex('2019年4月 電話：0120-123-456'))).toEqual(['phone|0120-123-456'])
  })

  it('文書日付ラベルの直後の日付は生年月日として扱わない', () => {
    expect(detectRegex('作成日：1990年1月1日')).toEqual([])
  })

  it('ラベルのない直近 20 年以内の日付は捨て、古い日付は残す', () => {
    expect(detectRegex('2020年4月1日 入社')).toEqual([])
    expect(summarize(detectRegex('1985年3月3日'))).toEqual(['birthday|1985年3月3日'])
  })

  it('生年月日ラベルがあれば直近の日付でも残す', () => {
    expect(summarize(detectRegex('生年月日：2015年3月3日'))).toEqual(['birthday|2015年3月3日'])
  })
})

// ═══ detectCustomKeywords ═══
describe('detectCustomKeywords', () => {
  it('キーワードごとに 1 件、id は最初の出現位置', () => {
    const ds = detectCustomKeywords('foo bar foo', ['foo'])
    expect(ds).toEqual([
      {
        id: 'ck_0',
        type: 'custom_keyword',
        label: 'カスタム指定',
        category: 'custom',
        value: 'foo',
        source: 'regex',
        confidence: 1,
        enabled: true,
      },
    ])
  })

  it('2 文字未満のキーワードと本文にないキーワードは無視する', () => {
    expect(summarize(detectCustomKeywords('foo bar', ['', 'x', 'zz', 'bar']))).toEqual([
      'custom_keyword|bar',
    ])
  })
})

// ═══ mergeDetections ═══
describe('mergeDetections', () => {
  it('base を優先し、category+value が未出の AI 検出だけ末尾に足す', () => {
    const base = [det({ type: 'name_dict', category: 'name', value: '山田 花子' })]
    const ai = [
      det({ type: 'name_ai', category: 'name', value: '山田 花子', source: 'ai' }),
      det({ type: 'name_ai', category: 'name', value: '佐藤 一郎', source: 'ai' }),
      det({ type: 'name_ai', category: 'name', value: '佐藤 一郎', source: 'ai', id: 'dup' }),
    ]
    const merged = mergeDetections(base, ai)
    expect(summarize(merged)).toEqual(['name_dict|山田 花子', 'name_ai|佐藤 一郎'])
    expect(merged[1].id).toBe('t_name_ai_佐藤 一郎')
  })

  it('入力配列を書き換えない', () => {
    const base = [det({ type: 'email', category: 'contact', value: 'a@b.cc' })]
    mergeDetections(base, [det({ type: 'url', category: 'web', value: 'https://x.y' })])
    expect(base).toHaveLength(1)
  })
})

// ═══ applyRedaction ═══
describe('applyRedaction', () => {
  it('検出種別ごとのプレースホルダに置き換える', () => {
    expect(applyRedaction(RESUME, detectAll(RESUME))).toBe(
      [
        '職務経歴書',
        '氏名：[氏名非公開]',
        'フリガナ：[氏名非公開]',
        '生年月日：[年月日非公開]',
        '[郵便番号非公開]',
        '住所：[住所非公開]',
        '電話番号：[電話番号非公開]',
        'メール：[メール非公開]',
      ].join('\n'),
    )
  })

  it('keepPrefecture で都道府県だけ残し、nameInitial でフリガナからイニシャルにする', () => {
    const out = applyRedaction(RESUME, detectAll(RESUME), {
      keepPrefecture: true,
      nameInitial: true,
    })
    expect(out).toContain('氏名：Y.H.')
    expect(out).toContain('フリガナ：Y.H.')
    expect(out).toContain('住所：東京都[住所詳細非公開]')
  })

  it('都道府県が取れない住所は keepPrefecture でも全体を伏せる', () => {
    const d = det({ type: 'address', category: 'address', value: '渋谷区神宮前3-14-5' })
    expect(applyRedaction('住所：渋谷区神宮前3-14-5', [d], { keepPrefecture: true })).toBe(
      '住所：[住所非公開]',
    )
  })

  it('フリガナがない氏名は漢字の頭文字でイニシャル化する', () => {
    const d = det({ type: 'name_dict', category: 'name', value: '佐藤 一郎' })
    expect(applyRedaction('担当：佐藤 一郎', [d], { nameInitial: true })).toBe('担当：佐.一.')
  })

  it('enabled:false の検出は置換しない', () => {
    const ds = [
      det({ type: 'email', category: 'contact', value: 'a@example.com', enabled: false }),
      det({ type: 'phone', category: 'contact', value: '090-0111-2222' }),
    ]
    expect(applyRedaction('a@example.com / 090-0111-2222', ds)).toBe(
      'a@example.com / [電話番号非公開]',
    )
  })

  it('長い値から順に置換するので、部分一致する短い値に先に壊されない', () => {
    const ds = detectAll('担当：鈴木 健太（部長）')
    // 辞書の「健太」「健」の両方が当たり、短い「鈴木 健」も検出される
    expect(summarize(ds)).toEqual(['name_dict|鈴木 健太', 'name_dict|鈴木 健'])
    const reversed = [...ds].reverse()
    expect(applyRedaction('担当：鈴木 健太（部長）', reversed)).toBe('担当：[氏名非公開]（部長）')
  })

  it('PH にない種別は [非公開]、2 文字未満の値は無視する', () => {
    const ds = [
      det({ type: 'unknown_type', category: 'misc', value: 'ABC' }),
      det({ type: 'email', category: 'contact', value: 'Z' }),
    ]
    expect(applyRedaction('ABC Z', ds)).toBe('[非公開] Z')
  })
})

// ═══ 補助関数 ═══
describe('extractPrefecture / buildReadingMap / nameToInitial', () => {
  it('住所先頭の都道府県を返す', () => {
    expect(extractPrefecture('北海道札幌市中央区')).toBe('北海道')
    expect(extractPrefecture('神奈川県横浜市')).toBe('神奈川県')
    expect(extractPrefecture('渋谷区神宮前')).toBe('')
  })

  it('氏名行と直後のフリガナ行を対応づける', () => {
    expect(buildReadingMap(RESUME)).toEqual(new Map([['山田 花子', 'ヤマダ ハナコ']]))
  })

  it('かな表記の名前はローマ字頭文字、漢字のみは先頭文字を使う', () => {
    expect(nameToInitial('たなか たろう')).toBe('T.T.')
    expect(nameToInitial('チバ')).toBe('C.')
    expect(nameToInitial('田中')).toBe('田.中.')
    expect(nameToInitial('山田 花子', new Map([['山田 花子', 'ヤマダ ハナコ']]))).toBe('Y.H.')
  })
})

describe('PH / PH_RE', () => {
  it('PH_RE はすべてのプレースホルダにマッチする', () => {
    for (const ph of Object.values(PH)) {
      expect(ph.match(new RegExp(PH_RE.source))?.[0]).toBe(ph)
    }
  })
})

// ═══ buildNonOverlappingMatches ═══
describe('buildNonOverlappingMatches', () => {
  it('occupied を共有すると先に渡した検出の位置が優先される', () => {
    const text = '東京都港区と東京都'
    const occ: Span[] = []
    const first = buildNonOverlappingMatches(
      text,
      [det({ type: 'address', category: 'address', value: '東京都港区' })],
      occ,
    )
    const second = buildNonOverlappingMatches(
      text,
      [det({ type: 'address', category: 'address', value: '東京都' })],
      occ,
    )
    expect(first.map((m) => [m.s, m.e])).toEqual([[0, 5]])
    expect(second.map((m) => [m.s, m.e])).toEqual([[6, 9]])
    expect(occ).toEqual([
      { s: 0, e: 5 },
      { s: 6, e: 9 },
    ])
  })

  it('値が文字列でない／2 文字未満の検出は無視する', () => {
    expect(buildNonOverlappingMatches('abc', [{ value: 1 }, { value: 'a' }])).toEqual([])
  })
})

// ═══ buildAnnotations ═══
describe('buildAnnotations', () => {
  const text = '氏名：田中太郎 TEL 090-0234-5678'
  const ds = [
    det({ id: 'n', type: 'name_dict', category: 'name', value: '田中太郎' }),
    det({ id: 'p', type: 'phone', category: 'contact', value: '090-0234-5678', enabled: false }),
  ]

  it('検出のないときはテキスト 1 セグメント', () => {
    expect(buildAnnotations('abc', [])).toEqual([{ type: 'text', text: 'abc' }])
    expect(buildAnnotations('', ds)).toEqual([{ type: 'text', text: '' }])
  })

  it('テキストと検出のセグメントに分割する', () => {
    expect(buildAnnotations(text, ds)).toEqual([
      { type: 'text', text: '氏名：' },
      { type: 'det', text: '田中太郎', det: ds[0], masked: false, disabledDet: false },
      { type: 'text', text: ' TEL ' },
      { type: 'det', text: '090-0234-5678', det: ds[1], masked: false, disabledDet: true },
    ])
  })

  it('showRedacted では enabled な検出だけマスク後の文字列にする', () => {
    const segs = buildAnnotations(text, ds, { showRedacted: true })
    expect(segs[1]).toEqual({
      type: 'det',
      text: '[氏名非公開]',
      original: '田中太郎',
      det: ds[0],
      masked: true,
    })
    expect(segs[3]).toMatchObject({ text: '090-0234-5678', masked: false, disabledDet: true })
  })
})
