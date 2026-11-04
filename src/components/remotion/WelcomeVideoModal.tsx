'use client'

import { Player, type PlayerRef } from '@remotion/player'
import { useRef, useState, useCallback, useEffect } from 'react'
import { WelcomeComposition, COMPOSITION_DURATION } from './WelcomeComposition'

const SLIDE_COUNT = 5
const SLIDE_DURATION = COMPOSITION_DURATION / SLIDE_COUNT

interface WelcomeVideoModalProps {
  onClose: () => void
  onStartTour?: () => void
}

export const WelcomeVideoModal: React.FC<WelcomeVideoModalProps> = ({ onClose, onStartTour }) => {
  const playerRef = useRef<PlayerRef>(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  // 自動再生は消音で始める（ブラウザの自動再生制限と、突然音が鳴るのを避けるため）
  const [isMuted, setIsMuted] = useState(true)

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const handler = () => {
      const frame = player.getCurrentFrame()
      setCurrentSlide(Math.min(Math.floor(frame / SLIDE_DURATION), SLIDE_COUNT - 1))
    }
    // requestVideoFrameCallback は使えないのでインターバルで
    const id = setInterval(handler, 200)
    return () => clearInterval(id)
  }, [])

  const goToSlide = useCallback((idx: number) => {
    const player = playerRef.current
    if (!player) return
    player.seekTo(idx * SLIDE_DURATION)
    player.play()
    setIsPlaying(true)
  }, [])

  const togglePlay = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    if (isPlaying) {
      player.pause()
    } else {
      player.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const toggleMute = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    if (player.isMuted()) {
      player.unmute()
      if (!player.isPlaying()) {
        player.play()
        setIsPlaying(true)
      }
      setIsMuted(false)
    } else {
      player.mute()
      setIsMuted(true)
    }
  }, [])

  const muteLabel = isMuted ? 'BGMを出す' : 'BGMを消す'

  const handleComplete = () => {
    onClose()
    onStartTour?.()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0f172a',
          borderRadius: 16,
          overflow: 'hidden',
          maxWidth: 800,
          width: '92vw',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Player */}
        <div style={{ position: 'relative', cursor: 'pointer' }} onClick={togglePlay}>
          <Player
            ref={playerRef}
            component={WelcomeComposition}
            durationInFrames={COMPOSITION_DURATION}
            compositionWidth={800}
            compositionHeight={500}
            fps={30}
            autoPlay
            initiallyMuted
            style={{ width: '100%', aspectRatio: '800/500' }}
            controls={false}
          />
          {/* 消音で自動再生するので、音を出す操作は映像の上の定位置に置く */}
          <button
            type="button"
            // 動画クリック（再生/一時停止）に伝わらないようにする
            onClick={(e) => {
              e.stopPropagation()
              toggleMute()
            }}
            aria-label={muteLabel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 1,
              minHeight: 44,
              whiteSpace: 'nowrap',
              background: 'rgba(15,23,42,0.78)',
              border: '1px solid rgba(255,255,255,0.24)',
              color: 'rgba(255,255,255,0.85)',
              padding: '0 14px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentcolor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              {isMuted ? (
                <path d="m23 9-6 6M17 9l6 6" />
              ) : (
                <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
              )}
            </svg>
            {muteLabel}
          </button>
          {/* 再生/一時停止オーバーレイ */}
          {!isPlaying && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.3)',
              }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.8)">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          )}
        </div>

        {/* プログレスドット */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            padding: '12px 0 4px',
          }}
        >
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              style={{
                width: currentSlide === i ? 24 : 8,
                height: 8,
                borderRadius: 4,
                border: 'none',
                background: currentSlide === i ? '#8b5cf6' : 'rgba(255,255,255,0.2)',
                cursor: 'pointer',
                transition: 'all 0.3s',
                padding: 0,
              }}
            />
          ))}
        </div>

        {/* フッター */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 24px 16px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.6)',
              padding: '8px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            スキップ
          </button>
          <button
            onClick={handleComplete}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
              border: 'none',
              color: '#fff',
              padding: '8px 20px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {currentSlide === SLIDE_COUNT - 1 ? 'はじめる →' : 'ガイドツアーを開始 →'}
          </button>
        </div>
      </div>
    </div>
  )
}
