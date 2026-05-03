// ExportPage.tsx — 文档导出（阶段 4：CSV）
import { useMemo, useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { exportRecordsCsv } from '../api'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'Draft', label: '草稿' },
  { value: 'Pending', label: '待审批' },
  { value: 'Approved', label: '已审批' },
  { value: 'Rejected', label: '已驳回' },
]

function nowStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export default function ExportPage() {
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [exporting, setExporting] = useState(false)
  const [resultInfo, setResultInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const defaultName = useMemo(() => `records_export_${nowStamp()}.csv`, [])

  const onExport = async () => {
    if (!isTauri()) return
    setExporting(true)
    setError(null)
    setResultInfo(null)
    try {
      const path = await save({
        title: '选择导出位置（CSV）',
        defaultPath: defaultName,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (!path) {
        setExporting(false)
        return
      }
      const result = await exportRecordsCsv(
        {
          keyword: keyword.trim(),
          status: status.trim(),
        },
        path
      )
      setResultInfo(`导出成功：${result.exported_count} 条，文件：${result.file_path}`)
    } catch (e) {
      setError(formatInvokeError(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">文档导出</h1>

      {!isTauri() && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Web 预览模式：请在 Tauri 桌面端使用系统文件选择器导出 CSV。
        </p>
      )}

      <div className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>导出筛选</h2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>关键字（编号 / 服刑人员 / 案号）</span>
          <input className="glass-input" value={keyword} onChange={e => setKeyword(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>状态</span>
          <select className="glass-input glass-input--select" value={status} onChange={e => setStatus(e.target.value)}>
            {statusOptions.map(s => (
              <option key={s.value || 'all'} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="glass-panel" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>导出说明</h2>
        <ul style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
          <li>格式：CSV（UTF-8 with BOM）</li>
          <li>时间：YYYY-MM-DD HH:mm:ss（本地时区）</li>
          <li>保存：系统文件选择器；同名文件允许覆盖</li>
        </ul>
      </div>

      {resultInfo && <p style={{ color: 'var(--status-online)', fontSize: 13 }}>{resultInfo}</p>}
      {error && <p style={{ color: 'var(--accent-secondary)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button
          type="button"
          className="glass-btn"
          onClick={() => {
            setKeyword('')
            setStatus('')
            setResultInfo(null)
            setError(null)
          }}
        >
          重置
        </button>
        <button type="button" className="glass-btn primary" disabled={!isTauri() || exporting} onClick={onExport}>
          {exporting ? '导出中...' : '导出 CSV'}
        </button>
      </div>
    </div>
  )
}
