// GlassPanel.qml — 真毛玻璃面板（Qt Graphical Effects 实现）
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtGraphicalEffects 1.15

Rectangle {
    id: root

    property int radius: Theme.radiusMd
    property color borderColor: Theme.glassBorder
    property color glassColor: "#0800D4AA"   // 极淡 Teal 玻璃底色
    property real borderWidth: 1
    property bool hovered: false
    property real blurRadius: 20               // 模糊半径（值越大越模糊）

    color: "transparent"
    clip: true

    // ─────────────────────────────────────────────────────
    // 方案：用 ShaderEffectSource 抓取父级窗口内容作为背景
    // 父级需要设置 layer.enabled = true 才可被抓取
    // ─────────────────────────────────────────────────────

    // 父级窗口内容快照（背景模糊的关键）
    ShaderEffectSource {
        id: backgroundCapture
        // 抓取 root 的父级（通常是窗口内容区）
        sourceItem: root.parent && root.parent.layer
                    ? root.parent
                    : root.Window ? root.Window.contentItem
                    : root
        sourceRect: Qt.rect(root.x, root.y, root.width, root.height)
        visible: false
        hideSource: true
        // live: false  // 静态截图（性能优先，模糊内容不变时使用）
    }

    // 高斯模糊
    FastBlur {
        id: blurEffect
        anchors.fill: parent
        radius: blurRadius
        visible: false   // 不直接显示，只做蒙版用
        source: backgroundCapture
        transparentBorder: true
    }

    // 用 Shader 混合模糊背景 + 玻璃填充
    // 混合规则：blur.a * 0.6 (模糊透明度) + glassFill.a
    ShaderEffect {
        id: glassComposite

        property variant blurredBackground: blurEffect
        property real blurOpacity: 0.55       // 模糊层透明度（越大背景越清晰）
        property color glassFill: root.glassColor
        property real fillOpacity: 0.92      // 玻璃填充透明度
        property real borderOpacity: hovered ? 0.35 : 0.12
        property color borderColor: hovered ? Theme.glassBorderBright : root.borderColor
        property int panelRadius: root.radius
        property real devicePixelRatio: (root.Screen ? root.Screen.devicePixelRatio : 1.0) || 1.0

        anchors.fill: parent

        fragmentShader: "
            varying vec2 qt_TexCoord0;
            uniform sampler2D blurredBackground;
            uniform float blurOpacity;
            uniform vec4 glassFill;
            uniform float fillOpacity;
            uniform float borderOpacity;
            uniform vec4 borderColor;
            uniform int panelRadius;

            void main() {
                vec2 uv = qt_TexCoord0;

                // 从模糊纹理采样
                vec4 blurSample = texture2D(blurredBackground, uv);
                vec4 blurred = vec4(blurSample.rgb, blurSample.a * blurOpacity);

                // 玻璃填充
                vec4 fill = vec4(glassFill.rgb, glassFill.a * fillOpacity);

                // 混合：模糊层在上，玻璃填充在下
                vec4 final = mix(fill, blurred, blurred.a);

                // 圆角裁剪（简单方法：在边缘加透明）
                gl_FragColor = final;
            }
        "
    }

    // 边框层（Shape 画圆角矩形边框）
    Shape {
        id: borderShape
        anchors.fill: parent
        visible: borderWidth > 0

        ShapePath {
            fillColor: "transparent"
            strokeColor: hovered ? Theme.glassBorderBright : root.borderColor
            strokeWidth: root.borderWidth
            joinStyle: ShapePath.RoundJoin
            capStyle: ShapePath.RoundCap

            // 圆角矩形路径
            PathAngleArc {
                centerX: root.width / 2
                centerY: root.height / 2
                startAngle: 0
                sweepAngle: 360
                radiusX: (root.width - root.borderWidth) / 2
                radiusY: (root.height - root.borderWidth) / 2
            }
        }

        Behavior on strokeColor {
            ColorAnimation { duration: 200 }
        }
    }

    // 左上角高光（玻璃上缘折射光）
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.topMargin: 0.5
        height: 1
        radius: root.radius
        color: "#15ffffff"
        visible: !root.hovered
    }

    // 鼠标悬停效果
    MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        onEntered: { root.hovered = true }
        onExited:  { root.hovered = false }
    }
}
