/**
 * 経歴書アドバイザー型定義
 */

export interface AdvisorMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface AdvisorPreset {
  id: string
  label: string
  prompt: string
  desc: string
}

