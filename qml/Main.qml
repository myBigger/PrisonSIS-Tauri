// Main.qml — PrisonSIS QML 应用入口
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Window 2.15
import "qml"

Window {
    id: mainWindow
    visible: true
    width: 1440
    height: 900
    minimumWidth: 1200
    minimumHeight: 700
    title: "监狱审讯笔录工具 v1.0.0"

    // 背景色（最深底色，防止透明露底）
    color: Theme.bgBase

    // 全局快捷键
    Shortcut {
        sequence: "Ctrl+N"
        onActivated: console.log("新建笔录")
    }
    Shortcut {
        sequence: "F5"
        onActivated: console.log("刷新数据")
    }
    Shortcut {
        sequence: "Ctrl+Q"
        onActivated: Qt.quit()
    }

    // 加载 AppShell
    AppShell {
        anchors.fill: parent
    }

    // 启动动画（渐显）
    Rectangle {
        id: splash
        anchors.fill: parent
        color: Theme.bgBase
        z: 999

        NumberAnimation {
            target: splash
            property: "opacity"
            from: 1
            to: 0
            duration: 600
            easing.type: Easing.OutCubic
            started: true
        }

        // 启动完成后隐藏
        onOpacityChanged: {
            if (opacity === 0) splash.visible = false
        }

        // 1.5秒后自动淡出
        Timer {
            interval: 1500
            running: true
            onTriggered: {
                // 触发渐隐动画
                splash.opacity = 0
            }
        }
    }
}
