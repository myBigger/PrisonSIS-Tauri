// LogsPage.tsx — 日志审计页面（阶段 5C：真数据）
import { useCallback, useEffect, useRef, useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import type { AuditLog } from '../api'
import { clearLogs, exportLogsCsv, getLogsByPage } from '../api'
import { formatInvokeError } from '../lib/invokeError'
import {
  formatLogDetailForDisplay,
  localizeLogAction,
  localizeLogTargetType,
  normalizeLogSearchKeyword,
} from '../lib/logI18n'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

const actionColor = (a: string) => {
  if (a.includes('登录') || a.includes('登出')) return 'var(--accent-primary)'
  if (a.includes('新增') || a.includes('创建')) return 'var(--status-online)'
  if (a.includes('审批') || a.includes('通过')) return 'var(--accent-purple)'
  if (a.includes('删除') || a.includes('驳回')) return 'var(--accent-red)'
  return 'var(--text-secondary)'
}

function readStoredRole(): string {
  try {
    const raw = localStorage.getItem('prisonsis_user')
    if (!raw) return ''
    const user = JSON.parse(raw) as { role?: string }
    return (user.role || '').trim()
  } catch {
    return ''
  }
}

export default function LogsPage() {
  const PAGE_SIZE = 20
  const currentRole = readStoredRole()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const backendSearch = normalizeLogSearchKeyword(appliedSearch)
  const canExportLogs = currentRole === 'Admin' || currentRole === 'Auditor'
  const canClearLogs = currentRole === 'Admin'

  /** 合并同参数的并发 load，避免 React StrictMode 双次 effect 触发两次 IPC */
  const loadLogsInflightRef = useRef<{ key: string; promise: Promise<void> } | null>(null)

  const loadLogs = useCallback(async () => {
    if (!isTauri()) {
      setLogs([])
      setTotal(0)
      setLoading(false)
      return
    }
    const key = `${page}|${backendSearch}|${startDate}|${endDate}`
    const inflight = loadLogsInflightRef.current
    if (inflight?.key === key) {
      await inflight.promise
      return
    }
    const promise = (async () => {
      setLoading(true)
      setError(null)
      try {
        const [rows, count] = await getLogsByPage(page, PAGE_SIZE, backendSearch, startDate, endDate)
        setLogs(rows)
        setTotal(count)
      } catch (e) {
        setError(formatInvokeError(e))
        setLogs([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    })()
    loadLogsInflightRef.current = { key, promise }
    try {
      await promise
    } finally {
      if (loadLogsInflightRef.current?.promise === promise) {
        loadLogsInflightRef.current = null
      }
    }
  }, [page, backendSearch, startDate, endDate])

  /** StrictMode 会先卸载再挂载：cleanup 取消首次 scheduled 调用，仅保留最后一次 effect 触发的拉取 */
  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadLogs()
    }, 0)
    return () => window.clearTimeout(id)
  }, [loadLogs])

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ page?: string; search?: string }>
      if (ce.detail?.page !== 'logs') return
      const searchText = (ce.detail?.search || '').trim()
      setSearchInput(searchText)
      setAppliedSearch(searchText)
      setPage(0)
    }
    window.addEventListener('prisonsis:apply-search', handler as EventListener)
    return () => window.removeEventListener('prisonsis:apply-search', handler as EventListener)
  }, [])

  const doExportLogs = async () => {
    if (!isTauri() || !canExportLogs) {
      setError('无权限执行该操作')
      return
    }
    setActing(true)
    try {
      const path = await save({
        title: '选择导出日志位置（CSV）',
        defaultPath: `logs_export_${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (!path) return
      const result = await exportLogsCsv(backendSearch, startDate, endDate, path)
      setError(null)
      alert(`导出完成：${result.exported_count} 条`)
    } catch (e) {
      setError(formatInvokeError(e))
    } finally {
      setActing(false)
    }
  }

  /** Tauri WebView 下 window.confirm 常不可靠，改用页面内二次确认 */
  const openClearLogsDialog = () => {
    if (!isTauri() || !canClearLogs) {
      setError('无权限执行该操作')
      return
    }
    setClearDialogOpen(true)
  }

  const executeClearLogs = async () => {
    setClearDialogOpen(false)
    if (!isTauri() || !canClearLogs) return
    setActing(true)
    try {
      const deleted = await clearLogs()
      setError(null)
      alert(`已清空 ${deleted} 条日志`)
      setPage(0)
      await loadLogs()
    } catch (e) {
      setError(formatInvokeError(e))
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">日志审计</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="glass-btn"
            disabled={!isTauri() || acting || !canExportLogs}
            onClick={() => void doExportLogs()}
            title={!canExportLogs ? '当前角色无导出权限' : ''}
          >
            导出日志
          </button>
          <button
            className="glass-btn danger"
            disabled={!isTauri() || acting || !canClearLogs}
            onClick={() => openClearLogsDialog()}
            title={
              !canClearLogs
                ? '仅管理员可清空日志'
                : '清空除「清空留痕」外的历史日志，需二次确认'
            }
          >
            清空日志
          </button>
        </div>
      </div>

      {!isTauri() && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Web 预览模式：请在 Tauri 桌面端使用日志审计。</p>
      )}
      {error && <p style={{ color: 'var(--accent-secondary)', fontSize: 13 }}>{error}</p>}

      <div className="toolbar" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="search-box" style={{ width: 320 }}>
          <span>🔍</span>
          <input
            type="text"
            placeholder="搜索用户、动作、模块..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setAppliedSearch(searchInput.trim())
                setPage(0)
              }
            }}
          />
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>开始日期</span>
          <input type="date" className="glass-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>结束日期</span>
          <input type="date" className="glass-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </label>
        <button
          className="glass-btn"
          onClick={() => {
            setAppliedSearch(searchInput.trim())
            setPage(0)
          }}
        >
          搜索
        </button>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>时间</th><th>用户</th><th>操作</th><th>模块</th>
                <th className="data-table__detail-col">详情</th>
                <th>IP地址</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    加载中...
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    {!isTauri() ? '仅桌面端可查库' : '暂无日志'}
                  </td>
                </tr>
              )}
              {!loading && logs.map(l => {
                const actionText = localizeLogAction(l.action)
                const targetTypeText = localizeLogTargetType(l.target_type)
                const detailText = formatLogDetailForDisplay(l.detail)
                return (
                  <tr key={l.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{l.created_at || '—'}</td>
                    <td style={{ color: 'var(--accent-primary)' }}>{l.user_id || '—'}</td>
                    <td>
                      <span style={{ color: actionColor(actionText), fontSize: 13 }}>{actionText}</span>
                    </td>
                    <td>
                      <span style={{
                        background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'var(--text-secondary)'
                      }}>{targetTypeText}</span>
                    </td>
                    <td
                      className="data-table__detail-cell"
                      style={{ color: 'var(--text-secondary)', fontSize: 12 }}
                      title={detailText}
                    >
                      {detailText}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{l.ip_address || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--glass-border)',
          display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)'
        }}>
          {loading ? '加载中...' : `共 ${total} 条，第 ${page + 1}/${totalPages} 页`}
          <div style={{ flex: 1 }} />
          <button
            className="glass-btn small"
            disabled={page === 0 || loading}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            上一页
          </button>
          <button
            className="glass-btn small"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          >
            下一页
          </button>
        </div>
      </div>

      {clearDialogOpen && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setClearDialogOpen(false)}
          onKeyDown={e => {
            if (e.key === 'Escape') setClearDialogOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-log-dialog-title"
            className="glass-panel"
            style={{ maxWidth: 420, width: '100%', padding: '20px 22px' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 id="clear-log-dialog-title" className="page-title" style={{ fontSize: 18, marginBottom: 12 }}>
              确认清空日志？
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55, marginBottom: 20 }}>
              将删除数据库中的大部分审计日志，仅保留本次「清空」操作的留痕记录。此操作不可撤销，请先自行导出备份。
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="glass-btn" onClick={() => setClearDialogOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="glass-btn danger"
                disabled={acting}
                onClick={() => void executeClearLogs()}
              >
                {acting ? '处理中…' : '确定清空'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
