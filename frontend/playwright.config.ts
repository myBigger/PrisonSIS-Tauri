import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const projectDir = path.dirname(fileURLToPath(import.meta.url))
/** 与日常 `npm run dev` 错开，避免 5173 被占用导致 webServer 一直等不到就绪 */
const port = process.env.PLAYWRIGHT_PORT ?? '5199'
/** 使用 localhost：部分环境下 Vite 仅绑定 localhost，127.0.0.1 会导致 webServer 就绪检测失败 */
const base =
  process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, '') ??
  `http://localhost:${port}/PrisonSIS-Tauri`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: base,
    ...devices['Desktop Chrome'],
    viewport: { width: 1920, height: 1080 },
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `${base}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: projectDir,
  },
})
