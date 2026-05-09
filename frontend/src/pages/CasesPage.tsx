// CasesPage.tsx — 案件管理（阶段 3：对接 SQLite cases）
import { useCallback, useEffect, useState } from 'react'
import type { Case, Record } from '../api'
import { addCase, getCasesByPage, listRecordsByCase, updateCase } from '../api'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

const PAGE_SIZE = 15

const statusLabel = (s: string) =>
  ({
    open: '进行中',
    closed: '已结案',
  }[s] ?? s)

const statusColor = (s: string) => {
  if (s === 'closed') return 'var(--status-online)'
  if (s === 'open') return 'var(--accent-secondary)'
  return 'var(--text-muted)'
}

const recordStatusLabel = (s: string) =>
  ({
    Draft: '草稿',
    Pending: '待审批',
    Approved: '已审批',
    Rejected: '已驳回',
  }[s] ?? s)

export default function CasesPage() {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formCaseNumber, setFormCaseNumber] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formStatus, setFormStatus] = useState('open')
  const [formRemark, setFormRemark] = useState('')
  /** 新建/编辑保存失败时的表单提示（案号重复等） */
  const [formSaveError, setFormSaveError] = useState<string | null>(null)
  const [editingCase, setEditingCase] = useState<Case | null>(null)

  const [viewCase, setViewCase] = useState<Case | null>(null)
  const [linkedRecords, setLinkedRecords] = useState<Record[]>([])
  const [linkedLoading, setLinkedLoading] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadCases = useCallback(async () => {
    if (!isTauri()) {
      setCases([])
      setTotal(0)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [rows, count] = await getCasesByPage(page, PAGE_SIZE, appliedSearch)
      setCases(rows)
      setTotal(count)
    } catch (e) {
      console.error(e)
      setCases([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, appliedSearch])

  useEffect(() => {
    loadCases()
  }, [loadCases])

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ page?: string; search?: string }>
      if (ce.detail?.page !== 'cases') return
      const searchText = (ce.detail?.search || '').trim()
      setSearchInput(searchText)
      setAppliedSearch(searchText)
      setPage(0)
    }
    window.addEventListener('prisonsis:apply-search', handler as EventListener)
    return () => window.removeEventListener('prisonsis:apply-search', handler as EventListener)
  }, [])

  const openCreate = () => {
    setFormMode('create')
    setEditingCase(null)
    setFormCaseNumber('')
    setFormTitle('')
    setFormStatus('open')
    setFormRemark('')
    setFormSaveError(null)
    setFormOpen(true)
  }

  const openEdit = (c: Case) => {
    setFormMode('edit')
    setEditingCase(c)
    setFormCaseNumber(c.case_number)
    setFormTitle(c.title ?? '')
    setFormStatus(c.status?.trim() ? c.status : 'open')
    setFormRemark(c.remark ?? '')
    setFormSaveError(null)
    setFormOpen(true)
  }

  const saveForm = async () => {
    if (!isTauri()) return
    const num = formCaseNumber.trim()
    if (!num) {
      setFormSaveError('案号不能为空')
      return
    }
    setFormSaveError(null)
    try {
      if (formMode === 'create') {
        await addCase({
          case_number: num,
          title: formTitle.trim(),
          status: formStatus,
          remark: formRemark.trim(),
        })
      } else if (editingCase) {
        await updateCase({
          ...editingCase,
          case_number: num,
          title: formTitle.trim(),
          status: formStatus,
          remark: formRemark.trim(),
        })
      }
      setFormOpen(false)
      setFormSaveError(null)
      await loadCases()
    } catch (e) {
      const raw = formatInvokeError(e)
      const dup =
        raw.includes('案号已存在') ||
        raw.toLowerCase().includes('unique') ||
        raw.toLowerCase().includes('constraint failed')
      setFormSaveError(dup ? '案号已存在，请更换其他案号。' : raw)
    }
  }

  const openView = async (c: Case) => {
    setViewCase(c)
    setLinkedRecords([])
    if (!isTauri()) return
    setLinkedLoading(true)
    try {
      const list = await listRecordsByCase(c.id)
      setLinkedRecords(list)
    } catch (e) {
      console.error(e)
      setLinkedRecords([])
    } finally {
      setLinkedLoading(false)
    }
  }

  const handleSearch = () => {
    setAppliedSearch(searchInput.trim())
    setPage(0)
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title">案件管理</h1>
        <button type="button" className="glass-btn primary" onClick={openCreate} disabled={!isTauri()}>
          + 新建案件
        </button>
      </div>

      {!isTauri() && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Web 预览模式：请在 Tauri 桌面端使用案件管理。</p>
      )}

      <div className="toolbar" style={{ marginTop: 8 }}>
        <div className="search-box">
          <span>🔍</span>
          <input
            type="text"
            placeholder="搜索案号、标题、备注..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <button type="button" className="glass-btn" onClick={handleSearch} disabled={!isTauri()}>
          搜索
        </button>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>案号</th>
                <th>标题</th>
                <th>状态</th>
                <th>备注</th>
                <th>创建时间</th>
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
              {!loading && cases.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    {!isTauri() ? '仅桌面端可查库' : '暂无案件'}
                  </td>
                </tr>
              )}
              {!loading &&
                cases.map(c => (
                  <tr key={c.id}>
                    <td className="cell-mono">{c.case_number}</td>
                    <td style={{ color: 'var(--text-primary)' }}>{c.title || '—'}</td>
                    <td>
                      <span className="cell-status">
                        <span className="status-dot" style={{ background: statusColor(c.status) }} />
                        <span style={{ color: statusColor(c.status) }}>{statusLabel(c.status)}</span>
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 220 }}>
                      {(c.remark || '').slice(0, 80)}
                      {(c.remark || '').length > 80 ? '…' : ''}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.created_at || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="glass-btn small" disabled={!isTauri()} onClick={() => openView(c)}>
                          查看
                        </button>
                        <button type="button" className="glass-btn small" disabled={!isTauri()} onClick={() => openEdit(c)}>
                          编辑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {isTauri() && (
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
        )}
      </div>

      {formOpen && (
        <div
          className="record-modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            setFormSaveError(null)
            setFormOpen(false)
          }}
        >
          <div className="record-modal" style={{ maxWidth: 520 }} onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>{formMode === 'create' ? '新建案件' : '编辑案件'}</h2>
              </div>
              <button
                type="button"
                className="record-modal__close"
                aria-label="关闭"
                onClick={() => {
                  setFormSaveError(null)
                  setFormOpen(false)
                }}
              >
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <div className="record-modal__grid">
                <label className="record-modal__field record-modal__field--full">
                  <span>案号</span>
                  <input
                    className="glass-input"
                    value={formCaseNumber}
                    onChange={e => {
                      setFormCaseNumber(e.target.value)
                      setFormSaveError(null)
                    }}
                    aria-invalid={Boolean(formSaveError)}
                    aria-describedby={formSaveError ? 'case-form-case-number-error' : undefined}
                  />
                  {formSaveError ? (
                    <p id="case-form-case-number-error" role="alert" style={{ color: 'var(--accent-red)', fontSize: 12, margin: '6px 0 0' }}>
                      {formSaveError}
                    </p>
                  ) : null}
                </label>
                <label className="record-modal__field record-modal__field--full">
                  <span>标题</span>
                  <input className="glass-input" value={formTitle} onChange={e => setFormTitle(e.target.value)} />
                </label>
                <label className="record-modal__field">
                  <span>状态</span>
                  <select className="glass-input glass-input--select" value={formStatus} onChange={e => setFormStatus(e.target.value)}>
                    <option value="open">进行中</option>
                    <option value="closed">已结案</option>
                  </select>
                </label>
                <label className="record-modal__field record-modal__field--full">
                  <span>备注</span>
                  <textarea className="glass-input glass-textarea" rows={3} value={formRemark} onChange={e => setFormRemark(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="record-modal__footer">
              <button
                type="button"
                className="glass-btn"
                onClick={() => {
                  setFormSaveError(null)
                  setFormOpen(false)
                }}
              >
                取消
              </button>
              <button type="button" className="glass-btn primary" onClick={() => saveForm()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {viewCase && (
        <div className="record-modal-backdrop" role="presentation" onMouseDown={() => setViewCase(null)}>
          <div className="record-modal" style={{ maxWidth: 720 }} onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>案件详情</h2>
                <div className="record-modal__meta">案号：{viewCase.case_number}</div>
                <div className="record-modal__meta">标题：{viewCase.title || '—'}</div>
                <div className="record-modal__meta" style={{ marginTop: 4 }}>
                  状态：
                  <span style={{ color: statusColor(viewCase.status) }}>{statusLabel(viewCase.status)}</span>
                </div>
                {viewCase.remark ? (
                  <div className="record-modal__hint" style={{ marginTop: 8 }}>
                    备注：{viewCase.remark}
                  </div>
                ) : null}
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={() => setViewCase(null)}>
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <div className="record-modal__section-title">关联笔录</div>
              {linkedLoading ? (
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>加载中...</p>
              ) : linkedRecords.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>暂无关联笔录（草稿中可选择本案）。</p>
              ) : (
                <div style={{ overflow: 'auto', maxHeight: 280 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>笔录编号</th>
                        <th>服刑人员</th>
                        <th>类型</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedRecords.map(r => (
                        <tr key={r.id}>
                          <td className="cell-mono">{r.record_id}</td>
                          <td>{r.criminal_name || '—'}</td>
                          <td>{r.record_type}</td>
                          <td>{recordStatusLabel(r.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="record-modal__footer">
              <button type="button" className="glass-btn" onClick={() => setViewCase(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
