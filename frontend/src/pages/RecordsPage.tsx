// RecordsPage.tsx — 笔录制作页面
import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Record {
  id: number
  record_id: string
  record_type: string
  criminal_id: number
  criminal_name: string
  record_date: string
  record_location: string
  interrogator_id: string
  status: string
  created_at: string
}

const statusColor = (s: string) => {
  if (s === 'Approved' || s === '已审批') return 'var(--status-online)'
  if (s === 'Pending' || s === '待审批') return 'var(--accent-secondary)'
  if (s === 'Rejected') return 'var(--accent-red)'
  return 'var(--text-muted)'
}

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    Draft: '草稿', Pending: '待审批', Approved: '已审批', Rejected: '已驳回'
  }
  return map[s] || s
}

export default function RecordsPage() {
  const [records, setRecords] = useState<Record[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    invoke<[Record[], number]>('get_records', { page: 0, pageSize: 50, search: '' })
      .then(([data]) => setRecords(data))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all'
    ? records
    : records.filter(r => {
        if (filter === 'draft') return r.status === 'Draft'
        if (filter === 'pending') return r.status === 'Pending'
        if (filter === 'approved') return r.status === 'Approved'
        return true
      })

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">笔录制作</h1>
        <button className="glass-btn primary">+ 新建笔录</button>
      </div>

      {/* 筛选标签 */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { key: 'all', label: '全部' },
          { key: 'draft', label: '草稿' },
          { key: 'pending', label: '待审批' },
          { key: 'approved', label: '已审批' },
        ].map(t => (
          <button
            key={t.key}
            className={`glass-btn${filter === t.key ? ' primary' : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>被审讯人</th>
                <th>审讯类型</th>
                <th>审讯日期</th>
                <th>地点</th>
                <th>承办人</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>加载中...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>暂无数据</td></tr>
              )}
              {!loading && filtered.map(r => (
                <tr key={r.id}>
                  <td className="cell-mono">{r.record_id}</td>
                  <td>{r.criminal_name || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.record_type}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.record_date || '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.record_location || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.interrogator_id || '—'}</td>
                  <td>
                    <span className="cell-status">
                      <span className="status-dot" style={{ background: statusColor(r.status) }} />
                      <span style={{ color: statusColor(r.status) }}>{statusLabel(r.status)}</span>
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="glass-btn small">查看</button>
                      {r.status === 'Draft' && <button className="glass-btn small">编辑</button>}
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
