/**
 * 画面が使うカテゴリ表示・マスク設定・書き出し形式の定義
 *
 * src/lib/constants.ts にも同名の定義があるが、画面はこちらを使う。差分は次の 3 点で、
 * 統一するときは画面の見た目とマスク対象が変わらないことを確認してから寄せること。
 *   - CATEGORIES.contact の色がテーマで反転する CSS 変数（T.accent）
 *   - DEFAULT_MASK / MASK_PRESETS に custom キーがない（未指定はマスク対象として扱われる）
 *   - EXPORT_FORMATS の PDF が「PDF (印刷)」で拡張子なし（印刷ダイアログ経由のため）
 */
import { C, T } from '@/lib/theme'

export interface CategoryMeta {
  label: string
  color: string
  bg: string
}

export type CategoryId =
  | 'name'
  | 'contact'
  | 'address'
  | 'personal'
  | 'web'
  | 'organization'
  | 'custom'
  | 'photo'

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  name: { label: '氏名', color: C.red, bg: C.redDim },
  contact: { label: '連絡先', color: T.accent, bg: T.accentDim },
  address: { label: '住所・地名', color: C.amber, bg: C.amberDim },
  personal: { label: '個人情報', color: C.purple, bg: C.purpleDim },
  web: { label: 'URL', color: C.cyan, bg: C.cyanDim },
  organization: { label: '組織名', color: '#8490A8', bg: 'rgba(132,144,168,0.1)' },
  custom: { label: 'カスタム', color: '#E879A8', bg: 'rgba(232,121,168,0.1)' },
  photo: { label: '顔写真', color: C.red, bg: C.redDim },
}

/** カテゴリごとのマスク ON/OFF と、住所・氏名の部分マスクの指定 */
export type MaskConfig = Partial<Record<CategoryId, boolean>> & {
  keepPrefecture?: boolean
  nameInitial?: boolean
}

export const DEFAULT_MASK: MaskConfig = {
  name: true,
  contact: true,
  address: true,
  personal: true,
  web: true,
  organization: false,
  keepPrefecture: true,
  nameInitial: false,
}

export interface MaskPreset {
  id: 'basic' | 'std' | 'strict'
  label: string
  desc: string
  level: number
  mask: MaskConfig
}

export const MASK_PRESETS: MaskPreset[] = [
  {
    id: 'basic',
    label: '基本',
    desc: '氏名 + 連絡先のみ',
    level: 1,
    mask: {
      name: true,
      contact: true,
      address: false,
      personal: false,
      web: false,
      organization: false,
      keepPrefecture: true,
      nameInitial: false,
    },
  },
  {
    id: 'std',
    label: '標準',
    desc: '+ 住所・年月日・URL',
    level: 2,
    mask: {
      name: true,
      contact: true,
      address: true,
      personal: true,
      web: true,
      organization: false,
      keepPrefecture: true,
      nameInitial: false,
    },
  },
  {
    id: 'strict',
    label: '厳格',
    desc: '組織名含む全項目',
    level: 3,
    mask: {
      name: true,
      contact: true,
      address: true,
      personal: true,
      web: true,
      organization: true,
      keepPrefecture: false,
      nameInitial: false,
    },
  },
]

export interface ExportFormat {
  id: 'txt' | 'md' | 'csv' | 'xlsx' | 'pdf' | 'docx'
  label: string
  ext: string
  icon: string
}

export const EXPORT_FORMATS: ExportFormat[] = [
  { id: 'txt', label: 'Text', ext: '.txt', icon: 'T' },
  { id: 'md', label: 'Markdown', ext: '.md', icon: 'M' },
  { id: 'csv', label: 'CSV', ext: '.csv', icon: 'C' },
  { id: 'xlsx', label: 'Excel', ext: '.xlsx', icon: 'X' },
  { id: 'pdf', label: 'PDF (印刷)', ext: '', icon: 'P' },
  { id: 'docx', label: 'Word', ext: '.docx', icon: 'W' },
]

export interface LayoutPreset {
  id: 'text' | 'balanced' | 'preview' | 'advisor' | 'focus'
  label: string
  /** 左から順の列幅の比（flex-grow） */
  cols: { f: number }[]
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: 'text', label: 'テキスト重視', cols: [{ f: 3 }, { f: 1 }] },
  { id: 'balanced', label: 'バランス', cols: [{ f: 5 }, { f: 3 }, { f: 2 }] },
  { id: 'preview', label: 'プレビュー重視', cols: [{ f: 2 }, { f: 5 }, { f: 2 }] },
  { id: 'advisor', label: 'アドバイザー重視', cols: [{ f: 2 }, { f: 4 }] },
  { id: 'focus', label: '集中モード', cols: [{ f: 1 }] },
]
