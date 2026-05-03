// TemplatesPage.tsx — 模板管理（阶段 4：分页、搜索、新增/编辑、软删）
import { useCallback, useEffect, useState } from 'react'
import type { Template } from '../api'
import { addTemplate, disableTemplate, getTemplatesByPage, updateTemplate } from '../api'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

const PAGE_SIZE = 12

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

  const openCreate = () => {
    setEditing(null)
    setName('')
    setCategory('')
    setContent('')
    setSaveError(null)
    setEditorOpen(true)
  }

  const openEdit = (t: Template) => {
    setEditing(t)
    setName(t.name || '')
    setCategory(t.category || '')
    setContent(t.content || '')
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
      if (editing) {
        await updateTemplate({
          ...editing,
          name: name.trim(),
          category: category.trim(),
          content,
        })
      } else {
        await addTemplate({
          name: name.trim(),
          category: category.trim(),
          content,
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
                <th>摘要</th>
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
              {!loading && tpls.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
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
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{previewText(t.content)}</td>
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
                  <span>类型编码</span>
                  <input className="glass-input" value={category} onChange={e => setCategory(e.target.value)} />
                </label>
                <label className="record-modal__field record-modal__field--full">
                  <span>模板正文</span>
                  <textarea className="glass-input glass-textarea" rows={10} value={content} onChange={e => setContent(e.target.value)} />
                </label>
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
