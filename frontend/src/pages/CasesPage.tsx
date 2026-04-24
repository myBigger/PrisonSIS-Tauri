// CasesPage.tsx — 案件管理页面
import React, { useState } from 'react'

const mockCases = [
  { id: 1, caseNumber: '2026-JA-0042', name: '张某盗窃案', type: '盗窃罪', status: '调查中', handler: '王警官', date: '2026-04-10' },
  { id: 2, caseNumber: '2026-JA-0038', name: '李某伤害案', type: '故意伤害', status: '待审判', handler: '李警官', date: '2026-03-28' },
  { id: 3, caseNumber: '2026-JA-0031', name: '王某诈骗案', type: '诈骗罪', status: '调查中', handler: '张警官', date: '2026-03-15' },
  { id: 4, caseNumber: '2026-JA-0025', name: '赵某抢劫案', type: '抢劫罪', status: '已结案', handler: '刘警官', date: '2026-03-01' },
]

const statusColor = (s: string) => {
  if (s === '调查中') return 'var(--accent-secondary)'
  if (s === '待审判') return 'var(--accent-purple)'
  if (s === '已结案') return 'var(--status-online)'
  return 'var(--text-muted)'
}

export default function CasesPage() {
  const [cases] = useState(mockCases)

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">案件管理</h1>
        <button className="glass-btn primary">+ 新建案件</button>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>案号</th>
                <th>案件名称</th>
                <th>案件类型</th>
                <th>承办人</th>
                <th>立案日期</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id}>
                  <td className="cell-mono">{c.caseNumber}</td>
                  <td style={{ color: 'var(--text-primary)' }}>{c.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.type}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.handler}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.date}</td>
                  <td>
                    <span className="cell-status">
                      <span className="status-dot" style={{ background: statusColor(c.status) }} />
                      <span style={{ color: statusColor(c.status) }}>{c.status}</span>
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="glass-btn small">查看</button>
                      <button className="glass-btn small">编辑</button>
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
