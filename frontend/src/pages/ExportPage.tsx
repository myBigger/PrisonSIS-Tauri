// ExportPage.tsx — 文档导出页面
import React, { useState } from 'react'

const formats = [
  { id: 'pdf', label: 'PDF文档', icon: '📄', desc: '适用于打印和存档，格式固定' },
  { id: 'docx', label: 'Word文档', icon: '📝', desc: '适用于二次编辑，可修改格式' },
  { id: 'json', label: 'JSON数据', icon: '📋', desc: '适用于系统对接，数据交换' },
  { id: 'html', label: 'HTML页面', icon: '🌐', desc: '适用于在线预览' },
]

export default function ExportPage() {
  const [selectedFormat, setSelectedFormat] = useState('pdf')
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  return (
    <div className="page">
      <h1 className="page-title">文档导出</h1>

      {/* 导出格式选择 */}
      <div className="glass-panel" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>选择导出格式</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {formats.map(f => (
            <div key={f.id} onClick={() => setSelectedFormat(f.id)}
              style={{
                padding: 16, borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                background: selectedFormat === f.id ? 'rgba(0,212,170,0.08)' : 'rgba(0,0,0,0.2)',
                border: `1px solid ${selectedFormat === f.id ? 'rgba(0,212,170,0.3)' : 'var(--glass-border)'}`,
                transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: selectedFormat === f.id ? 'var(--accent-primary)' : 'var(--text-primary)', marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 导出选项 */}
      <div className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>导出选项</h2>
        {[
          { label: '包含签名信息', checked: true },
          { label: '包含审批意见', checked: true },
          { label: '包含时间戳', checked: true },
          { label: '生成目录页', checked: false },
        ].map(opt => (
          <label key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked={opt.checked}
              style={{ accentColor: 'var(--accent-primary)' }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{opt.label}</span>
          </label>
        ))}
      </div>

      {/* 预览 */}
      <div className="glass-panel" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>已选笔录 (0 份)</h2>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, border: '1px dashed var(--glass-border)', borderRadius: 12 }}>
          从「笔录制作」或「审批中心」选择要导出的笔录
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button className="glass-btn">取消</button>
        <button className="glass-btn primary">开始导出</button>
      </div>
    </div>
  )
}
