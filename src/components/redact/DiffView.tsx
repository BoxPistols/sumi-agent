'use client'
/**
 * 2 つのテキストを行単位で左右に並べて比較する差分ビュー。
 * 右側（変更後）のマスキングタグは強調表示し、変更箇所のかたまり（チャンク）間を前後に移動できる。
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import s from '@/app/redact-pro.module.css'
import { Badge } from '@/components/redact/ui'
import { PH_RE } from '@/lib/redact-engine'
import { T } from '@/lib/theme'
import { computeLineDiff, countChangedLines, findChangeChunks } from '@/lib/text-diff'

export interface DiffViewProps {
  original: string
  modified: string
  /** ヘッダーの「差分: ○○」。未指定なら「変更箇所」 */
  label?: string
  /** 右列の見出し。未指定なら「マスキング済み」 */
  modifiedLabel?: string
}

export function DiffView({ original, modified, label, modifiedLabel }: DiffViewProps) {
  const diffs = computeLineDiff(original, modified)
  const changeCount = countChangedLines(diffs)

  // チャンク計算: 連続する changed 行をグループ化し、各グループの先頭indexを保持
  const chunks = useMemo(
    () => findChangeChunks(diffs),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- diffs は毎レンダー作り直されるので、入力の original/modified で再計算を判定する
    [diffs.length, original, modified],
  )

  const [currentChunk, setCurrentChunk] = useState(-1)
  const scrollRef = useRef<HTMLDivElement>(null)

  const jumpTo = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= chunks.length) return
      setCurrentChunk(idx)
      const el = scrollRef.current?.querySelector(`[data-chunk-start="${idx}"]`)
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    },
    [chunks],
  )

  return (
    <div className={s['diff-wrap']}>
      <div className={s['diff-header']}>
        <span className={s['diff-header-label']}>差分: {label || '変更箇所'}</span>
        {chunks.length > 0 && (
          <div className={s['diff-nav']}>
            <button
              className={s['diff-nav-btn']}
              disabled={currentChunk <= 0}
              onClick={() => jumpTo(currentChunk <= 0 ? 0 : currentChunk - 1)}
              aria-label="前の変更へ"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 12L8 4M8 4L4 8M8 4L12 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className={s['diff-nav-btn']}
              disabled={currentChunk >= chunks.length - 1}
              onClick={() => jumpTo(currentChunk < 0 ? 0 : currentChunk + 1)}
              aria-label="次の変更へ"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 4L8 12M8 12L12 8M8 12L4 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <span className={s['diff-nav-pos']}>
              {currentChunk < 0 ? '–' : currentChunk + 1} / {chunks.length}
            </span>
          </div>
        )}
        <Badge color={T.amber} bg={T.amberDim}>
          {changeCount} 行変更
        </Badge>
      </div>
      <div className={s['diff-scroll']} ref={scrollRef}>
        <div className={s['diff-grid']}>
          <div className={s['diff-col-left']}>
            <div className={s['diff-col-label']}>元テキスト</div>
            {diffs.map((d, i) => (
              <div
                key={i}
                className={s['diff-line']}
                data-changed={d.type === 'changed'}
                data-side="del"
                {...(chunks.indexOf(i) >= 0 ? { 'data-chunk-start': chunks.indexOf(i) } : {})}
              >
                <span className={s['diff-line-num']}>{i + 1}</span>
                <span className={s['diff-line-text']}>{d.orig || '\u00A0'}</span>
              </div>
            ))}
          </div>
          <div className={s['diff-col-right']}>
            <div className={s['diff-col-label']}>{modifiedLabel || 'マスキング済み'}</div>
            {diffs.map((d, i) => {
              const re = new RegExp(PH_RE.source, 'g')
              const parts: ReactNode[] = []
              let last = 0
              let m: RegExpExecArray | null
              const line = d.mod
              while ((m = re.exec(line)) !== null) {
                if (m.index > last)
                  parts.push(<span key={`t${last}`}>{line.slice(last, m.index)}</span>)
                parts.push(
                  <span key={`r${m.index}`} className={s['diff-redact-tag']}>
                    {m[0]}
                  </span>,
                )
                last = m.index + m[0].length
              }
              if (last < line.length) parts.push(<span key={`e${last}`}>{line.slice(last)}</span>)
              return (
                <div
                  key={i}
                  className={s['diff-line']}
                  data-changed={d.type === 'changed'}
                  data-side="add"
                >
                  <span className={s['diff-line-num']}>{i + 1}</span>
                  <span className={s['diff-line-text']}>
                    {parts.length ? parts : line || '\u00A0'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
