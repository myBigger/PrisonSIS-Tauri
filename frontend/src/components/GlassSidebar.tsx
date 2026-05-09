// GlassSidebar.tsx — 毛玻璃侧边栏
import { useState } from 'react'
import './GlassSidebar.css'

interface NavItem {
  group: string
  icon: string
  name: string
  page: string
}

export function pageAllowed(page: string, role: string): boolean {
  const r = role.trim()
  if (page === 'users') return r === 'Admin'
  if (page === 'backup') return r === 'Admin' || r === 'Approver'
  if (page === 'logs') return r === 'Admin' || r === 'Auditor'
  return true
}

const navData: NavItem[] = [
  { group: '核心业务', icon: '🏠', name: '首页', page: 'home' },
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

interface User {
  username: string
  real_name: string
  role: string
}

interface Props {
  currentPage: string
  onNavigate: (page: string) => void
  user: User
  onLogout?: () => void
}

export default function GlassSidebar({ currentPage, onNavigate, user, onLogout }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const groups = [...new Set(navData.map(n => n.group))]

  return (
    <div className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* 品牌区 */}
      <div className="sidebar-brand">
        <button
          type="button"
          className="sidebar-brand-clickable"
          onClick={() => onNavigate('home')}
          aria-label="返回首页"
          title="返回首页"
        >
          <div className="sidebar-logo">笔</div>
          {!collapsed && (
            <div className="sidebar-brand-text">
              <div className="title">监狱审讯笔录</div>
              <div className="subtitle">PrisonSIS v1.0</div>
            </div>
          )}
        </button>
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
              .filter(item => pageAllowed(item.page, user.role))
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
        <div className="sidebar-avatar">{user.real_name?.charAt(0) || '用'}</div>
        {!collapsed && (
          <div className="sidebar-user-info">
            <div className="name">{user.real_name || user.username}</div>
            <div className="role">{user.role === 'Admin' ? '系统管理员' : user.role}</div>
          </div>
        )}
        <button
          className="glass-btn icon-btn"
          title="退出登录"
          onClick={onLogout}
        >
          🚪
        </button>
      </div>
    </div>
  )
}
