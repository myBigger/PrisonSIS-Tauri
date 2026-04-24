// ApprovalsPage.tsx — 审批中心页面
import { useEffect, useState } from 'react'

const mockInvoke = async (_cmd: string) => {
  if (_cmd === 'get_records') return [[], 0]
  return [[], 0]
}

interface ApprovalRecord {
  id: number
  record_id: string
  criminal_name: string
  record_type: string
  status: string
  approver1_result: string
  approver2_result: string
  reject_reason: string
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

const mockRecords: ApprovalRecord[] = [
  { id: 1, record_id: 'BL-2026-0001', criminal_name: '张某', record_type: '问询', status: 'Approved', approver1_result: '', approver2_result: '', reject_reason: '', created_at: '2026-04-24 09:30' },
  { id: 2, record_id: 'BL-2026-0002', criminal_name: '李某', record_type: '审讯', status: 'Pending', approver1_result: '', approver2_result: '', reject_reason: '', created_at: '2026-04-23 14:20' },
  { id: 3, record_id: 'BL-2026-0003', criminal_name: '王某', record_type: '问询', status: 'Approved', approver1_result: '', approver2_result: '', reject_reason: '', created_at: '2026-04-23 10:00' },
  { id: 4, record_id: 'BL-2026-0004', criminal_name: '赵某', record_type: '问询', status: 'Rejected', approver1_result: '', approver2_result: '', reject_reason: '内容不完整', created_at: '2026-04-22 16:45' },
]

export default function ApprovalsPage() {
  const [records] = useState<ApprovalRecord[]>(mockRecords)

  const pending = records.filter(r => r.status === 'Pending')
  const processed = records.filter(r => r.status !== 'Pending')

  return (
    <div className="page">
      <h1 className="page-title">审批中心</h1>

      {/* 统计卡片 */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="glass-card highlighted">
          <div className="card-icon" style={{ background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.25)' }}>⏳</div>
          <div className="card-title">待审批</div>
          <div className="card-value" style={{ color: 'var(--accent-secondary)' }}>{pending.length}</div>
          <div className="card-subtitle">需要及时处理</div>
        </div>
        <div className="glass-card">
          <div className="card-icon" style={{ background: 'rgba(0,212,170,0.12)', border: '1px solid rgba(0,212,170,0.25)' }}>✅</div>
          <div className="card-title">已通过</div>
          <div className="card-value">{records.filter(r => r.status === 'Approved').length}</div>
          <div className="card-subtitle">本月</div>
        </div>
        <div className="glass-card">
          <div className="card-icon" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>❌</div>
          <div className="card-title">已驳回</div>
          <div className="card-value">{records.filter(r => r.status === 'Rejected').length}</div>
          <div className="card-subtitle">本月</div>
        </div>
      </div>

      {/* 待审批列表 */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--glass-border)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent-secondary)' }}>
            待审批 ({pending.length})
          </h2>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {pending.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 48 }}>暂无待审批项</div>
          )}
          {pending.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '14px 16px', borderBottom: '1px solid var(--glass-border)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="cell-mono" style={{ fontSize: 12 }}>{r.record_id}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{r.criminal_name || '未知'}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.record_type}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                  提交时间：{r.created_at}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="glass-btn primary small">通过</button>
                <button className="glass-btn danger small">驳回</button>
                <button className="glass-btn small">查看</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
