// GlassInput.qml — 毛玻璃输入框
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Templates 2.15 as T

T.TextField {
    id: root

    placeholderText: ""
    placeholderTextColor: Theme.textMuted

    // 圆角
    property int inputRadius: Theme.radiusSm

    // 颜色
    property color inputBg: "#55000000"
    property color inputBorder: Theme.glassBorder
    property color inputFocusBorder: Theme.accentPrimary

    // 内部状态
    bool inputFocused: false

    // 字体
    font.family: "Inter, 'Segoe UI', 'Noto Sans CJK SC', sans-serif"
    font.pixelSize: 13
    color: Theme.textPrimary

    // placeholder
    property string phText: placeholderText
    verticalAlignment: TextInput.AlignVCenter

    leftPadding: 14
    rightPadding: 14
    topPadding: 10
    bottomPadding: 10

    background: Rectangle {
        id: inputBg
        anchors.fill: parent
        radius: root.inputRadius
        color: root.inputBg
        border.width: inputFocused ? 1.5 : 1
        border.color: inputFocused ? root.inputFocusBorder : root.inputBorder

        Behavior on border.color { ColorAnimation { duration: 200 } }
        Behavior on color { ColorAnimation { duration: 150 } }
    }

    // placeholder 文字（用 MouseArea + Label 模拟）
    Rectangle {
        id: placeholderBg
        anchors.fill: parent
        radius: root.inputRadius
        color: "transparent"
        visible: root.text === "" && !root.inputFocused
        clip: true

        Label {
            anchors.fill: parent
            anchors.leftMargin: 14
            anchors.verticalCenter: parent.verticalCenter
            text: root.placeholderText
            color: Theme.textMuted
            font: root.font
            verticalAlignment: Text.AlignVCenter
        }
    }

    // focus 处理
    onFocusChanged: { root.inputFocused = focus }

    // 选中颜色
    selectionColor: "#4D00D4AA"
    selectedTextColor: Theme.textPrimary

    // 光标颜色
    cursorDelegate: Rectangle {
        width: 2
        color: Theme.accentPrimary
    }
}
