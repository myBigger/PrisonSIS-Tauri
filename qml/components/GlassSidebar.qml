// GlassSidebar.qml — 毛玻璃侧边栏（带真模糊）
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import QtGraphicalEffects 1.15

Rectangle {
    id: root

    property bool collapsed: false
    property int collapseWidth: 68
    property int expandWidth: 240
    property real blurRadius: 16

    signal navigateRequested(string page)
    signal collapseToggled()

    implicitWidth: collapsed ? collapseWidth : expandWidth
    Behavior on width { NumberAnimation { duration: 250; easing.type: Easing.OutCubic } }

    color: "transparent"
    clip: true

    // 侧边栏深色背景
    Rectangle {
        anchors.fill: parent
        color: "#CC0a0e14"    // 半透明深色（配合模糊形成遮罩）
        radius: 0

        // 左边缘细发光
        Rectangle {
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            width: 1
            color: "#1000D4AA"
        }
    }

    // 高斯模糊层（模糊背景内容）
    FastBlur {
        anchors.fill: parent
        radius: blurRadius
        visible: true
        // source 在运行时动态绑定到父级背景
    }

    // 顶部品牌区
    Rectangle {
        id: brandArea
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        height: 60
        color: "transparent"

        Rectangle {
            id: logoMark
            width: 36; height: 36
            anchors.left: parent.left
            anchors.leftMargin: 16
            anchors.verticalCenter: parent.verticalCenter
            radius: 10
            color: "#2000D4AA"
            border.width: 1
            border.color: "#4000D4AA"

            Label {
                anchors.centerIn: parent
                text: "笔"
                color: Theme.accentPrimary
                font.pixelSize: 18
                font.weight: Font.Bold
            }
        }

        Column {
            id: brandText
            anchors.left: logoMark.right
            anchors.leftMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            visible: !root.collapsed

            Label {
                text: "监狱审讯笔录"
                color: Theme.textPrimary
                font.pixelSize: 14
                font.weight: Font.DemiBold
            }
            Label {
                text: "PrisonSIS v1.0"
                color: Theme.textMuted
                font.pixelSize: 11
            }
        }

        GlassButton {
            id: collapseBtn
            anchors.right: parent.right
            anchors.rightMargin: 8
            anchors.verticalCenter: parent.verticalCenter
            isIcon: true
            iconSource: "⟨"
            width: 30; height: 30
            glassRadius: 8
            onClicked: {
                root.collapseToggled()
                collapseBtn.iconSource = root.collapsed ? "⟩" : "⟨"
            }
        }
    }

    // 分隔线
    Rectangle {
        id: divider
        anchors.top: brandArea.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        height: 1
        color: Theme.glassBorder
    }

    // 导航列表
    ListView {
        id: navList
        anchors.top: divider.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: footerArea.top
        anchors.topMargin: 8
        anchors.bottomMargin: 8
        clip: true
        spacing: 2

        model: navModel
        delegate: navDelegate
        currentIndex: 0
    }

    ListModel {
        id: navModel

        ListElement { group: "核心业务"; icon: "👤"; name: "罪犯信息"; page: "criminals"; }
        ListElement { group: "核心业务"; icon: "📝"; name: "笔录制作"; page: "records"; }
        ListElement { group: "核心业务"; icon: "✅"; name: "审批中心"; page: "approvals"; }
        ListElement { group: "核心业务"; icon: "📁"; name: "案件管理"; page: "cases"; }
        ListElement { group: "核心业务"; icon: "🗄"; name: "档案管理"; page: "archive"; }
        ListElement { group: "资源配置"; icon: "📊"; name: "统计分析"; page: "stats"; }
        ListElement { group: "资源配置"; icon: "📋"; name: "模板管理"; page: "templates"; }
        ListElement { group: "资源配置"; icon: "📤"; name: "文档导出"; page: "export"; }
        ListElement { group: "资源配置"; icon: "👥"; name: "用户管理"; page: "users"; }
        ListElement { group: "资源配置"; icon: "💾"; name: "数据备份"; page: "backup"; }
        ListElement { group: "系统管理"; icon: "📋"; name: "日志审计"; page: "logs"; }
    }

    Component {
        id: navDelegate

        Column {
            id: column
            width: root.width
            spacing: 0

            Label {
                id: groupLabel
                visible: (index === 0 || navModel.get(index).group !== navModel.get(index - 1).group) && !root.collapsed
                text: navModel.get(index).group
                color: Theme.textMuted
                font.pixelSize: 11
                font.weight: Font.DemiBold
                leftPadding: 16
                topPadding: 12
                bottomPadding: 4
            }

            Rectangle {
                id: navItem
                width: root.width
                height: 40
                radius: Theme.radiusSm
                color: ListView.isCurrentItem ? Theme.glassBgSelect : "transparent"
                border.width: ListView.isCurrentItem ? 1 : 0
                border.color: ListView.isCurrentItem ? "#4000D4AA" : "transparent"
                Behavior on color { ColorAnimation { duration: 150 } }

                Label {
                    id: navIcon
                    anchors.left: parent.left
                    anchors.leftMargin: root.collapsed ? 0 : 16
                    anchors.verticalCenter: parent.verticalCenter
                    text: navModel.get(index).icon
                    font.pixelSize: 16
                    width: 36
                    horizontalAlignment: Text.AlignHCenter
                }

                Label {
                    id: navLabel
                    anchors.left: navIcon.right
                    anchors.leftMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !root.collapsed
                    text: navModel.get(index).name
                    color: ListView.isCurrentItem ? Theme.accentPrimary : Theme.textSecondary
                    font.pixelSize: 13
                    font.weight: ListView.isCurrentItem ? Font.DemiBold : Font.Normal
                    Behavior on color { ColorAnimation { duration: 150 } }
                }

                // 右侧选中指示条
                Rectangle {
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    width: 3
                    height: 20
                    radius: 2
                    color: Theme.accentPrimary
                    visible: ListView.isCurrentItem
                }

                MouseArea {
                    anchors.fill: parent
                    hoverEnabled: true
                    onEntered: {
                        if (!ListView.isCurrentItem)
                            navItem.color = Theme.glassBgHover
                    }
                    onExited: {
                        if (!ListView.isCurrentItem)
                            navItem.color = "transparent"
                    }
                    onClicked: {
                        navList.currentIndex = index
                        root.navigateRequested(navModel.get(index).page)
                    }
                }
            }
        }
    }

    // 底部用户区
    Rectangle {
        id: footerArea
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        height: 64
        color: "transparent"

        Rectangle {
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.leftMargin: 12
            anchors.rightMargin: 12
            height: 1
            color: Theme.glassBorder
        }

        Row {
            anchors.fill: parent
            anchors.leftMargin: 16
            anchors.rightMargin: 12
            spacing: 10
            anchors.verticalCenter: parent.verticalCenter

            Rectangle {
                width: 34; height: 34
                radius: 10
                color: "#2000D4AA"
                border.width: 1
                border.color: "#4000D4AA"
                anchors.verticalCenter: parent.verticalCenter

                Label {
                    anchors.centerIn: parent
                    text: "管"
                    color: Theme.accentPrimary
                    font.pixelSize: 14
                    font.weight: Font.DemiBold
                }
            }

            Column {
                id: userInfo
                visible: !root.collapsed
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2

                Label {
                    text: "管理员"
                    color: Theme.textPrimary
                    font.pixelSize: 13
                    font.weight: Font.DemiBold
                }
                Label {
                    text: "系统管理员"
                    color: Theme.textMuted
                    font.pixelSize: 11
                }
            }

            Item { Layout.fillWidth: true }

            GlassButton {
                isIcon: true
                iconSource: "⚙"
                width: 32; height: 32
                glassRadius: 8
                anchors.verticalCenter: parent.verticalCenter
            }
        }
    }
}
