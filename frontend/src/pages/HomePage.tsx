// HomePage.tsx — 首页仪表盘
import React from 'react'

const statsData = [
  { title: '今日笔录', value: '3', icon: '📝', subtitle: '较昨日 +1', accent: 'var(--accent-primary)' },
  { title: '待审批', value: '12', icon: '✅', subtitle: '3 条逾期', accent: 'var(--accent-secondary)' },
  { title: '涉案人员', value: '248', icon: '👤', subtitle: '本月新增 7', accent: '#67E8F9' },
  { title: '案件总数', value: '56', icon: '📁', subtitle: '本月新增 3', accent: 'var(--accent-purple)' },
]

const recentRecords = [
  { id: 'BL-2026-0001', case: '盗窃案', person: '张某', type: '问询', time: '2026-04-24 09:30', status: '已审批' },
  { id: 'BL-2026-0002', case: '故意伤害', person: '李某', type: '审讯', time: '2026-04-23 14:20', status: '待审批' },
  { id: 'BL-2026-0003', case: '诈骗案', person: '王某', type: '问询', time: '2026-04-23 10:00', status: '已审批' },
  { id: 'BL-2026-0004', case: '抢劫案', person: '赵某', type: '问询', time: '2026-04-22 16:45', status: '已审批' },
  { id: 'BL-2026-0005', case: '贩毒案', person: '刘某', type: '审讯', time: '2026-04-22 09:00', status: '草稿' },
]

const today = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

const statusColor = (s: string) => {
  if (s === '已审批') return 'var(--status-online)'
  if (s === '待审批') return 'var(--accent-secondary)'
  return 'var(--text-muted)'
}

export default function HomePage() {
  return (
    <div className="page">
      {/* 欢迎语 */}
      <div>
        <div className="page-title-row">
          <h1 className="page-title">你好，管理员 👋</h1>
        </div>
        <p className="page-subtitle">今天是 {today}</p>
      </div>

      {/* 统计卡片 */}
      <div className="stats-grid">
        {statsData.map(s => (
          <div key={s.title} className="glass-card highlighted">
            <div className="card-icon" style={{ background: s.accent + '20', border: `1px solid ${s.accent}40` }}>
              {s.icon}
            </div>
            <div className="card-title">{s.title}</div>
            <div className="card-value">{s.value}</div>
            <div className="card-subtitle">{s.subtitle}</div>
          </div>
        ))}
      </div>

      {/* 近期笔录 */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--glass-border)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>近期笔录</h2>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>案件</th>
                <th>被审讯人</th>
                <th>审讯类型</th>
                <th>时间</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {recentRecords.map(r => (
                <tr key={r.id}>
                  <td className="cell-mono">{r.id}</td>
                  <td>{r.case}</td>
                  <td>{r.person}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.type}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.time}</td>
                  <td>
                    <span className="cell-status">
                      <span className="status-dot" style={{ background: statusColor(r.status) }} />
                      <span style={{ color: statusColor(r.status) }}>{r.status}</span>
                    </span>
                  </td>
                  <td>
                    <button className="glass-btn small">查看</button>
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
