// GlassHeader.tsx — 毛玻璃顶部状态栏
import React from 'react'

interface Props {
  currentPage: string
  onToggleSidebar: () => void
  onThemeSwitch: (theme: string) => void
}

const pageTitles: Record<string, string> = {
  home: '首页',
  criminals: '罪犯信息管理',
  records: '笔录制作',
  approvals: '审批中心',
  cases: '案件管理',
  archive: '档案管理',
  stats: '统计分析',
  templates: '模板管理',
  export: '文档导出',
  users: '用户管理',
  backup: '数据备份',
  logs: '日志审计',
}

export default function GlassHeader({ currentPage, onToggleSidebar, onThemeSwitch }: Props) {
  return (
    <header className="header">
      <button className="glass-btn icon-btn" onClick={onToggleSidebar} title="切换侧栏">
        ☰
      </button>

      <div className="header-title">{pageTitles[currentPage] || '首页'}</div>

      {/* 搜索框 */}
      <div className="header-search">
        <span className="header-search-icon">🔍</span>
        <input type="text" placeholder="搜索功能..." />
      </div>

      {/* 主题切换 */}
      <div className="theme-switcher">
        <button className="glass-btn" onClick={() => onThemeSwitch('dark')}>深色</button>
        <button className="glass-btn" onClick={() => onThemeSwitch('light')}>浅色</button>
        <button className="glass-btn primary" onClick={() => onThemeSwitch('glassmorphism')}>毛玻璃</button>
      </div>

      {/* 通知 */}
      <button className="glass-btn icon-btn" title="通知">🔔</button>
    </header>
  )
}
