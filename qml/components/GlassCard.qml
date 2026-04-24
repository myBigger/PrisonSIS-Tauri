// GlassCard.qml — 毛玻璃卡片（带图标和数据的展示卡片）
import QtQuick 2.15
import QtQuick.Controls 2.15

Rectangle {
    id: root

    property string cardTitle: ""
    property string cardValue: ""
    property string cardIcon: ""
    property string cardSubtitle: ""
    property color accentColor: Theme.accentPrimary

    // 是否为强调卡片
    property bool highlighted: false

    radius: Theme.radiusMd
    color: highlighted ? "#1200D4AA" : Theme.glassBg
    border.width: highlighted ? 1 : 1
    border.color: highlighted ? "#5000D4AA" : Theme.glassBorder

    // 点击效果
    property bool pressed: false
    scale: pressed ? 0.97 : 1.0
    Behavior on scale { NumberAnimation { duration: 100 } }

    Column {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 8

        // 图标 + 标题行
        Row {
            spacing: 10
            anchors.horizontalCenter: parent.horizontalCenter

            Rectangle {
                width: 40; height: 40
                radius: 12
                color: accentColor + "20"
                border.width: 1
                border.color: accentColor + "40"

                Label {
                    anchors.centerIn: parent
                    text: cardIcon
                    font.pixelSize: 20
                }
            }

            Label {
                text: cardTitle
                anchors.verticalCenter: parent.verticalCenter
                color: Theme.textSecondary
                font.pixelSize: 13
                font.weight: Font.Normal
            }
        }

        // 数值
        Label {
            text: cardValue
            anchors.horizontalCenter: parent.horizontalCenter
            color: Theme.textPrimary
            font.pixelSize: 28
            font.weight: Font.Bold
            font.family: "Inter, 'SF Pro Display', sans-serif"
        }

        // 副标题
        Label {
            text: cardSubtitle
            anchors.horizontalCenter: parent.horizontalCenter
            color: Theme.textMuted
            font.pixelSize: 11
            visible: cardSubtitle !== ""
        }
    }

    MouseArea {
        anchors.fill: parent
        onPressed: root.pressed = true
        onReleased: root.pressed = false
        onCanceled: root.pressed = false
        cursorShape: Qt.PointingHandCursor
    }
}
