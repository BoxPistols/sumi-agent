'use client'

/**
 * バッチ処理中・エラー時に、エディタの代わりに表示する画面
 *
 * 処理中はスピナーと進捗バー（n%）、エラー時はメッセージと（渡されれば）再試行ボタンを出す。
 */
import type { BatchFileEntry } from '@/lib/app-types'
import { Btn } from '@/components/redact/ui'
import { T } from '@/lib/theme'

export interface BatchProcessingViewProps {
  file: Pick<BatchFileEntry, 'fileName' | 'stage' | 'progress'>
}

export function BatchProcessingView({ file }: BatchProcessingViewProps) {
  return (
    <div
      aria-live="polite"
      aria-label={`${file.fileName}を処理中: ${file.stage || '処理待機中'} ${file.progress || 0}%`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 'calc(100vh - 130px)',
        gap: 16,
        fontFamily: T.font,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          border: `3px solid ${T.border}`,
          borderTopColor: T.accent,
          borderRadius: '50%',
          animation: 'rp-spin 1s linear infinite',
        }}
        role="status"
        aria-label="処理中"
      />
      <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{file.fileName}</div>
      <div style={{ fontSize: 13, color: T.text3 }}>{file.stage || '処理待機中...'}</div>
      <div
        style={{
          width: 240,
          height: 6,
          borderRadius: 3,
          background: T.surfaceAlt,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: 3,
            background: T.accent,
            width: `${file.progress || 0}%`,
            transition: 'width .3s',
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: T.text3 }}>{file.progress || 0}%</div>
    </div>
  )
}

export interface BatchErrorViewProps {
  file: Pick<BatchFileEntry, 'fileName' | 'error'>
  onRetry?: () => void
}

export function BatchErrorView({ file, onRetry }: BatchErrorViewProps) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 'calc(100vh - 130px)',
        gap: 12,
        fontFamily: T.font,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: T.redDim,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          color: T.red,
        }}
        aria-hidden="true"
      >
        !
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{file.fileName}</div>
      <div style={{ fontSize: 13, color: T.red }}>
        {file.error || '処理中にエラーが発生しました'}
      </div>
      {onRetry && (
        <Btn onClick={onRetry} style={{ padding: '6px 16px', fontSize: 12, borderRadius: 8 }}>
          再試行
        </Btn>
      )}
    </div>
  )
}
