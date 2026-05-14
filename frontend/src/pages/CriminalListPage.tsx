// CriminalListPage.tsx — 罪犯信息列表页
import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import { addCriminal, getCriminalsByPage, updateCriminal } from '../api'
import type { Criminal } from '../api'
import { formatInvokeError } from '../lib/invokeError'
const PAGE_SIZE = 20

// 检测是否运行在 Tauri 环境
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

type StatusFilter = '' | 'active' | 'archived'

type CriminalDraft = Omit<Criminal, 'id' | 'created_at'>

const GENDER_OPTIONS = ['男', '女'] as const

const DISTRICT_OPTIONS = [
  '一监区',
  '二监区',
  '三监区',
  '四监区',
  '五监区',
  '六监区',
  '七监区',
  '八监区',
  '九监区',
  '十监区',
  '十一监区',
  '十二监区',
  '医院监区',
  '十四监区',
  '十五监区',
  '十六监区',
] as const

function dashText(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  const s = typeof v === 'number' ? String(v) : v.trim()
  return s ? s : '—'
}

function CriminalViewProfile({
  c,
  normalizeEntryDate,
}: {
  c: Criminal
  normalizeEntryDate: (raw: string) => string
}) {
  const entryRaw = normalizeEntryDate(c.entry_date || '')
  const entryDisplay = entryRaw ? entryRaw.replace(/-/g, '/') : '—'
  const sentenceParts: string[] = []
  if (c.sentence_years > 0) sentenceParts.push(`${c.sentence_years} 年`)
  if (c.sentence_months > 0) sentenceParts.push(`${c.sentence_months} 月`)
  const sentence = sentenceParts.length > 0 ? sentenceParts.join(' ') : '—'

  const Row = ({ label, children, wide, mono }: { label: string; children: ReactNode; wide?: boolean; mono?: boolean }) => (
    <div className={`criminal-view-item${wide ? ' criminal-view-item--wide' : ''}`}>
      <div className="criminal-view-item__label">{label}</div>
      <div className={`criminal-view-item__value${mono ? ' criminal-view-item__value--mono' : ''}`}>{children}</div>
    </div>
  )

  const extraBits = [
    c.case_number?.trim(),
    c.remark?.trim(),
    c.handler_id?.trim(),
    c.birth_date?.trim(),
    c.native_place?.trim(),
    c.education?.trim(),
    c.original_court?.trim(),
    (c.manage_level || '').trim() && (c.manage_level || '').trim() !== '普通' ? c.manage_level : '',
  ].some(Boolean)

  return (
    <div className="criminal-view-profile">
      <div className="criminal-view-hero">
        <div className="criminal-view-hero__top">
          <div className="criminal-view-hero__name">{dashText(c.name)}</div>
          <div className={`criminal-view-status criminal-view-status--${c.archived ? 'archived' : 'active'}`}>
            <span className="criminal-view-status__dot" />
            {c.archived ? '归档' : '在押'}
          </div>
        </div>
        <div className="criminal-view-hero__meta">
          <span className="criminal-view-badge">{dashText(c.criminal_id)}</span>
        </div>
      </div>

      <div className="criminal-view-section">
        <h3 className="criminal-view-section__title">基本信息</h3>
        <div className="criminal-view-dl">
          <Row label="性别">{dashText(c.gender)}</Row>
          <Row label="民族">{dashText(c.ethnicity)}</Row>
          <Row label="身份证号" wide mono>
            {dashText(c.id_card_number)}
          </Row>
          <Row label="案由 / 罪名">{dashText(c.crime)}</Row>
          <Row label="类型">{dashText(c.crime_type)}</Row>
        </div>
      </div>

      <div className="criminal-view-section">
        <h3 className="criminal-view-section__title">在押与刑期</h3>
        <div className="criminal-view-dl">
          <Row label="监区">{dashText(c.district)}</Row>
          <Row label="仓号">{dashText(c.cell)}</Row>
          <Row label="入监日期">{entryDisplay}</Row>
          <Row label="刑期">{sentence}</Row>
        </div>
      </div>

      {extraBits ? (
        <div className="criminal-view-section criminal-view-section--muted">
          <h3 className="criminal-view-section__title">其它档案</h3>
          <div className="criminal-view-dl">
            <Row label="案件编号">{dashText(c.case_number)}</Row>
            <Row label="管理等级">{dashText(c.manage_level)}</Row>
            <Row label="承办人标识">{dashText(c.handler_id)}</Row>
            <Row label="出生日期">{dashText(c.birth_date)}</Row>
            <Row label="籍贯">{dashText(c.native_place)}</Row>
            <Row label="文化程度">{dashText(c.education)}</Row>
            <Row label="原判法院">{dashText(c.original_court)}</Row>
            <Row label="备注" wide>
              {c.remark?.trim() ? c.remark : '—'}
            </Row>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const EMPTY_DRAFT: CriminalDraft = {
  criminal_id: '',
  name: '',
  gender: '',
  ethnicity: '',
  birth_date: '',
  id_card_number: '',
  native_place: '',
  education: '',
  crime: '',
  sentence_years: 0,
  sentence_months: 0,
  entry_date: '',
  original_court: '',
  district: '',
  cell: '',
  crime_type: '',
  manage_level: '普通',
  handler_id: '',
  photo_path: '',
  remark: '',
  archived: false,
  case_number: '',
  custody_date: '',
  custody_location: '',
  bed_number: '',
  contact_phone: '',
}

export default function CriminalListPage() {
  const [criminals, setCriminals] = useState<Criminal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showView, setShowView] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editing, setEditing] = useState<Criminal | null>(null)
  const [form, setForm] = useState<CriminalDraft>(EMPTY_DRAFT)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const normalizeEntryDate = useCallback((raw: string) => {
    const s = (raw || '').trim()
    if (!s) return ''
    // Normal for <input type="date"> is YYYY-MM-DD; support historical YYYY/MM/DD too.
    const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(s)
    if (!m) return s
    const yyyy = m[1]
    const mm = m[2].padStart(2, '0')
    const dd = m[3].padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }, [])
  const crimeTypeOptions = useMemo(() => {
    const set = new Set<string>()
    criminals.forEach(c => {
      const value = (c.crime_type || '').trim()
      if (value) set.add(value)
    })
    return Array.from(set)
  }, [criminals])

  const loadCriminals = useCallback(async (p: number, q: string, status: StatusFilter, type: string) => {
    setLoading(true)
    setError(null)
    try {
      if (isTauri()) {
        const [data, count] = await getCriminalsByPage(p, PAGE_SIZE, q, status, type.trim())
        setCriminals(data)
        setTotal(count)
      } else {
        // Web 预览模式：静态数据
        setCriminals([])
        setTotal(0)
      }
    } catch (e) {
      setError(formatInvokeError(e))
      setCriminals([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCriminals(page, search, statusFilter, typeFilter)
  }, [page, search, statusFilter, typeFilter, loadCriminals])

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ page?: string; search?: string }>
      if (ce.detail?.page !== 'criminals') return
      const searchText = (ce.detail?.search || '').trim()
      setSearchInput(searchText)
      setSearch(searchText)
      setPage(0)
    }
    window.addEventListener('prisonsis:apply-search', handler as EventListener)
    return () => window.removeEventListener('prisonsis:apply-search', handler as EventListener)
  }, [])

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(0)
  }

  const handlePageChange = (newPage: number) => {
    if (newPage < 0 || newPage >= totalPages) return
    setPage(newPage)
  }

  const statusColor = (archived: boolean) =>
    archived ? 'var(--text-muted)' : 'var(--status-online)'

  const resetForm = () => {
    setForm(EMPTY_DRAFT)
    setFormError(null)
  }

  const openCreate = () => {
    resetForm()
    setShowCreate(true)
  }

  const openView = (row: Criminal) => {
    setEditing(row)
    setShowView(true)
  }

  const openEdit = (row: Criminal) => {
    setEditing(row)
    setForm({
      ...row,
      entry_date: normalizeEntryDate(row.entry_date),
    })
    setFormError(null)
    setShowEdit(true)
  }

  const validateForm = (draft: CriminalDraft) => {
    if (!draft.criminal_id.trim()) return '编号不能为空'
    if (!draft.name.trim()) return '姓名不能为空'
    const idCard = draft.id_card_number.trim()
    if (idCard && !/^[0-9Xx]{15,18}$/.test(idCard)) return '身份证号格式不正确'
    const entryDate = normalizeEntryDate(draft.entry_date)
    if (entryDate && !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return '入监日期格式不正确'
    return null
  }

  const setField = <K extends keyof CriminalDraft>(key: K, value: CriminalDraft[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const submitCreate = async () => {
    const err = validateForm(form)
    if (err) {
      setFormError(err)
      return
    }
    setSubmitLoading(true)
    setFormError(null)
    try {
      await addCriminal({
        ...form,
        criminal_id: form.criminal_id.trim(),
        name: form.name.trim(),
        id_card_number: form.id_card_number.trim(),
        entry_date: normalizeEntryDate(form.entry_date),
      })
      setShowCreate(false)
      resetForm()
      await loadCriminals(page, search, statusFilter, typeFilter)
    } catch (e) {
      setFormError(formatInvokeError(e))
    } finally {
      setSubmitLoading(false)
    }
  }

  const submitEdit = async () => {
    if (!editing) return
    const err = validateForm(form)
    if (err) {
      setFormError(err)
      return
    }
    setSubmitLoading(true)
    setFormError(null)
    try {
      await updateCriminal({
        ...editing,
        ...form,
        criminal_id: form.criminal_id.trim(),
        name: form.name.trim(),
        id_card_number: form.id_card_number.trim(),
        entry_date: normalizeEntryDate(form.entry_date),
      })
      setShowEdit(false)
      setEditing(null)
      await loadCriminals(page, search, statusFilter, typeFilter)
    } catch (e) {
      setFormError(formatInvokeError(e))
    } finally {
      setSubmitLoading(false)
    }
  }

  const webHint = !isTauri() && (
    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Web 预览模式：请在 Tauri 桌面端使用罪犯信息管理功能。</p>
  )

  return (
    <div className="page">
      <div>
        <h1 className="page-title">罪犯信息管理</h1>
      </div>
      {webHint}
      {error && <p style={{ color: 'var(--accent-secondary)', fontSize: 13 }}>{error}</p>}

      {/* 工具栏 */}
      <div className="toolbar">
        <div className="search-box">
          <span>🔍</span>
          <input
            type="text"
            placeholder="搜索姓名、编号、案由..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        </div>

        <select
          className="glass-input glass-input--select"
          value={statusFilter}
          onChange={e => {
            const next = e.target.value as StatusFilter
            setStatusFilter(next)
            setPage(0)
          }}
          style={{ maxWidth: 150 }}
        >
          <option value="">全部状态</option>
          <option value="active">在押</option>
          <option value="archived">归档</option>
        </select>

        <select
          className="glass-input glass-input--select"
          value={typeFilter}
          onChange={e => {
            setTypeFilter(e.target.value)
            setPage(0)
          }}
          style={{ maxWidth: 170 }}
        >
          <option value="">全部类型</option>
          {crimeTypeOptions.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        <button className="glass-btn primary" disabled={!isTauri()} onClick={openCreate}>
          + 新增人员
        </button>
      </div>

      {/* 表格 */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>编号</th>
                <th>姓名</th>
                <th>性别</th>
                <th>民族</th>
                <th>身份证号</th>
                <th>案由/罪名</th>
                <th>刑期</th>
                <th>入监日期</th>
                <th>监区</th>
                <th>仓号</th>
                <th>状态</th>
                <th className="data-table__col--actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    加载中...
                  </td>
                </tr>
              )}
              {!loading && criminals.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    {search ? '未找到匹配的记录' : '暂无数据'}
                  </td>
                </tr>
              )}
              {!loading && criminals.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--text-muted)' }}>{page * PAGE_SIZE + i + 1}</td>
                  <td className="cell-mono">{c.criminal_id}</td>
                  <td>{c.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.gender || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.ethnicity || '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{c.id_card_number || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.crime || c.crime_type || '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {c.sentence_years > 0 ? `${c.sentence_years}年` : ''}
                    {c.sentence_months > 0 ? `${c.sentence_months}月` : ''}
                    {c.sentence_years === 0 && c.sentence_months === 0 ? '—' : ''}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.entry_date || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.district || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{c.cell || '—'}</td>
                  <td>
                    <span className="cell-status">
                      <span className="status-dot" style={{ background: statusColor(c.archived) }} />
                      <span style={{ color: statusColor(c.archived) }}>{c.archived ? '归档' : '在押'}</span>
                    </span>
                  </td>
                  <td className="data-table__col--actions">
                    <div className="table-actions">
                      <button type="button" className="glass-btn small" onClick={() => openView(c)}>
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

        {/* 分页 */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--glass-border)',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-muted)'
        }}>
          {loading ? '加载中...' : `共 ${total} 条，第 ${page + 1}/${totalPages || 1} 页`}
          <div style={{ flex: 1 }} />
          <button className="glass-btn small" disabled={page === 0 || loading} onClick={() => handlePageChange(page - 1)}>上一页</button>
          <button className="glass-btn small" disabled={page >= totalPages - 1 || loading} onClick={() => handlePageChange(page + 1)}>下一页</button>
        </div>
      </div>

      {(showCreate || showEdit || showView) && (
        <div className="record-modal-backdrop" role="presentation" style={{ zIndex: 2400 }}>
          <div
            className={`record-modal ${showView && editing ? 'record-modal--criminal-view' : 'record-modal--criminal-form'}`}
            style={{ width: 'min(760px, 96vw)' }}
          >
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>{showCreate ? '新增人员' : showEdit ? '编辑人员' : '人员档案'}</h2>
                {showView && editing ? (
                  <p className="record-modal__meta">只读浏览，修改请点右下角「编辑」</p>
                ) : showCreate ? (
                  <p className="record-modal__meta">录入在押人员基本信息</p>
                ) : (
                  <p className="record-modal__meta">{editing ? `正在编辑：${editing.name || '—'}` : ''}</p>
                )}
              </div>
              <button
                type="button"
                className="record-modal__close"
                aria-label="关闭"
                disabled={submitLoading}
                onClick={() => {
                  setShowCreate(false)
                  setShowEdit(false)
                  setShowView(false)
                  setEditing(null)
                  resetForm()
                }}
              >
                ×
              </button>
            </div>
            <div className="record-modal__body">
              {showView && editing ? (
                <CriminalViewProfile c={editing} normalizeEntryDate={normalizeEntryDate} />
              ) : (
                <>
                  {formError && <p style={{ color: 'var(--accent-secondary)', fontSize: 13 }}>{formError}</p>}
                  <div className="criminal-form-card">
                    <div className="record-modal__grid">
                      <label className="record-modal__field">
                        <span>编号 *</span>
                        <input
                          className="glass-input"
                          value={form.criminal_id}
                          disabled={submitLoading}
                          onChange={e => setField('criminal_id', e.target.value)}
                        />
                      </label>
                      <label className="record-modal__field">
                        <span>姓名 *</span>
                        <input
                          className="glass-input"
                          value={form.name}
                          disabled={submitLoading}
                          onChange={e => setField('name', e.target.value)}
                        />
                      </label>
                      <label className="record-modal__field">
                        <span>性别</span>
                        <select
                          className="glass-input glass-input--select"
                          value={form.gender}
                          disabled={submitLoading}
                          onChange={e => setField('gender', e.target.value)}
                        >
                          <option value="">未填写</option>
                          {GENDER_OPTIONS.map(g => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="record-modal__field">
                        <span>民族</span>
                        <input
                          className="glass-input"
                          value={form.ethnicity}
                          disabled={submitLoading}
                          onChange={e => setField('ethnicity', e.target.value)}
                        />
                      </label>
                      <label className="record-modal__field">
                        <span>身份证号</span>
                        <input
                          className="glass-input"
                          value={form.id_card_number}
                          disabled={submitLoading}
                          onChange={e => setField('id_card_number', e.target.value)}
                        />
                      </label>
                      <label className="record-modal__field">
                        <span>案由</span>
                        <input
                          className="glass-input"
                          value={form.crime}
                          disabled={submitLoading}
                          onChange={e => setField('crime', e.target.value)}
                        />
                      </label>
                      <label className="record-modal__field">
                        <span>类型</span>
                        <input
                          className="glass-input"
                          value={form.crime_type}
                          disabled={submitLoading}
                          onChange={e => setField('crime_type', e.target.value)}
                        />
                      </label>
                      <label className="record-modal__field">
                        <span>监区</span>
                        <select
                          className="glass-input glass-input--select"
                          value={form.district}
                          disabled={submitLoading}
                          onChange={e => setField('district', e.target.value)}
                        >
                          <option value="">未填写</option>
                          {DISTRICT_OPTIONS.map(d => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="record-modal__field">
                        <span>仓号</span>
                        <input
                          className="glass-input"
                          value={form.cell}
                          disabled={submitLoading}
                          onChange={e => setField('cell', e.target.value)}
                        />
                      </label>
                      <label className="record-modal__field">
                        <span>入监日期</span>
                        <input
                          type="date"
                          className="glass-input"
                          value={normalizeEntryDate(form.entry_date)}
                          disabled={submitLoading}
                          onChange={e => setField('entry_date', e.target.value)}
                        />
                      </label>
                      <label className="record-modal__field">
                        <span>刑期（年）</span>
                        <input
                          type="number"
                          className="glass-input"
                          value={form.sentence_years}
                          disabled={submitLoading}
                          onChange={e => setField('sentence_years', Math.max(0, Number(e.target.value || 0)))}
                        />
                      </label>
                      <label className="record-modal__field">
                        <span>刑期（月）</span>
                        <input
                          type="number"
                          className="glass-input"
                          value={form.sentence_months}
                          disabled={submitLoading}
                          onChange={e => setField('sentence_months', Math.max(0, Number(e.target.value || 0)))}
                        />
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div
              className={`record-modal__footer${showView && editing ? ' record-modal__footer--criminal-view' : ''}`}
            >
              {showView && editing ? (
                <>
                  <button
                    type="button"
                    className="glass-btn"
                    disabled={submitLoading}
                    onClick={() => {
                      setShowView(false)
                      setEditing(null)
                      resetForm()
                    }}
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    className="glass-btn primary"
                    disabled={!isTauri() || submitLoading}
                    onClick={() => {
                      const row = editing
                      setShowView(false)
                      openEdit(row)
                    }}
                  >
                    编辑
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="glass-btn"
                    disabled={submitLoading}
                    onClick={() => {
                      setShowCreate(false)
                      setShowEdit(false)
                      setShowView(false)
                      setEditing(null)
                      resetForm()
                    }}
                  >
                    取消
                  </button>
                  {showCreate && (
                    <button type="button" className="glass-btn primary" disabled={submitLoading} onClick={() => void submitCreate()}>
                      {submitLoading ? '提交中...' : '保存'}
                    </button>
                  )}
                  {showEdit && (
                    <button type="button" className="glass-btn primary" disabled={submitLoading} onClick={() => void submitEdit()}>
                      {submitLoading ? '提交中...' : '保存'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
