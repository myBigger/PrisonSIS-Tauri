// TemplatesPage.tsx — 模板管理（阶段 4：分页、搜索、新增/编辑、软删）
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Template } from '../api'
import { addTemplate, disableTemplate, getTemplatesByPage, updateTemplate } from '../api'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'
import Icon from '../components/icons/Icon'
import IconButton from '../components/icons/IconButton'

const PAGE_SIZE = 12

type GuidedQuestion = {
  id: string
  prompt: string
}

type GuidedHeaderField = { key: string; label: string; placeholder?: string }

/** 编辑态稳定 key，避免改字段标识时列表项错位 */
type GuidedHeaderFieldRow = GuidedHeaderField & { rowId: string; keyMode: 'auto' | 'preset' | 'custom' }

type GuidedSchema = {
  version: number
  headerFields: GuidedHeaderField[]
  questions: Array<{ id: string; prompt: string; multiline?: boolean }>
  signaturePlaceholder: string
}

const SHARED_HEADER_FIELDS: GuidedSchema['headerFields'] = [
  { key: 'session_no', label: '第几次', placeholder: '如：1' },
  { key: 'interrogator_unit', label: '询/讯问人工作单位' },
  { key: 'recorder_unit', label: '记录人工作单位' },
  { key: 'id_card_number', label: '居民身份证号' },
  { key: 'household_address', label: '户籍地址' },
]

const HEADER_FIELD_PRESETS: Array<{ key: string; label: string }> = [
  { key: 'session_no', label: '第几次（文书：第·次）' },
  { key: 'interrogator_unit', label: '询/讯问人工作单位' },
  { key: 'recorder_unit', label: '记录人工作单位' },
  { key: 'id_card_number', label: '居民身份证号' },
  { key: 'household_address', label: '户籍地址' },
  { key: 'record_total_pages', label: '本笔录共几页（文书：本笔录共·页）' },
]

const HEADER_FIELD_PRESET_KEYS = new Set(HEADER_FIELD_PRESETS.map(x => x.key))

function normalizeTemplateCategory(rawCategory: string, templateName: string): string {
  const baseFromName = (templateName || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fff-]/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32)

  const candidate = (rawCategory || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fff-]/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32)

  if (candidate) return candidate
  if (baseFromName) return baseFromName

  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `guided_${stamp}`
}

function defaultGuidedSchema(): GuidedSchema {
  return {
    version: 1,
    headerFields: SHARED_HEADER_FIELDS.map(f => ({ ...f })),
    questions: [],
    signaturePlaceholder: '被询/讯问人签名：__________',
  }
}

function normalizeHeaderFieldsForSave(rows: GuidedHeaderField[]): GuidedHeaderField[] {
  const cleanKey = (raw: string) =>
    raw
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w\u4e00-\u9fff-]/gu, '')

  const seen = new Set<string>()
  return rows
    .map(f => ({
      key: (f.key || '').trim(),
      label: (f.label || '').trim(),
      placeholder: (f.placeholder || '').trim() || undefined,
    }))
    .filter(f => f.label)
    .map(f => {
      let base = cleanKey(f.key) || cleanKey(f.label) || 'field'
      let k = base
      let n = 1
      while (seen.has(k)) {
        k = `${base}_${n}`
        n += 1
      }
      seen.add(k)
      return { key: k, label: f.label, placeholder: f.placeholder }
    })
}

function parseGuidedSchema(raw: string): GuidedSchema {
  try {
    const parsed = JSON.parse(raw || '{}') as Partial<GuidedSchema>
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions
          .filter(q => typeof q?.prompt === 'string')
          .map((q, idx) => ({
            id: typeof q?.id === 'string' && q.id.trim() ? q.id : `q_${idx + 1}`,
            prompt: (q.prompt ?? '').trim(),
            multiline: Boolean(q.multiline),
          }))
          .filter(q => q.prompt)
      : []
    const headerFields: GuidedHeaderField[] = Array.isArray(parsed.headerFields)
      ? parsed.headerFields
          .filter(f => typeof f?.key === 'string' && typeof f?.label === 'string')
          .map(f => ({
            key: (f.key ?? '').trim(),
            label: (f.label ?? '').trim(),
            placeholder:
              typeof f.placeholder === 'string' && f.placeholder.trim() ? f.placeholder.trim() : undefined,
          }))
          .filter(f => f.key && f.label)
      : SHARED_HEADER_FIELDS.map(f => ({ ...f }))
    return {
      version: 1,
      headerFields,
      questions,
      signaturePlaceholder:
        typeof parsed.signaturePlaceholder === 'string' && parsed.signaturePlaceholder.trim()
          ? parsed.signaturePlaceholder
          : '被询/讯问人签名：__________',
    }
  } catch {
    return defaultGuidedSchema()
  }
}

export default function TemplatesPage() {
  const [tpls, setTpls] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [questions, setQuestions] = useState<GuidedQuestion[]>([])
  const [headerFields, setHeaderFields] = useState<GuidedHeaderFieldRow[]>([])
  const [draggingHeaderRowId, setDraggingHeaderRowId] = useState<string | null>(null)
  const [dragOverHeaderRowId, setDragOverHeaderRowId] = useState<string | null>(null)
  const [draggingQuestionId, setDraggingQuestionId] = useState<string | null>(null)
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<number | null>(null)

  const headerRowEls = useRef(new Map<string, HTMLDivElement>())
  const headerPrevRects = useRef(new Map<string, DOMRect>())
  const questionRowEls = useRef(new Map<string, HTMLDivElement>())
  const questionPrevRects = useRef(new Map<string, DOMRect>())

  const moveHeaderField = useCallback((fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return
    setHeaderFields(prev => {
      const from = prev.findIndex(h => h.rowId === fromId)
      const to = prev.findIndex(h => h.rowId === toId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const moveQuestion = useCallback((fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return
    setQuestions(prev => {
      const from = prev.findIndex(q => q.id === fromId)
      const to = prev.findIndex(q => q.id === toId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  useLayoutEffect(() => {
    const ids = headerFields.map(h => h.rowId)
    const nextRects = new Map<string, DOMRect>()
    for (const id of ids) {
      const el = headerRowEls.current.get(id)
      if (!el) continue
      nextRects.set(id, el.getBoundingClientRect())
    }

    for (const id of ids) {
      const el = headerRowEls.current.get(id)
      const prev = headerPrevRects.current.get(id)
      const next = nextRects.get(id)
      if (!el || !prev || !next) continue
      const dx = prev.left - next.left
      const dy = prev.top - next.top
      if (dx === 0 && dy === 0) continue
      el.style.transition = 'transform 0s'
      el.style.transform = `translate(${dx}px, ${dy}px)`
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms cubic-bezier(0.2, 0.9, 0.2, 1)'
        el.style.transform = ''
      })
    }

    headerPrevRects.current = nextRects
  }, [headerFields])

  useLayoutEffect(() => {
    const ids = questions.map(q => q.id)
    const nextRects = new Map<string, DOMRect>()
    for (const id of ids) {
      const el = questionRowEls.current.get(id)
      if (!el) continue
      nextRects.set(id, el.getBoundingClientRect())
    }

    for (const id of ids) {
      const el = questionRowEls.current.get(id)
      const prev = questionPrevRects.current.get(id)
      const next = nextRects.get(id)
      if (!el || !prev || !next) continue
      const dx = prev.left - next.left
      const dy = prev.top - next.top
      if (dx === 0 && dy === 0) continue
      el.style.transition = 'transform 0s'
      el.style.transform = `translate(${dx}px, ${dy}px)`
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms cubic-bezier(0.2, 0.9, 0.2, 1)'
        el.style.transform = ''
      })
    }

    questionPrevRects.current = nextRects
  }, [questions])

  useEffect(() => {
    if (!draggingHeaderRowId) return
    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const hit = el?.closest?.('[data-header-rowid]') as HTMLElement | null
      const toId = hit?.dataset?.headerRowid
      if (!toId) return
      if (toId === dragOverHeaderRowId) return
      setDragOverHeaderRowId(toId)
      moveHeaderField(draggingHeaderRowId, toId)
    }
    const onUp = () => {
      setDraggingHeaderRowId(null)
      setDragOverHeaderRowId(null)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [draggingHeaderRowId, dragOverHeaderRowId, moveHeaderField])

  useEffect(() => {
    if (!draggingQuestionId) return
    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const hit = el?.closest?.('[data-question-id]') as HTMLElement | null
      const toId = hit?.dataset?.questionId
      if (!toId) return
      if (toId === dragOverQuestionId) return
      setDragOverQuestionId(toId)
      moveQuestion(draggingQuestionId, toId)
    }
    const onUp = () => {
      setDraggingQuestionId(null)
      setDragOverQuestionId(null)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [draggingQuestionId, dragOverQuestionId, moveQuestion])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadTemplates = useCallback(async () => {
    if (!isTauri()) {
      setTpls([])
      setTotal(0)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [rows, count] = await getTemplatesByPage(page, PAGE_SIZE, appliedSearch, false)
      setTpls(rows)
      setTotal(count)
    } catch (e) {
      setError(formatInvokeError(e))
      setTpls([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, appliedSearch])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ page?: string; search?: string }>
      if (ce.detail?.page !== 'templates') return
      const searchText = (ce.detail?.search || '').trim()
      setSearchInput(searchText)
      setAppliedSearch(searchText)
      setPage(0)
    }
    window.addEventListener('prisonsis:apply-search', handler as EventListener)
    return () => window.removeEventListener('prisonsis:apply-search', handler as EventListener)
  }, [])

  const openCreate = () => {
    setEditing(null)
    setName('')
    setCategory('')
    setQuestions([])
    setHeaderFields(
      SHARED_HEADER_FIELDS.map((f, i) => ({
        ...f,
        rowId: `create_${i}_${f.key}`,
        keyMode: 'preset',
      }))
    )
    setSaveError(null)
    setEditorOpen(true)
  }

  const openEdit = (t: Template) => {
    setEditing(t)
    setName(t.name || '')
    setCategory(t.category || '')
    const schema = parseGuidedSchema(t.guide_schema_json || '')
    setQuestions(schema.questions.map(q => ({ id: q.id, prompt: q.prompt })))
    setHeaderFields(
      schema.headerFields.map((f, i) => ({
        ...f,
        rowId: `edit_${t.id}_${i}_${f.key || 'auto'}`,
        keyMode: f.key ? (HEADER_FIELD_PRESET_KEYS.has(f.key) ? 'preset' : 'custom') : 'auto',
      }))
    )
    setSaveError(null)
    setEditorOpen(true)
  }

  const onSave = async () => {
    if (!isTauri()) return
    if (!name.trim()) {
      setSaveError('模板名称不能为空')
      return
    }
    setSaveError(null)
    try {
      const guidedSchema = parseGuidedSchema(editing?.guide_schema_json || '')
      if (headerFields.some(h => h.keyMode === 'custom' && !h.key.trim())) {
        setSaveError('卷宗要素中存在「自定义字段标识」未填写的项')
        return
      }
      guidedSchema.headerFields = normalizeHeaderFieldsForSave(
        headerFields.map(r => ({
          key: r.keyMode === 'auto' ? '' : r.key,
          label: r.label,
          placeholder: r.placeholder,
        }))
      )
      guidedSchema.questions = questions
        .map((q, idx) => ({
          id: q.id.trim() || `q_${idx + 1}`,
          prompt: q.prompt.trim(),
          multiline: q.prompt.length > 48,
        }))
        .filter(q => q.prompt)
      if (guidedSchema.questions.length === 0) {
        setSaveError('请至少保留 1 条提问')
        return
      }
      const guide_schema_json = JSON.stringify(guidedSchema)
      const nextCategory = normalizeTemplateCategory(category, name)
      if (editing) {
        await updateTemplate({
          ...editing,
          name: name.trim(),
          category: nextCategory,
          content: '',
          template_kind: 'guided',
          guide_schema_json,
        })
      } else {
        await addTemplate({
          name: name.trim(),
          category: nextCategory,
          content: '',
          template_kind: 'guided',
          guide_schema_json,
        })
      }
      setEditorOpen(false)
      await loadTemplates()
    } catch (e) {
      setSaveError(formatInvokeError(e))
    }
  }

  const onDisable = async (id: number) => {
    if (!isTauri()) return
    setActingId(id)
    try {
      await disableTemplate(id)
      await loadTemplates()
    } catch (e) {
      alert(formatInvokeError(e))
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title">模板管理</h1>
        <button type="button" className="glass-btn primary" onClick={openCreate} disabled={!isTauri()}>
          + 新建模板
        </button>
      </div>

      {!isTauri() && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Web 预览模式：请在 Tauri 桌面端使用模板维护。</p>
      )}
      {error && <p style={{ color: 'var(--accent-secondary)', fontSize: 13 }}>{error}</p>}

      <div className="toolbar">
        <div className="search-box">
          <span>🔍</span>
          <input
            type="text"
            placeholder="搜索模板名称/类型/内容..."
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
        <IconButton
          label="搜索"
          onClick={() => {
            setAppliedSearch(searchInput.trim())
            setPage(0)
          }}
        >
          <Icon name="search" />
        </IconButton>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>模板名称</th>
                <th>类型编码</th>
                <th>模板形态</th>
                <th className="data-table__summary-col">摘要</th>
                <th>创建时间</th>
                <th className="data-table__col--actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    加载中...
                  </td>
                </tr>
              )}
              {!loading && tpls.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    {!isTauri() ? '仅桌面端可查库' : '暂无模板'}
                  </td>
                </tr>
              )}
              {!loading &&
                tpls.map(t => (
                  <tr key={t.id}>
                    <td className="cell-mono">TM-{String(t.id).padStart(2, '0')}</td>
                    <td>{t.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{t.category || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      引导式
                    </td>
                    <td className="data-table__summary-col" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {(() => {
                        const s = parseGuidedSchema(t.guide_schema_json || '')
                        const text = `共 ${s.questions.length} 条提问 · ${s.headerFields.length} 项卷宗要素`
                        return (
                          <span className="data-table__summary-cell" title={text}>
                            {text}
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.created_at || '—'}</td>
                    <td className="data-table__col--actions">
                      <div className="table-actions">
                        <button type="button" className="glass-btn small" onClick={() => openEdit(t)}>
                          编辑
                        </button>
                        <button
                          type="button"
                          className="glass-btn small danger"
                          disabled={actingId === t.id}
                          onClick={() => onDisable(t.id)}
                        >
                          停用
                        </button>
                      </div>
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
      </div>

      {editorOpen && (
        <div className="record-modal-backdrop" role="presentation" onMouseDown={() => setEditorOpen(false)}>
          <div
            className="record-modal record-modal--template-form"
            style={{ width: 'min(880px, 96vw)' }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>{editing ? '编辑模板' : '新建模板'}</h2>
                <p className="record-modal__meta">
                  {editing
                    ? '保存后影响选用该模板的新建笔录；已落库笔录不会自动改写。'
                    : '配置卷宗抬头与引导问答，保存后可在笔录制作中选择本模板。'}
                </p>
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={() => setEditorOpen(false)}>
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <div className="template-form-card">
                <div className="template-form-card__head">基本信息</div>
                <div className="record-modal__grid">
                  <label className="record-modal__field record-modal__field--full">
                    <span>模板名称</span>
                    <input className="glass-input" value={name} onChange={e => setName(e.target.value)} />
                  </label>
                  <label className="record-modal__field record-modal__field--full">
                    <span>模板形态</span>
                    <input className="glass-input" value="引导式（guided）" disabled />
                  </label>
                  <label className="record-modal__field record-modal__field--full">
                    <span>类型编码</span>
                    <input
                      className="glass-input"
                      value={category}
                      placeholder="可留空，将根据模板名自动生成"
                      onChange={e => setCategory(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="template-form-card">
                <div className="template-form-card__head">卷宗要素</div>
                <p className="template-form-hint">
                  字段标识须唯一。文书式「第·次」请用键名 <span className="cell-mono">session_no</span>
                  ；「本笔录共·页」请用 <span className="cell-mono">record_total_pages</span>
                  。留空标识时将根据标签自动生成键名。
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {headerFields.map((row, idx) => (
                    <div
                      key={row.rowId}
                      ref={el => {
                        if (!el) {
                          headerRowEls.current.delete(row.rowId)
                          return
                        }
                        headerRowEls.current.set(row.rowId, el)
                      }}
                      data-header-rowid={row.rowId}
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'minmax(8.5rem, 10.5rem) minmax(0, 1fr) minmax(5rem, 7.5rem) 28px auto',
                        gap: 8,
                        alignItems: 'center',
                        background:
                          draggingHeaderRowId === row.rowId
                            ? 'rgba(0, 212, 170, 0.12)'
                            : dragOverHeaderRowId === row.rowId
                              ? 'rgba(0, 212, 170, 0.08)'
                              : 'transparent',
                        boxShadow:
                          draggingHeaderRowId === row.rowId
                            ? '0 10px 28px rgba(0, 0, 0, 0.22)'
                            : 'none',
                        outline:
                          dragOverHeaderRowId === row.rowId && draggingHeaderRowId !== row.rowId
                            ? '1px dashed rgba(0, 212, 170, 0.55)'
                            : '1px solid transparent',
                        transition: 'background 120ms ease, box-shadow 160ms ease, outline-color 120ms ease',
                        borderRadius: 8,
                        padding: '2px 0',
                      }}
                    >
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            minWidth: 0,
                            width: '100%',
                            flexDirection: row.keyMode === 'custom' ? 'column' : 'row',
                            alignItems: 'stretch',
                          }}
                        >
                          <select
                            className="glass-input"
                            style={{ fontSize: 13, minWidth: 0, width: '100%' }}
                            title="字段标识：建议从下拉选择，避免拼写错误"
                            value={
                              row.keyMode === 'auto'
                                ? '__auto__'
                                : row.keyMode === 'custom'
                                  ? '__custom__'
                                  : row.key
                            }
                            onChange={e => {
                              const v = e.target.value
                              if (v === '__auto__') {
                                setHeaderFields(prev =>
                                  prev.map(h => (h.rowId === row.rowId ? { ...h, keyMode: 'auto', key: '' } : h))
                                )
                                return
                              }
                              if (v === '__custom__') {
                                setHeaderFields(prev =>
                                  prev.map(h =>
                                    h.rowId === row.rowId ? { ...h, keyMode: 'custom', key: '' } : h
                                  )
                                )
                                return
                              }
                              setHeaderFields(prev =>
                                prev.map(h =>
                                  h.rowId === row.rowId ? { ...h, keyMode: 'preset', key: v } : h
                                )
                              )
                            }}
                          >
                            <option value="__auto__">自动生成（不写入标识）</option>
                            {HEADER_FIELD_PRESETS.map(p => (
                              <option key={p.key} value={p.key}>
                                {p.key} · {p.label}
                              </option>
                            ))}
                            <option value="__custom__">自定义…</option>
                          </select>
                          {row.keyMode === 'custom' ? (
                            <input
                              className="glass-input"
                              style={{ fontSize: 13, minWidth: 0, width: '100%' }}
                              value={row.key}
                              placeholder="自定义标识，如 custom_field"
                              title="自定义字段标识（唯一，建议英文/数字/下划线）"
                              onChange={e =>
                                setHeaderFields(prev =>
                                  prev.map(h =>
                                    h.rowId === row.rowId ? { ...h, key: e.target.value } : h
                                  )
                                )
                              }
                            />
                          ) : null}
                        </div>
                        <input
                          className="glass-input"
                          value={row.label}
                          placeholder="卷面标签，如 第几次询问"
                          style={{ minWidth: 0 }}
                          onChange={e =>
                            setHeaderFields(prev =>
                              prev.map(h => (h.rowId === row.rowId ? { ...h, label: e.target.value } : h))
                            )
                          }
                        />
                        <input
                          className="glass-input"
                          value={row.placeholder ?? ''}
                          placeholder="占位（可选）"
                          style={{ minWidth: 0 }}
                          onChange={e =>
                            setHeaderFields(prev =>
                              prev.map(h => (h.rowId === row.rowId ? { ...h, placeholder: e.target.value } : h))
                            )
                          }
                        />
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label="拖拽排序"
                          title="拖拽排序"
                          onPointerDown={e => {
                            e.preventDefault()
                            setDraggingHeaderRowId(row.rowId)
                            setDragOverHeaderRowId(row.rowId)
                          }}
                          style={{
                            cursor: draggingHeaderRowId === row.rowId ? 'grabbing' : 'grab',
                            userSelect: 'none',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {[0, 1, 2].map(i => (
                            <span
                              key={i}
                              style={{
                                width: 4,
                                height: 4,
                                borderRadius: 2,
                                background: 'var(--text-muted)',
                                opacity: draggingHeaderRowId === row.rowId ? 1 : 0.85,
                              }}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          className="glass-btn small"
                          onClick={() => setHeaderFields(prev => prev.filter(h => h.rowId !== row.rowId))}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                    <div>
                      <button
                        type="button"
                        className="glass-btn"
                        onClick={() =>
                          setHeaderFields(prev => [
                            ...prev,
                            {
                              rowId: `new_${Date.now()}_${prev.length}`,
                              key: '',
                              label: '',
                              placeholder: '',
                              keyMode: 'auto',
                            },
                          ])
                        }
                      >
                        + 添加卷宗要素
                      </button>
                    </div>
                  </div>
                </div>

              <div className="template-form-card">
                <div className="template-form-card__head">引导式提问</div>
                <p className="template-form-hint" style={{ marginBottom: 10 }}>
                  支持增删与拖拽排序；用于制作页逐项填写。
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {questions.map((q, idx) => (
                    <div
                      key={q.id}
                      ref={el => {
                        if (!el) {
                          questionRowEls.current.delete(q.id)
                          return
                        }
                        questionRowEls.current.set(q.id, el)
                      }}
                      data-question-id={q.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 28px auto',
                        gap: 8,
                        alignItems: 'center',
                        background:
                          draggingQuestionId === q.id
                            ? 'rgba(0, 212, 170, 0.12)'
                            : dragOverQuestionId === q.id
                              ? 'rgba(0, 212, 170, 0.08)'
                              : 'transparent',
                        boxShadow:
                          draggingQuestionId === q.id ? '0 10px 28px rgba(0, 0, 0, 0.22)' : 'none',
                        outline:
                          dragOverQuestionId === q.id && draggingQuestionId !== q.id
                            ? '1px dashed rgba(0, 212, 170, 0.55)'
                            : '1px solid transparent',
                        transition: 'background 120ms ease, box-shadow 160ms ease, outline-color 120ms ease',
                        borderRadius: 8,
                        padding: '2px 0',
                      }}
                    >
                      <input
                        className="glass-input"
                        value={q.prompt}
                        placeholder={`第 ${idx + 1} 条提问`}
                        onChange={e =>
                          setQuestions(prev =>
                            prev.map(item =>
                              item.id === q.id ? { ...item, prompt: e.target.value } : item
                            )
                          )
                        }
                      />
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label="拖拽排序"
                        title="拖拽排序"
                        onPointerDown={e => {
                          e.preventDefault()
                          setDraggingQuestionId(q.id)
                          setDragOverQuestionId(q.id)
                        }}
                        style={{
                          cursor: draggingQuestionId === q.id ? 'grabbing' : 'grab',
                          userSelect: 'none',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {[0, 1, 2].map(i => (
                          <span
                            key={i}
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: 2,
                              background: 'var(--text-muted)',
                              opacity: draggingQuestionId === q.id ? 1 : 0.85,
                            }}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        className="glass-btn small"
                        onClick={() => setQuestions(prev => prev.filter(item => item.id !== q.id))}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                  <div>
                    <button
                      type="button"
                      className="glass-btn"
                      onClick={() =>
                        setQuestions(prev => [
                          ...prev,
                          { id: `q_${Date.now()}_${prev.length + 1}`, prompt: '' },
                        ])
                      }
                    >
                      + 添加提问
                    </button>
                  </div>
                </div>
              </div>

              {saveError && (
                <p role="alert" style={{ color: 'var(--accent-red)', fontSize: 13, margin: 0 }}>
                  {saveError}
                </p>
              )}
            </div>
            <div className="record-modal__footer">
              <button type="button" className="glass-btn" onClick={() => setEditorOpen(false)}>
                取消
              </button>
              <button type="button" className="glass-btn primary" onClick={onSave}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
