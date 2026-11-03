'use client'
/**
 * 確認画面に埋め込む A4 風プレビュー。
 * マスキング後の見た目で本文を描画し、見出し・箇条書き・「項目: 値」を簡易に整形する。
 * 検出箇所をクリックすると onFocusDet でその検出へフォーカスを移す。
 */
import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import s from '@/app/redact-pro.module.css'
import { buildAnnotations } from '@/lib/redact-engine'
import type { AnnotationSegment, AppDetection, MaskOptions } from '@/lib/redact-engine'
import { T } from '@/lib/theme'
import { CATEGORIES } from '@/lib/ui-config'
import type { CategoryMeta } from '@/lib/ui-config'

export interface A4PreviewPanelProps {
  text: string
  detections: AppDetection[]
  maskOpts?: MaskOptions | null
  focusDetId?: string | null
  /** フォーカスのたびに増える値。偶奇でアニメーション名を切り替えて同じ検出でも再生させる */
  focusPulse: number
  onFocusDet?: (id: string) => void
  zoom?: number
}

type Segment = AnnotationSegment<AppDetection>

interface PreviewLine {
  line: Segment[]
  raw: string
}

type LineClass =
  | { type: 'blank' }
  | { type: 'heading'; level: number; content?: string }
  | { type: 'hr' }
  | { type: 'list' }
  | { type: 'kv' }
  | { type: 'body' }

// カテゴリ ID は検出側では string なので、未知のカテゴリも引けるようにする
const CATEGORY_LOOKUP: Partial<Record<string, CategoryMeta>> = CATEGORIES

function classifyLine(raw: string): LineClass {
  const trimmed = raw.trim()
  if (!trimmed) return { type: 'blank' }
  const hm = trimmed.match(/^(#{1,3})\s+(.+)$/)
  if (hm) return { type: 'heading', level: hm[1].length, content: hm[2] }
  if (/^【(.+?)】$/.test(trimmed)) return { type: 'heading', level: 2 }
  if (/^[■●◆◇▶▷☆★]+\s*(.+)$/.test(trimmed)) return { type: 'heading', level: 2 }
  if (
    /^(?:職務経歴書|履歴書|基本情報|職務要約|職務経歴|学歴|資格|スキル|自己PR|志望動機|プロフィール|連絡先)\s*$/i.test(
      trimmed,
    )
  )
    return { type: 'heading', level: 2 }
  if (/^-{3,}$/.test(trimmed)) return { type: 'hr' }
  if (/^[-*]\s+(.+)$/.test(trimmed) || /^・\s*(.+)$/.test(trimmed)) return { type: 'list' }
  if (/^(.{1,30}?)[：:]\s*(.+)$/.test(trimmed)) return { type: 'kv' }
  return { type: 'body' }
}

export function A4PreviewPanel({
  text,
  detections,
  maskOpts,
  focusDetId,
  focusPulse,
  onFocusDet,
  zoom = 1,
}: A4PreviewPanelProps) {
  const segments = useMemo(() => {
    return buildAnnotations(text, detections, {
      showRedacted: true,
      keepPrefecture: maskOpts?.keepPrefecture || false,
      nameInitial: maskOpts?.nameInitial || false,
    })
  }, [text, detections, maskOpts])

  // A4用のMarkdownパース（セクション分割）
  const lines = useMemo(() => {
    const result: PreviewLine[] = []
    // セグメントをテキスト行に再構成
    let lineBuffer: Segment[] = []
    for (const seg of segments) {
      const parts = seg.text.split('\n')
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          result.push({ line: lineBuffer, raw: lineBuffer.map((sg) => sg.text || '').join('') })
          lineBuffer = []
        }
        if (parts[i] || i < parts.length) {
          lineBuffer.push({ ...seg, text: parts[i] })
        }
      }
    }
    if (lineBuffer.length > 0) {
      result.push({ line: lineBuffer, raw: lineBuffer.map((sg) => sg.text || '').join('') })
    }
    return result
  }, [segments])

  const animName = focusPulse % 2 ? 'detFlashA' : 'detFlashB'

  function renderSegment(seg: Segment, idx: string): ReactNode {
    if (seg.type === 'text') {
      return <span key={`t${idx}`}>{seg.text}</span>
    }
    const d = seg.det
    const focused = !!(focusDetId && d?.id === focusDetId)
    const anim: CSSProperties = focused ? { animation: `${animName} 1.25s ease-in-out 1` } : {}
    const meta = CATEGORY_LOOKUP[d?.category] || { color: T.text2 }
    if (seg.masked) {
      return (
        <span
          key={`d${idx}`}
          data-det-id={d?.id}
          onClick={(e) => {
            e.stopPropagation()
            if (onFocusDet) onFocusDet(d?.id)
          }}
          style={{
            background: `${meta.color}18`,
            color: meta.color,
            padding: '1px 5px',
            borderRadius: 3,
            fontWeight: 600,
            fontSize: '0.92em',
            cursor: 'pointer',
            borderBottom: `2px solid ${meta.color}40`,
            ...anim,
          }}
        >
          {seg.text}
        </span>
      )
    }
    // enabled:false の検出は点線下線で視覚的に区別
    const disabledStyle: CSSProperties = seg.disabledDet
      ? {
          borderBottom: `1.5px dashed ${meta.color}60`,
          opacity: 0.7,
        }
      : {}
    return (
      <span
        key={`d${idx}`}
        data-det-id={d?.id}
        onClick={(e) => {
          e.stopPropagation()
          if (onFocusDet) onFocusDet(d?.id)
        }}
        style={{
          background: focused ? `${meta.color}16` : 'transparent',
          borderRadius: 3,
          cursor: 'pointer',
          ...anim,
          ...disabledStyle,
        }}
      >
        {seg.text}
      </span>
    )
  }

  return (
    <div className={s['a4-wrap']}>
      <div style={{ width: Math.round(595 * zoom), flexShrink: 0 }}>
        <div className={s['a4-shadow']} style={{ transform: `scale(${zoom})` }}>
          <div className={s['a4-page']}>
            {lines.map(({ line, raw }, li) => {
              const cls = classifyLine(raw)
              const segs = line.map((seg, si) => renderSegment(seg, `${li}_${si}`))

              if (cls.type === 'blank')
                return <br key={li} style={{ display: 'block', marginTop: 8 }} />
              if (cls.type === 'hr') return <hr key={li} className={s['a4-hr']} />
              if (cls.type === 'heading') {
                const hCls = cls.level <= 2 ? s['a4-h2'] : s['a4-h3']
                // 見出しマーカーを除去して表示
                const cleaned = raw
                  .trim()
                  .replace(/^#{1,3}\s+/, '')
                  .replace(/^[■●◆◇▶▷☆★]+\s*/, '')
                  .replace(/^【(.+?)】$/, '$1')
                // セグメント内の検出値はそのまま表示
                const hasDetection = line.some((sg) => sg.type === 'det')
                if (hasDetection) {
                  return (
                    <div key={li} className={hCls}>
                      {segs}
                    </div>
                  )
                }
                return (
                  <div key={li} className={hCls}>
                    {cleaned}
                  </div>
                )
              }
              if (cls.type === 'list') {
                return (
                  <div key={li} className={s['a4-li']}>
                    ・{segs}
                  </div>
                )
              }
              if (cls.type === 'kv') {
                const kvMatch = raw.trim().match(/^(.{1,30}?)[：:]\s*(.+)$/)
                if (kvMatch) {
                  // キー部分と値部分を分割してセグメント表示
                  const keyLen = kvMatch[1].length
                  const sepIdx = raw.indexOf(kvMatch[1]) + keyLen
                  const keySegs: ReactNode[] = []
                  const valSegs: ReactNode[] = []
                  let charCount = 0
                  for (let si = 0; si < line.length; si++) {
                    const seg = line[si]
                    const segLen = seg.text.length
                    if (charCount + segLen <= sepIdx) {
                      keySegs.push(renderSegment(seg, `${li}_k${si}`))
                    } else if (charCount >= sepIdx) {
                      valSegs.push(renderSegment(seg, `${li}_v${si}`))
                    } else {
                      // セグメントがキーと値にまたがる場合 — detection metadataを保持
                      const splitAt = sepIdx - charCount
                      keySegs.push(
                        renderSegment(
                          { ...seg, text: seg.text.slice(0, splitAt) },
                          `${li}_ks${si}`,
                        ),
                      )
                      valSegs.push(
                        renderSegment({ ...seg, text: seg.text.slice(splitAt) }, `${li}_vs${si}`),
                      )
                    }
                    charCount += segLen
                  }
                  return (
                    <div key={li} className={s['a4-kv']}>
                      <div className={s['a4-kv-key']}>{keySegs}</div>
                      <div className={s['a4-kv-val']}>{valSegs}</div>
                    </div>
                  )
                }
              }
              return (
                <div key={li} style={{ lineHeight: 1.75 }}>
                  {segs}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
