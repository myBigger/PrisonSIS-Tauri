// GlassPanel.qml — 毛玻璃面板容器
import QtQuick 2.15
import QtQuick.Shapes 1.15

Rectangle {
    id: root

    property int radius: Theme.radiusMd
    property color borderColor: Theme.glassBorder
    property color bgColor: Theme.glassBg
    property real borderWidth: 1
    property bool hovered: false

    color: "transparent"

    // 外发光效果（用 Shape 画边框）
    Shape {
        id: borderShape
        anchors.fill: parent
        anchors.margins: 0

        ShapePath {
            id: borderPath
            fillColor: "transparent"
            strokeColor: hovered ? Theme.glassBorderBright : borderColor
            strokeWidth: borderWidth
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin

            // 圆角矩形路径
            PathAngleArc {
                startAngle: 0
                sweepAngle: 360
                centerX: root.width / 2
                centerY: root.height / 2
                radiusX: (root.width - borderWidth) / 2
                radiusY: (root.height - borderWidth) / 2
            }
        }
    }

    // 内部内容（用 Repeater 画四个圆角矩形覆盖边角）
    Rectangle {
        anchors.fill: parent
        anchors.margins: borderWidth
        radius: root.radius - borderWidth
        color: bgColor
        border.width: 0

        // hover 效果
        Behavior on color {
            ColorAnimation { duration: 200 }
        }
    }

    // 四个角落：画圆角裁剪
    // （实际上 Rectangle 的 radius 已经处理了圆角，这里不需要额外处理）

    MouseArea {
        id: hoverArea
        anchors.fill: parent
        hoverEnabled: true
        onEntered: { root.hovered = true }
        onExited:  { root.hovered = false }
    }
}
