/**
 * 画面の配色トークン
 *
 * C はテーマに依存しない固定色、T はテーマ（ライト/ダーク）で値が変わる CSS 変数への参照。
 * 色の使い分けは docs/DESIGN.md を参照。
 */
import { C } from '@/lib/constants'

export { C }

export const T = {
  ...C,
  accent: 'var(--rp-accent)',
  accentDim: 'var(--rp-accentDim)',
  bg: 'var(--rp-bg)',
  bg2: 'var(--rp-bg2)',
  surface: 'var(--rp-surface)',
  surfaceAlt: 'var(--rp-surfaceAlt)',
  border: 'var(--rp-border)',
  text: 'var(--rp-text)',
  text2: 'var(--rp-text2)',
  text3: 'var(--rp-text3)',
  diffAdd: 'var(--rp-diffAdd)',
  diffDel: 'var(--rp-diffDel)',
  diffAddBorder: 'var(--rp-diffAddBorder)',
  diffDelBorder: 'var(--rp-diffDelBorder)',
  warn: 'var(--rp-warn)',
} as const
