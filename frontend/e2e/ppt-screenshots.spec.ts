import * as fs from 'node:fs'
import * as path from 'node:path'
import { test, expect } from '@playwright/test'

/** 与仓库根目录 `docs/ppt-screenshots/汇报版` 对齐（在 frontend 下执行 npm run ppt:screenshots） */
const OUT_DIR = path.join(process.cwd(), '..', 'docs', 'ppt-screenshots', '汇报版')

const NAV_PAGES = [
  'home',
  'criminals',
  'records',
  'approvals',
  'cases',
  'archive',
  'stats',
  'templates',
  'export',
  'users',
  'backup',
  'logs',
] as const

test.describe('PPT 汇报版截图', () => {
  test('导出各模块界面 PNG', async ({ page }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true })

    await page.goto('/')
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible()
    await page.getByRole('button', { name: '登录' }).click()

    await expect(page.locator('.app-shell')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-page="home"].active')).toBeVisible()

    for (const p of NAV_PAGES) {
      await page.locator(`[data-page="${p}"]`).click()
      await expect(page.locator(`[data-page="${p}"].active`)).toBeVisible({ timeout: 15_000 })
      await page.waitForTimeout(600)
      const shot = path.join(OUT_DIR, `${p}.png`)
      await page.locator('.app-shell').screenshot({ path: shot })
    }

    await page.locator('[data-page="records"]').click()
    await expect(page.locator('[data-page="records"].active')).toBeVisible()
    const searchInput = page.locator('header').getByPlaceholder('全局搜索（回车）')
    await searchInput.fill('示例')
    await searchInput.press('Enter')
    await expect(page.getByRole('heading', { name: /全局搜索/ })).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(400)
    await page.locator('.global-search-panel').screenshot({ path: path.join(OUT_DIR, 'global-search.png') })
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(page.locator('.global-search-panel')).toBeHidden()
  })
})
