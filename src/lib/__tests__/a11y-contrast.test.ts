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

    it('ダークテーマ: 次へ/完了ボタンはグラデーション両端で白文字が読める', () => {
      assertContrast('#FFFFFF', '#7c3aed', AA, 'tour next (dark, from)')
      assertContrast('#FFFFFF', '#8b5cf6', 4.2, 'tour next (dark, to)')
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
