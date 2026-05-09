// ExportPage.tsx — 文档导出（阶段 4：CSV）
import { useEffect, useMemo, useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { exportRecordsCount, exportRecordsCsv, getCasesByPage, getCriminalsByPage } from '../api'
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
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [criminalCode, setCriminalCode] = useState('')
  const [caseNumber, setCaseNumber] = useState('')
  const [criminalHints, setCriminalHints] = useState<Array<{ code: string; name: string }>>([])
  const [caseHints, setCaseHints] = useState<Array<{ case_number: string; title: string }>>([])
  const [exporting, setExporting] = useState(false)
  const [resultInfo, setResultInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const defaultName = useMemo(() => `records_export_${nowStamp()}.csv`, [])

  useEffect(() => {
    if (!isTauri() || !criminalCode.trim()) {
      setCriminalHints([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const [rows] = await getCriminalsByPage(0, 8, criminalCode.trim())
        if (!cancelled) {
          setCriminalHints(
            rows
              .map(r => ({ code: r.criminal_id, name: r.name }))
              .filter(x => x.code.trim().length > 0)
          )
        }
      } catch {
        if (!cancelled) setCriminalHints([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [criminalCode])

  useEffect(() => {
    if (!isTauri() || !caseNumber.trim()) {
      setCaseHints([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const [rows] = await getCasesByPage(0, 8, caseNumber.trim())
        if (!cancelled) {
          setCaseHints(
            rows
              .map(r => ({ case_number: r.case_number, title: r.title }))
              .filter(x => x.case_number.trim().length > 0)
          )
        }
      } catch {
        if (!cancelled) setCaseHints([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [caseNumber])

  const onExport = async () => {
    if (!isTauri()) return
    setExporting(true)
    setError(null)
    setResultInfo(null)
    try {
      const filterPayload = {
        keyword: keyword.trim(),
        status: status.trim(),
        start_date: startDate.trim(),
        end_date: endDate.trim(),
        criminal_code: criminalCode.trim(),
        case_number: caseNumber.trim(),
      }
      const matchedCount = await exportRecordsCount(filterPayload)
      setResultInfo(`当前筛选命中 ${matchedCount} 条记录`)
      if (matchedCount <= 0) {
        setError('当前筛选条件无匹配数据，请调整条件后再导出。')
        return
      }
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
        filterPayload,
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

      <div
        className="glass-panel"
        style={{
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxHeight: '46vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>导出筛选</h2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>关键字（编号 / 服刑人员 / 案号）</span>
          <input className="glass-input" value={keyword} onChange={e => setKeyword(e.target.value)} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>开始日期（record_date）</span>
            <input type="date" className="glass-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>结束日期（record_date）</span>
            <input type="date" className="glass-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>服刑人员编号（精确）</span>
            <input
              className="glass-input"
              value={criminalCode}
              onChange={e => setCriminalCode(e.target.value)}
              list="export-criminal-code-hints"
              placeholder="输入后自动联想"
            />
            <datalist id="export-criminal-code-hints">
              {criminalHints.map(x => (
                <option key={`${x.code}-${x.name}`} value={x.code}>
                  {x.name}
                </option>
              ))}
            </datalist>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>案件案号（精确）</span>
            <input
              className="glass-input"
              value={caseNumber}
              onChange={e => setCaseNumber(e.target.value)}
              list="export-case-number-hints"
              placeholder="输入后自动联想"
            />
            <datalist id="export-case-number-hints">
              {caseHints.map(x => (
                <option key={`${x.case_number}-${x.title}`} value={x.case_number}>
                  {x.title}
                </option>
              ))}
            </datalist>
          </label>
        </div>
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
            setStartDate('')
            setEndDate('')
            setCriminalCode('')
            setCaseNumber('')
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
