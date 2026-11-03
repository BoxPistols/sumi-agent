'use client'

/**
 * 複数ファイル取り込み（Pro のバッチ処理）のタブバー
 *
 * ファイルごとの状態（待機中・処理中・完了・エラー・キャンセル）を色の点と aria-label で示し、
 * ファイル追加と ZIP 一括出力の操作を右端に置く。
 */
import type { BatchFileEntry } from '@/lib/app-types'
import { Btn } from '@/components/redact/ui'
import { T } from '@/lib/theme'

/** タブの描画に使う項目だけを受け取る（BatchFileEntry 全体を渡してよい） */
export type FileTabEntry = Pick<BatchFileEntry, 'id' | 'fileName' | 'status' | 'stage' | 'progress'>

export interface FileTabBarProps {
  files: FileTabEntry[]
  activeIdx: number
  onSelect: (index: number) => void
  /** 呼び出し側は渡しているが、タブバーには閉じるボタンがなく現在は使われていない */
  onRemove?: (index: number) => void
  onBatchExport: () => void
  onAddFiles: () => void
}

function statusLabel(f: FileTabEntry): string {
  return f.status === 'done'
    ? '完了'
    : f.status === 'processing'
      ? f.stage || '処理中'
      : f.status === 'error'
        ? 'エラー'
        : f.status === 'cancelled'
          ? 'キャンセル'
          : '待機中'
}

export function FileTabBar({
  files,
  activeIdx,
  onSelect,
  onBatchExport,
  onAddFiles,
}: FileTabBarProps) {
  const doneCount = files.filter((f) => f.status === 'done').length
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        borderBottom: `1px solid ${T.border}`,
        background: T.bg2,
        height: 38,
        paddingLeft: 8,
        paddingRight: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 2,
          flex: 1,
          overflow: 'auto',
          alignItems: 'center',
          paddingRight: 8,
        }}
      >
        {files.map((f, i) => {
          const active = i === activeIdx
          const statusDot =
            f.status === 'done'
              ? T.green
              : f.status === 'error'
                ? T.red
                : f.status === 'processing'
                  ? T.amber
                  : T.text3
          return (
            <button
              key={f.id}
              onClick={() => onSelect(i)}
              aria-label={`${f.fileName} (${statusLabel(f)})`}
              title={`${f.fileName} (${statusLabel(f)})`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: '6px 6px 0 0',
                fontSize: 12,
                fontFamily: T.font,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                maxWidth: 180,
                background: active ? T.bg : 'transparent',
                borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent',
                color: active ? T.text : T.text3,
                fontWeight: active ? 600 : 400,
                textDecoration: f.status === 'cancelled' ? 'line-through' : 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: statusDot,
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.fileName}</span>
              {f.status === 'processing' && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    height: 2,
                    background: T.accent,
                    width: `${f.progress || 0}%`,
                    transition: 'width .3s',
                    borderRadius: 1,
                  }}
                />
              )}
            </button>
          )
        })}
        <button
          onClick={onAddFiles}
          title="ファイルを追加"
          aria-label="ファイルを追加"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: `1px dashed ${T.border}`,
            background: 'transparent',
            cursor: 'pointer',
            color: T.text3,
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontFamily: T.font,
          }}
        >
          +
        </button>
      </div>
      {files.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            flexShrink: 0,
            paddingLeft: 8,
            borderLeft: `1px solid ${T.border}`,
          }}
        >
          <span style={{ fontSize: 11, color: T.text3 }}>
            {doneCount}/{files.length}
          </span>
          <Btn
            onClick={onBatchExport}
            disabled={doneCount === 0}
            title="全ファイルのマスキング結果をZIPで一括ダウンロード"
            style={{
              padding: '4px 10px',
              fontSize: 11,
              borderRadius: 6,
              opacity: doneCount === 0 ? 0.4 : 1,
            }}
          >
            ZIP出力
          </Btn>
        </div>
      )}
    </div>
  )
}
