// HomePage.qml — 首页仪表盘
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import "../components"

Item {
    id: root

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 20

        // 欢迎语
        Row {
            spacing: 8
            Layout.alignment: Qt.AlignLeft

            Label {
                text: "你好，管理员"
                color: Theme.textPrimary
                font.pixelSize: 22
                font.weight: Font.Bold
                anchors.verticalCenter: parent.verticalCenter
            }

            Label {
                text: "👋"
                font.pixelSize: 20
                anchors.verticalCenter: parent.verticalCenter
            }
        }

        Label {
            text: "今天是 " + new Date().toLocaleDateString(Qt.locale("zh_CN"), "yyyy年MM月dd日 ddd")
            color: Theme.textMuted
            font.pixelSize: 13
            Layout.alignment: Qt.AlignLeft
        }

        // 统计卡片行
        Row {
            spacing: 16
            Layout.fillWidth: true

            GlassCard {
                cardTitle: "今日笔录"
                cardValue: "3"
                cardIcon: "📝"
                cardSubtitle: "较昨日 +1"
                accentColor: Theme.accentPrimary
            }
            GlassCard {
                cardTitle: "待审批"
                cardValue: "12"
                cardIcon: "✅"
                cardSubtitle: "3 条逾期"
                accentColor: Theme.accentSecondary
            }
            GlassCard {
                cardTitle: "涉案人员"
                cardValue: "248"
                cardIcon: "👤"
                cardSubtitle: "本月新增 7"
                accentColor: Theme.codeType
            }
            GlassCard {
                cardTitle: "案件总数"
                cardValue: "56"
                cardIcon: "📁"
                cardSubtitle: "本月新增 3"
                accentColor: Theme.accentPurple
            }
        }

        // 近期笔录列表
        GlassPanel {
            Layout.fillWidth: true
            Layout.fillHeight: true
            radius: Theme.radiusMd

            Column {
                anchors.fill: parent
                anchors.margins: 16
                spacing: 12

                Label {
                    text: "近期笔录"
                    color: Theme.textPrimary
                    font.pixelSize: 15
                    font.weight: Font.DemiBold
                }

                // 表头
                Row {
                    spacing: 0
                    Layout.fillWidth: true

                    Label { text: "编号";   width: 120; color: Theme.textMuted; font.pixelSize: 11; font.weight: Font.DemiBold }
                    Label { text: "案件";   width: 140; color: Theme.textMuted; font.pixelSize: 11; font.weight: Font.DemiBold }
                    Label { text: "被审讯人"; width: 120; color: Theme.textMuted; font.pixelSize: 11; font.weight: Font.DemiBold }
                    Label { text: "审讯类型"; width: 100; color: Theme.textMuted; font.pixelSize: 11; font.weight: Font.DemiBold }
                    Label { text: "时间";   width: 160; color: Theme.textMuted; font.pixelSize: 11; font.weight: Font.DemiBold }
                    Label { text: "状态";   width: 80;  color: Theme.textMuted; font.pixelSize: 11; font.weight: Font.DemiBold }
                    Label { text: "操作";   width: 80;  color: Theme.textMuted; font.pixelSize: 11; font.weight: Font.DemiBold }
                }

                Rectangle { height: 1; color: Theme.glassBorder; width: parent.width }

                // 示例数据行
                ListView {
                    id: recordList
                    model: 5
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    spacing: 0

                    delegate: Row {
                        spacing: 0
                        width: recordList.width
                        height: 44

                        Label { text: "BL-2026-%1".arg(index + 1).padStart(4, '0'); width: 120; anchors.verticalCenter: parent.verticalCenter; color: Theme.textSecondary; font.pixelSize: 12 }
                        Label { text: ["盗窃案", "故意伤害", "诈骗案", "抢劫案", "贩毒案"][index]; width: 140; anchors.verticalCenter: parent.verticalCenter; color: Theme.textPrimary; font.pixelSize: 12 }
                        Label { text: ["张某", "李某", "王某", "赵某", "刘某"][index]; width: 120; anchors.verticalCenter: parent.verticalCenter; color: Theme.textPrimary; font.pixelSize: 12 }
                        Label { text: ["问询", "审讯", "问询", "问询", "审讯"][index]; width: 100; anchors.verticalCenter: parent.verticalCenter; color: Theme.textSecondary; font.pixelSize: 12 }
                        Label { text: ["2026-04-24 09:30", "2026-04-23 14:20", "2026-04-23 10:00", "2026-04-22 16:45", "2026-04-22 09:00"][index]; width: 160; anchors.verticalCenter: parent.verticalCenter; color: Theme.textMuted; font.pixelSize: 12 }
                        Label {
                            text: ["已审批", "待审批", "已审批", "已审批", "草稿"][index]
                            width: 80
                            anchors.verticalCenter: parent.verticalCenter
                            color: ["已审批": Theme.statusOnline, "待审批": Theme.accentSecondary, "草稿": Theme.textMuted][text]
                            font.pixelSize: 12
                        }

                        GlassButton {
                            text: "查看"
                            width: 64
                            height: 28
                            glassRadius: 6
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        Rectangle { height: 1; color: Theme.glassBorder; width: parent.width }
                    }
                }
            }
        }
    }
}
