# PrisonSIS-QML

> 监狱审讯笔录系统 — QML 重构版本（毛玻璃暗黑风格）

基于 Qt Quick/QML 重构的 PrisonSIS 前端，采用 **Glassmorphism + Dark Mode** 设计风格。

## 技术栈

| 技术 | 说明 |
|------|------|
| Qt 6 | 基础框架 |
| Qt Quick / QML | UI 实现 |
| Qt Quick Controls 2 | 控件库 |
| Qt Graphical Effects | 模糊/毛玻璃效果 |
| Material Style | 基础控件风格 |

## 设计风格

- **毛玻璃效果**：半透明面板 + 高斯模糊背景
- **强调色**：Teal `#00D4AA` + 琥珀金 `#F5A623`
- **圆角**：统一 14px
- **字体**：Inter / Segoe UI / Noto Sans CJK

## 项目结构

```
PrisonSIS-QML/
├── PrisonSIS-QML.pro       # Qt 项目文件
├── main.cpp               # 应用入口
├── qml.qrc               # QML 资源注册
├── qtquickcontrols2.conf # Quick Controls 配置
│
├── qml/
│   ├── Main.qml          # 入口窗口
│   ├── AppShell.qml      # 应用外壳
│   ├── Theme.qml         # 全局主题变量（Singleton）
│   │
│   ├── components/       # 可复用组件
│   │   ├── GlassPanel.qml    # 毛玻璃面板
│   │   ├── GlassButton.qml   # 毛玻璃按钮
│   │   ├── GlassInput.qml    # 毛玻璃输入框
│   │   ├── GlassCard.qml     # 数据展示卡片
│   │   ├── GlassSidebar.qml  # 侧边导航栏
│   │   ├── GlassHeader.qml   # 顶部状态栏
│   │   └── GlassStatusBar.qml # 底部状态栏
│   │
│   └── pages/            # 页面
│       ├── HomePage.qml       # 首页仪表盘
│       └── CriminalListPage.qml # 罪犯信息列表
│
└── README.md
```

## 构建方法

```bash
# Qt Creator 打开 .pro 文件直接编译
# 或命令行：

qmake PrisonSIS-QML.pro
make

# Qt 6 + CMake（推荐）
mkdir build && cd build
cmake ..
make
```

## 依赖

- Qt 6.2+
- Qt Quick Controls 2
- Qt Graphical Effects（用于后续毛玻璃效果增强）

## 相关项目

- [PrisonSIS-Qt](https://github.com/myBigger/PrisonSIS-Qt) — Qt Widgets 原版
- [PrisonSIS-PyQt](https://github.com/myBigger/PrisonSIS-PyQt) — Python + PyQt6 版本
