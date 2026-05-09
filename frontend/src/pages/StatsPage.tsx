// StatsPage.tsx — 统计分析页面
import { useEffect, useMemo, useState } from 'react'
import { getDashboardStats } from '../api'
import type { DashboardStats } from '../api'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

const MOCK_STATS: DashboardStats = {
  today_records: 3,
  pending_approvals: 12,
  total_criminals: 248,
  total_cases: 56,
  closed_cases: 18,
  active_cases: 38,
  yesterday_delta: 1,
  expired_count: 3,
  month_new_criminals: 7,
  month_new_cases: 3,
  month_records: 63,
  approval_rate: 94.2,
  avg_approval_hours: 2.3,
  archive_rate: 12.4,
  monthly_trends: [
    { month: '2026-01', records: 42, criminals: 38 },
    { month: '2026-02', records: 55, criminals: 45 },
    { month: '2026-03', records: 48, criminals: 41 },
    { month: '2026-04', records: 63, criminals: 52 },
    { month: '2026-05', records: 59, criminals: 49 },
    { month: '2026-06', records: 66, criminals: 55 },
  ],
  crime_distribution: [
    { label: '盗窃罪', count: 86, percent: 34 },
    { label: '故意伤害', count: 45, percent: 18 },
    { label: '诈骗罪', count: 38, percent: 15 },
    { label: '抢劫罪', count: 29, percent: 12 },
    { label: '贩毒罪', count: 22, percent: 9 },
    { label: '其他', count: 34, percent: 13 },
  ],
}

function BarChart({ label, value, max, color, suffix = '' }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const width = max > 0 ? `${Math.max((value / max) * 100, 2)}%` : '0%'
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{label}</span>
        <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{value}{suffix}</span>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width,
          background: color,
          borderRadius: 4,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  )
}

export default function StatsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadStats() {
      try {
        if (isTauri()) {
          const data = await getDashboardStats()
          setStats(data)
        } else {
          setStats(MOCK_STATS)
        }
      } catch (e) {
        setError(String(e))
        setStats(MOCK_STATS)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [])

  const monthly = stats?.monthly_trends ?? []
  const byType = stats?.crime_distribution ?? []
  const maxRecords = useMemo(() => Math.max(1, ...monthly.map(m => m.records)), [monthly])
  const maxCrime = useMemo(() => Math.max(1, ...byType.map(m => m.count)), [byType])

  return (
    <div className="page">
      <h1 className="page-title">统计分析</h1>
      {error && <p className="page-subtitle" style={{ color: 'var(--accent-secondary)' }}>统计加载失败，已显示降级数据：{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>月度笔录趋势（自然月）</h2>
          {(loading ? MOCK_STATS.monthly_trends : monthly).map(m => (
            <div key={m.month} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.month}</span>
                <span style={{ color: 'var(--accent-primary)', fontSize: 13, fontWeight: 600 }}>{m.records} 笔</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                <div style={{
                  height: '100%',
                  width: `${(m.records / maxRecords) * 100}%`,
                  background: 'linear-gradient(90deg, rgba(0,212,170,0.4), var(--accent-primary))',
                  borderRadius: 3,
                }} />
              </div>
            </div>
          ))}
        </div>

        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>罪名分布（默认含历史）</h2>
          {(loading ? MOCK_STATS.crime_distribution : byType).map((item, i) => {
            const colors = ['var(--accent-primary)', '#67E8F9', '#F59E0B', '#8B5CF6', '#EF4444', 'var(--text-secondary)']
            return <BarChart key={item.label} label={item.label} value={item.count} max={maxCrime} color={colors[i % colors.length]} />
          })}
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {[
          { label: '本月笔录', value: loading ? '—' : String(stats?.month_records ?? 0), icon: '📝', accent: 'var(--accent-primary)' },
          { label: '本月新增人员', value: loading ? '—' : String(stats?.month_new_criminals ?? 0), icon: '👤', accent: '#67E8F9' },
          { label: '审批通过率', value: loading ? '—' : `${(stats?.approval_rate ?? 0).toFixed(1)}%`, icon: '✅', accent: 'var(--status-online)' },
          { label: '平均审批时长', value: loading ? '—' : `${(stats?.avg_approval_hours ?? 0).toFixed(1)}h`, icon: '⏱', accent: 'var(--accent-secondary)' },
          { label: '归档率', value: loading ? '—' : `${(stats?.archive_rate ?? 0).toFixed(1)}%`, icon: '🗄', accent: 'var(--accent-purple)' },
        ].map(s => (
          <div key={s.label} className="glass-card">
            <div className="card-icon" style={{ background: s.accent + '15', border: `1px solid ${s.accent}30` }}>
              {s.icon}
            </div>
            <div className="card-title">{s.label}</div>
            <div className="card-value" style={{ fontSize: 24 }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
