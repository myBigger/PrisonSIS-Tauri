import { useCallback, useEffect, useRef } from 'react'
import {
  recordContentToPlainReadingText,
  stripGuidedPaperDuplicatePreamble,
  stripGuidedPaperDuplicateSignatureTail,
} from '../lib/recordContentReading'
import './RecordFullReadingPreview.css'

const AGENCY_NAME = 'XX省XX监狱'
const FIXED_ENDING_LINE = '以上笔录我已看过，和我所说的一样'

type DocKind = '询问笔录' | '讯问笔录' | '现场勘验笔录' | '辨认笔录' | '侦查实验笔录' | '提取笔录'

function inferDocKind(recordType: string): DocKind | null {
  const t = (recordType || '').trim()
  if (!t) return null
  const s = t.replace(/\s+/g, '')
  if (s.includes('现场勘验')) return '现场勘验笔录'
  if (s.includes('辨认')) return '辨认笔录'
  if (s.includes('侦查实验') || s.includes('实验')) return '侦查实验笔录'
  if (s.includes('提取')) return '提取笔录'
  if (s.includes('讯问')) return '讯问笔录'
  if (s.includes('询问')) return '询问笔录'
  return null
}

function softWrapLines(text: string, maxCharsPerLine: number): string[] {
  const src = (text || '').replace(/\r\n/g, '\n')
  const out: string[] = []
  for (const rawLine of src.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line) {
      out.push('')
      continue
    }
    let cur = ''
    for (const ch of line) {
      cur += ch
      if (cur.length >= maxCharsPerLine) {
        out.push(cur)
        cur = ''
      }
    }
    if (cur) out.push(cur)
  }
  return out
}

function LinedReadingBody({ text }: { text: string }) {
  const lines = softWrapLines(text, 32)
  return (
    <div className="record-reading-lined">
      {lines.map((line, i) => (
        <div key={i} className="record-reading-lined__row">
          <span className="record-reading-lined__text">{line || '\u00A0'}</span>
        </div>
      ))}
    </div>
  )
}

function UnderlineValue({ value }: { value: string }) {
  return (
    <span className="record-reading-uv">
      <span className="record-reading-uv__value">{value || '\u00A0'}</span>
    </span>
  )
}

export type RecordFullReadingPreviewProps = {
  open: boolean
  onClose: () => void
  headerTitle?: string
  zIndex?: number
  /** 业务类型（用于映射文书种类） */
  recordType: string
  /** 将保存的正文（Tiptap JSON 或纯文本） */
  content: string
  /** 只读查看 vs 制作草稿 */
  viewMode?: 'guidedDraft' | 'recordReadonly'
  readOnly?: boolean
  guidedUnsynced?: boolean
  guidedDraftPlain?: string
  onSyncToBody?: () => void

  /** 元信息（查看/审批用） */
  recordId?: string
  criminalName?: string
  recordDate?: string
  recordLocation?: string
  interrogatorId?: string
  recorderId?: string
  caseNumber?: string
  /** 次第（第几次）与页数（可选） */
  sessionNo?: string
  totalPages?: string

  /** 审批信息（可选） */
  approvalInfo?: {
    statusLabel?: string
    approver1Id?: string
    approver1Result?: string
    approver2Id?: string
    approver2Result?: string
  }
  rejectReason?: string
}

export default function RecordFullReadingPreview(props: RecordFullReadingPreviewProps) {
  const {
    open,
    onClose,
    headerTitle = '查看笔录',
    zIndex = 12000,
    recordType,
    content,
    viewMode = 'guidedDraft',
    guidedUnsynced = false,
    guidedDraftPlain = '',
    onSyncToBody,
    readOnly = false,
    recordId,
    criminalName,
    recordDate,
    recordLocation,
    interrogatorId,
    recorderId,
    caseNumber,
    sessionNo,
    totalPages,
    approvalInfo,
    rejectReason,
  } = props

  const printCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open || viewMode !== 'recordReadonly') return
    if (!import.meta.env.DEV) return
    // 开发环境指纹：若仍为「大纲+富文本」旧界面，请完全退出应用后在本仓库根目录重新执行 npm run tauri dev，避免连到旧 Vite 进程。
    // eslint-disable-next-line no-console -- dev-only bundle verification
    console.info('[PrisonSIS] 纸面只读查看已挂载', { headerTitle, recordId })
  }, [open, viewMode, headerTitle, recordId])

  useEffect(() => {
    return () => {
      document.body.classList.remove('record-reading-print-active')
      if (printCleanupTimerRef.current != null) {
        clearTimeout(printCleanupTimerRef.current)
        printCleanupTimerRef.current = null
      }
    }
  }, [])

  const print = useCallback(() => {
    if (typeof window.print !== 'function') {
      window.alert('当前环境不支持打印，请使用系统截屏或导出后打印。')
      return
    }

    const endPrintSession = () => {
      document.body.classList.remove('record-reading-print-active')
      if (printCleanupTimerRef.current != null) {
        clearTimeout(printCleanupTimerRef.current)
        printCleanupTimerRef.current = null
      }
      window.removeEventListener('afterprint', endPrintSession)
    }

    document.body.classList.add('record-reading-print-active')
    window.addEventListener('afterprint', endPrintSession, { passive: true })
    printCleanupTimerRef.current = window.setTimeout(endPrintSession, 90_000)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.print()
        } catch (e) {
          endPrintSession()
          window.alert(`打印调用失败：${String(e)}`)
        }
      })
    })
  }, [])

  if (!open) return null

  const canonicalPlain = recordContentToPlainReadingText(content)
  const draftPlain = (guidedDraftPlain || '').trim()
  const hasCanonical = canonicalPlain.trim().length > 0
  const showDraftFallback = !hasCanonical && draftPlain.length > 0
  const showGuidedHints = viewMode === 'guidedDraft'
  const docKind = inferDocKind(recordType) ?? (recordType.trim() || '—')

  const rawPaperBody = hasCanonical ? canonicalPlain : draftPlain
  const paperBodyPlain = (() => {
    let t = rawPaperBody
    if (t.trim()) {
      // 引导草稿：表头与正文前缀可能重复；已落库只读纸面同样来自 composeGuidedContent 时需剥离卷宗/时间地点行
      if (showGuidedHints || viewMode === 'recordReadonly') {
        t = stripGuidedPaperDuplicatePreamble(t, recordType)
      }
    }
    // 无论正文来自草稿还是已同步历史，去掉末尾 schema 签名占位，与纸面固定落款一致
    return stripGuidedPaperDuplicateSignatureTail(t)
  })()

  return (
    <div
      className="record-reading-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-reading-title"
      style={{ zIndex }}
    >
      <div className="record-reading-topbar">
        <h2 id="record-reading-title">{headerTitle}</h2>
        <div style={{ flex: 1 }} />
        <button type="button" className="glass-btn small" onClick={print}>
          打印
        </button>
        <button type="button" className="glass-btn small" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="record-reading-scroll">
        <div className="record-reading-paper">
          <div className="record-reading-head">
            <div className="record-reading-head__agency">{AGENCY_NAME}</div>
            <div className="record-reading-head__title">{docKind}</div>
            <div className="record-reading-head__session">
              第 <UnderlineValue value={sessionNo || ''} /> 次
            </div>
          </div>

          <div className="record-reading-meta">
            <div className="record-reading-meta__row">
              <span className="k">询问时间</span>
              <UnderlineValue value={recordDate || ''} />
              <span className="k" style={{ marginLeft: 12 }}>
                笔录共
              </span>
              <UnderlineValue value={totalPages || ''} />
              <span className="k">页</span>
            </div>
            <div className="record-reading-meta__row">
              <span className="k">询问地点</span>
              <UnderlineValue value={recordLocation || ''} />
            </div>
            <div className="record-reading-meta__row">
              <span className="k">询问人</span>
              <UnderlineValue value={interrogatorId || ''} />
            </div>
            <div className="record-reading-meta__row">
              <span className="k">记录人</span>
              <UnderlineValue value={recorderId || ''} />
            </div>
            <div className="record-reading-meta__row">
              <span className="k">被询问人</span>
              <UnderlineValue value={criminalName || ''} />
            </div>
            {(caseNumber?.trim() || recordId?.trim()) ? (
              <div className="record-reading-meta__row">
                {caseNumber?.trim() ? (
                  <>
                    <span className="k">案号</span>
                    <UnderlineValue value={caseNumber.trim()} />
                  </>
                ) : null}
                {recordId?.trim() ? (
                  <>
                    <span className="k" style={{ marginLeft: caseNumber?.trim() ? 12 : 0 }}>
                      编号
                    </span>
                    <UnderlineValue value={recordId.trim()} />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          {showGuidedHints && guidedUnsynced && hasCanonical ? (
            <div className="record-reading-banner record-reading-banner--warn">
              结构化问答已有更新，与当前正文不一致。保存前建议先同步到正文。
              {!readOnly && onSyncToBody ? (
                <>
                  {' '}
                  <button type="button" className="glass-btn small primary" style={{ marginLeft: 8 }} onClick={onSyncToBody}>
                    同步到正文
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {showGuidedHints && showDraftFallback ? (
            <div className="record-reading-banner">
              正文尚未写入或为空。以下为根据当前结构化填写生成的草稿预览（保存前请使用「同步到正文」写入正式正文）。
            </div>
          ) : null}

          {approvalInfo ? (
            <div className="record-reading-approval">
              <span className="t">审批信息</span>
              <span className="v">状态：{approvalInfo.statusLabel || '—'}</span>
              <span className="v">
                一级：{approvalInfo.approver1Id || '—'}（{approvalInfo.approver1Result || '—'}）
              </span>
              <span className="v">
                二级：{approvalInfo.approver2Id || '—'}（{approvalInfo.approver2Result || '—'}）
              </span>
            </div>
          ) : null}
          {rejectReason?.trim() ? <div className="record-reading-reject">驳回理由：{rejectReason.trim()}</div> : null}

          {hasCanonical ? (
            <LinedReadingBody text={paperBodyPlain} />
          ) : showDraftFallback ? (
            <LinedReadingBody text={paperBodyPlain} />
          ) : (
            <p className="record-reading-empty">暂无正文内容</p>
          )}

          <div className="record-reading-ending">{FIXED_ENDING_LINE}</div>

          <div className="record-reading-footer">
            <div className="left">被询问人签名：__________</div>
            <div className="right">第&nbsp;&nbsp;页</div>
          </div>
        </div>
      </div>
    </div>
  )
}
