// GlassButton.qml — 毛玻璃按钮
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Templates 2.15 as T

T.Button {
    id: root

    // 变体类型：primary / secondary / danger / ghost / icon
    property string variant: "default"

    // 毛玻璃属性
    property color glassColor: Theme.glassBg
    property color glassBorder: Theme.glassBorder
    property color glassHover: Theme.glassBgHover
    property color glassActive: Theme.glassBgActive

    // 圆角
    property int glassRadius: Theme.radiusSm

    // 是否为图标按钮
    property bool isIcon: false

    // 内部状态
    bool isHovered: false
    bool isPressed: false

    implicitWidth: isIcon ? 36 : (contentItem.implicitWidth + 32)
    implicitHeight: isIcon ? 36 : 38

    // 背景
    background: Rectangle {
        id: bg
        radius: root.glassRadius
        color: {
            if (root.variant === "primary") {
                return root.isPressed ? "#4000D4AA"
                     : root.isHovered ? "#28ffD4AA"
                     : "#1a00D4AA"
            }
            if (root.variant === "danger") {
                return root.isPressed ? "#40EF4444"
                     : root.isHovered ? "#28EF4444"
                     : "#1aEF4444"
            }
            return root.isPressed ? glassActive
                 : root.isHovered ? glassHover
                 : glassColor
        }
        border.width: root.isPressed ? 1 : (root.isHovered ? 1 : 1)
        border.color: {
            if (root.variant === "primary")
                return root.isHovered ? Theme.accentPrimary : "#4D00D4AA"
            if (root.variant === "danger")
                return root.isHovered ? Theme.accentRed : "#4DEF4444"
            return root.isHovered ? Theme.glassBorderBright : glassBorder
        }

        Behavior on color { ColorAnimation { duration: 150 } }
        Behavior on border.color { ColorAnimation { duration: 150 } }

        // 图标按钮圆形
        Rectangle {
            anchors.centerIn: parent
            width: parent.width
            height: parent.height
            radius: parent.radius
            visible: root.isIcon
            color: "transparent"
        }
    }

    // 文字颜色
    contentItem: Item {}
    label: Text {
        anchors.centerIn: parent
        text: root.text
        font: root.font
        color: {
            if (root.variant === "primary") return Theme.accentPrimary
            if (root.variant === "danger") return Theme.accentRed
            return root.isHovered ? Theme.textPrimary : Theme.textSecondary
        }
        Behavior on color { ColorAnimation { duration: 150 } }

        font.pixelSize: 13
        font.weight: root.variant === "primary" ? Font.DemiBold : Font.Normal
        font.family: "Inter, 'Segoe UI', 'Noto Sans CJK SC', sans-serif"
    }

    // 图标（如果指定了 iconSource）
    property string iconSource: ""

    // 左图标
    Rectangle {
        id: leftIcon
        width: 18; height: 18
        radius: 4
        visible: root.iconSource !== "" && root.isIcon === false
        anchors.verticalCenter: parent.verticalCenter
        anchors.left: parent.left
        anchors.leftMargin: 12
        color: "transparent"

        Text {
            anchors.centerIn: parent
            text: root.iconSource
            color: root.contentItem.color
            font.pixelSize: 15
        }
    }

    // 鼠标事件（用于状态控制）
    MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        onEntered: { root.isHovered = true }
        onExited:  { root.isHovered = false }
        onPressed: { root.isPressed = true }
        onReleased: { root.isPressed = false }
        acceptedButtons: Qt.LeftButton | Qt.RightButton
    }

    // 涟漪效果
    Rectangle {
        id: ripple
        anchors.centerIn: parent
        width: parent.width * 2
        height: parent.height * 2
        radius: width / 2
        color: "#20ffffff"
        opacity: root.isPressed ? 0.3 : 0
        Behavior on opacity { NumberAnimation { duration: 200 } }
        visible: root.isPressed
    }
}
