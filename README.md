# PrisonSIS-Tauri

> 监狱审讯笔录系统 — Tauri 2.0 + React 重构版本
> 采用 **Glassmorphism + Dark Mode** 设计风格

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2.0 |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 5 |
| 样式 | 原生 CSS（毛玻璃效果） |
| 后端 | Rust（Tauri Commands） |
| 目标包 | `.exe` (Windows x64) |

## 设计风格

- **毛玻璃效果**：`backdrop-filter: blur(20px)` + CSS 半透明
- **强调色**：Teal `#00D4AA` + 琥珀金 `#F5A623`
- **圆角**：统一 14px
- **字体**：Inter / Segoe UI / Noto Sans CJK SC

## 项目结构

```
PrisonSIS-Tauri/
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # 应用主入口
│   │   ├── index.css            # 全局样式 + 毛玻璃 CSS
│   │   ├── theme.ts            # 主题变量
│   │   ├── components/
│   │   │   ├── GlassSidebar.tsx     # 侧边栏
│   │   │   ├── GlassHeader.tsx      # 顶部栏
│   │   │   └── GlassStatusBar.tsx   # 底部状态栏
│   │   └── pages/
│   │       ├── HomePage.tsx        # 首页仪表盘
│   │       └── CriminalListPage.tsx # 罪犯列表
│   │
│   ├── src-tauri/               # Rust 后端
│   │   ├── src/lib.rs           # Tauri Commands + Rust 逻辑
│   │   ├── Cargo.toml
│   │   └── tauri.conf.json
│   │
│   ├── package.json
│   └── vite.config.ts
│
├── README.md
```

## 构建方法

### 前置依赖

```bash
# Node.js 18+
node --version  # >= 18

# Rust 1.77+
rustc --version  # >= 1.77
```

### 开发模式

```bash
cd frontend
npm install
npm run tauri dev
```

### 生产构建

```bash
npm run tauri build
```

构建产物位于 `frontend/src-tauri/target/release/bundle/nsis/`（Windows NSIS 安装包）。

## Tauri 命令（Rust → 前端）

| 命令 | 说明 | 返回 |
|------|------|------|
| `get_criminals` | 获取罪犯列表 | `Criminal[]` |
| `get_recent_records` | 获取近期笔录 | `Record[]` |
| `get_dashboard_stats` | 获取统计面板 | `DashboardStats` |

## 页面路由

| 页面 | 路径 | 说明 |
|------|------|------|
| 首页仪表盘 | `/home` | 统计卡片 + 近期笔录 |
| 罪犯信息 | `/criminals` | 人员列表 + 搜索 |
| 笔录制作 | `/records` | 待开发 |
| 审批中心 | `/approvals` | 待开发 |

## 相关项目

- [PrisonSIS-Qt](https://github.com/myBigger/PrisonSIS-Qt) — Qt Widgets 原版
- [PrisonSIS-PyQt](https://github.com/myBigger/PrisonSIS-PyQt) — Python + PyQt6 版本
