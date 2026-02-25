import { test, expect } from '@playwright/test'
import path from 'node:path'

// WCAG AA コントラスト比 (大テキスト基準 3:1, 通常テキストは4.5:1)
const MIN_CONTRAST = 3.0

// 全テスト共通: ツアー・ウェルカムモーダルを抑制
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rp_onboarding_done', '1')
    localStorage.setItem('rp_visited', '1')
    localStorage.setItem('rp_tour_upload_done', '1')
    localStorage.setItem('rp_tour_editor_done', '1')
    localStorage.setItem('rp_tour_pro_done', '1')
  })
})

async function dismissTour(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document
      .querySelectorAll(
        '.introjs-overlay, .introjs-tour, .introjs-helperLayer, .introjs-tooltipReferenceLayer, .introjs-fixedTooltip',
      )
      .forEach((el) => el.remove())
  })
}

/**
 * ページ上の要素のテキスト色と背景色を取得し、コントラスト比を計算する。
 * CSS変数・rgba・hex すべて computedStyle で解決済みの値を使う。
 */
async function getContrastInfo(page: import('@playwright/test').Page, selector: string, index = 0) {
  return page.evaluate(
    ({ sel, idx }) => {
      // sRGB相対輝度
      function luminance(r: number, g: number, b: number) {
        const [rs, gs, bs] = [r, g, b].map((c) => {
          const s = c / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        })
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
      }

      function parseColor(color: string): [number, number, number] | null {
        const m =
          color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/) || color.match(/rgb\((\d+)\s+(\d+)\s+(\d+)/)
        if (m) return [+m[1], +m[2], +m[3]]
        return null
      }

      // 背景色を祖先をたどって取得（transparent の場合は親へ）
      function getEffectiveBg(el: Element): [number, number, number] {
        let current: Element | null = el
        while (current) {
          const s = getComputedStyle(current)
          const c = parseColor(s.backgroundColor)
          if (c) {
            // 完全透明でなければ採用
            const alpha = s.backgroundColor.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/)
            if (!alpha || parseFloat(alpha[1]) > 0.1) return c
          }
          current = current.parentElement
        }
        return [0, 0, 0] // ダークモードのデフォルト
      }

      const els = document.querySelectorAll(sel)
      const el = els[idx]
      if (!el) return { error: `要素が見つかりません: ${sel} [${idx}]` }

      const style = getComputedStyle(el)
      const fg = parseColor(style.color)
      if (!fg) return { error: `色のパースに失敗: ${style.color}` }

      const bg = getEffectiveBg(el)
      const fgL = luminance(...fg)
      const bgL = luminance(...bg)
      const ratio = (Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05)

      return {
        text: el.textContent?.trim().slice(0, 50) || '',
        fg: style.color,
        bg: `rgb(${bg.join(', ')})`,
        ratio: Math.round(ratio * 100) / 100,
      }
    },
    { sel: selector, idx: index },
  )
}

test.describe('ダークモード コントラストチェック', () => {
  test('EditorScreenのテキストがダークモードで読める', async ({ page }) => {
    await page.goto('/')

    // ダークモードに切替
    const themeBtn = page.getByRole('button', { name: 'ダークモード切替' })
    await themeBtn.click()
    await page.waitForTimeout(300)

    // ファイルアップロードで EditorScreen に遷移
    const filePath = path.resolve('test-data/mock-resumes/01_職務経歴書_ITエンジニア.txt')
    const input = page.locator('input[type="file"]')
    await input.setInputFiles(filePath)

    // 検出完了を待つ
    await expect(page.getByText('検出結果')).toBeVisible({ timeout: 15000 })
    await dismissTour(page)

    // ── コントラストチェック対象 ──

    // 1. ヘッダーの「検出 N件」Badge
    const detectionBadge = await getContrastInfo(page, '.rp-header-badges span', 0)
    console.log('検出Badge:', detectionBadge)
    if ('ratio' in detectionBadge) {
      expect(
        detectionBadge.ratio,
        `「検出 N件」Badge コントラスト不足 (${detectionBadge.ratio}:1, fg=${detectionBadge.fg}, bg=${detectionBadge.bg})`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }

    // 2. カテゴリヘッダー（折りたたみ）— 全カテゴリをチェック
    const catHeaders = page.locator('.rp-editor-right [role="button"]')
    const catCount = await catHeaders.count()

    for (let i = 0; i < catCount; i++) {
      const info = await getContrastInfo(page, '.rp-editor-right [role="button"]', i)
      if ('ratio' in info && info.text) {
        console.log(`カテゴリ[${i}] "${info.text}":`, info)
        expect(
          info.ratio,
          `カテゴリ「${info.text}」コントラスト不足 (${info.ratio}:1, fg=${info.fg}, bg=${info.bg})`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST)
      }
    }

    // 3. サイドバーの検出結果タブ
    const tabs = page.locator('.rp-editor-right button')
    const tabCount = await tabs.count()
    for (let i = 0; i < Math.min(tabCount, 3); i++) {
      const info = await getContrastInfo(page, '.rp-editor-right button', i)
      if ('ratio' in info && info.text) {
        console.log(`タブ[${i}] "${info.text}":`, info)
        expect(
          info.ratio,
          `タブ「${info.text}」コントラスト不足 (${info.ratio}:1, fg=${info.fg}, bg=${info.bg})`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST)
      }
    }
  })

  test('UploadScreenのテキストがダークモードで読める', async ({ page }) => {
    await page.goto('/')

    // ダークモードに切替
    const themeBtn = page.getByRole('button', { name: 'ダークモード切替' })
    await themeBtn.click()
    await page.waitForTimeout(300)

    // 見出し
    const heading = await getContrastInfo(page, 'h1', 0)
    console.log('見出し:', heading)
    if ('ratio' in heading) {
      expect(heading.ratio, `見出しコントラスト不足 (${heading.ratio}:1)`).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      )
    }

    // ドロップゾーンテキスト
    const dropText = await getContrastInfo(page, '[class*="dropzone"] p, [role="button"] p', 0)
    if ('ratio' in dropText && dropText.text) {
      console.log('ドロップゾーン:', dropText)
      expect(
        dropText.ratio,
        `ドロップゾーン「${dropText.text}」コントラスト不足 (${dropText.ratio}:1)`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
  })
})
