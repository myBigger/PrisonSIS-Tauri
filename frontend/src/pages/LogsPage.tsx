// LogsPage.tsx — 日志审计页面
import { useState } from 'react'

const mockLogs = [
  { id: 1, user: 'admin', action: '登录', module: '认证', details: '登录成功', ip: '127.0.0.1', time: '2026-04-24 09:00:12' },
  { id: 2, user: 'admin', action: '新增笔录', module: '笔录', details: 'BL-2026-0006 新增成功', ip: '127.0.0.1', time: '2026-04-24 09:15:33' },
  { id: 3, user: 'user01', action: '查看笔录', module: '笔录', details: '查看 BL-2026-0003', ip: '192.168.1.101', time: '2026-04-24 10:02:18' },
  { id: 4, user: 'admin', action: '审批通过', module: '审批', details: 'BL-2026-0002 审批通过', ip: '127.0.0.1', time: '2026-04-24 11:30:05' },
  { id: 5, user: 'user02', action: '登录', module: '认证', details: '登录成功', ip: '192.168.1.102', time: '2026-04-24 14:22:41' },
  { id: 6, user: 'admin', action: '新增人员', module: '人员', details: '新增罪犯张某 (CR-00011)', ip: '127.0.0.1', time: '2026-04-24 15:08:59' },
  { id: 7, user: 'user01', action: '导出笔录', module: '导出', details: '导出 PDF 格式 3份', ip: '192.168.1.101', time: '2026-04-24 16:45:22' },
]

const actionColor = (a: string) => {
  if (a.includes('登录') || a.includes('登出')) return 'var(--accent-primary)'
  if (a.includes('新增') || a.includes('创建')) return 'var(--status-online)'
  if (a.includes('审批') || a.includes('通过')) return 'var(--accent-purple)'
  if (a.includes('删除') || a.includes('驳回')) return 'var(--accent-red)'
  return 'var(--text-secondary)'
}

export default function LogsPage() {
  const [logs] = useState(mockLogs)
  const [search, setSearch] = useState('')

  const filtered = logs.filter(l =>
    l.user.includes(search) || l.action.includes(search) || l.module.includes(search)
  )

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">日志审计</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="glass-btn">导出日志</button>
          <button className="glass-btn danger">清空日志</button>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="search-box" style={{ width: 300 }}>
        <span>🔍</span>
        <input
          type="text"
          placeholder="搜索用户、操作、模块..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>时间</th><th>用户</th><th>操作</th><th>模块</th><th>详情</th><th>IP地址</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{l.time}</td>
                  <td style={{ color: 'var(--accent-primary)' }}>{l.user}</td>
                  <td>
                    <span style={{ color: actionColor(l.action), fontSize: 13 }}>{l.action}</span>
                  </td>
                  <td>
                    <span style={{
                      background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'var(--text-secondary)'
                    }}>{l.module}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12, maxWidth: 280 }}>{l.details}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{l.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--glass-border)',
          display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)'
        }}>
          共 {filtered.length} 条
          <div style={{ flex: 1 }} />
          <button className="glass-btn small" disabled>上一页</button>
          <button className="glass-btn small" disabled>下一页</button>
        </div>
      </div>
    </div>
  )
}
