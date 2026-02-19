// ═══ PII Detection Engine ═══

export interface Detection {
  id: string
  type: string
  label: string
  category: string
  value: string
  source: 'regex' | 'dict' | 'ai' | 'heuristic'
  confidence: number
  enabled: boolean
}

// ═══ Text Normalization ═══
export function normalizeText(text: string): string {
  let t = text.replace(/[\uff10-\uff19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  t = t.replace(/[\uff21-\uff3a\uff41-\uff5a]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  )
  t = t.replace(/\uff1a/g, '：').replace(/\uff1b/g, ';')
  t = t.replace(/[ \t]{2,}/g, ' ')
  return t
}

// ═══ Regex Patterns ═══
interface RegexPattern {
  id: string
  label: string
  category: string
  regex: RegExp
  group?: number
}

export const REGEX_PATTERNS: RegexPattern[] = [
  {
    id: 'email',
    label: 'メールアドレス',
    category: 'contact',
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  },
  {
    id: 'url',
    label: 'URL',
    category: 'web',
    regex: /https?:\/\/[^\s\u3000\u3001\u3002\uff0c\uff0e<>"')\]）」』】]{4,}/g,
  },
  {
    id: 'phone',
    label: '電話番号',
    category: 'contact',
    regex:
      /(?<!\d)(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}|\(0\d{1,4}\)\s?\d{1,4}[-\s]?\d{3,4}|0\d{9,10})(?!\d)/g,
  },
  {
    id: 'postal',
    label: '郵便番号',
    category: 'address',
    regex: /(?:〒\s?\d{3}[-ー]\d{4}|(?<!\d)(?<![-ー])\d{3}[-ー]\d{4}(?![-ー]\d)(?!\d))/g,
  },
  {
    id: 'birthday',
    label: '年月日',
    category: 'personal',
    regex:
      /(?:(?:19|20)\d{2}\s?[年/\-\.]\s?\d{1,2}\s?[月/\-\.]\s?\d{1,2}\s?日?|(?:昭和|平成|令和)\s?\d{1,2}\s?年\s?\d{1,2}\s?月\s?\d{1,2}\s?日)/g,
  },
  {
    id: 'address',
    label: '住所',
    category: 'address',
    regex:
      /(?:北海道|(?:東京|京都|大阪)(?:都|府)|.{2,3}県)[^\n\r,、。]{3,40}?(?:\d+[-ー]\d+(?:[-ー]\d+)?|丁目|番地|号)(?:[ \t\u3000]+[^\n\r,、。]{1,30}?\d+(?:号(?:室)?|階))?/g,
  },
  {
    id: 'name_label',
    label: '氏名（ラベル近傍）',
    category: 'name',
    regex:
      /(?:氏\s?名|フリガナ|ふりがな|名\s?前)\s*[：:・\s]\s*([\u4e00-\u9fff][\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]*(?:[\s\u3000][\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]{1,4})?)/g,
    group: 1,
  },
  {
    id: 'mynumber',
    label: 'マイナンバー候補',
    category: 'personal',
    regex: /(?<!\d)\d{4}\s?\d{4}\s?\d{4}(?!\d)/g,
  },
  {
    id: 'name_kana',
    label: 'フリガナ',
    category: 'name',
    regex:
      /(?:フリガナ|ふりがな|カナ)\s*[：:・\s]\s*([\u30a0-\u30ffー]+(?:[\s\u3000][\u30a0-\u30ffー]+)?)/g,
    group: 1,
  },
  {
    id: 'sns_twitter',
    label: 'Twitter/Xアカウント',
    category: 'contact',
    regex: /(?:Twitter|X|ツイッター)\s*[：:・\s]\s*@([a-zA-Z0-9_]{1,15})/gi,
    group: 1,
  },
  {
    id: 'sns_github',
    label: 'GitHubアカウント',
    category: 'contact',
    regex: /(?:GitHub|Github|github|ギットハブ)\s*[：:・\s]\s*@?([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})/gi,
    group: 1,
  },
  {
    id: 'sns_linkedin',
    label: 'LinkedInアカウント',
    category: 'contact',
    regex: /(?:LinkedIn|linkedin|リンクトイン)\s*[：:・\s]\s*(?:\/in\/)?([a-zA-Z0-9-]{3,100})/gi,
    group: 1,
  },
  {
    id: 'sns_instagram',
    label: 'Instagramアカウント',
    category: 'contact',
    regex: /(?:Instagram|instagram|インスタグラム)\s*[：:・\s]\s*@([a-zA-Z0-9_](?:[a-zA-Z0-9_.]{0,28}[a-zA-Z0-9_])?)/gi,
    group: 1,
  },
  {
    id: 'sns_facebook',
    label: 'Facebookアカウント',
    category: 'contact',
    regex: /(?:Facebook|facebook|フェイスブック)\s*[：:・\s]\s*@?([a-zA-Z0-9.]{3,50})/gi,
    group: 1,
  },
]

// Year/date pattern (used to filter false-positive detections)
const YEAR_RANGE_CONTEXT =
  /(?:19|20)\d{2}\s*(?:年\s*\d{0,2}\s*月?\s*)?[-–—~〜～]\s*(?:(?:19|20)\d{2}|現在|至|present)/i

// Prefecture extraction
const PREFECTURE_RE = /^(北海道|東京都|京都府|大阪府|.{2,3}県)/
export function extractPrefecture(addr: string): string {
  const m = addr.match(PREFECTURE_RE)
  return m ? m[1] : ''
}

// ═══ Katakana → Romaji Initial ═══
const KANA_INITIAL_MAP: Record<string, string> = {
  ア: 'A',
  イ: 'I',
  ウ: 'U',
  エ: 'E',
  オ: 'O',
  カ: 'K',
  キ: 'K',
  ク: 'K',
  ケ: 'K',
  コ: 'K',
  ガ: 'G',
  ギ: 'G',
  グ: 'G',
  ゲ: 'G',
  ゴ: 'G',
  サ: 'S',
  シ: 'S',
  ス: 'S',
  セ: 'S',
  ソ: 'S',
  ザ: 'Z',
  ジ: 'Z',
  ズ: 'Z',
  ゼ: 'Z',
  ゾ: 'Z',
  タ: 'T',
  チ: 'C',
  ツ: 'T',
  テ: 'T',
  ト: 'T',
  ダ: 'D',
  ヂ: 'D',
  ヅ: 'D',
  デ: 'D',
  ド: 'D',
  ナ: 'N',
  ニ: 'N',
  ヌ: 'N',
  ネ: 'N',
  ノ: 'N',
  ハ: 'H',
  ヒ: 'H',
  フ: 'F',
  ヘ: 'H',
  ホ: 'H',
  バ: 'B',
  ビ: 'B',
  ブ: 'B',
  ベ: 'B',
  ボ: 'B',
  パ: 'P',
  ピ: 'P',
  プ: 'P',
  ペ: 'P',
  ポ: 'P',
  マ: 'M',
  ミ: 'M',
  ム: 'M',
  メ: 'M',
  モ: 'M',
  ヤ: 'Y',
  ユ: 'Y',
  ヨ: 'Y',
  ラ: 'R',
  リ: 'R',
  ル: 'R',
  レ: 'R',
  ロ: 'R',
  ワ: 'W',
  ヲ: 'W',
  ン: 'N',
}

function hiraToKata(c: string): string {
  const cp = c.charCodeAt(0)
  return cp >= 0x3041 && cp <= 0x3096 ? String.fromCharCode(cp + 0x60) : c
}

function charToInitial(c: string): string | null {
  return KANA_INITIAL_MAP[c] || KANA_INITIAL_MAP[hiraToKata(c)] || null
}

export function buildReadingMap(text: string): Map<string, string> {
  const map = new Map<string, string>()
  const lines = text.split(/\n/)
  for (let i = 0; i < lines.length; i++) {
    const nameM = lines[i].match(/(?:氏\s?名|名\s?前)\s*[：:・]\s*(.+)/)
    if (nameM) {
      const kanji = nameM[1].trim()
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const kanaM = lines[j].match(
          /(?:フリガナ|ふりがな|カナ)\s*[：:・]\s*([\u30a0-\u30ffー\u3040-\u309f\s\u3000]+)/,
        )
        if (kanaM) {
          map.set(kanji, kanaM[1].trim())
          break
        }
      }
    }
  }
  return map
}

export function nameToInitial(name: string, readingMap?: Map<string, string> | null): string {
  if (!name) return ''
  const isKana = /^[\u30a0-\u30ff\u3040-\u309fー\s\u3000]+$/.test(name)
  const reading = isKana ? name : readingMap?.get(name) || ''
  if (reading) {
    const parts = reading.split(/[\s\u3000]+/).filter(Boolean)
    const initials = parts.map((p) => charToInitial(p[0]) || p[0]).join('.')
    return initials ? initials + '.' : ''
  }
  const parts = name.split(/[\s\u3000]+/).filter(Boolean)
  if (parts.length >= 2) return parts.map((p) => p[0]).join('.') + '.'
  if (name.length >= 2) return name[0] + '.' + name[1] + '.'
  return name[0] + '.'
}

// ═══ Regex Detection ═══
export function detectRegex(text: string): Detection[] {
  const r: Detection[] = []
  const seen = new Set<string>()

  for (const p of REGEX_PATTERNS) {
    const re = new RegExp(p.regex.source, p.regex.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const v = (p.group ? m[p.group] : m[0]).trim()
      const k = `${p.id}:${v}`
      if (seen.has(k) || v.length < 2) continue

      // False positive filter: year/date context
      if (p.id === 'phone' || p.id === 'postal' || p.id === 'mynumber') {
        const mStart = m.index
        const mEnd = m.index + m[0].length
        const tightBefore = text.slice(Math.max(0, mStart - 8), mStart)
        const tightAfter = text.slice(mEnd, Math.min(text.length, mEnd + 8))
        const tightCtx = tightBefore + m[0] + tightAfter
        if (YEAR_RANGE_CONTEXT.test(tightCtx)) continue
        const lineStart = text.lastIndexOf('\n', mStart) + 1
        const lineEnd = text.indexOf('\n', mEnd)
        const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
        const hasPIILabel = /(?:電話|TEL|tel|Tel|携帯|FAX|fax|連絡先|〒|郵便)\s*[：:・]?\s*$/.test(
          text.slice(Math.max(0, mStart - 20), mStart),
        )
        if (
          !hasPIILabel &&
          /^\s*(?:(?:19|20)\d{2}|(?:昭和|平成|令和)\s?\d{1,2})\s*[年/.\-]/.test(line)
        )
          continue
        if (p.id === 'postal' && !v.startsWith('〒')) {
          const charBefore = mStart > 0 ? text[mStart - 1] : ''
          if (/\d/.test(charBefore)) continue
        }
        if (p.id === 'phone') {
          const after1 = text.slice(mEnd, mEnd + 1)
          if (/[年月]/.test(after1)) continue
        }
      }

      // False positive filter: SNS accounts
      if (p.id.startsWith('sns_')) {
        const mStart = m.index
        const mEnd = m.index + m[0].length
        const before = text.slice(Math.max(0, mStart - 20), mStart)
        // Skip if part of email address
        if (/[a-zA-Z0-9._%+\-]@/.test(before) && /\.\w+/.test(text.slice(mEnd, mEnd + 10)))
          continue
        // Skip if part of URL (already detected by url pattern)
        if (/https?:\/\/\S*$/.test(before)) continue
      }

      // False positive filter: date as birthday vs document date
      if (p.id === 'birthday') {
        const mStart = m.index
        const before30 = text.slice(Math.max(0, mStart - 30), mStart)
        const isBirthdayLabel = /(?:生年月日|誕生日|生まれ|DOB|Date of Birth)\s*[：:・]?\s*$/i.test(
          before30,
        )
        const isDocDateLabel =
          /(?:作成日|提出日|更新日|記入日|発行日|印刷日|出力日|日付|現在|応募日|送付日|記載日)\s*[：:・]?\s*$/i.test(
            before30,
          )
        if (isDocDateLabel) continue
        if (!isBirthdayLabel) {
          let year: number | null = null
          const westernM = v.match(/^((?:19|20)\d{2})/)
          if (westernM) year = parseInt(westernM[1])
          const eraM = v.match(/^(昭和|平成|令和)\s?(\d{1,2})/)
          if (eraM) {
            const base = eraM[1] === '昭和' ? 1925 : eraM[1] === '平成' ? 1988 : 2018
            year = base + parseInt(eraM[2])
          }
          const currentYear = new Date().getFullYear()
          if (year && year > currentYear - 20) continue
        }
      }

      seen.add(k)
      r.push({
        id: `re_${p.id}_${m.index}`,
        type: p.id,
        label: p.label,
        category: p.category,
        value: v,
        source: 'regex',
        confidence: 0.95,
        enabled: true,
      })
    }
  }
  return r
}

// ═══ Name Dictionaries ═══
export const SURNAMES = [
  '佐藤',
  '鈴木',
  '高橋',
  '田中',
  '伊藤',
  '渡辺',
  '山本',
  '中村',
  '小林',
  '加藤',
  '吉田',
  '山田',
  '佐々木',
  '松本',
  '井上',
  '木村',
  '林',
  '斎藤',
  '清水',
  '山口',
  '森',
  '池田',
  '橋本',
  '阿部',
  '石川',
  '山崎',
  '中島',
  '藤田',
  '小川',
  '後藤',
  '岡田',
  '長谷川',
  '村上',
  '近藤',
  '石井',
  '斉藤',
  '坂本',
  '遠藤',
  '青木',
  '藤井',
  '西村',
  '福田',
  '太田',
  '三浦',
  '藤原',
  '岡本',
  '松田',
  '中川',
  '中野',
  '原田',
  '小野',
  '田村',
  '竹内',
  '金子',
  '和田',
  '中山',
  '石田',
  '上田',
  '森田',
  '原',
  '柴田',
  '酒井',
  '工藤',
  '横山',
  '宮崎',
  '宮本',
  '内田',
  '高木',
  '安藤',
  '谷口',
  '大野',
  '丸山',
  '今井',
  '河野',
  '藤本',
  '村田',
  '武田',
  '上野',
  '杉山',
  '増田',
  '平野',
  '大塚',
  '千葉',
  '久保',
  '松井',
  '小島',
  '岩崎',
  '桜井',
  '野口',
  '松尾',
  '野村',
  '木下',
  '菊地',
  '佐野',
  '大西',
  '杉本',
  '新井',
  '浜田',
  '菅原',
  '市川',
  '水野',
  '小松',
  '島田',
  '古川',
  '前田',
  '東',
  '熊谷',
  '小山',
  '石原',
  '望月',
  '永井',
  '平田',
  '森本',
  '久保田',
  '大島',
  '渡部',
  '山内',
  '飯田',
  '内藤',
  '川口',
  '矢野',
  '吉川',
  '辻',
  '星野',
  '関',
  '岩田',
  '馬場',
  '西田',
  '川崎',
  '堀',
  '関口',
  '片山',
  '横田',
  '秋山',
  '本田',
  '土屋',
  '吉村',
  '荒木',
  '黒田',
  '安田',
  '奥村',
  '大久保',
  '野田',
  '川上',
  '松岡',
  '田口',
  '須藤',
  '中田',
  '荒井',
  '小池',
  '山下',
  '松原',
  '福島',
  '福井',
  '尾崎',
  '服部',
  '篠原',
  '西川',
  '五十嵐',
  '北村',
  '細川',
  '浅野',
  '宮田',
  '大石',
  '白石',
  '南',
  '大谷',
  '平井',
  '児玉',
  '富田',
  '松村',
  '吉岡',
  '大橋',
  '中西',
  '津田',
  '大山',
  '黒木',
  '田島',
  '栗原',
  '今村',
  '西山',
  '沢田',
  '榎本',
  '堀内',
  '永田',
  '植田',
  '向井',
  '若林',
  '北川',
  '堀田',
  '米田',
  '広瀬',
  '土井',
  '梅田',
  '高野',
  '早川',
  '本間',
  '桑原',
  '滝沢',
  '奥田',
  '秋元',
  '川村',
  '松下',
  '竹田',
  '大森',
  '福本',
  '三宅',
  '落合',
  '田辺',
  '岸',
  '栗田',
  '横井',
  '成田',
  '小泉',
  '窪田',
  '大竹',
  '坂口',
  '牧野',
  '三好',
  '倉田',
  '平山',
  '高田',
  '上原',
  '丹羽',
  '根本',
  '宮川',
  '稲葉',
  '岩本',
  '古賀',
  '大平',
  '伊東',
  '安部',
  '河合',
  '河村',
  '柳',
  '水谷',
  '小野寺',
  '門田',
  '沖田',
  '萩原',
  '柳田',
  '塚本',
  '笠原',
  '尾上',
  '相田',
  '倉本',
  '峯',
  '戸田',
  '北野',
  '桑田',
  '日高',
  '有田',
  '瀬戸',
  '宗',
  '津村',
  '古田',
  '柏木',
  '友田',
  '神田',
  '鶴田',
  '梶原',
  '生田',
  '相馬',
  '亀山',
  '畑',
  '浦田',
]

export const GIVEN_NAMES = [
  '太郎',
  '一郎',
  '二郎',
  '三郎',
  '健太',
  '翔太',
  '大輝',
  '拓也',
  '直樹',
  '和也',
  '達也',
  '哲也',
  '雄太',
  '裕太',
  '康平',
  '大介',
  '俊介',
  '慎一',
  '誠',
  '隆',
  '浩',
  '豊',
  '茂',
  '勝',
  '清',
  '正',
  '進',
  '博',
  '修',
  '剛',
  '翔',
  '蓮',
  '悠真',
  '陽翔',
  '湊',
  '朝陽',
  '蒼',
  '律',
  '悠人',
  '大翔',
  '陸',
  '結翔',
  '颯真',
  '悠斗',
  '樹',
  '奏太',
  '陽太',
  '駿',
  '暖',
  '柊',
  '花子',
  '洋子',
  '和子',
  '恵子',
  '幸子',
  '節子',
  '京子',
  '美智子',
  '由美子',
  '真理子',
  '裕子',
  '順子',
  '直子',
  '久美子',
  '智子',
  '典子',
  '康子',
  '明美',
  '由美',
  '真由美',
  '美咲',
  '陽菜',
  '結衣',
  'さくら',
  '美月',
  '莉子',
  '結菜',
  '凛',
  '葵',
  '楓',
  '芽依',
  '紬',
  '澪',
  '心春',
  '陽葵',
  '詩',
  '杏',
  '琴音',
  '美優',
  '彩花',
  '愛',
  '優子',
  '麻衣',
  '里美',
  '千尋',
  '綾',
  '舞',
  '遥',
  '彩',
  '茜',
  '翼',
  '海斗',
  '颯',
  '悠',
  '碧',
  '暁',
  '涼太',
  '健',
  '優',
  '亮',
  '純',
  '聡',
  '学',
  '光',
  '力',
  '実',
  '守',
  '昇',
  '登',
  '望',
  '瑛太',
  '蒼太',
  '大和',
  '悠希',
  '春樹',
  '遼',
  '拓海',
  '奏',
  '凪',
  '煌',
  '真央',
  '美羽',
  '日菜',
  '七海',
  '千夏',
  '風花',
  '美桜',
  '瑠奈',
  '希',
  '柚',
  '恵',
  '薫',
  '忍',
  '操',
  '静',
  '光子',
  '文子',
  '芳子',
  '弘子',
  '信子',
  '篤志',
  '篤',
  '敦',
  '淳',
  '潤',
  '亘',
  '渉',
  '徹',
  '哲',
  '稔',
  '満',
  '充',
  '均',
  '仁',
  '義',
  '勇',
  '武',
  '章',
  '彰',
  '昭',
  '明',
  '晃',
  '宏',
  '弘',
  '広',
  '裕',
  '祐',
  '雄',
  '勲',
  '薫',
  '馨',
  '敬',
  '啓',
  '慶',
  '恭',
  '恵一',
  '賢一',
  '健一',
  '幸一',
  '孝一',
  '浩一',
  '宗一',
  '正一',
  '善一',
  '泰一',
  '忠一',
  '哲一',
  '徳一',
  '秀一',
  '英一',
  '文一',
  '雅之',
  '正之',
  '秀之',
  '裕之',
  '浩之',
  '和之',
  '隆之',
  '博之',
  '義之',
  '敬之',
]

// Boundary check
const NAME_BEF_OK = /[：:・、。，．\s\u3000\n\r\t|｜/／()（）「」『』【】\-–—~\d.,;!?'"]/
const LABEL_ENDS = /[名者当員長任師生客様方人]/

const NON_NAME_WORDS = new Set([
  '株式会社',
  '有限会社',
  '合同会社',
  '一般社団',
  '特定非営利',
  '事業部',
  '開発部',
  '営業部',
  '総務部',
  '人事部',
  '経理部',
  '企画部',
  '技術部',
  '管理部',
  '製造部',
  '品質管理',
  '情報システム',
  'エンジニア',
  'マネージャー',
  'ディレクター',
  'プロジェクト',
  'アシスタント',
  'コンサルタント',
  'デザイナー',
  'マーケター',
  'プログラマー',
  'アナリスト',
  'インターン',
  'フロントエンド',
  'バックエンド',
  'フルスタック',
  'テックリード',
  'アドバイザー',
  'クリエーター',
  'プランナー',
  'リサーチャー',
  'スペシャリスト',
  'コーディネーター',
  'マーケティング',
  'ブランディング',
  'コンサルティング',
  'エグゼクティブ',
  'プレジデント',
  'チーフ',
  'シニア',
  'ジュニア',
  'リード',
  'ヘッド',
  '美容師',
  '薬剤師',
  '看護師',
  '弁護士',
  '税理士',
  '会計士',
  '司法書士',
  '行政書士',
  '社労士',
  '建築士',
  '技術者',
  '研究者',
  '教授',
  '講師',
  '助手',
  '学生',
  '院生',
  '新卒',
  '中途',
  '派遣',
  '契約',
  '正社員',
  'パート',
  'アルバイト',
  '代表取締役',
  '取締役',
  '監査役',
  '執行役員',
  '副社長',
  '専務',
  '常務',
  '部長代理',
  '次長',
  '主幹',
  '係長補佐',
  '班長',
  '組長',
  'チームリーダー',
  'グループリーダー',
  'セクションリーダー',
  '技術顧問',
  '顧問',
  '相談役',
  '参与',
  '特別顧問',
  '社外取締役',
  '非常勤',
  '嘱託',
  '名誉会長',
  '名誉顧問',
  '最高顧問',
  '経営顧問',
  '法律顧問',
  '技術担当',
  '事業担当',
  '統括責任者',
  '統括部長',
  '本部長',
  '副本部長',
  '支社長',
  '支店長',
  '工場長',
  '所長',
  '室長',
  'センター長',
  '部門長',
  '課長代理',
  '主任技師',
  '主任研究員',
  '技術主任',
  '開発主任',
  'プロダクトマネージャー',
  'スクラムマスター',
  'テクニカルリード',
  'アーキテクト',
  'データサイエンティスト',
  '機械学習エンジニア',
  'インフラエンジニア',
  'セキュリティエンジニア',
  '品質保証',
  'テスター',
  'カスタマーサクセス',
  'アカウントマネージャー',
  '事業開発',
  '経営企画',
  '広報担当',
  '人事担当',
  '法務担当',
  '財務担当',
  '経理担当',
  '総務担当',
  '情報管理',
  '会長',
  '社長',
  '部長',
  '課長',
  '係長',
  '主任',
  '店長',
  '院長',
  '園長',
  '館長',
  '署長',
  '局長',
  '議長',
  '委員長',
  '理事長',
  '学長',
  '校長',
  '教頭',
  '学部長',
  '研究室長',
])

function isLikelyName(text: string): boolean {
  if (!text || text.length < 2 || text.length > 10) return false
  const clean = text.replace(/[\s\u3000]/g, '')
  if (NON_NAME_WORDS.has(clean)) return false
  if (!/[\u4e00-\u9fff]/.test(clean)) return false
  if (/^[\u30a0-\u30ff\s\u3000]+$/.test(clean)) return false
  return true
}

// ═══ Japanese Name Detection ═══
export function detectJapaneseNames(text: string): Detection[] {
  const r: Detection[] = []
  const seen = new Set<string>()

  // 1. Dictionary match: SURNAME + optional space + GIVEN_NAME
  for (const sn of SURNAMES) {
    let p = 0
    while ((p = text.indexOf(sn, p)) !== -1) {
      const a = p + sn.length
      const rest = text.slice(a, a + 10)
      const sp = rest.match(/^[\s\u3000]*/)
      const ns = a + (sp ? sp[0].length : 0)
      const nr = text.slice(ns, ns + 6)
      let matched = false
      for (const gn of GIVEN_NAMES) {
        if (nr.startsWith(gn)) {
          const full = text.slice(p, ns + gn.length)
          const k = `name:${full}`
          if (!seen.has(k) && isLikelyName(full)) {
            const bef = p > 0 ? text[p - 1] : ' '
            const ok = p === 0 || NAME_BEF_OK.test(bef) || LABEL_ENDS.test(bef)
            if (ok) {
              seen.add(k)
              r.push({
                id: `nd_${p}`,
                type: 'name_dict',
                label: '氏名（辞書）',
                category: 'name',
                value: full,
                source: 'dict',
                confidence: 0.92,
                enabled: true,
              })
              matched = true
            }
          }
        }
      }
      if (!matched) {
        const before30 = text.slice(Math.max(0, p - 30), p)
        const hasLabel =
          /(?:氏名|名前|担当|著者|記入者|申請者|連絡先|責任者|作成者|報告者|代表者|上司|部長|課長|主任|対応者)[：:・\s\u3000/|]*$/.test(
            before30,
          )
        if (hasLabel) {
          const after = text.slice(a, a + 8)
          const gnMatch = after.match(/^[\s\u3000]*([\u4e00-\u9fff]{1,4})/)
          const fullName = gnMatch
            ? text.slice(p, a + (gnMatch.index || 0) + gnMatch[0].length).trim()
            : sn
          if (isLikelyName(fullName)) {
            const k = `nc2:${fullName}:${p}`
            if (!seen.has(k)) {
              seen.add(k)
              r.push({
                id: `nc2_${p}`,
                type: 'name_context',
                label: '氏名（文脈）',
                category: 'name',
                value: fullName,
                source: 'dict',
                confidence: 0.88,
                enabled: true,
              })
            }
          }
        }
      }
      p++
    }
  }

  // 2. Label-based context detection
  const lre =
    /(?:氏名|名前|担当者?|著者|記入者|申請者|連絡先|責任者|作成者|報告者|代表者|上司|所属長|管理者|承認者)\s*[：:・\s\u3000/|｜\t]\s*/g
  let lm: RegExpExecArray | null
  while ((lm = lre.exec(text)) !== null) {
    const afterLabel = text.slice(lm.index + lm[0].length, lm.index + lm[0].length + 16)
    let found = false
    for (const sn of SURNAMES) {
      if (afterLabel.startsWith(sn)) {
        const k = `nc:${sn}:${lm.index}`
        if (!seen.has(k)) {
          const rn = afterLabel.slice(sn.length)
          const nm = rn.match(/^[\s\u3000]*([\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]{1,4})/)
          const fv = nm ? afterLabel.slice(0, sn.length + nm[0].length) : sn
          if (isLikelyName(fv.trim())) {
            seen.add(k)
            r.push({
              id: `nc_${lm.index}`,
              type: 'name_context',
              label: '氏名（文脈）',
              category: 'name',
              value: fv.trim(),
              source: 'dict',
              confidence: 0.9,
              enabled: true,
            })
            found = true
          }
        }
        break
      }
    }
    if (!found) {
      const nameGuess = afterLabel.match(/^([\u4e00-\u9fff]{2,4}[\s\u3000]?[\u4e00-\u9fff]{1,4})/)
      if (nameGuess && isLikelyName(nameGuess[1].trim())) {
        const val = nameGuess[1].trim()
        const k = `ng:${val}:${lm.index}`
        if (!seen.has(k)) {
          seen.add(k)
          r.push({
            id: `ng_${lm.index}`,
            type: 'name_context',
            label: '氏名（推定）',
            category: 'name',
            value: val,
            source: 'heuristic',
            confidence: 0.75,
            enabled: true,
          })
        }
      }
    }
  }
  return r
}

// ═══ Combined Detection ═══
export function detectAll(text: string): Detection[] {
  const nt = normalizeText(text)
  const all = [...detectRegex(nt), ...detectJapaneseNames(nt)]
  const seen = new Set<string>()
  return all.filter((d) => {
    const k = `${d.category}:${d.value}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function mergeDetections(base: Detection[], aiResults: Detection[]): Detection[] {
  const seen = new Set(base.map((d) => `${d.category}:${d.value}`))
  const merged = [...base]
  for (const d of aiResults) {
    const k = `${d.category}:${d.value}`
    if (!seen.has(k)) {
      seen.add(k)
      merged.push(d)
    }
  }
  return merged
}
