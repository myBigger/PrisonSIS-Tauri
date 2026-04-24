// BackupPage.tsx — 数据备份页面
import React, { useState } from 'react'

const backupHistory = [
  { id: 1, name: '完整备份-20260424', type: '完整', size: '128.5 MB', records: 1248, time: '2026-04-24 02:00', status: '成功' },
  { id: 2, name: '增量备份-20260423', type: '增量', size: '12.3 MB', records: 15, time: '2026-04-23 02:00', status: '成功' },
  { id: 3, name: '增量备份-20260422', type: '增量', size: '8.7 MB', records: 9, time: '2026-04-22 02:00', status: '成功' },
  { id: 4, name: '完整备份-20260415', type: '完整', size: '126.1 MB', records: 1198, time: '2026-04-15 02:00', status: '成功' },
]

export default function BackupPage() {
  const [backingUp, setBackingUp] = useState(false)

  const handleBackup = () => {
    setBackingUp(true)
    setTimeout(() => setBackingUp(false), 3000)
  }

  return (
    <div className="page">
      <h1 className="page-title">数据备份</h1>

      {/* 操作卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="glass-panel highlighted" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💾</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>立即备份</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>创建完整数据库备份</div>
          <button className="glass-btn primary" onClick={handleBackup} disabled={backingUp}>
            {backingUp ? '备份中...' : '开始备份'}
          </button>
        </div>

        <div className="glass-panel" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏰</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>自动备份</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>每日凌晨 2:00 自动备份</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'var(--status-online)', fontSize: 12 }}>● 已启用</span>
            <button className="glass-btn small">设置</button>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>☁️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>云端同步</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>备份到云存储（待配置）</div>
          <button className="glass-btn" disabled>配置</button>
        </div>
      </div>

      {/* 备份历史 */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--glass-border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>备份历史</h2>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>备份名称</th><th>类型</th><th>大小</th><th>笔录数</th><th>备份时间</th><th>状态</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {backupHistory.map(b => (
                <tr key={b.id}>
                  <td style={{ color: 'var(--text-primary)' }}>{b.name}</td>
                  <td>
                    <span style={{
                      background: b.type === '完整' ? 'rgba(0,212,170,0.1)' : 'rgba(245,166,35,0.1)',
                      color: b.type === '完整' ? 'var(--accent-primary)' : 'var(--accent-secondary)',
                      borderRadius: 4, padding: '2px 8px', fontSize: 11
                    }}>{b.type}</span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{b.size}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{b.records}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{b.time}</td>
                  <td>
                    <span className="cell-status">
                      <span className="status-dot" style={{ background: b.status === '成功' ? 'var(--status-online)' : 'var(--accent-red)' }} />
                      <span style={{ color: b.status === '成功' ? 'var(--status-online)' : 'var(--accent-red)' }}>{b.status}</span>
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="glass-btn small">下载</button>
                      <button className="glass-btn small">恢复</button>
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
