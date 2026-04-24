// GlassHeader.qml — 毛玻璃顶部状态栏
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

Rectangle {
    id: root

    property string currentPage: "home"
    signal toggleSidebar()
    signal themeSwitchRequested(string theme)

    color: "transparent"

    // 底部分隔线
    Rectangle {
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        height: 1
        color: Theme.glassBorder
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 16
        anchors.rightMargin: 16
        spacing: 12

        // 菜单切换按钮
        GlassButton {
            isIcon: true
            iconSource: "☰"
            width: 36; height: 36
            glassRadius: 10
            onClicked: root.toggleSidebar()
        }

        // 当前页面标题
        Label {
            id: pageTitle
            text: pageTitleText(root.currentPage)
            color: Theme.textPrimary
            font.pixelSize: 16
            font.weight: Font.DemiBold
            Layout.alignment: Qt.AlignVCenter
        }

        Item { Layout.fillWidth: true }

        // 搜索框（胶囊形）
        Rectangle {
            id: searchBox
            Layout.preferredWidth: 240
            Layout.preferredHeight: 36
            Layout.alignment: Qt.AlignVCenter
            radius: 18
            color: "#30000000"
            border.width: 1
            border.color: Theme.glassBorder

            Row {
                anchors.fill: parent
                anchors.leftMargin: 14
                anchors.rightMargin: 14
                spacing: 8
                anchors.verticalCenter: parent.verticalCenter

                Label {
                    text: "🔍"
                    font.pixelSize: 14
                    anchors.verticalCenter: parent.verticalCenter
                    color: Theme.textMuted
                }

                TextInput {
                    id: searchInput
                    anchors.verticalCenter: parent.verticalCenter
                    width: 180
                    color: Theme.textPrimary
                    font.pixelSize: 13
                    font.family: "Inter, 'Segoe UI', sans-serif"
                    cursorVisible: false
                    maximumLength: 100
                    property string placeholder: "搜索功能..."

                    Rectangle {
                        anchors.fill: parent
                        color: "transparent"
                        Label {
                            anchors.verticalCenter: parent.verticalCenter
                            text: searchInput.placeholder
                            color: Theme.textMuted
                            font: searchInput.font
                            visible: searchInput.text === ""
                        }
                    }
                }
            }

            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: searchInput.forceActiveFocus()
            }
        }

        // 主题切换按钮组
        Row {
            id: themeSwitcher
            spacing: 4
            Layout.alignment: Qt.AlignVCenter

            // 深色
            GlassButton {
                text: "深色"
                width: 60
                height: 32
                glassRadius: 8
                onClicked: root.themeSwitchRequested("dark")
            }

            // 浅色
            GlassButton {
                text: "浅色"
                width: 60
                height: 32
                glassRadius: 8
                onClicked: root.themeSwitchRequested("light")
            }

            // 毛玻璃（当前）
            GlassButton {
                text: "毛玻璃"
                variant: "primary"
                width: 68
                height: 32
                glassRadius: 8
                onClicked: root.themeSwitchRequested("glassmorphism")
            }
        }

        // 通知图标
        GlassButton {
            isIcon: true
            iconSource: "🔔"
            width: 36; height: 36
            glassRadius: 10
            Layout.alignment: Qt.AlignVCenter
        }
    }

    function pageTitleText(page) {
        const map = {
            "home":       "首页",
            "criminals":  "罪犯信息管理",
            "records":    "笔录制作",
            "approvals":  "审批中心",
            "cases":      "案件管理",
            "archive":    "档案管理",
            "stats":      "统计分析",
            "templates":  "模板管理",
            "export":     "文档导出",
            "users":      "用户管理",
            "backup":     "数据备份",
            "logs":       "日志审计",
        }
        return map[page] || "监狱审讯笔录"
    }
}
