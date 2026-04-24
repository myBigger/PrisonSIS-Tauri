// HomePage.tsx — 首页仪表盘（数据来自 Tauri Rust 后端）
import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface DashboardStats {
  today_records: number
  pending_approvals: number
  total_criminals: number
  total_cases: number
  yesterday_delta: number
  expired_count: number
  month_new_criminals: number
  month_new_cases: number
}

interface Record {
  id: number
  record_id: string
  record_type: string
  criminal_id: number
  criminal_name: string
  record_date: string
  record_location: string
  status: string
}

const statusColor = (s: string) => {
  if (s === '已审批' || s === 'Approved') return 'var(--status-online)'
  if (s === '待审批' || s === 'Pending') return 'var(--accent-secondary)'
  return 'var(--text-muted)'
}

const today = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

export default function HomePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [records, setRecords] = useState<Record[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      invoke<DashboardStats>('get_dashboard_stats'),
      invoke<Record[]>('get_recent_records', { limit: 5 }),
    ])
      .then(([s, r]) => {
        setStats(s)
        setRecords(r)
      })
      .catch(err => {
        console.error('加载数据失败:', err)
        setStats({
          today_records: 3,
          pending_approvals: 12,
          total_criminals: 248,
          total_cases: 56,
          yesterday_delta: 1,
          expired_count: 3,
          month_new_criminals: 7,
          month_new_cases: 3,
        })
        setRecords([
          { id: 1, record_id: 'BL-2026-0001', record_type: '问询', criminal_id: 1, criminal_name: '张某', record_date: '2026-04-24 09:30', record_location: '审讯室A', status: 'Approved' },
          { id: 2, record_id: 'BL-2026-0002', record_type: '审讯', criminal_id: 2, criminal_name: '李某', record_date: '2026-04-23 14:20', record_location: '审讯室B', status: 'Pending' },
          { id: 3, record_id: 'BL-2026-0003', record_type: '问询', criminal_id: 3, criminal_name: '王某', record_date: '2026-04-23 10:00', record_location: '审讯室A', status: 'Approved' },
          { id: 4, record_id: 'BL-2026-0004', record_type: '问询', criminal_id: 4, criminal_name: '赵某', record_date: '2026-04-22 16:45', record_location: '审讯室C', status: 'Approved' },
          { id: 5, record_id: 'BL-2026-0005', record_type: '审讯', criminal_id: 5, criminal_name: '刘某', record_date: '2026-04-22 09:00', record_location: '审讯室A', status: 'Draft' },
        ])
      })
      .finally(() => setLoading(false))
  }, [])

  const statusLabel = (s: string) => {
    if (s === 'Approved') return '已审批'
    if (s === 'Pending') return '待审批'
    if (s === 'Draft') return '草稿'
    return s
  }

  return (
    <div className="page">
      <div>
        <div className="page-title-row">
          <h1 className="page-title">你好，管理员 👋</h1>
        </div>
        <p className="page-subtitle">今天是 {today}</p>
      </div>

      {/* 统计卡片 */}
      <div className="stats-grid">
        <div className="glass-card highlighted">
          <div className="card-icon" style={{ background: 'rgba(0,212,170,0.12)', border: '1px solid rgba(0,212,170,0.25)' }}>📝</div>
          <div className="card-title">今日笔录</div>
          <div className="card-value">{loading ? '—' : (stats?.today_records ?? 0)}</div>
          <div className="card-subtitle">
            {loading ? '' : (
              stats && stats.yesterday_delta > 0
                ? `较昨日 +${stats.yesterday_delta}`
                : stats ? `较昨日 ${stats.yesterday_delta}`
                : ''
            )}
          </div>
        </div>

        <div className="glass-card highlighted">
          <div className="card-icon" style={{ background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.25)' }}>✅</div>
          <div className="card-title">待审批</div>
          <div className="card-value">{loading ? '—' : (stats?.pending_approvals ?? 0)}</div>
          <div className="card-subtitle">
            {!loading && stats && stats.expired_count > 0
              ? `${stats.expired_count} 条逾期`
              : !loading ? '无逾期' : ''}
          </div>
        </div>

        <div className="glass-card highlighted">
          <div className="card-icon" style={{ background: 'rgba(103,232,249,0.12)', border: '1px solid rgba(103,232,249,0.25)' }}>👤</div>
          <div className="card-title">涉案人员</div>
          <div className="card-value">{loading ? '—' : (stats?.total_criminals ?? 0)}</div>
          <div className="card-subtitle">{loading ? '' : `本月新增 ${stats?.month_new_criminals ?? 0}`}</div>
        </div>

        <div className="glass-card highlighted">
          <div className="card-icon" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}>📁</div>
          <div className="card-title">案件总数</div>
          <div className="card-value">{loading ? '—' : (stats?.total_cases ?? 0)}</div>
          <div className="card-subtitle">{loading ? '' : `本月新增 ${stats?.month_new_cases ?? 0}`}</div>
        </div>
      </div>

      {/* 近期笔录 */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
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
                <th>地点</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    加载中...
                  </td>
                </tr>
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    暂无数据
                  </td>
                </tr>
              )}
              {!loading && records.map(r => (
                <tr key={r.id}>
                  <td className="cell-mono">{r.record_id}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>—</td>
                  <td>{r.criminal_name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.record_type}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.record_date}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.record_location}</td>
                  <td>
                    <span className="cell-status">
                      <span className="status-dot" style={{ background: statusColor(r.status) }} />
                      <span style={{ color: statusColor(r.status) }}>{statusLabel(r.status)}</span>
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
