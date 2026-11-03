import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rp_onboarding_done', '1')
    localStorage.setItem('rp_visited', '1')
    localStorage.setItem('rp_tour_upload_done', '1')
    localStorage.setItem('rp_tour_editor_done', '1')
    localStorage.setItem('rp_tour_pro_done', '1')
  })
})

// Geminiを選択肢から外したあとも、保存値がgoogleのまま残る利用者が壊れないこと
test('保存済みのGemini設定はOpenAIに戻り、Geminiのキーは消える', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('rp_provider', 'google')
    localStorage.setItem('rp_model', 'gemini-2.5-flash')
    localStorage.setItem('rp_api_key', 'AIza-example')
  })
  await page.reload()

  await expect.poll(() => page.evaluate(() => localStorage.getItem('rp_provider'))).toBe('openai')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('rp_model'))).toBe('gpt-6-luna')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('rp_api_key'))).toBeNull()
})
