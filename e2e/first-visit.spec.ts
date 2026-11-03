import { test, expect } from '@playwright/test'

// smoke.spec.ts と違い localStorage を事前に埋めない（本当の初回訪問）
test.describe('初回訪問', () => {
  test('取り込み画面には紹介動画もツアーも重ならず、動画はボタンから開ける', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'ファイルを選択' })).toBeVisible()
    // 保存値の読み込み（最後に rp_visited を記録する）が終わってもオーバーレイが出ないこと
    await page.waitForFunction(() => localStorage.getItem('rp_visited') === '1')
    await expect(page.locator('.introjs-tooltip')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'ガイドツアーを開始 →' })).toHaveCount(0)

    await page.getByRole('button', { name: '紹介動画（25秒）' }).click()
    await expect(page.getByRole('button', { name: 'スキップ' })).toBeVisible()
  })
})
