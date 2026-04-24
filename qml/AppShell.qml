// AppShell.qml — 应用外壳：渐变背景 + 侧边栏 + 内容区
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import QtQuick.Shapes 1.15

Rectangle {
    id: appShell

    // 全屏渐变背景（毛玻璃底色）
    gradient: Gradient {
        orientation: Gradient.Horizontal
        GradientStop { position: 0.0; color: Theme.bgBase }
        GradientStop { position: 0.5; color: "#0d1a1f" }
        GradientStop { position: 1.0; color: Theme.bgBase }
    }

    // 背景装饰纹理（半透明几何线条）
    Canvas {
        id: bgCanvas
        anchors.fill: parent
        opacity: 0.04
        onPaint: {
            const ctx = getContext("2d");
            ctx.strokeStyle = Theme.accentPrimary;
            ctx.lineWidth = 1;
            for (let i = 0; i < width; i += 80) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i, height);
                ctx.stroke();
            }
            for (let j = 0; j < height; j += 80) {
                ctx.beginPath();
                ctx.moveTo(0, j);
                ctx.lineTo(width, j);
                ctx.stroke();
            }
        }
    }

    // 主布局：侧边栏 + 内容
    RowLayout {
        anchors.fill: parent
        anchors.margins: 0
        spacing: 0

        // ── 侧边栏 ───────────────────────────────────
        GlassSidebar {
            id: sidebar
            Layout.fillHeight: true
            Layout.preferredWidth: appState.sidebarExpanded ? 240 : 68
            Layout.collapseWidth: 68

            onNavigateRequested: (page) => {
                appState.currentPage = page
            }
        }

        // ── 内容区 ────────────────────────────────────
        ColumnLayout {
            Layout.fillHeight: true
            Layout.fillWidth: true
            spacing: 0

            // 顶部 Header
            GlassHeader {
                id: header
                Layout.fillWidth: true
                Layout.preferredHeight: 56

                currentPage: appState.currentPage
                onToggleSidebar: {
                    appState.sidebarExpanded = !appState.sidebarExpanded
                }
                onThemeSwitchRequested: (theme) => {
                    appState.currentTheme = theme
                }
            }

            // 主内容（页面堆栈）
            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.margins: 16
                color: "transparent"

                // 毛玻璃内容面板
                GlassPanel {
                    anchors.fill: parent
                    radius: Theme.radiusMd

                    // 页面内容
                    StackLayout {
                        anchors.fill: parent
                        anchors.margins: 0
                        currentIndex: appState.pageIndex

                        HomePage        { id: homePage }
                        CriminalListPage{ id: criminalPage }
                    }
                }
            }

            // 底部状态栏
            GlassStatusBar {
                Layout.fillWidth: true
                Layout.preferredHeight: 28
            }
        }
    }

    // ── 全局应用状态（单例）──────────────────────────────
    QtObject {
        id: appState

        // 侧边栏展开/收起
        property bool sidebarExpanded: true

        // 当前页面名称
        property string currentPage: "home"

        // 当前主题：glassmorphism / dark / light
        property string currentTheme: "glassmorphism"

        // 页面索引映射
        readonly property var pageMap: {
            "home": 0,
            "criminals": 1,
            "records": 2,
            "approvals": 3,
            "cases": 4,
            "archive": 5,
            "stats": 6,
            "templates": 7,
            "export": 8,
            "users": 9,
            "backup": 10,
            "logs": 11,
        }

        property int pageIndex: pageMap[currentPage] || 0
    }
}
