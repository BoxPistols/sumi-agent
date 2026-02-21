// ═══ Constants & Configuration ═══

export const C = {
  accent: '#4C85F6',
  accentDim: 'rgba(76,133,246,0.12)',
  red: '#F05656',
  redDim: 'rgba(240,86,86,0.1)',
  green: '#36C78A',
  greenDim: 'rgba(54,199,138,0.1)',
  amber: '#DDA032',
  amberDim: 'rgba(221,160,50,0.1)',
  purple: '#9B6DFF',
  purpleDim: 'rgba(155,109,255,0.1)',
  cyan: '#22D3EE',
  cyanDim: 'rgba(34,211,238,0.1)',
  font: "'Noto Sans JP','DM Sans',system-ui,sans-serif",
  mono: "'JetBrains Mono','Fira Code',monospace",
} as const

export interface AIModel {
  id: string
  label: string
  desc: string
  tier: number
}

export interface AIProvider {
  id: string
  label: string
  icon: string
  color: string
  needsKey: boolean
  models: AIModel[]
  defaultModel: string
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'anthropic',
    label: 'Claude',
    icon: 'C',
    color: '#D97706',
    needsKey: false,
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', desc: '高速・低コスト', tier: 1 },
      {
        id: 'claude-sonnet-4-20250514',
        label: 'Sonnet 4',
        desc: 'バランス型（推奨）',
        tier: 2,
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        label: 'Sonnet 4.5',
        desc: '高精度',
        tier: 3,
      },
    ],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    icon: 'O',
    color: '#10A37F',
    needsKey: false,
    models: [
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', desc: '旧世代・超軽量', tier: 1 },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', desc: '旧世代・低コスト', tier: 2 },
      { id: 'gpt-5-nano', label: 'GPT-5 Nano', desc: '最速・最安（推奨）', tier: 1 },
      { id: 'gpt-5-mini', label: 'GPT-5 Mini', desc: '高速・高精度', tier: 2 },
    ],
    defaultModel: 'gpt-5-nano',
  },
  {
    id: 'google',
    label: 'Gemini',
    icon: 'G',
    color: '#4285F4',
    needsKey: true,
    models: [
      { id: 'gemini-2.0-flash', label: '2.0 Flash', desc: '軽量・高速', tier: 1 },
      { id: 'gemini-2.5-flash', label: '2.5 Flash', desc: 'バランス型', tier: 2 },
      { id: 'gemini-2.5-pro', label: '2.5 Pro', desc: '高精度', tier: 3 },
    ],
    defaultModel: 'gemini-2.5-flash',
  },
]

export const AI_MODELS = AI_PROVIDERS.flatMap((p) =>
  p.models.map((m) => ({ ...m, provider: p.id })),
)

export function getProviderForModel(modelId: string): string {
  for (const p of AI_PROVIDERS) {
    if (p.models.some((m) => m.id === modelId)) return p.id
  }
  return 'anthropic'
}

export interface CategoryMeta {
  label: string
  color: string
  bg: string
}

export const CATEGORIES: Record<string, CategoryMeta> = {
  name: { label: '氏名', color: C.red, bg: C.redDim },
  contact: { label: '連絡先', color: C.accent, bg: C.accentDim },
  address: { label: '住所・地名', color: C.amber, bg: C.amberDim },
  personal: { label: '個人情報', color: C.purple, bg: C.purpleDim },
  web: { label: 'URL', color: C.cyan, bg: C.cyanDim },
  organization: { label: '組織名', color: '#8490A8', bg: 'rgba(132,144,168,0.1)' },
  custom: { label: 'カスタム', color: '#E879A8', bg: 'rgba(232,121,168,0.1)' },
  photo: { label: '顔写真', color: C.red, bg: C.redDim },
}

export const DEFAULT_MASK: Record<string, boolean> = {
  name: true,
  contact: true,
  address: true,
  personal: true,
  web: true,
  organization: false,
  custom: true,
  keepPrefecture: true,
  nameInitial: false,
}

export interface MaskPreset {
  id: string
  label: string
  desc: string
  level: number
  mask: Record<string, boolean>
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
      custom: true,
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
      custom: true,
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
      custom: true,
      keepPrefecture: false,
      nameInitial: false,
    },
  },
]

export const EXPORT_FORMATS = [
  { id: 'txt', label: 'Text', ext: '.txt', icon: 'T' },
  { id: 'md', label: 'Markdown', ext: '.md', icon: 'M' },
  { id: 'csv', label: 'CSV', ext: '.csv', icon: 'C' },
  { id: 'xlsx', label: 'Excel', ext: '.xlsx', icon: 'X' },
  { id: 'pdf', label: 'PDF', ext: '.pdf', icon: 'P' },
  { id: 'docx', label: 'Word', ext: '.docx', icon: 'W' },
] as const

// SPA sites that can't be scraped
export const SPA_DOMAINS = [
  'canva.com',
  'figma.com',
  'notion.so',
  'docs.google.com',
  'drive.google.com',
  'adobe.com',
  'miro.com',
]
