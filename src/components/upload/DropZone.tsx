'use client'

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import styles from './DropZone.module.css'

/** 取り込みに対応するファイル拡張子（input の accept と同じ） */
export const ACCEPTED_EXTENSIONS =
  '.pdf,.docx,.doc,.xlsx,.xls,.ods,.csv,.txt,.tsv,.md,.markdown,.html,.htm,.rtf,.json,.odt'

/** 画面に表示する対応形式の一覧 */
export const ACCEPTED_FORMAT_LABELS = [
  'PDF',
  'Word',
  'Excel',
  'ODS',
  'CSV',
  'Markdown',
  'HTML',
  'RTF',
  'JSON',
  'ODT',
  'TXT',
] as const

/**
 * input / drop で受け取ったファイル群から、呼び出し側に渡す配列を作る。
 * multiple=false のときは先頭の1件だけを返す。空なら空配列。
 */
export function selectFiles(list: ArrayLike<File> | null | undefined, multiple: boolean): File[] {
  if (!list || list.length === 0) return []
  const files = Array.from(list)
  return multiple ? files : files.slice(0, 1)
}

export interface DropZoneProps {
  /** ファイルが選ばれたとき。multiple=false のときは常に1件 */
  onFiles: (files: File[]) => void
  /** 複数ファイルを受け付けるか（Pro のバッチ処理） */
  multiple?: boolean
  /** 単一カラム（Lite）では余白を大きくする */
  size?: 'md' | 'lg'
  /** タブ付きボックスの中に置くときは外枠を描かない */
  embedded?: boolean
  /**
   * 送信先についての注記。既定は Lite の「ブラウザ内で処理・サーバー保存なし」。
   * Pro のように AI やサーバー抽出へ送る場合は、その例外を正確に書いた文を渡す
   */
  privacyNote?: string
  disabled?: boolean
}

export const DEFAULT_PRIVACY_NOTE = 'ファイルはブラウザ内で処理され、サーバーには保存されません。'

/**
 * ファイル取り込みゾーン。
 * 「ファイルを選択」ボタンを主アクションとして見せ、
 * ドラッグ＆ドロップは補助手段として案内する（初見でも操作が迷わない）。
 */
export function DropZone({
  onFiles,
  multiple = false,
  size = 'md',
  embedded = false,
  privacyNote = DEFAULT_PRIVACY_NOTE,
  disabled = false,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const openPicker = () => {
    if (!disabled) inputRef.current?.click()
  }

  const emit = (list: ArrayLike<File> | null | undefined) => {
    const files = selectFiles(list, multiple)
    if (files.length > 0) onFiles(files)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (!disabled) emit(e.dataTransfer?.files)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    emit(e.target.files)
    // 同じファイルをもう一度選べるようにリセット
    e.target.value = ''
  }

  return (
    <div
      data-intro="upload-zone"
      className={styles.zone}
      data-drag={dragOver}
      data-size={size}
      data-embedded={embedded}
      data-disabled={disabled}
      onClick={openPicker}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        aria-label="ファイルを選択"
        multiple={multiple}
        accept={ACCEPTED_EXTENSIONS}
        className={styles.input}
        onChange={handleChange}
        disabled={disabled}
      />
      <svg
        className={styles.icon}
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <button
        type="button"
        className={styles.primary}
        aria-label="ファイルを選択"
        disabled={disabled}
        onClick={(e) => {
          // ゾーン全体の onClick と二重にダイアログを開かない
          e.stopPropagation()
          openPicker()
        }}
      >
        ファイルを選択
      </button>
      <p className={styles.title}>または、ここにファイルをドラッグ＆ドロップ</p>
      <p className={styles.desc}>
        {multiple ? '複数ファイルをまとめて選ぶと一括で処理します。' : ''}
        {privacyNote}
      </p>
      <p className={styles.formats}>対応形式: {ACCEPTED_FORMAT_LABELS.join(' / ')}</p>
    </div>
  )
}
