/**
 * A11y コントラスト比テスト（WCAG A レベル）
 *
 * コンセプト重視の設計方針に基づき、最低限の可読性を担保する。
 * - 本文テキスト: 3:1 以上
 * - ボタン内テキスト: 3:1 以上
 * - 装飾的要素（ボーダー、ミュートテキスト）: テスト対象外
 */
import { describe, it, expect } from 'vitest'

/** hex → [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

/** sRGB → 相対輝度 (WCAG 2.1) */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** コントラスト比 (1:1 ～ 21:1) */
function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// --- テーマ定義 ---

const DARK = {
  accent: '#E7E5E4',
  bg: '#1C1917',
  bg2: '#292524',
  surface: '#292524',
  surfaceAlt: '#44403C',
  text: '#E7E5E4',
  text2: '#A8A29E',
}

const LIGHT = {
  accent: '#1C1917',
  bg: '#FAF9F6',
  bg2: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#1C1917',
  text2: '#57534E',
}

// 最低基準: 可読性のある文字は 3:1 以上
const MIN = 3.0

function assertContrast(fg: string, bg: string, minRatio: number, label: string) {
  const ratio = contrastRatio(fg, bg)
  expect(
    ratio,
    `${label}: ${fg} on ${bg} → ${ratio.toFixed(2)}:1 (要 ${minRatio}:1)`,
  ).toBeGreaterThanOrEqual(minRatio)
}

describe('A11y コントラスト比（WCAG A レベル）', () => {
  describe('ダークテーマ — テキスト可読性', () => {
    it('本文テキスト on bg', () => {
      assertContrast(DARK.text, DARK.bg, MIN, 'text/bg')
    })

    it('本文テキスト on surface', () => {
      assertContrast(DARK.text, DARK.surface, MIN, 'text/surface')
    })

    it('セカンダリテキスト on bg', () => {
      assertContrast(DARK.text2, DARK.bg, MIN, 'text2/bg')
    })

    it('アクセント on bg', () => {
      assertContrast(DARK.accent, DARK.bg, MIN, 'accent/bg')
    })

    it('Btn primary: テキストが背景に対して読める', () => {
      // Btn primary: color=T.bg on background=T.accent
      assertContrast(DARK.bg, DARK.accent, MIN, 'Btn primary')
    })
  })

  describe('ライトテーマ — テキスト可読性', () => {
    it('本文テキスト on bg', () => {
      assertContrast(LIGHT.text, LIGHT.bg, MIN, 'text/bg')
    })

    it('本文テキスト on surface', () => {
      assertContrast(LIGHT.text, LIGHT.surface, MIN, 'text/surface')
    })

    it('セカンダリテキスト on bg', () => {
      assertContrast(LIGHT.text2, LIGHT.bg, MIN, 'text2/bg')
    })

    it('アクセント on bg', () => {
      assertContrast(LIGHT.accent, LIGHT.bg, MIN, 'accent/bg')
    })

    it('Btn primary: テキストが背景に対して読める', () => {
      assertContrast(LIGHT.bg, LIGHT.accent, MIN, 'Btn primary')
    })
  })

  describe('ハードコード色 — 致命的な問題の防止', () => {
    it('白文字 on #222 ボタン', () => {
      assertContrast('#FFFFFF', '#222222', MIN, 'white/#222')
    })

    it('白文字 on #333 ボタン', () => {
      assertContrast('#FFFFFF', '#333333', MIN, 'white/#333')
    })

    it('白文字 on ダークアクセント(#E7E5E4) は不可', () => {
      // これが元々壊れていた: white on #E7E5E4 → ほぼ見えない
      const ratio = contrastRatio('#FFFFFF', '#E7E5E4')
      expect(ratio, '白 on ダークアクセント → 見えない').toBeLessThan(2)
    })
  })

  describe('ガイドツアー（intro.js）ボタン', () => {
    // 塗りボタンは文字色との比を 4.5:1 以上に保つ（docs/DESIGN.md §2.3）
    const AA = 4.5

    it('ダークテーマ: 次へ/完了ボタンはグラデーション両端で白文字が AA を満たす', () => {
      assertContrast('#FFFFFF', '#7c3aed', AA, 'tour next (dark, from)')
      assertContrast('#FFFFFF', '#6d28d9', AA, 'tour next (dark, to)')
    })

    it('ライトテーマ: 次へ/完了ボタンはグラデーション両端で白文字が読める', () => {
      assertContrast('#FFFFFF', '#7c3aed', AA, 'tour next (light, from)')
      assertContrast('#FFFFFF', '#6d28d9', AA, 'tour next (light, to)')
    })

    it('紫の塗り背景に暗い文字を置くと読めない（退行防止）', () => {
      // 実際に起きた不具合: [data-theme=light] .introjs-button が
      // .introjs-nextbutton の白文字を上書きし 1.79:1 になった
      expect(contrastRatio('#475569', '#7c3aed')).toBeLessThan(3)
    })

    it('明るすぎる紫は塗り背景に使えない', () => {
      expect(contrastRatio('#FFFFFF', '#a78bfa')).toBeLessThan(3)
      expect(contrastRatio('#FFFFFF', '#9B6DFF')).toBeLessThan(AA)
      // #8b5cf6 は 4.23:1 で本文サイズのボタン文字には不足
      expect(contrastRatio('#FFFFFF', '#8b5cf6')).toBeLessThan(AA)
    })

    it('ステップカウンターのテキストが背景に対して読める', () => {
      assertContrast('#57534E', '#FFFFFF', MIN, 'step counter (light)')
      assertContrast('#A6A6A6', '#1e293b', MIN, 'step counter (dark)')
    })
  })

  describe('コントラスト計算の正確性', () => {
    it('黒と白: 21:1', () => {
      expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    })

    it('同色: 1:1', () => {
      expect(contrastRatio('#808080', '#808080')).toBeCloseTo(1, 1)
    })
  })
})

/** 半透明の前景色を背景に合成した結果の hex を返す（Dim 系トークンの実効色） */
function blend(fgHex: string, alpha: number, bgHex: string): string {
  const fg = hexToRgb(fgHex)
  const bg = hexToRgb(bgHex)
  const mix = fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)))
  return '#' + mix.map((c) => c.toString(16).padStart(2, '0')).join('')
}

describe('初見ユーザー向けUI（取り込む / 確認する画面）', () => {
  const AMBER = '#D97706'
  // --rp-warn（要確認・注意の文字色）。ライトは #D97706 だと 2.9:1 で不合格のため濃い amber
  const WARN_LIGHT = '#92400E'
  const WARN_DARK = '#F59E0B'
  const TEXT3_LIGHT = '#78716C'
  const TEXT3_DARK = '#78716C'

  describe('取り込みゾーンの主ボタン（accent 塗り + bg 文字）', () => {
    it('ライト: 和紙色の文字が墨色の塗りに対して AA を満たす', () => {
      expect(contrastRatio(LIGHT.bg, LIGHT.accent)).toBeGreaterThanOrEqual(4.5)
    })
    it('ダーク: 墨色の文字が和紙色の塗りに対して AA を満たす', () => {
      expect(contrastRatio(DARK.bg, DARK.accent)).toBeGreaterThanOrEqual(4.5)
    })
  })

  describe('確認画面の初回案内（accentDim を bg2 に重ねた面 + text2 文字）', () => {
    it('ライト', () => {
      const surface = blend(LIGHT.accent, 0.06, LIGHT.bg2)
      expect(contrastRatio(LIGHT.text2, surface)).toBeGreaterThanOrEqual(4.5)
    })
    it('ダーク', () => {
      const surface = blend(DARK.accent, 0.1, DARK.bg2)
      expect(contrastRatio(DARK.text2, surface)).toBeGreaterThanOrEqual(4.5)
    })
    it('閉じるボタン（text2）は両テーマで読める', () => {
      expect(
        contrastRatio(LIGHT.text2, blend(LIGHT.accent, 0.06, LIGHT.bg2)),
      ).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(DARK.text2, blend(DARK.accent, 0.1, DARK.bg2))).toBeGreaterThanOrEqual(
        4.5,
      )
    })
  })

  describe('「要確認」バッジ（--rp-warn 文字 + amberDim 背景）', () => {
    it('ライト: 本文基準 4.5:1 以上', () => {
      expect(contrastRatio(WARN_LIGHT, blend(AMBER, 0.1, LIGHT.bg2))).toBeGreaterThanOrEqual(4.5)
    })
    it('ダーク: 本文基準 4.5:1 以上', () => {
      expect(contrastRatio(WARN_DARK, blend(AMBER, 0.1, DARK.bg2))).toBeGreaterThanOrEqual(4.5)
    })
    it('退行防止: ライトで #D97706 をそのまま文字色にすると 3:1 を下回る', () => {
      expect(contrastRatio(AMBER, blend(AMBER, 0.1, LIGHT.bg2))).toBeLessThan(3)
    })
  })

  describe('補足テキスト（text3）は UI 境界基準 3:1 を満たす', () => {
    it('ライト: 対応形式・Pro誘導の文字 on bg2', () => {
      expect(contrastRatio(TEXT3_LIGHT, LIGHT.bg2)).toBeGreaterThanOrEqual(3)
    })
    it('ダーク: 対応形式・Pro誘導の文字 on bg2', () => {
      expect(contrastRatio(TEXT3_DARK, DARK.bg2)).toBeGreaterThanOrEqual(3)
    })
  })
})
