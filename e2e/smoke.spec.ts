import { test, expect } from '@playwright/test'
import path from 'node:path'

// 全テスト共通: ページロード前にツアー・ウェルカムモーダルを抑制する
test.beforeEach(async ({ page }) => {
  // addInitScript はページ遷移のたびに実行される
  await page.addInitScript(() => {
    localStorage.setItem('rp_onboarding_done', '1')
    localStorage.setItem('rp_visited', '1')
    localStorage.setItem('rp_tour_upload_done', '1')
    localStorage.setItem('rp_tour_editor_done', '1')
    localStorage.setItem('rp_tour_pro_done', '1')
  })
})

// 万が一オーバーレイが残っている場合に JS で除去するヘルパー
async function dismissTour(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document
      .querySelectorAll(
        '.introjs-overlay, .introjs-tour, .introjs-helperLayer, .introjs-tooltipReferenceLayer, .introjs-fixedTooltip',
      )
      .forEach((el) => el.remove())
  })
}

test.describe('TOP画面', () => {
  test('見出しとドロップゾーンが表示される', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /個人情報/ })).toBeVisible()
    await expect(page.getByText('ファイルをドラッグ')).toBeVisible()
  })

  test('Lite/Pro 切替', async ({ page }) => {
    await page.goto('/')
    // エディション切替はradiogroup
    const proRadio = page.getByRole('radio', { name: /Pro/ })
    await proRadio.click()
    // Pro切替後のツアーを除去
    await dismissTour(page)
    // Pro版にはURLスクレイピングタブがある
    await expect(page.getByText('URLスクレイピング')).toBeVisible()

    // Liteに戻す
    const liteRadio = page.getByRole('radio', { name: /Lite/ })
    await liteRadio.click()
    await expect(page.getByText('URLスクレイピング')).not.toBeVisible()
  })

  test('テーマ切替', async ({ page }) => {
    await page.goto('/')
    const themeBtn = page.getByRole('button', { name: 'ダークモード切替' })
    await themeBtn.click()
    await page.waitForTimeout(300)
    // 切り替え後もページが表示されていること
    await expect(page.getByRole('heading', { name: /個人情報/ })).toBeVisible()
  })
})

test.describe('ファイルアップロード', () => {
  test('TXTファイルで検出結果が表示される', async ({ page }) => {
    await page.goto('/')
    const filePath = path.resolve('test-data/mock-resumes/01_職務経歴書_ITエンジニア.txt')
    const input = page.locator('input[type="file"]')
    await input.setInputFiles(filePath)

    // 検出完了を待つ（EditorScreenに遷移）
    await expect(page.getByText('検出結果')).toBeVisible({ timeout: 15000 })
  })
})

test.describe('PreviewModal', () => {
  test('プレビューモーダルの表示と最大化', async ({ page }) => {
    await page.goto('/')
    const filePath = path.resolve('test-data/mock-resumes/01_職務経歴書_ITエンジニア.txt')
    const input = page.locator('input[type="file"]')
    await input.setInputFiles(filePath)
    await expect(page.getByText('検出結果')).toBeVisible({ timeout: 15000 })

    // EditorScreen のツアーオーバーレイを除去
    await dismissTour(page)

    // 確認する → 整える（A4プレビュー画面）
    await page.getByRole('button', { name: '次へ: 整える' }).click()
    await expect(page.getByText('A4 プレビュー')).toBeVisible()

    // 整える → 書き出す（エクスポートプレビューモーダル）
    await page.getByRole('button', { name: '次へ: 書き出す' }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // 最大化ボタン（背後の整えるビューにも「縮小」ズームボタンがあるためダイアログ内にスコープ）
    const dialog = page.getByRole('dialog')
    const expandBtn = dialog.getByRole('button', { name: '最大化' })
    if ((await expandBtn.count()) > 0) {
      await expandBtn.click()
      await expect(dialog.getByRole('button', { name: '縮小' })).toBeVisible()
    }
  })
})
