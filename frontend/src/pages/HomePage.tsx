// HomePage.tsx — 首页仪表盘
import { useEffect, useState } from 'react'
import { getDashboardStats, getRecentRecords } from '../api'
import type { DashboardStats, Record } from '../api'
import RecordViewModal from '../components/RecordViewModal'

// 模拟数据（开发预览用）
const MOCK_STATS: DashboardStats = {
  today_records: 3, pending_approvals: 12, total_criminals: 248,
  total_cases: 56, closed_cases: 18, active_cases: 38, yesterday_delta: 1, expired_count: 3,
  month_new_criminals: 7, month_new_cases: 3,
  month_records: 63, approval_rate: 94.2, avg_approval_hours: 2.3, archive_rate: 12.4,
  monthly_trends: [
    { month: '2026-01', records: 42, criminals: 38 },
    { month: '2026-02', records: 55, criminals: 45 },
  ],
  crime_distribution: [
    { label: '盗窃罪', count: 86, percent: 34.0 },
    { label: '故意伤害', count: 45, percent: 18.0 },
  ],
}

const MOCK_RECORDS: Record[] = [
  { id:1, record_id:'BL-2026-0001', record_type:'问询', criminal_id:1, criminal_name:'张某', record_date:'2026-04-24 09:30', record_location:'审讯室A', status:'Approved', interrogator_id:'', recorder_id:'', present_persons:'', content:'', content_encrypted:false, signed_interrogator:false, signed_recorder:false, signed_subject:false, approver1_id:'', approver2_id:'', approver1_result:'', approver2_result:'', reject_reason:'', created_at:'' },
  { id:2, record_id:'BL-2026-0002', record_type:'审讯', criminal_id:2, criminal_name:'李某', record_date:'2026-04-23 14:20', record_location:'审讯室B', status:'Pending', interrogator_id:'', recorder_id:'', present_persons:'', content:'', content_encrypted:false, signed_interrogator:false, signed_recorder:false, signed_subject:false, approver1_id:'', approver2_id:'', approver1_result:'', approver2_result:'', reject_reason:'', created_at:'' },
  { id:3, record_id:'BL-2026-0003', record_type:'问询', criminal_id:3, criminal_name:'王某', record_date:'2026-04-23 10:00', record_location:'审讯室A', status:'Approved', interrogator_id:'', recorder_id:'', present_persons:'', content:'', content_encrypted:false, signed_interrogator:false, signed_recorder:false, signed_subject:false, approver1_id:'', approver2_id:'', approver1_result:'', approver2_result:'', reject_reason:'', created_at:'' },
  { id:4, record_id:'BL-2026-0004', record_type:'问询', criminal_id:4, criminal_name:'赵某', record_date:'2026-04-22 16:45', record_location:'审讯室C', status:'Approved', interrogator_id:'', recorder_id:'', present_persons:'', content:'', content_encrypted:false, signed_interrogator:false, signed_recorder:false, signed_subject:false, approver1_id:'', approver2_id:'', approver1_result:'', approver2_result:'', reject_reason:'', created_at:'' },
  { id:5, record_id:'BL-2026-0005', record_type:'审讯', criminal_id:5, criminal_name:'刘某', record_date:'2026-04-22 09:00', record_location:'审讯室A', status:'Draft', interrogator_id:'', recorder_id:'', present_persons:'', content:'', content_encrypted:false, signed_interrogator:false, signed_recorder:false, signed_subject:false, approver1_id:'', approver2_id:'', approver1_result:'', approver2_result:'', reject_reason:'', created_at:'' },
]

const statusColor = (s: string) => {
  if (s === 'Approved') return 'var(--status-online)'
  if (s === 'Pending') return 'var(--accent-secondary)'
  return 'var(--text-muted)'
}

const statusLabel = (s: string) => {
  if (s === 'Approved') return '已审批'
  if (s === 'Pending') return '待审批'
  if (s === 'Draft') return '草稿'
  return s
}

// 检测是否运行在 Tauri 环境
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

export default function HomePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [records, setRecords] = useState<Record[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('用户')
  const [viewOpen, setViewOpen] = useState(false)
  const [viewRecordId, setViewRecordId] = useState<number | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('prisonsis_user')
      if (raw) {
        const u = JSON.parse(raw) as { real_name?: string; username?: string; role?: string }
        const name = (u.real_name || u.username || '').trim()
        setDisplayName(name || (u.role === 'Admin' ? '管理员' : '用户'))
      }
    } catch {
      // ignore parse errors; keep default display name
    }

    async function loadData() {
      try {
        if (isTauri()) {
          // Tauri 模式：从 Rust 后端加载
          const [statsData, recordsData] = await Promise.all([
            getDashboardStats(),
            getRecentRecords(10),
          ])
          setStats(statsData)
          setRecords(recordsData)
        } else {
          // Web 预览模式：使用模拟数据
          setStats(MOCK_STATS)
          setRecords(MOCK_RECORDS)
        }
      } catch (e) {
        console.error('加载数据失败:', e)
        setError(String(e))
        // 降级到模拟数据
        setStats(MOCK_STATS)
        setRecords(MOCK_RECORDS)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const openView = (id: number) => {
    if (!isTauri()) return
    setViewRecordId(id)
    setViewOpen(true)
  }

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  return (
    <div className="page">
      <div>
        <h1 className="page-title">你好，{displayName} 👋</h1>
        <p className="page-subtitle">
          今天是 {today}
          {error && <span style={{ color: 'var(--accent-secondary)', marginLeft: 12 }}>({error})</span>}
        </p>
      </div>

      <div className="stats-grid">
        {[
          {
            title: '今日笔录', value: stats?.today_records ?? 0,
            sub: stats && stats.yesterday_delta > 0 ? `较昨日 +${stats.yesterday_delta}` : '',
            icon: '📝', accent: 'rgba(0,212,170,0.12)', border: 'rgba(0,212,170,0.25)',
          },
          {
            title: '待审批', value: stats?.pending_approvals ?? 0,
            sub: stats && stats.expired_count > 0 ? `${stats.expired_count} 条逾期` : '无逾期',
            icon: '✅', accent: 'rgba(245,166,35,0.12)', border: 'rgba(245,166,35,0.25)',
            accentColor: 'var(--accent-secondary)',
          },
          {
            title: '涉案人员', value: stats?.total_criminals ?? 0,
            sub: `本月新增 ${stats?.month_new_criminals ?? 0}`,
            icon: '👤', accent: 'rgba(103,232,249,0.12)', border: 'rgba(103,232,249,0.25)',
          },
          {
            title: '案件总数', value: stats?.total_cases ?? 0,
            sub: `已结案 ${stats?.closed_cases ?? 0} / 在办 ${stats?.active_cases ?? 0}`,
            icon: '📁', accent: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)',
          },
        ].map((s, i) => (
          <div key={i} className="glass-card highlighted">
            <div className="card-icon" style={{ background: s.accent, border: `1px solid ${s.border}` }}>
              {s.icon}
            </div>
            <div className="card-title">{s.title}</div>
            <div className="card-value">{loading ? '—' : s.value}</div>
            <div className="card-subtitle" style={s.accentColor ? { color: s.accentColor } : {}}>
              {loading ? '' : s.sub}
            </div>
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--glass-border)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>近期笔录</h2>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>编号</th><th>案件</th><th>被审讯人</th><th>审讯类型</th>
                <th>时间</th><th>地点</th><th>状态</th><th className="data-table__col--actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td className="cell-mono">{r.record_id}</td>
                  <td>{r.case_number?.trim() ? r.case_number : '—'}</td>
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
                  <td className="data-table__col--actions">
                    <button type="button" className="glass-btn small" disabled={!isTauri()} onClick={() => openView(r.id)}>
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <RecordViewModal
        open={viewOpen}
        recordId={viewRecordId ?? undefined}
        onClose={() => {
          setViewOpen(false)
          setViewRecordId(null)
        }}
        zIndex={2400}
      />
    </div>
  )
}
