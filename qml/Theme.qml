// Theme.qml — 全局主题变量（毛玻璃暗黑风格）
pragma Singleton
import QtQuick 2.15

QtObject {
    // ── 背景层 ────────────────────────────────────────
    readonly property color bgBase:     "#0a0e14"
    readonly property color bgDeep:     "#060a0e"
    readonly property color bgSurface: "#0d1520"

    // ── 毛玻璃层 ────────────────────────────────────────
    readonly property color glassBg:         "#0dffffff"
    readonly property color glassBgHover:    "#14ffffff"
    readonly property color glassBgActive:   "#1effffff"
    readonly property color glassBgSelect:   "#2600D4AA"
    readonly property color glassBorder:     "#17ffffff"
    readonly property color glassBorderBright:"#33ffffff"

    // ── 侧边栏 ────────────────────────────────────────
    readonly property color sidebarBg:  "#110a0e14"

    // ── 强调色 ─────────────────────────────────────────
    readonly property color accentPrimary:   "#00D4AA"   // Teal 青色
    readonly property color accentSecondary: "#F5A623"  // 琥珀金
    readonly property color accentPurple:    "#8B5CF6"  // 紫色
    readonly property color accentRed:       "#EF4444"   // 危险红

    // ── 文字 ───────────────────────────────────────────
    readonly property color textPrimary:   "#FFFFFF"
    readonly property color textSecondary: "#9CA3AF"
    readonly property color textMuted:     "#5A6270"
    readonly property color textAccent:    accentPrimary

    // ── 状态色 ─────────────────────────────────────────
    readonly property color statusOnline:   "#22C55E"
    readonly property color statusOffline: "#6B7280"
    readonly property color statusWarning:  "#F59E0B"
    readonly property color statusError:    "#EF4444"

    // ── 代码高亮 ───────────────────────────────────────
    readonly property color codeKeyword:   "#93C5FD"
    readonly property color codeType:     "#67E8F9"
    readonly property color codeString:  "#A3E635"
    readonly property color codeNumber:   "#F59E0B"
    readonly property color codeComment:  "#6B7280"
    readonly property color codeFunction: "#C084FC"

    // ── 圆角 ───────────────────────────────────────────
    readonly property int radiusSm:  8
    readonly property int radiusMd:  14
    readonly property int radiusLg:  20
    readonly property int radiusXl:  28

    // ── 间距 ───────────────────────────────────────────
    readonly property int spacingXs:  4
    readonly property int spacingSm:  8
    readonly property int spacingMd:  16
    readonly property int spacingLg:  24
    readonly property int spacingXl:  32

    // ── 阴影（Qt Quick 不支持 box-shadow，用层级模拟）────
    readonly property real blurRadius: 20
}
