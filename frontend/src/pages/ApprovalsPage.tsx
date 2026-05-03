// ApprovalsPage.tsx — 审批中心（阶段 2：对接 SQLite）
import { useCallback, useEffect, useState } from 'react'
import type { Record } from '../api'
import {
  approveRecord,
  getApprovalSummary,
  getRecordById,
  listPendingRecords,
  rejectRecord,
} from '../api'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'
import { dbDateTimeToLocalValue } from '../lib/recordFormUtils'

const statusColor = (s: string) => {
  if (s === 'Approved') return 'var(--status-online)'
  if (s === 'Pending') return 'var(--accent-secondary)'
  if (s === 'Rejected') return 'var(--accent-red)'
  return 'var(--text-muted)'
}

export default function ApprovalsPage() {
  const [summary, setSummary] = useState<{ pending: number; approved_total: number; rejected_total: number } | null>(
    null
  )
  const [pendingList, setPendingList] = useState<Record[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionId, setActionId] = useState<number | null>(null)

  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectTargetId, setRejectTargetId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const [viewOpen, setViewOpen] = useState(false)
  const [viewRecord, setViewRecord] = useState<Record | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  const loadAll = useCallback(async () => {
    if (!isTauri()) {
      setSummary({ pending: 0, approved_total: 0, rejected_total: 0 })
      setPendingList([])
      setLoading(false)
      return
    }
    setError(null)
    setLoading(true)
    try {
      const [s, list] = await Promise.all([getApprovalSummary(), listPendingRecords()])
      setSummary(s)
      setPendingList(list)
    } catch (e) {
      setError(formatInvokeError(e))
      setSummary(null)
      setPendingList([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const openReject = (id: number) => {
    setRejectTargetId(id)
    setRejectReason('')
    setRejectOpen(true)
  }

  const confirmReject = async () => {
    if (rejectTargetId == null) return
    const r = rejectReason.trim()
    if (!r) {
      alert('请填写驳回理由')
      return
    }
    setActionId(rejectTargetId)
    try {
      await rejectRecord(rejectTargetId, r)
      setRejectOpen(false)
      setRejectTargetId(null)
      setRejectReason('')
      await loadAll()
    } catch (e) {
      alert(formatInvokeError(e))
    } finally {
      setActionId(null)
    }
  }

  const handleApprove = async (id: number) => {
    setActionId(id)
    try {
      await approveRecord(id)
      await loadAll()
    } catch (e) {
      alert(formatInvokeError(e))
    } finally {
      setActionId(null)
    }
  }

  const openView = async (id: number) => {
    if (!isTauri()) return
    setViewOpen(true)
    setViewLoading(true)
    setViewRecord(null)
    try {
      const r = await getRecordById(id)
      setViewRecord(r)
    } catch (e) {
      alert(formatInvokeError(e))
      setViewOpen(false)
    } finally {
      setViewLoading(false)
    }
  }

  const pending = pendingList
  const webHint = !isTauri() && (
    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Web 预览模式：请在 Tauri 桌面端使用审批功能。</p>
  )

  return (
    <div className="page">
      <h1 className="page-title">审批中心</h1>
      {webHint}
      {error && <p style={{ color: 'var(--accent-secondary)', fontSize: 13 }}>{error}</p>}

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="glass-card highlighted">
          <div
            className="card-icon"
            style={{ background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.25)' }}
          >
            ⏳
          </div>
          <div className="card-title">待审批</div>
          <div className="card-value" style={{ color: 'var(--accent-secondary)' }}>
            {loading ? '…' : summary?.pending ?? 0}
          </div>
          <div className="card-subtitle">需要及时处理</div>
        </div>
        <div className="glass-card">
          <div className="card-icon" style={{ background: 'rgba(0,212,170,0.12)', border: '1px solid rgba(0,212,170,0.25)' }}>
            ✅
          </div>
          <div className="card-title">已通过</div>
          <div className="card-value">{loading ? '…' : summary?.approved_total ?? 0}</div>
          <div className="card-subtitle">累计</div>
        </div>
        <div className="glass-card">
          <div className="card-icon" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
            ❌
          </div>
          <div className="card-title">已驳回</div>
          <div className="card-value">{loading ? '…' : summary?.rejected_total ?? 0}</div>
          <div className="card-subtitle">累计</div>
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--glass-border)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent-secondary)' }}>
            待审批 ({pending.length})
          </h2>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 48 }}>加载中…</div>
          )}
          {!loading && pending.length === 0 && isTauri() && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 48 }}>暂无待审批项</div>
          )}
          {!loading &&
            pending.map(r => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--glass-border)',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="cell-mono" style={{ fontSize: 12 }}>
                      {r.record_id}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>{r.criminal_name || '未知'}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.record_type}</span>
                    <span className="cell-status" style={{ fontSize: 12 }}>
                      <span className="status-dot" style={{ background: statusColor('Pending') }} />
                      待审批
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                    提交时间：{r.created_at || '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="glass-btn primary small"
                    disabled={!isTauri() || actionId != null}
                    onClick={() => handleApprove(r.id)}
                  >
                    通过
                  </button>
                  <button
                    type="button"
                    className="glass-btn danger small"
                    disabled={!isTauri() || actionId != null}
                    onClick={() => openReject(r.id)}
                  >
                    驳回
                  </button>
                  <button
                    type="button"
                    className="glass-btn small"
                    disabled={!isTauri()}
                    onClick={() => openView(r.id)}
                  >
                    查看
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {rejectOpen && (
        <div
          className="record-modal-backdrop"
          role="presentation"
          style={{ zIndex: 2500 }}
          onMouseDown={() => !actionId && setRejectOpen(false)}
        >
          <div className="record-modal" style={{ maxWidth: 420 }} onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2 style={{ margin: 0, fontSize: 16 }}>驳回笔录</h2>
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={() => !actionId && setRejectOpen(false)}>
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <p className="record-modal__hint" style={{ marginTop: 0 }}>
                请填写驳回理由（必填，不可仅为空格）。
              </p>
              <textarea
                className="glass-input glass-textarea"
                rows={4}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="驳回理由"
                aria-label="驳回理由"
              />
            </div>
            <div className="record-modal__footer">
              <button type="button" className="glass-btn" disabled={actionId != null} onClick={() => setRejectOpen(false)}>
                取消
              </button>
              <button type="button" className="glass-btn danger" disabled={actionId != null} onClick={() => void confirmReject()}>
                确认驳回
              </button>
            </div>
          </div>
        </div>
      )}

      {viewOpen && (
        <div
          className="record-modal-backdrop"
          role="presentation"
          style={{ zIndex: 2400 }}
          onMouseDown={() => setViewOpen(false)}
        >
          <div className="record-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>查看笔录</h2>
                {viewRecord && <div className="record-modal__meta">编号：{viewRecord.record_id}</div>}
              </div>
              <button
                type="button"
                className="record-modal__close"
                aria-label="关闭"
                onClick={() => setViewOpen(false)}
              >
                ×
              </button>
            </div>
            {viewLoading || !viewRecord ? (
              <div className="record-modal__body">
                <p style={{ color: 'var(--text-muted)' }}>加载中…</p>
              </div>
            ) : (
              <div className="record-modal__body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
                <div className="record-modal__section-title">基本信息</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                  服刑人员：{viewRecord.criminal_name || '—'} · 类型：{viewRecord.record_type}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                  谈话时间：{dbDateTimeToLocalValue(viewRecord.record_date) || '—'} · 地点：{viewRecord.record_location || '—'}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                  关联案件（案号）：{viewRecord.case_number?.trim() ? viewRecord.case_number : '—'}
                </p>
                <div className="record-modal__section-title" style={{ marginTop: 16 }}>
                  正文
                </div>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    margin: 0,
                    padding: 12,
                    background: 'rgba(0,0,0,.2)',
                    borderRadius: 8,
                    border: '1px solid var(--glass-border)',
                  }}
                >
                  {viewRecord.content || '（空）'}
                </pre>
              </div>
            )}
            <div className="record-modal__footer">
              <button type="button" className="glass-btn" onClick={() => setViewOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
