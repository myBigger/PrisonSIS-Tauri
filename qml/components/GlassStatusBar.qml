// GlassStatusBar.qml — 毛玻璃底部状态栏
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

Rectangle {
    id: root
    color: "transparent"

    // 顶部分隔线
    Rectangle {
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        height: 1
        color: Theme.glassBorder
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 16
        anchors.rightMargin: 16
        spacing: 16

        // 状态指示
        Row {
            spacing: 6
            anchors.verticalCenter: parent.verticalCenter

            Rectangle {
                width: 8; height: 8
                radius: 4
                color: Theme.statusOnline
                anchors.verticalCenter: parent.verticalCenter

                // 脉冲动画
                SequentialAnimation on opacity {
                    loops: Animation.Infinite
                    PauseAnimation { duration: 1500 }
                    NumberAnimation { from: 1; to: 0.3; duration: 1 }
                    PauseAnimation { duration: 1500 }
                }
            }

            Label {
                text: "在线"
                color: Theme.statusOnline
                font.pixelSize: 11
                anchors.verticalCenter: parent.verticalCenter
            }
        }

        // 数据库状态
        Label {
            text: "数据库：正常"
            color: Theme.textMuted
            font.pixelSize: 11
            anchors.verticalCenter: parent.verticalCenter
        }

        // P2P 状态
        Label {
            text: "P2P：未启动"
            color: Theme.textMuted
            font.pixelSize: 11
            anchors.verticalCenter: parent.verticalCenter
        }

        Item { Layout.fillWidth: true }

        // 当前时间
        Label {
            id: timeLabel
            text: new Date().toLocaleString(Qt.locale("zh_CN"), "yyyy-MM-dd HH:mm:ss")
            color: Theme.textMuted
            font.pixelSize: 11
            anchors.verticalCenter: parent.verticalCenter

            // 每秒更新时间
            Timer {
                interval: 1000
                running: true
                repeat: true
                onTriggered: {
                    timeLabel.text = new Date().toLocaleString(
                        Qt.locale("zh_CN"), "yyyy-MM-dd HH:mm:ss")
                }
            }
        }

        // 版本
        Label {
            text: "v1.0.0"
            color: Theme.textMuted
            font.pixelSize: 11
            anchors.verticalCenter: parent.verticalCenter
        }
    }
}
