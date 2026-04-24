// CriminalListPage.qml — 罪犯信息列表页
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import "../components"

Item {
    id: root

    ColumnLayout {
        anchors.fill: parent
        spacing: 16

        // 搜索 + 操作栏
        Row {
            spacing: 12
            Layout.fillWidth: true

            // 搜索框
            Rectangle {
                width: 300; height: 38
                radius: 19
                color: "#30000000"
                border.width: 1
                border.color: Theme.glassBorder

                Row {
                    anchors.fill: parent
                    anchors.leftMargin: 16
                    anchors.rightMargin: 16
                    spacing: 8
                    anchors.verticalCenter: parent.verticalCenter

                    Label { text: "🔍"; font.pixelSize: 14; anchors.verticalCenter: parent.verticalCenter; color: Theme.textMuted }
                    TextInput {
                        id: searchInput
                        width: 240
                        color: Theme.textPrimary
                        font.pixelSize: 13
                        font.family: "Inter, sans-serif"
                        anchors.verticalCenter: parent.verticalCenter
                        cursorVisible: false
                        Rectangle {
                            anchors.fill: parent
                            color: "transparent"
                            Label {
                                anchors.verticalCenter: parent.verticalCenter
                                text: "搜索姓名、编号、案由..."
                                color: Theme.textMuted
                                font: searchInput.font
                                visible: searchInput.text === ""
                            }
                        }
                    }
                }

                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor }
            }

            Item { Layout.fillWidth: true }

            // 筛选下拉
            GlassButton {
                text: "全部状态 ▼"
                width: 130
                height: 38
                glassRadius: 10
            }

            GlassButton {
                text: "全部类型 ▼"
                width: 130
                height: 38
                glassRadius: 10
            }

            // 新增按钮
            GlassButton {
                variant: "primary"
                text: "+ 新增人员"
                width: 120
                height: 38
                glassRadius: 10
            }
        }

        // 表格毛玻璃面板
        GlassPanel {
            id: tablePanel
            Layout.fillWidth: true
            Layout.fillHeight: true
            radius: Theme.radiusMd

            Column {
                anchors.fill: parent

                // 表头
                Row {
                    id: tableHeader
                    anchors.top: parent.top
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.margins: 0
                    height: 44
                    spacing: 0

                    Rectangle {
                        width: 80; height: parent.height
                        color: "#10ffffff"
                        border.bottom: 1
                        border.color: Theme.glassBorder

                        Label { text: "序号"; anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 12; font.weight: Font.DemiBold }
                    }
                    Rectangle {
                        width: 120; height: parent.height
                        color: "#10ffffff"
                        border.bottom: 1
                        border.color: Theme.glassBorder
                        Label { text: "编号"; anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 12; font.weight: Font.DemiBold }
                    }
                    Rectangle {
                        width: 120; height: parent.height
                        color: "#10ffffff"
                        border.bottom: 1
                        border.color: Theme.glassBorder
                        Label { text: "姓名"; anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 12; font.weight: Font.DemiBold }
                    }
                    Rectangle {
                        width: 80; height: parent.height
                        color: "#10ffffff"
                        border.bottom: 1
                        border.color: Theme.glassBorder
                        Label { text: "性别"; anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 12; font.weight: Font.DemiBold }
                    }
                    Rectangle {
                        width: 120; height: parent.height
                        color: "#10ffffff"
                        border.bottom: 1
                        border.color: Theme.glassBorder
                        Label { text: "身份证号"; anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 12; font.weight: Font.DemiBold }
                    }
                    Rectangle {
                        width: 150; height: parent.height
                        color: "#10ffffff"
                        border.bottom: 1
                        border.color: Theme.glassBorder
                        Label { text: "案由"; anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 12; font.weight: Font.DemiBold }
                    }
                    Rectangle {
                        width: 120; height: parent.height
                        color: "#10ffffff"
                        border.bottom: 1
                        border.color: Theme.glassBorder
                        Label { text: "入狱日期"; anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 12; font.weight: Font.DemiBold }
                    }
                    Rectangle {
                        width: 100; height: parent.height
                        color: "#10ffffff"
                        border.bottom: 1
                        border.color: Theme.glassBorder
                        Label { text: "状态"; anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 12; font.weight: Font.DemiBold }
                    }
                    Rectangle {
                        width: 200; height: parent.height
                        color: "#10ffffff"
                        border.bottom: 1
                        border.color: Theme.glassBorder
                        Label { text: "操作"; anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 12; font.weight: Font.DemiBold }
                    }
                }

                // 数据行
                ListView {
                    id: dataList
                    model: 10
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true

                    delegate: tableRow
                    spacing: 0
                }
            }
        }
    }

    // 表格行组件
    Component {
        id: tableRow

        Rectangle {
            id: rowRect
            width: dataList.width
            height: 48
            color: modelData % 2 === 0 ? "transparent" : "#08ffffff"
            border.width: 0
            border.bottom: 1
            border.color: Theme.glassBorder + "40"

            property bool rowHovered: false

            Row {
                anchors.fill: parent
                spacing: 0

                Rectangle { width: 80;  height: parent.height; Label { text: modelData + 1;           anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 12 } }
                Rectangle { width: 120; height: parent.height; Label { text: "CR-%1".arg(String(modelData+1).padStart(5,'0')); anchors.centerIn: parent; color: Theme.accentPrimary; font.pixelSize: 12 } }
                Rectangle { width: 120; height: parent.height; Label { text: ["张某","李某","王某","赵某","刘某","陈某","周某","吴某","郑某","孙某"][modelData]; anchors.centerIn: parent; color: Theme.textPrimary; font.pixelSize: 12 } }
                Rectangle { width: 80;  height: parent.height; Label { text: ["男","女","男","男","女","男","男","男","男","男"][modelData]; anchors.centerIn: parent; color: Theme.textSecondary; font.pixelSize: 12 } }
                Rectangle { width: 120; height: parent.height; Label { text: "***********%1XXX".arg(modelData+1); anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 11 } }
                Rectangle { width: 150; height: parent.height; Label { text: ["盗窃罪","故意伤害","诈骗罪","抢劫罪","贩毒罪","盗窃罪","诈骗罪","故意伤害","抢劫罪","盗窃罪"][modelData]; anchors.centerIn: parent; color: Theme.textSecondary; font.pixelSize: 12 } }
                Rectangle { width: 120; height: parent.height; Label { text: "2026-0%1-15".arg(modelData%9+1); anchors.centerIn: parent; color: Theme.textMuted; font.pixelSize: 12 } }
                Rectangle {
                    width: 100; height: parent.height
                    Label {
                        anchors.centerIn: parent
                        text: ["在押","在押","已释放","在押","在押","在押","取保","在押","在押","在押"][modelData]
                        color: ["在押": Theme.statusOnline, "已释放": Theme.textMuted, "取保": Theme.accentSecondary][text]
                        font.pixelSize: 12
                    }
                }
                Rectangle {
                    width: 200; height: parent.height

                    Row {
                        anchors.centerIn: parent
                        spacing: 8

                        GlassButton {
                            text: "查看"
                            width: 64; height: 28
                            glassRadius: 6
                        }
                        GlassButton {
                            text: "编辑"
                            width: 64; height: 28
                            glassRadius: 6
                        }
                    }
                }
            }

            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                onEntered: rowRect.color = Theme.glassBgHover
                onExited:  rowRect.color = modelData % 2 === 0 ? "transparent" : "#08ffffff"
                cursorShape: Qt.PointingHandCursor
            }
        }
    }
}
