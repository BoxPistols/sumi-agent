'use client'

// ═══ 確認画面の本文: 検出箇所に data-det-id のアンカーを付けて描画する ═══
// 検出リストの項目クリックで本文の該当箇所へスクロール・点滅させるために、
// 検出値ごとに <span data-det-id> を差し込んだ JSX セグメント列を返す。
// showRedacted のときは enabled な検出をプレースホルダ表示（値は出さない）にする。

import type { CSSProperties, ReactNode } from 'react'
import {
  PH,
  buildNonOverlappingMatches,
  buildReadingMap,
  extractPrefecture,
  nameToInitial,
  type AppDetection,
  type DetectionMatch,
  type MaskOptions,
  type Span,
} from '@/lib/redact-engine'
import { T } from '@/lib/theme'

export function renderTextWithDetectionAnchors(
  text: string,
  dets: readonly AppDetection[],
  opts: MaskOptions | null | undefined,
  showRedacted: boolean,
  focusId: string | null | undefined,
  focusPulse: number,
): string | ReactNode[] {
  if (typeof text !== 'string' || !text) return text || ''
  const all = [...dets]
    .filter((d) => d && typeof d.value === 'string' && d.value.length >= 2)
    .sort((a, b) => (b.value?.length || 0) - (a.value?.length || 0))
  if (all.length === 0) return text

  const keepPref = opts?.keepPrefecture || false
  const nameInit = opts?.nameInitial || false
  const readingMap = nameInit ? buildReadingMap(text) : null

  const placeholderStyle: CSSProperties = {
    background: T.redDim,
    color: T.red,
    padding: '1px 6px',
    borderRadius: 4,
    fontWeight: 600,
    fontSize: '0.92em',
  }
  const rawHitStyle: CSSProperties = {
    background: 'rgba(76,133,246,0.16)',
    borderRadius: 3,
    boxShadow: 'inset 0 -1px 0 rgba(76,133,246,0.55)',
  }

  let matches: DetectionMatch<AppDetection>[] = []
  if (showRedacted) {
    const occ: Span[] = []
    const en = all.filter((d) => d.enabled)
    const dis = all.filter((d) => !d.enabled)
    const m1 = buildNonOverlappingMatches(text, en, occ)
    const m2 = buildNonOverlappingMatches(text, dis, occ)
    matches = [...m1, ...m2].sort((a, b) => a.s - b.s)
  } else {
    matches = buildNonOverlappingMatches(text, all)
  }
  if (matches.length === 0) return text

  const out: ReactNode[] = []
  let cur = 0
  const animName = focusPulse % 2 ? 'detFlashA' : 'detFlashB'

  for (const m of matches) {
    if (m.s > cur) out.push(text.slice(cur, m.s))
    const d = m.det
    const focused = !!(focusId && d?.id === focusId)
    const anim: CSSProperties = focused ? { animation: `${animName} 1.25s ease-in-out 1` } : {}

    if (showRedacted) {
      if (d.enabled) {
        // Masked rendering (keeps privacy; value is not shown)
        let node: ReactNode = null
        const isNameType = d.category === 'name'
        const isAddrType = d.type === 'address'
        if (isNameType && nameInit) {
          const rep = nameToInitial(d.value, readingMap) || PH[d.type] || '[非公開]'
          node = <span style={placeholderStyle}>{rep}</span>
        } else if (isAddrType && keepPref) {
          const pref = extractPrefecture(d.value)
          node = pref ? (
            <>
              <span>{pref}</span>
              <span style={placeholderStyle}>[住所詳細非公開]</span>
            </>
          ) : (
            <span style={placeholderStyle}>[住所非公開]</span>
          )
        } else {
          const rep = PH[d.type] || '[非公開]'
          node = <span style={placeholderStyle}>{rep}</span>
        }
        out.push(
          <span key={`det_${d.id}_${m.s}`} data-det-id={d.id} style={{ borderRadius: 6, ...anim }}>
            {node}
          </span>,
        )
      } else {
        // Unmasked detection: keep original text; only highlight when focused
        const hit = text.slice(m.s, m.e)
        out.push(
          <span
            key={`det_${d.id}_${m.s}`}
            data-det-id={d.id}
            style={{ ...(focused ? rawHitStyle : {}), ...anim }}
          >
            {hit}
          </span>,
        )
      }
    } else {
      // Raw/original rendering (value is visible; highlight only when focused)
      const hit = text.slice(m.s, m.e)
      out.push(
        <span
          key={`det_${d.id}_${m.s}`}
          data-det-id={d.id}
          style={{ ...(focused ? rawHitStyle : {}), ...anim }}
        >
          {hit}
        </span>,
      )
    }
    cur = m.e
  }
  if (cur < text.length) out.push(text.slice(cur))
  return out
}
