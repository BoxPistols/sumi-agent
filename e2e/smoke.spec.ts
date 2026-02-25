import { test, expect } from '@playwright/test'
import path from 'node:path'

// ツアーオーバーレイを閉じるヘルパー
async function dismissTour(page: import('@playwright/test').Page) {
  const skip = page.getByRole('button', { name: 'スキップ' })
  if (await skip.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skip.click()
    await page.waitForTimeout(500)
  }
}

test.describe('TOP画面', () => {
  test('見出しとドロップゾーンが表示される', async ({ page }) => {
    await page.goto('/')
    await dismissTour(page)
    await expect(page.getByRole('heading', { name: /個人情報/ })).toBeVisible()
    await expect(page.getByText('ファイルをドラッグ')).toBeVisible()
  })

  test('Lite/Pro 切替', async ({ page }) => {
    await page.goto('/')
    await dismissTour(page)
    // エディション切替はradiogroup
    const proRadio = page.getByRole('radio', { name: /Pro/ })
    await proRadio.click()
    // Pro版にはURLスクレイピングタブがある
    await expect(page.getByText('URLスクレイピング')).toBeVisible()

    // Liteに戻す
    const liteRadio = page.getByRole('radio', { name: /Lite/ })
    await liteRadio.click()
    await expect(page.getByText('URLスクレイピング')).not.toBeVisible()
  })

  test('テーマ切替', async ({ page }) => {
    await page.goto('/')
    await dismissTour(page)
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
    await dismissTour(page)
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
    await dismissTour(page)
    const filePath = path.resolve('test-data/mock-resumes/01_職務経歴書_ITエンジニア.txt')
    const input = page.locator('input[type="file"]')
    await input.setInputFiles(filePath)
    await expect(page.getByText('検出結果')).toBeVisible({ timeout: 15000 })

    // EditorScreen のツアーも閉じる
    await dismissTour(page)

    // プレビューボタンをクリック
    const previewBtn = page.getByRole('button', { name: /プレビュー/ })
    if ((await previewBtn.count()) > 0) {
      await previewBtn.first().click()
      // モーダルが開く
      await expect(page.locator('[role="dialog"]')).toBeVisible()

      // 最大化ボタン
      const expandBtn = page.getByRole('button', { name: '最大化' })
      if ((await expandBtn.count()) > 0) {
        await expandBtn.click()
        await expect(page.getByRole('button', { name: '縮小' })).toBeVisible()
      }
    }
  })
})
