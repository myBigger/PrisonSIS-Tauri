// theme.ts — 全局主题变量（与 QML 版本保持一致）
export const theme = {
  // 背景层
  bgBase: '#0a0e14',
  bgDeep: '#060a0e',
  bgSurface: '#0d1520',

  // 毛玻璃层
  glassBg: 'rgba(255, 255, 255, 0.05)',
  glassBgHover: 'rgba(255, 255, 255, 0.09)',
  glassBgActive: 'rgba(255, 255, 255, 0.13)',
  glassBgSelect: 'rgba(0, 212, 170, 0.15)',
  glassBorder: 'rgba(255, 255, 255, 0.09)',
  glassBorderBright: 'rgba(255, 255, 255, 0.20)',
  glassBorderAccent: 'rgba(0, 212, 170, 0.40)',

  // 侧边栏
  sidebarBg: 'rgba(10, 14, 20, 0.80)',

  // 强调色
  accentPrimary: '#00D4AA',
  accentSecondary: '#F5A623',
  accentPurple: '#8B5CF6',
  accentRed: '#EF4444',

  // 文字
  textPrimary: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#5A6270',

  // 状态
  statusOnline: '#22C55E',
  statusOffline: '#6B7280',
  statusWarning: '#F59E0B',
  statusError: '#EF4444',

  // 圆角
  radiusSm: 8,
  radiusMd: 14,
  radiusLg: 20,

  // 间距
  spacingXs: 4,
  spacingSm: 8,
  spacingMd: 16,
  spacingLg: 24,
  spacingXl: 32,
}

export type Theme = typeof theme
