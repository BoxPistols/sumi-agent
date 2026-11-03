import { test, expect } from '@playwright/test'

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

test.describe('ローカルAI: 設定画面', () => {
  test('ローカルAIプロバイダ選択でエンドポイント入力が表示される', async ({ page }) => {
    await page.goto('/')

    // Pro版に切替
    const proRadio = page.getByRole('radio', { name: /Pro/ })
    await proRadio.click()
    await dismissTour(page)

    // 設定モーダルを開く
    const settingsBtn = page.getByRole('button', { name: /設定/ })
    await settingsBtn.click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // ローカルAIプロバイダを選択
    const localBtn = page.locator('[role="dialog"] button').filter({ hasText: 'ローカルAI' })
    await localBtn.scrollIntoViewIfNeeded()
    await localBtn.click()

    // エンドポイント入力欄が表示される
    const endpointInput = page.getByLabel('ローカルAIエンドポイント')
    await expect(endpointInput).toBeVisible()

    // デフォルト値の確認
    await expect(endpointInput).toHaveValue('http://localhost:11434/v1')

    // Ollama / LM Studio のヒントテキスト
    await expect(page.getByText('Ollama:')).toBeVisible()
    await expect(page.getByText('LM Studio:')).toBeVisible()

    // セキュリティ説明テキスト
    await expect(page.getByText('データが外部に送信されず')).toBeVisible()
  })
})

test.describe('ローカルAI: ヘルプモーダル', () => {
  test('ヘルプにローカルAIセクションが表示される', async ({ page }) => {
    await page.goto('/')

    // ヘルプモーダルを開く
    const helpBtn = page.getByRole('button', { name: /ヘルプ/ })
    await helpBtn.click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // ローカルAIセクションの存在
    await expect(page.getByText('ローカルAI（Ollama / LM Studio）')).toBeVisible()

    // 主要な説明テキスト
    await expect(page.getByText('データが外部に一切送信されません')).toBeVisible()
    await expect(page.getByText('利用回数の制限なし')).toBeVisible()

    // エンドポイント例
    await expect(page.getByText('http://localhost:11434/v1')).toBeVisible()
    await expect(page.getByText('http://localhost:1234/v1')).toBeVisible()
  })
})
