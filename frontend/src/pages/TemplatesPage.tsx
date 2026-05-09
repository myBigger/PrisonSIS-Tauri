// TemplatesPage.tsx — 模板管理（阶段 4：分页、搜索、新增/编辑、软删）
import { useCallback, useEffect, useState } from 'react'
import type { Template } from '../api'
import { addTemplate, disableTemplate, getTemplatesByPage, updateTemplate } from '../api'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

const PAGE_SIZE = 12
type TemplateKind = 'free_text' | 'guided'

type GuidedQuestion = {
  id: string
  prompt: string
}

type GuidedSchema = {
  version: number
  headerFields: Array<{ key: string; label: string; placeholder?: string }>
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

function defaultGuidedSchema(): GuidedSchema {
  return {
    version: 1,
    headerFields: SHARED_HEADER_FIELDS,
    questions: [],
    signaturePlaceholder: '被询/讯问人签名：__________',
  }
}

function normalizeKind(kind: string): TemplateKind {
  return kind === 'guided' ? 'guided' : 'free_text'
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
    return {
      version: 1,
      headerFields:
        Array.isArray(parsed.headerFields) && parsed.headerFields.length > 0
          ? parsed.headerFields.filter(f => typeof f?.key === 'string' && typeof f?.label === 'string')
          : SHARED_HEADER_FIELDS,
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

function previewText(s: string, max = 90) {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
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
  const [content, setContent] = useState('')
  const [templateKind, setTemplateKind] = useState<TemplateKind>('free_text')
  const [questions, setQuestions] = useState<GuidedQuestion[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<number | null>(null)

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
    setContent('')
    setTemplateKind('free_text')
    setQuestions([])
    setSaveError(null)
    setEditorOpen(true)
  }

  const openEdit = (t: Template) => {
    setEditing(t)
    setName(t.name || '')
    setCategory(t.category || '')
    setContent(t.content || '')
    setTemplateKind(normalizeKind(t.template_kind))
    setQuestions(
      parseGuidedSchema(t.guide_schema_json || '')
        .questions.map(q => ({ id: q.id, prompt: q.prompt }))
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
      guidedSchema.questions = questions
        .map((q, idx) => ({
          id: q.id.trim() || `q_${idx + 1}`,
          prompt: q.prompt.trim(),
          multiline: q.prompt.length > 48,
        }))
        .filter(q => q.prompt)
      const guide_schema_json = templateKind === 'guided' ? JSON.stringify(guidedSchema) : ''
      const nextContent = templateKind === 'free_text' ? content : ''
      if (editing) {
        await updateTemplate({
          ...editing,
          name: name.trim(),
          category: category.trim(),
          content: nextContent,
          template_kind: templateKind,
          guide_schema_json,
        })
      } else {
        await addTemplate({
          name: name.trim(),
          category: category.trim(),
          content: nextContent,
          template_kind: templateKind,
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
                <th>ID</th>
                <th>模板名称</th>
                <th>类型编码</th>
                <th>模板形态</th>
                <th className="data-table__summary-col">摘要</th>
                <th>创建时间</th>
                <th>操作</th>
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
                      {normalizeKind(t.template_kind) === 'guided' ? '引导式' : '自由正文'}
                    </td>
                    <td className="data-table__summary-col" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      <span
                        className="data-table__summary-cell"
                        title={
                          normalizeKind(t.template_kind) === 'guided'
                            ? `题目数：${parseGuidedSchema(t.guide_schema_json || '').questions.length}`
                            : previewText(t.content, 220)
                        }
                      >
                        {normalizeKind(t.template_kind) === 'guided'
                          ? `共 ${parseGuidedSchema(t.guide_schema_json || '').questions.length} 条提问`
                          : previewText(t.content)}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.created_at || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="glass-btn small" onClick={() => openEdit(t)}>
                          编辑
                        </button>
                        <button
                          type="button"
                          className="glass-btn small"
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
          <div className="record-modal" style={{ maxWidth: 720 }} onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>{editing ? '编辑模板' : '新建模板'}</h2>
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={() => setEditorOpen(false)}>
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <div className="record-modal__grid">
                <label className="record-modal__field record-modal__field--full">
                  <span>模板名称</span>
                  <input className="glass-input" value={name} onChange={e => setName(e.target.value)} />
                </label>
                <label className="record-modal__field record-modal__field--full">
                  <span>模板形态</span>
                  <select
                    className="glass-input glass-input--select"
                    value={templateKind}
                    onChange={e => setTemplateKind(e.target.value as TemplateKind)}
                  >
                    <option value="free_text">自由正文（free_text）</option>
                    <option value="guided">引导式（guided）</option>
                  </select>
                </label>
                <label className="record-modal__field record-modal__field--full">
                  <span>类型编码</span>
                  <input className="glass-input" value={category} onChange={e => setCategory(e.target.value)} />
                </label>
                {templateKind === 'free_text' ? (
                  <label className="record-modal__field record-modal__field--full">
                    <span>模板正文</span>
                    <textarea className="glass-input glass-textarea" rows={10} value={content} onChange={e => setContent(e.target.value)} />
                  </label>
                ) : (
                  <div className="record-modal__field record-modal__field--full">
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                      引导式提问列表（支持增删和排序，抬头字段自动复用）
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {questions.map((q, idx) => (
                        <div
                          key={q.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto auto auto',
                            gap: 8,
                            alignItems: 'center',
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
                          <button
                            type="button"
                            className="glass-btn small"
                            disabled={idx === 0}
                            onClick={() =>
                              setQuestions(prev => {
                                const next = [...prev]
                                const tmp = next[idx - 1]
                                next[idx - 1] = next[idx]
                                next[idx] = tmp
                                return next
                              })
                            }
                          >
                            上移
                          </button>
                          <button
                            type="button"
                            className="glass-btn small"
                            disabled={idx === questions.length - 1}
                            onClick={() =>
                              setQuestions(prev => {
                                const next = [...prev]
                                const tmp = next[idx + 1]
                                next[idx + 1] = next[idx]
                                next[idx] = tmp
                                return next
                              })
                            }
                          >
                            下移
                          </button>
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
                )}
              </div>
              {saveError && <p style={{ color: 'var(--accent-red)', fontSize: 13 }}>{saveError}</p>}
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
