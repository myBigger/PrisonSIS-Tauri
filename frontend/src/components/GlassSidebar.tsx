// GlassSidebar.tsx — 毛玻璃侧边栏
import { useState } from 'react'
import './GlassSidebar.css'

interface NavItem {
  group: string
  icon: string
  name: string
  page: string
}

const navData: NavItem[] = [
  { group: '核心业务', icon: '👤', name: '罪犯信息', page: 'criminals' },
  { group: '核心业务', icon: '📝', name: '笔录制作', page: 'records' },
  { group: '核心业务', icon: '✅', name: '审批中心', page: 'approvals' },
  { group: '核心业务', icon: '📁', name: '案件管理', page: 'cases' },
  { group: '核心业务', icon: '🗄', name: '档案管理', page: 'archive' },
  { group: '资源配置', icon: '📊', name: '统计分析', page: 'stats' },
  { group: '资源配置', icon: '📋', name: '模板管理', page: 'templates' },
  { group: '资源配置', icon: '📤', name: '文档导出', page: 'export' },
  { group: '资源配置', icon: '👥', name: '用户管理', page: 'users' },
  { group: '资源配置', icon: '💾', name: '数据备份', page: 'backup' },
  { group: '系统管理', icon: '📋', name: '日志审计', page: 'logs' },
]

interface Props {
  currentPage: string
  onNavigate: (page: string) => void
}

export default function GlassSidebar({ currentPage, onNavigate }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const groups = [...new Set(navData.map(n => n.group))]

  return (
    <div className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* 品牌区 */}
      <div className="sidebar-brand">
        <div className="sidebar-logo">笔</div>
        {!collapsed && (
          <div className="sidebar-brand-text">
            <div className="title">监狱审讯笔录</div>
            <div className="subtitle">PrisonSIS v1.0</div>
          </div>
        )}
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? '展开侧栏' : '收起侧栏'}
        >
          {collapsed ? '⟩' : '⟨'}
        </button>
      </div>

      {/* 导航列表 */}
      <div className="nav-list">
        {groups.map(group => (
          <div key={group}>
            {!collapsed && <div className="nav-group-label">{group}</div>}
            {navData
              .filter(n => n.group === group)
              .map(item => (
                <div
                  key={item.page}
                  className={`nav-item${currentPage === item.page ? ' active' : ''}`}
                  onClick={() => onNavigate(item.page)}
                  title={item.name}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {!collapsed && <span className="nav-name">{item.name}</span>}
                  <span className="active-bar" />
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* 底部用户区 */}
      <div className="sidebar-footer">
        <div className="sidebar-avatar">管</div>
        {!collapsed && (
          <div className="sidebar-user-info">
            <div className="name">管理员</div>
            <div className="role">系统管理员</div>
          </div>
        )}
        <button className="glass-btn icon-btn" title="设置">
          ⚙
        </button>
      </div>
    </div>
  )
}
