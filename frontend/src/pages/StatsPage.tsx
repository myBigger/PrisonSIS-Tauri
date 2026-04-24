// StatsPage.tsx — 统计分析页面
import React from 'react'

const mockData = {
  monthly: [
    { month: '1月', records: 42, criminals: 38 },
    { month: '2月', records: 55, criminals: 45 },
    { month: '3月', records: 48, criminals: 41 },
    { month: '4月', records: 63, criminals: 52 },
  ],
  byType: [
    { label: '盗窃罪', count: 86, percent: 34 },
    { label: '故意伤害', count: 45, percent: 18 },
    { label: '诈骗罪', count: 38, percent: 15 },
    { label: '抢劫罪', count: 29, percent: 12 },
    { label: '贩毒罪', count: 22, percent: 9 },
    { label: '其他', count: 34, percent: 13 },
  ],
}

function BarChart({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{label}</span>
        <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{value}</span>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${(value / max) * 100}%`,
          background: color, borderRadius: 4,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  )
}

export default function StatsPage() {
  const maxRecords = Math.max(...mockData.monthly.map(m => m.records))

  return (
    <div className="page">
      <h1 className="page-title">统计分析</h1>

      {/* 月度趋势 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 月度笔录趋势 */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>月度笔录趋势</h2>
          {mockData.monthly.map(m => (
            <div key={m.month} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.month}</span>
                <span style={{ color: 'var(--accent-primary)', fontSize: 13, fontWeight: 600 }}>{m.records} 笔</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                <div style={{
                  height: '100%', width: `${(m.records / maxRecords) * 100}%`,
                  background: 'linear-gradient(90deg, rgba(0,212,170,0.4), var(--accent-primary))',
                  borderRadius: 3,
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* 罪名分布 */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>罪名分布</h2>
          {mockData.byType.map((item, i) => {
            const colors = ['var(--accent-primary)', '#67E8F9', '#F59E0B', '#8B5CF6', '#EF4444', 'var(--text-secondary)']
            return <BarChart key={item.label} label={item.label} value={item.count} max={100} color={colors[i]} />
          })}
        </div>
      </div>

      {/* 综合统计 */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {[
          { label: '本月笔录', value: '63', icon: '📝', accent: 'var(--accent-primary)' },
          { label: '本月新增人员', value: '52', icon: '👤', accent: '#67E8F9' },
          { label: '审批通过率', value: '94.2%', icon: '✅', accent: 'var(--status-online)' },
          { label: '平均审批时长', value: '2.3h', icon: '⏱', accent: 'var(--accent-secondary)' },
          { label: '归档率', value: '87.6%', icon: '🗄', accent: 'var(--accent-purple)' },
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
