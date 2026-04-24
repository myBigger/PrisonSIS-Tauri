// TemplatesPage.tsx — 模板管理页面
import { useState } from 'react'

const templates = [
  { id: 'TM-01', name: '入监笔录标准模板', type: 'RT-01', status: '启用', version: 'v1.0', updated: '2026-01-15' },
  { id: 'TM-02', name: '问询笔录模板', type: 'RT-02', status: '启用', version: 'v1.2', updated: '2026-02-20' },
  { id: 'TM-03', name: '提审笔录模板', type: 'RT-03', status: '启用', version: 'v1.0', updated: '2026-01-10' },
  { id: 'TM-04', name: '释放笔录模板', type: 'RT-04', status: '草稿', version: 'v0.9', updated: '2026-03-05' },
]


export default function TemplatesPage() {
  const [tpls] = useState(templates)

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">模板管理</h1>
        <button className="glass-btn primary">+ 新建模板</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {tpls.map(t => (
          <div key={t.id} className="glass-panel" style={{ padding: 20, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,212,170,0.3)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-border)'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span className="cell-mono" style={{ fontSize: 11 }}>{t.id}</span>
                  <span style={{
                    background: t.status === '启用' ? 'rgba(34,197,94,0.12)' : 'rgba(245,166,35,0.12)',
                    color: t.status === '启用' ? 'var(--status-online)' : 'var(--accent-secondary)',
                    borderRadius: 4, padding: '2px 8px', fontSize: 11
                  }}>{t.status}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>类型: {t.type} | 版本: {t.version}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>更新: {t.updated}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="glass-btn small">预览</button>
                <button className="glass-btn small">编辑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
