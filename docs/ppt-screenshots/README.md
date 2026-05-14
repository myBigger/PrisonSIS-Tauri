# 汇报版 PPT 截图与生成

用于生成仓库根目录 `PrisonSIS_产品介绍_汇报版.pptx` 的界面素材（本目录下 `汇报版/*.png`）与根目录脚本 `generate_prisonsis_ppt_report_with_images.py`。

## 前置条件

1. **Node**：在 [`frontend`](../../frontend) 目录已执行 `npm install`。
2. **Playwright 浏览器**（首次需要，下载到 `frontend/.pw-browsers`，避免与系统缓存架构不一致）：

   ```bash
   cd frontend && npm run ppt:install-browsers
   ```

3. **Python**：已安装 `python-pptx`：

   ```bash
   pip install python-pptx
   ```

## 一键流程

在 **`frontend`** 目录（需能启动 Vite；`playwright.config` 会按需自动 `npm run dev`，也可先手动 `npm run dev` 再测）：

```bash
cd frontend
npm run ppt:report
```

- `ppt:screenshots`：仅截取 PNG 到 `docs/ppt-screenshots/汇报版/`。
- `ppt:report`：先截图，再在仓库根目录执行 `python3 generate_prisonsis_ppt_report_with_images.py`。

Playwright 会**单独启动** Vite（默认端口 **5199**、`--strictPort`），与日常占用的 5173 不冲突。若需改端口：

```bash
export PLAYWRIGHT_PORT=5200
npm run ppt:screenshots
```

若改为手动先起 `npm run dev`，请设置与之一致的地址（需含 `/PrisonSIS-Tauri` 前缀）：

```bash
export PLAYWRIGHT_BASE_URL=http://localhost:5173/PrisonSIS-Tauri
npm run ppt:screenshots
```

## 说明

- 截图走 **Web 预览**（非 Tauri 窗体）：登录页点击「登录」即进入管理员界面，与 [`LoginPage`](../../frontend/src/pages/LoginPage.tsx) 行为一致。
- 非 Tauri 下 `base` 为 `/PrisonSIS-Tauri/`，与 [`vite.config.ts`](../../frontend/vite.config.ts) 一致。
