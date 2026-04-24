// UsersPage.tsx — 用户管理页面
import React, { useState } from 'react'

const mockUsers = [
  { id: 1, userId: 'US-0001', username: 'admin', realName: '系统管理员', role: 'Admin', department: '信息科', position: '科长', lastLogin: '2026-04-24 09:00', enabled: true },
  { id: 2, userId: 'US-0002', username: 'user01', realName: '张三', role: 'ReadOnly', department: '一监区', position: '管教员', lastLogin: '2026-04-23 14:30', enabled: true },
  { id: 3, userId: 'US-0003', username: 'user02', realName: '李四', role: 'ReadOnly', department: '二监区', position: '管教员', lastLogin: '2026-04-22 10:15', enabled: true },
  { id: 4, userId: 'US-0004', username: 'legal01', realName: '王五', role: 'Legal', department: '法制科', position: '法制员', lastLogin: '2026-04-21 16:45', enabled: true },
]

const roleColor = (r: string) => {
  if (r === 'Admin') return 'var(--accent-red)'
  if (r === 'Legal') return 'var(--accent-purple)'
  if (r === 'Interrogator') return 'var(--accent-primary)'
  return 'var(--text-secondary)'
}

export default function UsersPage() {
  const [users] = useState(mockUsers)

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">用户管理</h1>
        <button className="glass-btn primary">+ 添加用户</button>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>用户ID</th><th>账号</th><th>姓名</th><th>角色</th><th>部门</th><th>岗位</th><th>最后登录</th><th>状态</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td className="cell-mono">{u.userId}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{u.username}</td>
                  <td style={{ color: 'var(--text-primary)' }}>{u.realName}</td>
                  <td>
                    <span style={{
                      background: roleColor(u.role) + '15',
                      color: roleColor(u.role),
                      border: `1px solid ${roleColor(u.role)}30`,
                      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600
                    }}>{u.role}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{u.department}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{u.position}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{u.lastLogin}</td>
                  <td>
                    <span className="cell-status">
                      <span className="status-dot" style={{ background: u.enabled ? 'var(--status-online)' : 'var(--text-muted)' }} />
                      <span style={{ color: u.enabled ? 'var(--status-online)' : 'var(--text-muted)' }}>{u.enabled ? '启用' : '禁用'}</span>
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="glass-btn small">编辑</button>
                      <button className="glass-btn small">重置密码</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
