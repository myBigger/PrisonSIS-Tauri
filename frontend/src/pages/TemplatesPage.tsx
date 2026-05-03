// TemplatesPage.tsx — 模板管理（列表来自 SQLite，与笔录下拉同源）
import { useEffect, useState } from 'react'
import type { Template } from '../api'
import { getTemplates } from '../api'
import { fallbackTemplatesStub } from '../config/recordTemplatesFallback'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

function previewText(s: string, max = 200) {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export default function TemplatesPage() {
  const [tpls, setTpls] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isTauri()) {
      setTpls(fallbackTemplatesStub())
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const list = await getTemplates()
        if (!cancelled) setTpls(list.length ? list : fallbackTemplatesStub())
      } catch {
        if (!cancelled) setTpls(fallbackTemplatesStub())
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title">模板管理</h1>
        <button type="button" className="glass-btn primary" disabled title="后续迭代开放">
          + 新建模板
        </button>
      </div>

      {!isTauri() && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          Web 预览：以下为占位列表；桌面端将加载数据库中的模板正文。
        </p>
      )}
      {loading && isTauri() && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载中…</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {tpls.map(t => (
          <div
            key={t.id}
            className="glass-panel"
            style={{ padding: 20 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span className="cell-mono" style={{ fontSize: 11 }}>
                    TM-{String(t.id).padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      background: 'rgba(34,197,94,0.12)',
                      color: 'var(--status-online)',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 11,
                    }}
                  >
                    启用
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>类型编码: {t.category || '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  {t.created_at ? `更新: ${t.created_at}` : '来源：系统种子模板'}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {previewText(t.content) || '（无正文，请在桌面端同步数据库）'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <button type="button" className="glass-btn small" disabled title="后续迭代开放">
                  预览
                </button>
                <button type="button" className="glass-btn small" disabled title="后续迭代开放">
                  编辑
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
