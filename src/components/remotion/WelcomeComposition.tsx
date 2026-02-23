'use client'

import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion'

const ACCENT = '#8b5cf6'
const ACCENT_LIGHT = '#a78bfa'
const BLUE = '#3b82f6'
const GREEN = '#10b981'
const AMBER = '#f59e0b'

/* ---------- 共通コンポーネント ---------- */

const FadeSlide: React.FC<{
    children: React.ReactNode
    delay?: number
}> = ({ children, delay = 0 }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const progress = spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 100 } })

    return (
        <div style={{
            opacity: interpolate(progress, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(progress, [0, 1], [20, 0])}px)`,
        }}>
            {children}
        </div>
    )
}

const SlideBase: React.FC<{
    children: React.ReactNode
    gradient?: string
}> = ({ children, gradient }) => {
    const frame = useCurrentFrame()
    const { durationInFrames } = useVideoConfig()
    const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' })
    const fadeOut = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

    return (
        <AbsoluteFill style={{
            background: gradient || 'linear-gradient(145deg, #0f172a 0%, #1a1033 50%, #0f172a 100%)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", sans-serif',
            padding: '48px 56px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            opacity: fadeIn * fadeOut,
        }}>
            {children}
        </AbsoluteFill>
    )
}

const Subtitle: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => (
    <FadeSlide delay={delay}>
        <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT_LIGHT, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12 }}>
            {children}
        </div>
    </FadeSlide>
)

const Title: React.FC<{ children: React.ReactNode; delay?: number; size?: number }> = ({ children, delay = 5, size = 38 }) => (
    <FadeSlide delay={delay}>
        <h1 style={{ fontSize: size, fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.3 }}>
            {children}
        </h1>
    </FadeSlide>
)

const Body: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 15 }) => (
    <FadeSlide delay={delay}>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.65)', margin: '16px 0 0', lineHeight: 1.8, maxWidth: 520 }}>
            {children}
        </p>
    </FadeSlide>
)

/* ---------- Slide 1: 課題提起 ---------- */

const ProblemPill: React.FC<{ text: string; index: number }> = ({ text, index }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const progress = spring({ frame: frame - 35 - index * 6, fps, config: { damping: 20 } })

    return (
        <div style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)',
            fontSize: 13,
            color: '#fca5a5',
            fontWeight: 500,
            opacity: interpolate(progress, [0, 1], [0, 1]),
        }}>
            {text}
        </div>
    )
}

const Slide1Problem: React.FC = () => (
    <SlideBase>
        <Subtitle>The Problem</Subtitle>
        <Title delay={8} size={36}>
            履歴書の個人情報、<br />
            まだ手作業で消していませんか？
        </Title>
        <Body delay={20}>
            人材紹介・採用の現場では、候補者の個人情報を消してから共有する必要があります。
            手作業でのマスキングは見落としが起きやすく、時間もかかります。
        </Body>
        <FadeSlide delay={35}>
            <div style={{ display: 'flex', gap: 16, marginTop: 28 }}>
                {['見落としリスク', '作業時間', '形式のバラつき'].map((t, i) => (
                    <ProblemPill key={t} text={t} index={i} />
                ))}
            </div>
        </FadeSlide>
    </SlideBase>
)

/* ---------- Slide 2: 日本語特有の難しさ ---------- */

const ExampleRow: React.FC<{ label: string; examples: string[]; delay: number; color: string }> = ({ label, examples, delay, color }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const progress = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } })

    return (
        <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            opacity: interpolate(progress, [0, 1], [0, 1]),
            transform: `translateX(${interpolate(progress, [0, 1], [-20, 0])}px)`,
        }}>
            <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 90, textAlign: 'right' }}>{label}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
                {examples.join('　')}
            </span>
        </div>
    )
}

const Slide2Japanese: React.FC = () => (
    <SlideBase gradient="linear-gradient(150deg, #0f172a 0%, #172033 50%, #0f172a 100%)">
        <Subtitle>Japanese Complexity</Subtitle>
        <Title delay={8} size={34}>
            日本語文書ならではの難しさ
        </Title>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
            <ExampleRow label="名前の揺れ" examples={['山田太郎', 'ヤマダタロウ', 'やまだたろう']} delay={18} color={BLUE} />
            <ExampleRow label="住所形式" examples={['東京都渋谷区神南1-2-3']} delay={26} color={GREEN} />
            <ExampleRow label="和暦/西暦" examples={['令和6年', '2024年', 'R6']} delay={34} color={AMBER} />
            <ExampleRow label="全角/半角" examples={['090-1234-5678', '０９０−１２３４−５６７８']} delay={42} color={ACCENT} />
        </div>
        <Body delay={52}>
            英語向けツールでは対応できない。日本語に特化した検出が必要です。
        </Body>
    </SlideBase>
)

/* ---------- Slide 3: 4層検出 ---------- */

const LayerCard: React.FC<{
    num: number; label: string; desc: string; delay: number; color: string
}> = ({ num, label, desc, delay, color }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const progress = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } })

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 18px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 10,
            borderLeft: `3px solid ${color}`,
            opacity: interpolate(progress, [0, 1], [0, 1]),
            transform: `translateX(${interpolate(progress, [0, 1], [-30, 0])}px)`,
        }}>
            <span style={{
                width: 28, height: 28, borderRadius: 6,
                background: `${color}20`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, flexShrink: 0,
            }}>{num}</span>
            <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{desc}</div>
            </div>
        </div>
    )
}

const Slide3Detection: React.FC = () => (
    <SlideBase gradient="linear-gradient(140deg, #0f172a 0%, #1a1033 40%, #151030 100%)">
        <Subtitle>4-Layer Detection</Subtitle>
        <Title delay={8} size={34}>
            4層ハイブリッド検出
        </Title>
        <Body delay={16}>
            単一の手法では精度が不十分。4つの層が互いの弱点を補完します。
        </Body>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
            <LayerCard num={1} label="正規表現" desc="メール・電話・住所・生年月日などのパターンマッチ" delay={28} color={BLUE} />
            <LayerCard num={2} label="日本人名辞書" desc="姓名辞書照合 + ラベル近傍推定" delay={36} color={GREEN} />
            <LayerCard num={3} label="ヒューリスティクス" desc="文脈ベースの推定検出" delay={44} color={AMBER} />
            <LayerCard num={4} label="AI補完" desc="Claude / GPT / Gemini による追加検出" delay={52} color={ACCENT} />
        </div>
    </SlideBase>
)

/* ---------- Slide 4: ブラウザ完結 ---------- */

const Slide4Privacy: React.FC = () => (
    <SlideBase gradient="linear-gradient(155deg, #0f172a 0%, #0f2018 50%, #0f172a 100%)">
        <Subtitle>Browser-First Privacy</Subtitle>
        <Title delay={8} size={34}>
            データはブラウザの外に出ません
        </Title>
        <Body delay={18}>
            正規表現・辞書・ヒューリスティクス検出はすべてブラウザ内で完結。
            AI検出はオプション機能で、コア検出は外部通信なしで動作します。
        </Body>
        <FadeSlide delay={32}>
            <div style={{
                marginTop: 28,
                padding: '20px 24px',
                borderRadius: 12,
                border: `1px solid ${GREEN}30`,
                background: `${GREEN}08`,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
            }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${GREEN}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                </div>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>個人情報が外部に送信されない設計</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                        機密性の高い書類も安心して処理できます
                    </div>
                </div>
            </div>
        </FadeSlide>
    </SlideBase>
)

/* ---------- Slide 5: 操作フロー ---------- */

const FlowStep: React.FC<{
    num: number; label: string; sub: string; delay: number
}> = ({ num, label, sub, delay }) => {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const progress = spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 100 } })

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            opacity: interpolate(progress, [0, 1], [0, 1]),
            transform: `scale(${interpolate(progress, [0, 1], [0.9, 1])})`,
        }}>
            <span style={{
                width: 32, height: 32, borderRadius: 8,
                background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_LIGHT})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>{num}</span>
            <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{sub}</div>
            </div>
        </div>
    )
}

const Slide5Flow: React.FC = () => (
    <SlideBase>
        <Subtitle>Simple Workflow</Subtitle>
        <Title delay={8} size={34}>
            操作はたったの4ステップ
        </Title>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 28 }}>
            <FlowStep num={1} label="ファイルをアップロード" sub="PDF, Word, Excel, CSV など多数の形式に対応" delay={18} />
            <FlowStep num={2} label="自動検出" sub="4層パイプラインが個人情報を一括検出" delay={28} />
            <FlowStep num={3} label="確認・調整" sub="検出結果を個別にON/OFF。Diff表示で前後比較" delay={38} />
            <FlowStep num={4} label="エクスポート" sub="テキスト、PDF、Word、Excelなど6形式で出力" delay={48} />
        </div>
        <FadeSlide delay={60}>
            <div style={{
                marginTop: 28,
                padding: '12px 24px',
                background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_LIGHT})`,
                borderRadius: 10,
                display: 'inline-block',
                fontSize: 15,
                fontWeight: 600,
                color: '#fff',
            }}>
                さっそく始めましょう →
            </div>
        </FadeSlide>
    </SlideBase>
)

/* ---------- メインコンポジション ---------- */

const SLIDE_DURATION = 150 // 5秒 x 30fps
const TOTAL_SLIDES = 5

export const COMPOSITION_DURATION = SLIDE_DURATION * TOTAL_SLIDES // 750フレーム = 25秒

export const WelcomeComposition: React.FC = () => {
    return (
        <AbsoluteFill>
            <Sequence from={0} durationInFrames={SLIDE_DURATION}>
                <Slide1Problem />
            </Sequence>
            <Sequence from={SLIDE_DURATION} durationInFrames={SLIDE_DURATION}>
                <Slide2Japanese />
            </Sequence>
            <Sequence from={SLIDE_DURATION * 2} durationInFrames={SLIDE_DURATION}>
                <Slide3Detection />
            </Sequence>
            <Sequence from={SLIDE_DURATION * 3} durationInFrames={SLIDE_DURATION}>
                <Slide4Privacy />
            </Sequence>
            <Sequence from={SLIDE_DURATION * 4} durationInFrames={SLIDE_DURATION}>
                <Slide5Flow />
            </Sequence>
        </AbsoluteFill>
    )
}
