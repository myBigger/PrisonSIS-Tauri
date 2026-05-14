// ExportPage.tsx — 文档导出（阶段 4：CSV）
import { useEffect, useMemo, useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { exportRecordsCount, exportRecordsCsv, getCasesByPage, getCriminalsByPage } from '../api'
import type { ExportRecordFilter } from '../api/types'
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

/** 根据关键字与当前联想结果，拆成后端导出筛选字段（精确编号 / 案号优先于模糊关键字） */
function buildExportFilterPayload(
  keywordRaw: string,
  criminalHints: Array<{ code: string; name: string }>,
  caseHints: Array<{ case_number: string; title: string }>,
  status: string,
  startDate: string,
  endDate: string
): ExportRecordFilter {
  const kw = keywordRaw.trim()
  let keyword = ''
  let criminal_code = ''
  let case_number = ''

  if (kw) {
    const matchedCriminal = criminalHints.some(h => h.code.trim() === kw)
    const matchedCase = caseHints.some(h => h.case_number.trim() === kw)
    if (matchedCriminal) {
      criminal_code = kw
    } else if (matchedCase) {
      case_number = kw
    } else {
      keyword = kw
    }
  }

  return {
    keyword,
    status: status.trim(),
    start_date: startDate.trim(),
    end_date: endDate.trim(),
    criminal_code,
    case_number,
  }
}

export default function ExportPage() {
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [criminalHints, setCriminalHints] = useState<Array<{ code: string; name: string }>>([])
  const [caseHints, setCaseHints] = useState<Array<{ case_number: string; title: string }>>([])
  const [exporting, setExporting] = useState(false)
  const [resultInfo, setResultInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const defaultName = useMemo(() => `records_export_${nowStamp()}.csv`, [])

  useEffect(() => {
    if (!isTauri() || !keyword.trim()) {
      setCriminalHints([])
      setCaseHints([])
      return
    }
    const q = keyword.trim()
    let cancelled = false
    ;(async () => {
      try {
        const [[crRows], [caRows]] = await Promise.all([getCriminalsByPage(0, 8, q), getCasesByPage(0, 8, q)])
        if (cancelled) return
        setCriminalHints(
          crRows
            .map(r => ({ code: r.criminal_id, name: r.name }))
            .filter(x => x.code.trim().length > 0)
        )
        setCaseHints(
          caRows
            .map(r => ({ case_number: r.case_number, title: r.title }))
            .filter(x => x.case_number.trim().length > 0)
        )
      } catch {
        if (!cancelled) {
          setCriminalHints([])
          setCaseHints([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [keyword])

  const onExport = async () => {
    if (!isTauri()) return
    setExporting(true)
    setError(null)
    setResultInfo(null)
    try {
      const filterPayload = buildExportFilterPayload(keyword, criminalHints, caseHints, status, startDate, endDate)
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
      const result = await exportRecordsCsv(filterPayload, path)
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
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            关键字（笔录编号 / 服刑人员姓名 / 案号；与联想条完全一致时按编号或案号精确筛选）
          </span>
          <input
            className="glass-input"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            list="export-keyword-hints"
            placeholder="支持模糊；输入后从下拉联想服刑人员编号或案号"
          />
          <datalist id="export-keyword-hints">
            {criminalHints.map(x => (
              <option key={`c-${x.code}`} value={x.code}>
                {x.name}
              </option>
            ))}
            {caseHints.map(x => (
              <option key={`k-${x.case_number}`} value={x.case_number}>
                {x.title}
              </option>
            ))}
          </datalist>
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
          <li>
            Excel：本文件可用 Microsoft Excel、WPS
            表格等直接打开；若用户要求归档为「.xlsx」，在表格软件中使用「另存为」即可转为 Excel 工作簿。
          </li>
          <li>时间：YYYY-MM-DD HH:mm:ss（本地时区）</li>
          <li>保存：系统文件选择器；同名文件允许覆盖</li>
          <li>关键字：默认按笔录编号、服刑人员姓名、案号模糊匹配；从联想中选择或输入内容与联想中的服刑人员编号、案号完全一致时，按该字段精确筛选</li>
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
