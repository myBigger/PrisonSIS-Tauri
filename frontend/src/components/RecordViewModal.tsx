import { useEffect, useState } from 'react'
import type { Record } from '../api'
import { getRecordById } from '../api'
import { dbDateTimeToLocalValue } from '../lib/recordFormUtils'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'
import RecordFullReadingPreview from './RecordFullReadingPreview'

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

  if (loading || !current) {
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
            </div>
            <button type="button" className="record-modal__close" aria-label="关闭" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="record-modal__body">
            <p style={{ color: 'var(--text-muted)' }}>{loading ? '加载中…' : '暂无数据'}</p>
          </div>
          <div className="record-modal__footer">
            <button type="button" className="glass-btn" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <RecordFullReadingPreview
      open
      onClose={onClose}
      headerTitle="查看笔录"
      zIndex={zIndex}
      viewMode="recordReadonly"
      readOnly
      recordType={current.record_type || ''}
      content={current.content || ''}
      recordId={current.record_id || ''}
      criminalName={current.criminal_name || ''}
      recordDate={dbDateTimeToLocalValue(current.record_date) || ''}
      recordLocation={current.record_location || ''}
      interrogatorId={current.interrogator_id || ''}
      recorderId={current.recorder_id || ''}
      caseNumber={current.case_number?.trim() ? current.case_number : ''}
      approvalInfo={
        showApprovalInfo
          ? {
              statusLabel: statusLabel(current.status),
              approver1Id: current.approver1_id || '',
              approver1Result: approvalResultLabel(current.approver1_result),
              approver2Id: current.approver2_id || '',
              approver2Result: approvalResultLabel(current.approver2_result),
            }
          : undefined
      }
      rejectReason={showRejectReason ? current.reject_reason || '' : ''}
    />
  )
}

