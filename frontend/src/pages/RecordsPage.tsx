// RecordsPage.tsx — 笔录制作（阶段 1 MVP：对接 SQLite）
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Criminal, Record, RecordInput, Template } from '../api'
import {
  addRecord,
  getRecordById,
  getRecordsByPage,
  getCriminalsByPage,
  getTemplates,
  updateRecord,
} from '../api'
import {
  PRISON_RECORD_LOCATION_OTHER,
  PRISON_RECORD_LOCATION_PRESETS,
  isPresetLocation,
} from '../config/prisonRecordLocations'
import { FALLBACK_TEMPLATE_NAMES, fallbackTemplatesStub } from '../config/recordTemplatesFallback'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'
import {
  applyInsertDate,
  dbDateTimeToLocalValue,
  localValueToDbDateTime,
  nowLocalValue,
  replacePrisonerNamePlaceholders,
  todayYmd,
} from '../lib/recordFormUtils'

const PAGE_SIZE = 15

type StatusTab = 'all' | 'Draft' | 'Pending' | 'Approved' | 'Rejected'

const statusTabs: { key: StatusTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'Draft', label: '草稿' },
  { key: 'Pending', label: '待审批' },
  { key: 'Approved', label: '已审批' },
  { key: 'Rejected', label: '已驳回' },
]

const statusColor = (s: string) => {
  if (s === 'Approved') return 'var(--status-online)'
  if (s === 'Pending') return 'var(--accent-secondary)'
  if (s === 'Rejected') return 'var(--accent-red)'
  return 'var(--text-muted)'
}

const statusLabel = (s: string) =>
  ({
    Draft: '草稿',
    Pending: '待审批',
    Approved: '已审批',
    Rejected: '已驳回',
  }[s] ?? s)

type OverwritePrompt =
  | null
  | { kind: 'recordType'; nextType: string; nextBody: string }
  | { kind: 'applyTemplate'; body: string }

export default function RecordsPage() {
  const [records, setRecords] = useState<Record[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [statusTab, setStatusTab] = useState<StatusTab>('all')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailReadonly, setDetailReadonly] = useState(true)
  const [form, setForm] = useState<RecordInput>(() => ({
    record_type: FALLBACK_TEMPLATE_NAMES[0],
    criminal_id: 0,
    record_date: '',
    record_location: PRISON_RECORD_LOCATION_PRESETS[0],
    interrogator_id: '',
    recorder_id: '',
    present_persons: '',
    content: '',
  }))
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingRecordId, setEditingRecordId] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerList, setPickerList] = useState<Criminal[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)

  const [templates, setTemplates] = useState<Template[]>([])
  const [resolvedCriminalName, setResolvedCriminalName] = useState('')
  const [overwritePrompt, setOverwritePrompt] = useState<OverwritePrompt>(null)
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const statusFilterPayload = statusTab === 'all' ? '' : statusTab

  const loadRecords = useCallback(async () => {
    if (!isTauri()) return
    setLoading(true)
    setError(null)
    try {
      const [rows, count] = await getRecordsByPage(
        page,
        PAGE_SIZE,
        appliedSearch,
        statusFilterPayload
      )
      setRecords(rows)
      setTotal(count)
    } catch (e) {
      console.error(e)
      setError(String(e))
      setRecords([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, appliedSearch, statusFilterPayload])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  /** 弹窗打开时拉取模板列表 */
  useEffect(() => {
    if (!detailOpen || !isTauri()) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await getTemplates()
        if (!cancelled) setTemplates(list)
      } catch {
        if (!cancelled) setTemplates(fallbackTemplatesStub())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [detailOpen])

  /** 新建且正文为空：模板到达后套用正文 */
  useEffect(() => {
    if (!detailOpen || editingId != null || detailLoading || !templates.length) return
    setForm(f => {
      if (f.content.trim() !== '') return f
      const t = templates.find(x => x.name === f.record_type)
      return t?.content ? { ...f, content: t.content } : f
    })
  }, [detailOpen, editingId, detailLoading, templates])

  /** 详情打开时预拉服刑人员列表，便于展示姓名 */
  useEffect(() => {
    if (!detailOpen || !isTauri() || !form.criminal_id) return
    let cancelled = false
    ;(async () => {
      try {
        const [list] = await getCriminalsByPage(0, 200, '')
        if (!cancelled) setPickerList(list)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [detailOpen, form.criminal_id])

  useEffect(() => {
    if (!detailOpen || !pickerOpen || !isTauri()) return
    let cancelled = false
    setPickerLoading(true)
    ;(async () => {
      try {
        const [list] = await getCriminalsByPage(0, 80, pickerSearch.trim())
        if (!cancelled) setPickerList(list)
      } catch {
        if (!cancelled) setPickerList([])
      } finally {
        if (!cancelled) setPickerLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [detailOpen, pickerOpen, pickerSearch])

  useEffect(() => {
    if (!detailOpen) setOverwritePrompt(null)
  }, [detailOpen])

  const selectedCriminalName = (): string => {
    const hit = pickerList.find(c => c.id === form.criminal_id)
    if (hit) return hit.name
    if (resolvedCriminalName) return resolvedCriminalName
    return form.criminal_id ? `ID ${form.criminal_id}` : '未选择'
  }

  const templateBodyForType = (typeName: string): string => {
    const t = templates.find(x => x.name === typeName)
    return t?.content ?? ''
  }

  /** 正文仍与当前类型模板一致（用户未改）时，切换类型不提示覆盖，直接切换 */
  const isContentStillDefaultTemplate = (): boolean => {
    const cur = form.content
    if (!cur.trim()) return true
    const tpl = templateBodyForType(form.record_type)
    if (!tpl.trim()) return false
    return cur.replace(/\r\n/g, '\n').trim() === tpl.replace(/\r\n/g, '\n').trim()
  }

  const applyTemplateWithConfirm = (nextType: string, nextBody: string) => {
    const go = () => setForm(f => ({ ...f, record_type: nextType, content: nextBody }))
    if (isContentStillDefaultTemplate()) {
      go()
      return
    }
    setOverwritePrompt({ kind: 'recordType', nextType, nextBody: nextBody })
  }

  const handleRecordTypeSelect = (nextType: string) => {
    if (nextType === form.record_type) return
    applyTemplateWithConfirm(nextType, templateBodyForType(nextType))
  }

  const handleApplyTemplateClick = () => {
    const body = templateBodyForType(form.record_type)
    if (!body) {
      alert('当前类型暂无模板正文')
      return
    }
    if (!form.content.trim()) {
      setForm(f => ({ ...f, content: body }))
      return
    }
    setOverwritePrompt({ kind: 'applyTemplate', body })
  }

  const cancelOverwrite = () => setOverwritePrompt(null)

  const confirmOverwrite = () => {
    if (!overwritePrompt) return
    if (overwritePrompt.kind === 'recordType') {
      setForm(f => ({
        ...f,
        record_type: overwritePrompt.nextType,
        content: overwritePrompt.nextBody,
      }))
    } else {
      setForm(f => ({ ...f, content: overwritePrompt.body }))
    }
    setOverwritePrompt(null)
  }

  const handleInsertDateClick = () => {
    const ta = contentTextareaRef.current
    const cursor = ta?.selectionStart ?? form.content.length
    const { content, newCursor } = applyInsertDate(form.content, cursor, todayYmd())
    setForm(f => ({ ...f, content }))
    requestAnimationFrame(() => {
      ta?.focus()
      try {
        ta?.setSelectionRange(newCursor, newCursor)
      } catch {
        /* ignore */
      }
    })
  }

  const handleReplaceNameClick = () => {
    if (!form.criminal_id) {
      alert('请先选择服刑人员')
      return
    }
    const name = selectedCriminalName()
    setForm(f => ({ ...f, content: replacePrisonerNamePlaceholders(f.content, name) }))
  }

  const handleSearchSubmit = () => {
    setAppliedSearch(searchInput.trim())
    setPage(0)
  }

  const openCreate = () => {
    setResolvedCriminalName('')
    setEditingId(null)
    setEditingRecordId('')
    setDetailReadonly(false)
    const firstType = templates[0]?.name ?? FALLBACK_TEMPLATE_NAMES[0]
    const tpl = templates.find(t => t.name === firstType)
    setForm({
      record_type: firstType,
      criminal_id: 0,
      record_date: localValueToDbDateTime(nowLocalValue()),
      record_location: PRISON_RECORD_LOCATION_PRESETS[0],
      interrogator_id: '',
      recorder_id: '',
      present_persons: '',
      content: tpl?.content ?? '',
    })
    setDetailOpen(true)
  }

  const openViewOrEdit = async (id: number, readonly: boolean) => {
    if (!isTauri()) return
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailReadonly(readonly)
    try {
      const r = await getRecordById(id)
      setEditingId(r.id)
      setEditingRecordId(r.record_id)
      setResolvedCriminalName(r.criminal_name || '')
      setForm({
        record_type: r.record_type,
        criminal_id: r.criminal_id,
        record_date: r.record_date,
        record_location: r.record_location || PRISON_RECORD_LOCATION_PRESETS[0],
        interrogator_id: r.interrogator_id,
        recorder_id: r.recorder_id,
        present_persons: r.present_persons,
        content: r.content,
      })
    } catch (e) {
      alert(String(e))
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const saveDetail = async () => {
    if (!isTauri()) return
    if (!form.record_type.trim()) {
      alert('请选择笔录类型')
      return
    }
    if (!form.criminal_id) {
      alert('请选择服刑人员')
      return
    }
    try {
      if (editingId == null) {
        await addRecord(form)
      } else {
        await updateRecord({
          id: editingId,
          record_id: editingRecordId,
          record_type: form.record_type,
          criminal_id: form.criminal_id,
          criminal_name: '',
          record_date: form.record_date,
          record_location: form.record_location,
          interrogator_id: form.interrogator_id,
          recorder_id: form.recorder_id,
          present_persons: form.present_persons,
          content: form.content,
          content_encrypted: false,
          signed_interrogator: false,
          signed_recorder: false,
          signed_subject: false,
          status: 'Draft',
          approver1_id: '',
          approver2_id: '',
          approver1_result: '',
          approver2_result: '',
          reject_reason: '',
          created_at: '',
        })
      }
      setDetailOpen(false)
      await loadRecords()
    } catch (e) {
      alert(String(e))
    }
  }

  const locationSelectValue = isPresetLocation(form.record_location)
    ? form.record_location
    : PRISON_RECORD_LOCATION_OTHER
  const locationOtherValue =
    locationSelectValue === PRISON_RECORD_LOCATION_OTHER && !isPresetLocation(form.record_location)
      ? form.record_location
      : ''

  const mockPreview = (
    <>
      {!loading && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Web 预览模式：请在 Tauri 桌面端使用笔录读写功能。
        </p>
      )}
    </>
  )

  const toolbarDisabled = detailReadonly
  const toolbarTitle = '查看模式下不可用'

  const templateListForSelect = templates.length > 0 ? templates : fallbackTemplatesStub()
  const showLegacyRecordType =
    Boolean(form.record_type) &&
    !templateListForSelect.some(t => t.name === form.record_type)

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title">笔录制作</h1>
        <button className="glass-btn primary" type="button" onClick={() => openCreate()} disabled={!isTauri()}>
          + 新建笔录
        </button>
      </div>

      {error && (
        <p style={{ color: 'var(--accent-secondary)', fontSize: 13 }}>{error}</p>
      )}
      {!isTauri() && mockPreview}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {statusTabs.map(t => (
          <button
            key={t.key}
            type="button"
            className={`glass-btn${statusTab === t.key ? ' primary' : ''}`}
            onClick={() => {
              setStatusTab(t.key)
              setPage(0)
            }}
            disabled={!isTauri()}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1, minWidth: 120 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            className="glass-input-ish"
            style={{
              height: 36,
              minWidth: 200,
              borderRadius: 8,
              border: '1px solid var(--glass-border)',
              background: 'rgba(0,0,0,.25)',
              color: 'var(--text-primary)',
              padding: '0 12px',
            }}
            placeholder="编号 / 服刑人员"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearchSubmit()}
          />
          <button type="button" className="glass-btn" onClick={handleSearchSubmit} disabled={!isTauri()}>
            搜索
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>服刑人员</th>
                <th>笔录类型</th>
                <th>谈话日期</th>
                <th>地点</th>
                <th>承办人</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    加载中...
                  </td>
                </tr>
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    {!isTauri() ? '仅桌面端可查库' : '暂无数据'}
                  </td>
                </tr>
              )}
              {!loading &&
                records.map(r => (
                  <tr key={r.id}>
                    <td className="cell-mono">{r.record_id}</td>
                    <td>{r.criminal_name || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.record_type}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.record_date || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.record_location || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{r.interrogator_id || '—'}</td>
                    <td>
                      <span className="cell-status">
                        <span className="status-dot" style={{ background: statusColor(r.status) }} />
                        <span style={{ color: statusColor(r.status) }}>{statusLabel(r.status)}</span>
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="glass-btn small" onClick={() => openViewOrEdit(r.id, true)} disabled={!isTauri()}>
                          查看
                        </button>
                        {r.status === 'Draft' && (
                          <button type="button" className="glass-btn small" onClick={() => openViewOrEdit(r.id, false)} disabled={!isTauri()}>
                            编辑
                          </button>
                        )}
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
            <button type="button" className="glass-btn small" disabled={page === 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>
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

      {detailOpen && (
        <div
          className="record-modal-backdrop"
          role="presentation"
          onMouseDown={() => !detailLoading && setDetailOpen(false)}
        >
          <div className="record-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>{detailReadonly ? '查看笔录' : editingId == null ? '新建笔录' : '编辑草稿'}</h2>
                {!detailLoading && editingId != null && (
                  <div className="record-modal__meta">笔录编号：{editingRecordId}</div>
                )}
                {!detailReadonly && (
                  <div className="record-modal__hint" style={{ marginTop: 8 }}>
                    监狱执法谈话笔录：面向服刑人员，用语区别于公安机关讯问犯罪嫌疑人。
                  </div>
                )}
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={() => setDetailOpen(false)}>
                ×
              </button>
            </div>
            {detailLoading ? (
              <div className="record-modal__body">
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>加载中...</p>
              </div>
            ) : (
              <>
                <div className="record-modal__body">
                  <div>
                    <div className="record-modal__section-title">基本信息</div>
                    <div className="record-modal__grid">
                      <label className="record-modal__field">
                        <span>笔录类型</span>
                        <select
                          className="glass-input glass-input--select"
                          disabled={detailReadonly}
                          value={form.record_type}
                          onChange={e => handleRecordTypeSelect(e.target.value)}
                        >
                          {templateListForSelect.map(t => (
                            <option key={t.id} value={t.name}>
                              {t.name}
                            </option>
                          ))}
                          {showLegacyRecordType && (
                            <option value={form.record_type}>
                              当前：{form.record_type}（未匹配模板）
                            </option>
                          )}
                        </select>
                      </label>
                      <label className="record-modal__field">
                        <span>谈话日期 / 时间</span>
                        <input
                          type="datetime-local"
                          className="glass-input glass-input--datetime"
                          disabled={detailReadonly}
                          value={dbDateTimeToLocalValue(form.record_date)}
                          onChange={e =>
                            setForm(f => ({ ...f, record_date: localValueToDbDateTime(e.target.value) }))
                          }
                        />
                      </label>
                      <div className="record-modal__criminal-strip">
                        <div>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                            服刑人员
                          </span>
                          <strong>{selectedCriminalName()}</strong>
                        </div>
                        {!detailReadonly && (
                          <button type="button" className="glass-btn small" onClick={() => setPickerOpen(true)}>
                            选择人员
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="record-modal__section-title">人员与场所</div>
                    <div className="record-modal__grid">
                      <label className="record-modal__field record-modal__field--full">
                        <span>地点</span>
                        <select
                          className="glass-input glass-input--select"
                          disabled={detailReadonly}
                          value={locationSelectValue}
                          onChange={e => {
                            const v = e.target.value
                            if (v === PRISON_RECORD_LOCATION_OTHER) {
                              setForm(f => ({ ...f, record_location: '' }))
                            } else {
                              setForm(f => ({ ...f, record_location: v }))
                            }
                          }}
                        >
                          {PRISON_RECORD_LOCATION_PRESETS.map(p => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                          <option value={PRISON_RECORD_LOCATION_OTHER}>{PRISON_RECORD_LOCATION_OTHER}</option>
                        </select>
                      </label>
                      {locationSelectValue === PRISON_RECORD_LOCATION_OTHER && (
                        <label className="record-modal__field record-modal__field--full">
                          <span>具体地点</span>
                          <input
                            type="text"
                            className="glass-input"
                            disabled={detailReadonly}
                            placeholder="填写具体地点"
                            value={locationOtherValue}
                            onChange={e => setForm(f => ({ ...f, record_location: e.target.value }))}
                          />
                        </label>
                      )}
                      <label className="record-modal__field">
                        <span>民警（谈话人）标识</span>
                        <input
                          type="text"
                          className="glass-input"
                          disabled={detailReadonly}
                          value={form.interrogator_id}
                          onChange={e => setForm(f => ({ ...f, interrogator_id: e.target.value }))}
                        />
                      </label>
                      <label className="record-modal__field">
                        <span>记录人标识</span>
                        <input
                          type="text"
                          className="glass-input"
                          disabled={detailReadonly}
                          value={form.recorder_id}
                          onChange={e => setForm(f => ({ ...f, recorder_id: e.target.value }))}
                        />
                      </label>
                      <label className="record-modal__field record-modal__field--full">
                        <span>在场人员</span>
                        <input
                          type="text"
                          className="glass-input"
                          disabled={detailReadonly}
                          value={form.present_persons}
                          onChange={e => setForm(f => ({ ...f, present_persons: e.target.value }))}
                        />
                      </label>
                    </div>
                  </div>
                  <div>
                    <div className="record-modal__section-title">笔录正文</div>
                    <p className="record-modal__hint">
                      以下为模板框架，请据实填写；可使用工具条插入日期或替换「[服刑人员姓名]」占位符。
                    </p>
                    <div className="record-modal__content-toolbar">
                      <button
                        type="button"
                        className="glass-btn small"
                        disabled={toolbarDisabled}
                        title={toolbarDisabled ? toolbarTitle : undefined}
                        onClick={handleApplyTemplateClick}
                      >
                        套用模板
                      </button>
                      <button
                        type="button"
                        className="glass-btn small"
                        disabled={toolbarDisabled}
                        title={toolbarDisabled ? toolbarTitle : undefined}
                        onClick={handleInsertDateClick}
                      >
                        插入日期
                      </button>
                      <button
                        type="button"
                        className="glass-btn small"
                        disabled={toolbarDisabled}
                        title={toolbarDisabled ? toolbarTitle : undefined}
                        onClick={handleReplaceNameClick}
                      >
                        填入服刑人员姓名
                      </button>
                    </div>
                    <textarea
                      ref={contentTextareaRef}
                      className="glass-input glass-textarea"
                      disabled={detailReadonly}
                      rows={8}
                      value={form.content}
                      onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                      aria-label="笔录正文"
                    />
                  </div>
                </div>
                <div className="record-modal__footer">
                  <button type="button" className="glass-btn" onClick={() => setDetailOpen(false)}>
                    {detailReadonly ? '关闭' : '取消'}
                  </button>
                  {!detailReadonly && (
                    <button type="button" className="glass-btn primary" onClick={() => saveDetail()}>
                      保存
                    </button>
                  )}
                </div>
              </>
            )}
            {overwritePrompt && !detailLoading && (
              <div
                className="record-modal__confirm-layer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="record-overwrite-title"
              >
                <div
                  className="record-modal__confirm-backdrop"
                  role="presentation"
                  onMouseDown={cancelOverwrite}
                />
                <div className="record-modal__confirm-box" onMouseDown={e => e.stopPropagation()}>
                  <h3 id="record-overwrite-title" className="record-modal__confirm-title">
                    覆盖正文
                  </h3>
                  <p className="record-modal__confirm-text">
                    {overwritePrompt.kind === 'recordType'
                      ? '当前正文已修改，确定后将切换笔录类型并用新类型模板替换正文。'
                      : '当前正文已修改，确定后将用当前笔录类型的模板覆盖现有正文。'}
                  </p>
                  <div className="record-modal__confirm-actions">
                    <button type="button" className="glass-btn" onClick={cancelOverwrite}>
                      取消
                    </button>
                    <button type="button" className="glass-btn primary" onClick={confirmOverwrite}>
                      确定覆盖
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="record-picker-backdrop" role="presentation" onMouseDown={() => setPickerOpen(false)}>
          <div className="record-picker" onMouseDown={e => e.stopPropagation()}>
            <div className="record-picker__title">选择服刑人员</div>
            <input
              type="text"
              className="glass-input"
              placeholder="姓名 / 编号 / 罪名"
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              aria-label="搜索服刑人员"
            />
            <div className="record-picker__list">
              {pickerLoading ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '8px 0 0' }}>加载中...</p>
              ) : pickerList.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '8px 0 0' }}>无匹配人员</p>
              ) : (
                pickerList.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="record-picker__item"
                    onClick={() => {
                      setResolvedCriminalName('')
                      setForm(f => ({ ...f, criminal_id: c.id }))
                      setPickerOpen(false)
                    }}
                  >
                    <div className="record-picker__item-name">{c.name}</div>
                    <div className="record-picker__item-meta">
                      {c.criminal_id} · {c.crime || '—'}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="record-picker__footer">
              <button type="button" className="glass-btn" onClick={() => setPickerOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
