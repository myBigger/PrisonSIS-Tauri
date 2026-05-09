// ArchivePage.tsx — 档案管理（阶段 4：仅 criminals 归档，支持管理员取消归档）
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Criminal } from '../api'
import { archiveCriminal, getArchiveCriminalsByPage, unarchiveCriminal } from '../api'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

type Tab = 'active' | 'archived'
const PAGE_SIZE = 20

function getCurrentUserRole(): string {
  try {
    const raw = localStorage.getItem('prisonsis_user')
    if (!raw) return ''
    const obj = JSON.parse(raw) as { role?: string }
    return obj?.role ?? ''
  } catch {
    return ''
  }
}

export default function ArchivePage() {
  const [tab, setTab] = useState<Tab>('active')
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [list, setList] = useState<Criminal[]>([])
  const [loading, setLoading] = useState(false)
  const [actingId, setActingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const userRole = useMemo(() => getCurrentUserRole(), [])
  const isAdmin = userRole === 'Admin'
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const archivedFilter: '' | 'archived' | 'active' = tab

  const loadList = useCallback(async () => {
    if (!isTauri()) {
      setList([])
      setTotal(0)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [rows, count] = await getArchiveCriminalsByPage(
        page,
        PAGE_SIZE,
        appliedSearch,
        archivedFilter
      )
      setList(rows)
      setTotal(count)
    } catch (e) {
      setError(formatInvokeError(e))
      setList([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, appliedSearch, archivedFilter])

  useEffect(() => {
    loadList()
  }, [loadList])

  const onArchive = async (id: number) => {
    if (!isTauri()) return
    setActingId(id)
    try {
      await archiveCriminal(id)
      await loadList()
    } catch (e) {
      alert(formatInvokeError(e))
    } finally {
      setActingId(null)
    }
  }

  const onUnarchive = async (id: number) => {
    if (!isTauri()) return
    setActingId(id)
    try {
      await unarchiveCriminal(id, userRole)
      await loadList()
    } catch (e) {
      alert(formatInvokeError(e))
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">档案管理</h1>

      {!isTauri() && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Web 预览模式：请在 Tauri 桌面端使用归档能力。
        </p>
      )}
      {error && <p style={{ color: 'var(--accent-secondary)', fontSize: 13 }}>{error}</p>}

      <div className="toolbar">
        <button
          type="button"
          className={`glass-btn${tab === 'active' ? ' primary' : ''}`}
          onClick={() => {
            setTab('active')
            setPage(0)
          }}
        >
          在押人员
        </button>
        <button
          type="button"
          className={`glass-btn${tab === 'archived' ? ' primary' : ''}`}
          onClick={() => {
            setTab('archived')
            setPage(0)
          }}
        >
          已归档
        </button>
        <div style={{ flex: 1 }} />
        <div className="search-box">
          <span>🔍</span>
          <input
            type="text"
            value={searchInput}
            placeholder="搜索姓名、编号、案由..."
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setAppliedSearch(searchInput.trim())
                setPage(0)
              }
            }}
          />
        </div>
        <button
          type="button"
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
                <th>编号</th>
                <th>姓名</th>
                <th>罪名</th>
                <th>入监日期</th>
                <th>状态</th>
                <th>操作</th>
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
              {!loading && list.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    {!isTauri() ? '仅桌面端可查库' : '暂无数据'}
                  </td>
                </tr>
              )}
              {!loading &&
                list.map(c => (
                  <tr key={c.id}>
                    <td className="cell-mono">{c.criminal_id}</td>
                    <td>{c.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.crime || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.entry_date || '—'}</td>
                    <td>
                      <span className="cell-status">
                        <span
                          className="status-dot"
                          style={{ background: c.archived ? 'var(--text-muted)' : 'var(--status-online)' }}
                        />
                        <span style={{ color: c.archived ? 'var(--text-muted)' : 'var(--status-online)' }}>
                          {c.archived ? '已归档' : '在押'}
                        </span>
                      </span>
                    </td>
                    <td>
                      {c.archived ? (
                        <button
                          type="button"
                          className="glass-btn small"
                          disabled={!isAdmin || actingId === c.id}
                          title={!isAdmin ? '仅管理员可取消归档' : undefined}
                          onClick={() => onUnarchive(c.id)}
                        >
                          取消归档
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="glass-btn small"
                          disabled={actingId === c.id}
                          onClick={() => onArchive(c.id)}
                        >
                          归档
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          {loading ? '加载中...' : `共 ${total} 条，第 ${page + 1}/${totalPages} 页`}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="glass-btn small"
            disabled={page === 0 || loading}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            上一页
          </button>
          <button
            type="button"
            className="glass-btn small"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  )
}
