import { useEffect, useState } from 'react'
import type { Record } from '../api'
import { getRecordById } from '../api'
import { dbDateTimeToLocalValue } from '../lib/recordFormUtils'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'
import RecordRichTextEditor from './RecordRichTextEditor'

function statusLabel(value: string): string {
  const v = (value || '').trim()
  if (!v) return '—'
  if (v === 'Draft') return '草稿'
  if (v === 'Pending') return '待审批'
  if (v === 'Approved') return '已审批'
  if (v === 'Rejected') return '已驳回'
  return v
}

function approvalResultLabel(value: string): string {
  const v = (value || '').trim()
  if (!v) return '—'
  const lower = v.toLowerCase()
  if (lower === 'approved' || lower === 'pass' || lower === 'ok' || lower === 'success') {
    return '通过'
  }
  if (lower === 'rejected' || lower === 'reject' || lower === 'fail' || lower === 'denied') {
    return '驳回'
  }
  if (lower === 'pending') return '待处理'
  return v
}

export default function RecordViewModal(props: {
  open: boolean
  recordId?: number
  record?: Record
  onClose: () => void
  zIndex?: number
  showApprovalInfo?: boolean
  showRejectReason?: boolean
}) {
  const {
    open,
    recordId,
    record,
    onClose,
    zIndex = 2400,
    showApprovalInfo = false,
    showRejectReason = false,
  } = props
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState<Record | null>(record ?? null)

  useEffect(() => {
    if (!open) {
      setLoading(false)
      setCurrent(record ?? null)
      return
    }
    if (record) {
      setLoading(false)
      setCurrent(record)
      return
    }
    if (!isTauri() || !recordId) {
      setLoading(false)
      setCurrent(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setCurrent(null)
    ;(async () => {
      try {
        const r = await getRecordById(recordId)
        if (!cancelled) setCurrent(r)
      } catch (e) {
        if (!cancelled) {
          alert(formatInvokeError(e))
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, recordId, record, onClose])

  if (!open) return null

  return (
    <div
      className="record-modal-backdrop"
      role="presentation"
      style={{ zIndex }}
      onMouseDown={onClose}
    >
      <div className="record-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="record-modal__header">
          <div className="record-modal__title-wrap">
            <h2>查看笔录</h2>
            {current && <div className="record-modal__meta">编号：{current.record_id}</div>}
          </div>
          <button type="button" className="record-modal__close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        {loading || !current ? (
          <div className="record-modal__body">
            <p style={{ color: 'var(--text-muted)' }}>{loading ? '加载中…' : '暂无数据'}</p>
          </div>
        ) : (
          <div className="record-modal__body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <div className="record-modal__section-title">基本信息</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
              服刑人员：{current.criminal_name || '—'} · 类型：{current.record_type}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
              谈话时间：{dbDateTimeToLocalValue(current.record_date) || '—'} · 地点：{current.record_location || '—'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
              关联案件（案号）：{current.case_number?.trim() ? current.case_number : '—'}
            </p>
            {showApprovalInfo && (
              <>
                <div className="record-modal__section-title" style={{ marginTop: 16 }}>
                  审批信息
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                  状态：{statusLabel(current.status)}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                  一级审批人：{current.approver1_id || '—'} · 一级结果：{approvalResultLabel(current.approver1_result)}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                  二级审批人：{current.approver2_id || '—'} · 二级结果：{approvalResultLabel(current.approver2_result)}
                </p>
              </>
            )}
            {showRejectReason && current.reject_reason?.trim() && (
              <>
                <div className="record-modal__section-title" style={{ marginTop: 16 }}>
                  驳回理由
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                  {current.reject_reason}
                </p>
              </>
            )}
            <div className="record-modal__section-title" style={{ marginTop: 16 }}>
              正文
            </div>
            <RecordRichTextEditor value={current.content || ''} editable={false} onChange={() => {}} />
          </div>
        )}

        <div className="record-modal__footer">
          <button type="button" className="glass-btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

