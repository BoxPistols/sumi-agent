// ═══ Redaction Engine ═══

import type { Detection } from './detection'
import { extractPrefecture, buildReadingMap, nameToInitial } from './detection'

// Placeholder mappings
export const PLACEHOLDERS: Record<string, string> = {
  email: '[メール非公開]',
  url: '[URL非公開]',
  phone: '[電話番号非公開]',
  postal: '[郵便番号非公開]',
  birthday: '[年月日非公開]',
  address: '[住所非公開]',
  name_label: '[氏名非公開]',
  name_dict: '[氏名非公開]',
  name_context: '[氏名非公開]',
  name_ai: '[氏名非公開]',
  name_kana: '[氏名非公開]',
  sns_ai: '[SNS非公開]',
  sns_twitter: '[Twitter/X非公開]',
  sns_github: '[GitHub非公開]',
  sns_linkedin: '[LinkedIn非公開]',
  sns_instagram: '[Instagram非公開]',
  sns_facebook: '[Facebook非公開]',
  mynumber: '[番号非公開]',
  ner_person: '[氏名非公開]',
  ner_org: '[組織名非公開]',
  face: '[顔写真削除]',
}

// Regex to match any placeholder in text
export const PLACEHOLDER_RE =
  /\[(?:メール非公開|URL非公開|電話番号非公開|郵便番号非公開|年月日非公開|生年月日非公開|住所非公開|住所詳細非公開|氏名非公開|番号非公開|SNS非公開|Twitter\/X非公開|GitHub非公開|LinkedIn非公開|Instagram非公開|Facebook非公開|地名非公開|場所非公開|組織名非公開|日付非公開|国名非公開|顔写真削除|非公開|Name Redacted|Email Redacted|Phone Redacted|Address Redacted|DOB Redacted|URL Redacted)\]/g

export interface RedactionOptions {
  keepPrefecture?: boolean
  nameInitial?: boolean
}

export function applyRedaction(text: string, dets: Detection[], opts?: RedactionOptions): string {
  const keepPref = opts?.keepPrefecture || false
  const nameInit = opts?.nameInitial || false
  const readingMap = nameInit ? buildReadingMap(text) : null
  let r = text
  const s = [...dets]
    .filter((d) => d.enabled)
    .sort((a, b) => (b.value?.length || 0) - (a.value?.length || 0))

  for (const d of s) {
    if (!d.value) continue
    const isNameType = d.category === 'name'
    const isAddrType = d.type === 'address'
    let replacement: string

    if (isNameType && nameInit) {
      replacement = nameToInitial(d.value, readingMap) || PLACEHOLDERS[d.type] || '[非公開]'
    } else if (isAddrType && keepPref) {
      const pref = extractPrefecture(d.value)
      replacement = pref ? pref + '[住所詳細非公開]' : '[住所非公開]'
    } else {
      replacement = PLACEHOLDERS[d.type] || '[非公開]'
    }
    r = r.split(d.value).join(replacement)
  }
  return r
}
