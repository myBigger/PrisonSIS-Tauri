// AppShell.qml — 应用外壳：支持真毛玻璃模糊的背景层
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import QtGraphicalEffects 1.15

Rectangle {
    id: appShell

    // ── 1. 渐变背景层（最先渲染，供给模糊层抓取）──────────
    Rectangle {
        id: backgroundLayer
        anchors.fill: parent
        z: 0

        // 深色渐变
        gradient: Gradient {
            orientation: Gradient.Horizontal
            GradientStop { position: 0.0; color: Theme.bgBase }
            GradientStop { position: 0.4; color: "#0d1a1f" }
            GradientStop { position: 1.0; color: Theme.bgBase }
        }

        // 装饰性网格线
        Canvas {
            id: gridCanvas
            anchors.fill: parent
            opacity: 0.04
            onPaint: {
                const ctx = getContext("2d");
                ctx.strokeStyle = Theme.accentPrimary;
                ctx.lineWidth = 1;
                for (let x = 0; x < width; x += 80) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                    ctx.stroke();
                }
                for (let y = 0; y < height; y += 80) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                }
            }
        }

        // 右上角装饰圆（模拟光线折射）
        Rectangle {
            id: glowOrb
            width: 600
            height: 600
            radius: width / 2
            anchors.top: parent.top
            anchors.right: parent.right
            anchors.topMargin: -200
            anchors.rightMargin: -100
            gradient: Gradient {
                orientation: Gradient.Radial
                GradientStop { position: 0.0; color: "#2000D4AA" }
                GradientStop { position: 1.0; color: "transparent" }
            }
            opacity: 0.5
        }

        // 左下角装饰圆
        Rectangle {
            width: 400
            height: 400
            radius: width / 2
            anchors.bottom: parent.bottom
            anchors.left: parent.left
            anchors.bottomMargin: -100
            anchors.leftMargin: -50
            gradient: Gradient {
                orientation: Gradient.Radial
                GradientStop { position: 0.0; color: "#1500D4AA" }
                GradientStop { position: 1.0; color: "transparent" }
            }
            opacity: 0.4
        }
    }

    // ── 2. 主布局层（开启 layer，供毛玻璃模糊抓取背景）────
    RowLayout {
        id: mainLayout
        anchors.fill: parent
        anchors.margins: 0
        spacing: 0
        z: 1

        // 重要：开启 layer 后 ShaderEffectSource 才能抓取这个区域
        layer.enabled: true
        layer.samplerName: "contentTexture"

        // 侧边栏
        GlassSidebar {
            id: sidebar
            Layout.fillHeight: true
            Layout.preferredWidth: appState.sidebarExpanded ? 240 : 68

            onNavigateRequested: (page) => {
                appState.currentPage = page
            }
            onCollapseToggled: {
                appState.sidebarExpanded = !appState.sidebarExpanded
            }
        }

        // 内容区
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

            // 主内容面板（真毛玻璃）
            GlassPanel {
                id: contentPanel
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.margins: 16
                radius: Theme.radiusMd
                blurRadius: 20

                StackLayout {
                    id: pageStack
                    anchors.fill: parent
                    anchors.margins: 0
                    currentIndex: appState.pageIndex

                    HomePage        { id: homePage }
                    CriminalListPage{ id: criminalPage }
                }
            }

            // 底部状态栏
            GlassStatusBar {
                Layout.fillWidth: true
                Layout.preferredHeight: 28
            }
        }
    }

    // ── 3. 全局应用状态 ────────────────────────────────
    QtObject {
        id: appState

        property bool sidebarExpanded: true
        property string currentPage: "home"
        property string currentTheme: "glassmorphism"

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
