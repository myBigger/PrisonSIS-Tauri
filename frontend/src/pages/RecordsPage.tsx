// RecordsPage.tsx — 笔录制作（阶段 1 MVP：对接 SQLite）
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import type { Case, Criminal, Record, RecordInput, Template } from '../api'
import {
  addRecord,
  getRecordById,
  getRecordsByPage,
  getCriminalsByPage,
  getCasesByPage,
  getTemplates,
  updateRecord,
  updateTemplate,
  addTemplate,
  submitRecordForApproval,
} from '../api'
import {
  PRISON_RECORD_LOCATION_OTHER,
  PRISON_RECORD_LOCATION_PRESETS,
  isPresetLocation,
} from '../config/prisonRecordLocations'
import { FALLBACK_TEMPLATE_NAMES, fallbackTemplatesStub } from '../config/recordTemplatesFallback'
import {
  GUIDED_SCHEMA_RT01,
  GUIDED_SCHEMA_RT02,
  GUIDED_SCHEMA_RT03,
  GUIDED_SCHEMA_RT04,
} from '../config/guidedPrisonSchemas'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'
import {
  PLACEHOLDER_INTERVIEW_DATE,
  PLACEHOLDER_PRISONER_NAME,
  dbDateTimeToLocalValue,
  localValueToDbDateTime,
  nowLocalValue,
  todayYmd,
} from '../lib/recordFormUtils'
import { extractPaperSessionAndPagesFromRecordContent, parseGuidedComposeFromPlaintext, recordContentToPlainReadingText } from '../lib/recordContentReading'
import RecordFullReadingPreview from '../components/RecordFullReadingPreview'
import AutoSizeTextarea from '../components/AutoSizeTextarea'
import Icon from '../components/icons/Icon'
import IconButton from '../components/icons/IconButton'
import { useRecordEditSession } from '../context/RecordEditSessionContext'

const PAGE_SIZE = 15
type GuidedSchema = {
  version?: number
  headerFields?: Array<{ key: string; label: string; placeholder?: string }>
  questions?: Array<{ id: string; prompt: string; multiline?: boolean }>
  signaturePlaceholder?: string
}

const GUIDED_SCHEMA_BY_NAME: { [key: string]: string } = {
  入监谈话笔录: GUIDED_SCHEMA_RT01,
  个别教育谈话笔录: GUIDED_SCHEMA_RT02,
  '提押（出庭）谈话笔录': GUIDED_SCHEMA_RT03,
  出监前谈话笔录: GUIDED_SCHEMA_RT04,
}

function parseGuidedSchema(raw: string): GuidedSchema | null {
  if (!raw.trim()) return null
  try {
    const parsed = JSON.parse(raw) as GuidedSchema
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function normalizeGuidedQuestions(
  questions: Array<{ id: string; prompt: string; multiline?: boolean }>
): Array<{ id: string; prompt: string; multiline: boolean }> {
  const seen = new Set<string>()
  return questions
    .map((q, idx) => {
      const prompt = (q.prompt || '').trim()
      if (!prompt) return null
      const baseId = (q.id || '').trim() || `q_${idx + 1}`
      let nextId = baseId
      let salt = 1
      while (seen.has(nextId)) {
        nextId = `${baseId}_${salt}`
        salt += 1
      }
      seen.add(nextId)
      return { id: nextId, prompt, multiline: Boolean(q.multiline) }
    })
    .filter((q): q is { id: string; prompt: string; multiline: boolean } => Boolean(q))
}

/** 引导模板顶栏：适合并排窄列的短字段（与 key / 中文标签启发式一致） */
function isGuidedHeaderShortField(field: { key: string; label: string }): boolean {
  const k = field.key.toLowerCase()
  if (k === 'session_no' || k === 'record_total_pages') return true
  const lab = (field.label || '').trim()
  if (/第几次|共几页|页数|讯问次数|询问次数/.test(lab)) return true
  return false
}

function resolveGuidedSchema(template: Template | undefined, recordType: string): GuidedSchema | null {
  const direct = parseGuidedSchema(template?.guide_schema_json || '')
  if (direct) {
    return { ...direct, questions: normalizeGuidedQuestions(direct.questions ?? []) }
  }
  const fallbackRaw = GUIDED_SCHEMA_BY_NAME[recordType] || ''
  const fallback = parseGuidedSchema(fallbackRaw)
  if (!fallback) {
    return {
      version: 1,
      headerFields: [],
      questions: [],
      signaturePlaceholder: '被询/讯问人签名：__________',
    }
  }
  return { ...fallback, questions: normalizeGuidedQuestions(fallback.questions ?? []) }
}

/** 新建/校正默认类型：优先选「带有效引导题」的模板，避免与异步加载后的列表不一致 */
function pickDefaultRecordType(templatesList: Template[]): string {
  if (!templatesList.length) return ''
  for (const t of templatesList) {
    const s = resolveGuidedSchema(t, t.name)
    if (normalizeGuidedQuestions(s?.questions ?? []).length > 0) return t.name
  }
  return templatesList[0].name
}

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

type GuidedMode = 'step' | 'overview'
type GuidedStepState = 'current' | 'done' | 'skipped' | 'pending'
type GuidedChecklistFilter = 'all' | 'pending' | 'skipped'

type ListPaperPreviewState = {
  recordType: string
  content: string
  recordId: string
  criminalName: string
  recordDate: string
  recordLocation: string
  interrogatorId: string
  recorderId: string
  caseNumber: string
  sessionNo: string
  totalPages: string
  approvalInfo: {
    statusLabel: string
    approver1Id: string
    approver1Result: string
    approver2Id: string
    approver2Result: string
  }
  rejectReason: string
}

export default function RecordsPage() {
  const { setGuard } = useRecordEditSession()
  const [records, setRecords] = useState<Record[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [statusTab, setStatusTab] = useState<StatusTab>('all')

  const [detailOpen, setDetailOpen] = useState(false)
  /** 列表「查看」：纸面全文只读（不打开制作弹窗） */
  const [listPaperPreview, setListPaperPreview] = useState<ListPaperPreviewState | null>(null)
  const [listPaperLoadingId, setListPaperLoadingId] = useState<number | null>(null)
  /** 新建笔录：先填基本信息对话框，确认后再打开全屏制作 */
  const [createPreflightOpen, setCreatePreflightOpen] = useState(false)
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
    case_id: null,
  }))
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingRecordId, setEditingRecordId] = useState('')
  /** 当前弹层对应笔录在库中的状态（新建未落库时为空字符串） */
  const [editingRecordStatus, setEditingRecordStatus] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerList, setPickerList] = useState<Criminal[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)

  const [templates, setTemplates] = useState<Template[]>([])
  const [caseOptions, setCaseOptions] = useState<Case[]>([])
  const [detailCaseNumberDisplay, setDetailCaseNumberDisplay] = useState('')
  const [resolvedCriminalName, setResolvedCriminalName] = useState('')
  const [overwritePrompt, setOverwritePrompt] = useState<OverwritePrompt>(null)
  const [editorApi, setEditorApi] = useState<TiptapEditor | null>(null)
  const [editorText, setEditorText] = useState('')
  /** 富文本初始化会把模板正文规范化（JSON 化）；用基线对比来判断“是否真的被用户修改过” */
  const [contentBaseline, setContentBaseline] = useState('')
  const [contentDirty, setContentDirty] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [guidedMeta, setGuidedMeta] = useState<{ [key: string]: string }>({})
  const [guidedAnswers, setGuidedAnswers] = useState<{ [key: string]: string }>({})
  const [guidedSessionQuestions, setGuidedSessionQuestions] = useState<Array<{ id: string; prompt: string; multiline?: boolean }>>([])
  const [guidedSessionDirty, setGuidedSessionDirty] = useState(false)
  const [guidedMode, setGuidedMode] = useState<GuidedMode>('step')
  const [guidedCurrentStepIndex, setGuidedCurrentStepIndex] = useState(0)
  const [guidedSkippedMap, setGuidedSkippedMap] = useState<{ [key: string]: boolean }>({})
  const [guidedPreviewOpen, setGuidedPreviewOpen] = useState(false)
  const [guidedChecklistOpen, setGuidedChecklistOpen] = useState(false)
  const [guidedChecklistFilter, setGuidedChecklistFilter] = useState<GuidedChecklistFilter>('pending')
  const [guidedAddQuestionConfirmOpen, setGuidedAddQuestionConfirmOpen] = useState(false)
  const [guidedDeleteConfirm, setGuidedDeleteConfirm] = useState<{ id: string; prompt: string } | null>(null)
  const [guidedTemplateSaveOpen, setGuidedTemplateSaveOpen] = useState(false)
  const [guidedTemplateSaveAsNew, setGuidedTemplateSaveAsNew] = useState(false)
  const [guidedTemplateNewName, setGuidedTemplateNewName] = useState('')
  /** 总览 / 单题：正在编辑题干的问题 id（null 为只读展示题干） */
  const [guidedPromptEditId, setGuidedPromptEditId] = useState<string | null>(null)
  /** 总览：操作总开关（拖拽/编辑/删除） */
  const [guidedOverviewManageOn, setGuidedOverviewManageOn] = useState(false)
  /** 总览：拖拽排序（指针拖拽，不依赖 HTML5 drag&drop） */
  const [guidedOverviewDraggingId, setGuidedOverviewDraggingId] = useState<string | null>(null)
  const [guidedOverviewDragOverId, setGuidedOverviewDragOverId] = useState<string | null>(null)
  /** 总览：点击卡片高亮（与单题卡视觉一致，便于扫读定位） */
  const [guidedOverviewFocusedId, setGuidedOverviewFocusedId] = useState<string | null>(null)
  const guidedOverviewRowEls = useRef(new Map<string, HTMLDivElement>())
  const guidedOverviewPrevRects = useRef(new Map<string, DOMRect>())
  const guidedCurrentQuestionIdRef = useRef<string | null>(null)
  const [guidedLastAutosaveAt, setGuidedLastAutosaveAt] = useState<number | null>(null)
  const [guidedLastSyncedAt, setGuidedLastSyncedAt] = useState<number | null>(null)
  const [guidedSyncSnapshot, setGuidedSyncSnapshot] = useState('')
  const [guidedHint, setGuidedHint] = useState('')
  /** 卷宗要素（模板 headerFields）默认展开，可折叠以腾出纵向空间 */
  const [guidedSchemaHeaderExpanded, setGuidedSchemaHeaderExpanded] = useState(true)
  const [templateSyncing, setTemplateSyncing] = useState(false)
  const pendingOpenedRef = useRef(false)
  /** 编辑态从正文回填引导问答/卷宗要素，每条笔录只执行一次，避免覆盖用户修改 */
  const guidedRehydratedForEditRef = useRef<number | null>(null)

  const discardEditingSession = useCallback(() => {
    setOverwritePrompt(null)
    setGuidedPreviewOpen(false)
    setGuidedChecklistOpen(false)
    setGuidedAddQuestionConfirmOpen(false)
    setGuidedDeleteConfirm(null)
    setGuidedTemplateSaveOpen(false)
    setGuidedPromptEditId(null)
    setGuidedOverviewFocusedId(null)
    setCreatePreflightOpen(false)
    setDetailOpen(false)
  }, [])

  const PENDING_KEY = 'prisonsis_pending_record_view'
  /** 帮助（待接入）：原引导新手文案 —— 推荐先用「单题」逐题推进；需要快速回看时切到「总览」。 */
  const GUIDED_MODE_KEY = 'prisonsis_guided_mode_last'
  const GUIDED_OVERVIEW_MANAGE_KEY = 'prisonsis_guided_overview_manage'

  const getPreferredGuidedMode = useCallback((): GuidedMode => {
    try {
      const saved = localStorage.getItem(GUIDED_MODE_KEY)
      return saved === 'overview' ? 'overview' : 'step'
    } catch {
      return 'step'
    }
  }, [])

  const getPreferredOverviewManageOn = useCallback((): boolean => {
    try {
      return localStorage.getItem(GUIDED_OVERVIEW_MANAGE_KEY) === '1'
    } catch {
      return false
    }
  }, [])

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

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ page?: string; search?: string }>
      if (ce.detail?.page !== 'records') return
      const searchText = (ce.detail?.search || '').trim()
      setSearchInput(searchText)
      setAppliedSearch(searchText)
      setPage(0)
    }
    window.addEventListener('prisonsis:apply-search', handler as EventListener)
    return () => window.removeEventListener('prisonsis:apply-search', handler as EventListener)
  }, [])

  // Esc：先关最上层浮层
  useEffect(() => {
    if (!detailOpen && !createPreflightOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (createPreflightOpen) {
        setCreatePreflightOpen(false)
        return
      }
      if (guidedPreviewOpen) {
        setGuidedPreviewOpen(false)
        return
      }
      if (guidedChecklistOpen) {
        setGuidedChecklistOpen(false)
        return
      }
      if (guidedDeleteConfirm) {
        setGuidedDeleteConfirm(null)
        return
      }
      if (guidedAddQuestionConfirmOpen) {
        setGuidedAddQuestionConfirmOpen(false)
        return
      }
      if (guidedTemplateSaveOpen) {
        setGuidedTemplateSaveOpen(false)
        return
      }
      if (drawerOpen) setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    detailOpen,
    createPreflightOpen,
    drawerOpen,
    guidedPreviewOpen,
    guidedChecklistOpen,
    guidedDeleteConfirm,
    guidedAddQuestionConfirmOpen,
    guidedTemplateSaveOpen,
  ])

  useEffect(() => {
    if (!detailOpen) {
      setGuidedAddQuestionConfirmOpen(false)
      setGuidedDeleteConfirm(null)
      setGuidedTemplateSaveOpen(false)
      setGuidedPromptEditId(null)
    }
  }, [detailOpen])

  useEffect(() => {
    if (!detailOpen) {
      guidedRehydratedForEditRef.current = null
      setGuidedOverviewFocusedId(null)
    }
  }, [detailOpen])

  useEffect(() => {
    if (guidedMode !== 'overview') setGuidedOverviewFocusedId(null)
  }, [guidedMode])

  useEffect(() => {
    setGuidedPromptEditId(null)
  }, [guidedMode, guidedCurrentStepIndex])

  useEffect(() => {
    setGuidedSchemaHeaderExpanded(false)
  }, [form.record_type, detailOpen])

  useEffect(() => {
    if (!detailOpen && !createPreflightOpen) return
    const template = templates.find(t => t.name === form.record_type)
    const schema = resolveGuidedSchema(template, form.record_type)
    const base = normalizeGuidedQuestions(schema?.questions ?? [])
    setGuidedSessionQuestions(base)
    setGuidedSessionDirty(false)
    setGuidedPromptEditId(null)
  }, [detailOpen, createPreflightOpen, form.record_type, templates])

  /** 编辑已有笔录：从 composeGuidedContent 保存的正文回填引导态（查看能显示但编辑曾清空 guided*） */
  useEffect(() => {
    if (!detailOpen || detailLoading || editingId == null) return
    if (detailReadonly) return

    const template = templates.find(t => t.name === form.record_type)
    const schema = resolveGuidedSchema(template, form.record_type)
    const normQs = normalizeGuidedQuestions(schema?.questions ?? [])
    if (!schema || normQs.length === 0) return

    const plain = recordContentToPlainReadingText(form.content)
    if (!plain.includes('问：')) return

    if (guidedRehydratedForEditRef.current === editingId) return

    const { meta: parsedMeta, answers: parsedAnswers } = parseGuidedComposeFromPlaintext(
      plain,
      form.record_type,
      schema.headerFields ?? [],
      normQs,
    )

    const hasParsed =
      Object.keys(parsedAnswers).some(k => (parsedAnswers[k] || '').trim()) ||
      Object.values(parsedMeta).some(v => (v || '').trim())
    if (!hasParsed) return

    const fullMeta: { [key: string]: string } = {}
    for (const hf of schema.headerFields ?? []) {
      fullMeta[hf.key] = parsedMeta[hf.key] ?? ''
    }
    const fullAnswers: { [key: string]: string } = {}
    for (const q of normQs) {
      fullAnswers[q.id] = parsedAnswers[q.id] ?? ''
    }

    setGuidedMeta(fullMeta)
    setGuidedAnswers(fullAnswers)
    setGuidedSyncSnapshot(form.content)
    setGuidedLastSyncedAt(Date.now())
    guidedRehydratedForEditRef.current = editingId
  }, [
    detailOpen,
    detailLoading,
    detailReadonly,
    editingId,
    form.record_type,
    form.content,
    templates,
  ])

  /** 弹窗打开时拉取模板列表 */
  useEffect(() => {
    if ((!detailOpen && !createPreflightOpen) || !isTauri()) return
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
  }, [detailOpen, createPreflightOpen])

  /** 弹窗打开时拉取案件列表（笔录可选关联） */
  useEffect(() => {
    if ((!detailOpen && !createPreflightOpen) || !isTauri()) return
    let cancelled = false
    ;(async () => {
      try {
        const [list] = await getCasesByPage(0, 500, '')
        if (!cancelled) setCaseOptions(list)
      } catch {
        if (!cancelled) setCaseOptions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [detailOpen, createPreflightOpen])

  /** 新建且正文为空：模板到达后套用正文 */
  useEffect(() => {
    if (!detailOpen || editingId != null || detailLoading || !templates.length) return
    setForm(f => {
      if (f.content.trim() !== '') return f
      const t = templates.find(x => x.name === f.record_type)
      if (!t) return f
      const schema = resolveGuidedSchema(t, f.record_type)
      if (schema) {
        const nextMeta: { [key: string]: string } = {}
        for (const hf of schema.headerFields ?? []) nextMeta[hf.key] = ''
        setGuidedMeta(nextMeta)
        setGuidedAnswers({})
        return { ...f, content: '' }
      }
      return t.content ? { ...f, content: t.content } : f
    })
  }, [detailOpen, editingId, detailLoading, templates])

  /** 详情打开时预拉服刑人员列表，便于展示姓名 */
  useEffect(() => {
    if ((!detailOpen && !createPreflightOpen) || !isTauri() || !form.criminal_id) return
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
  }, [detailOpen, createPreflightOpen, form.criminal_id])

  useEffect(() => {
    if ((!detailOpen && !createPreflightOpen) || !pickerOpen || !isTauri()) return
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
  }, [detailOpen, createPreflightOpen, pickerOpen, pickerSearch])

  useEffect(() => {
    if (!detailOpen && !createPreflightOpen) setOverwritePrompt(null)
  }, [detailOpen, createPreflightOpen])

  // 首次拿到“规范化后的 JSON content”时设为基线；只有偏离基线才算用户修改过正文
  useEffect(() => {
    if (!detailOpen) return
    if (!editorApi) return
    if (contentBaseline) return
    if (!form.content.trim()) return
    setContentBaseline(form.content)
    setContentDirty(false)
  }, [detailOpen, editorApi, contentBaseline, form.content])

  const selectedCriminalName = (): string => {
    const hit = pickerList.find(c => c.id === form.criminal_id)
    if (hit) return hit.name
    if (resolvedCriminalName) return resolvedCriminalName
    return form.criminal_id ? `ID ${form.criminal_id}` : '未选择'
  }

  const selectedTemplate = templates.find(t => t.name === form.record_type)
  const selectedGuidedSchema = resolveGuidedSchema(selectedTemplate, form.record_type)
  const isGuidedTemplate = normalizeGuidedQuestions(selectedGuidedSchema?.questions ?? []).length > 0
  const guidedQuestions = guidedSessionQuestions
  const guidedQuestionCount = guidedQuestions.length
  const guidedCurrentQuestion =
    guidedQuestionCount > 0 ? guidedQuestions[Math.max(0, Math.min(guidedCurrentStepIndex, guidedQuestionCount - 1))] : null
  guidedCurrentQuestionIdRef.current = guidedCurrentQuestion?.id ?? null
  const guidedAutoInkTokenKeys = useMemo(
    () => selectedGuidedSchema?.headerFields?.map(field => (field.label || '').trim()).filter(Boolean) ?? [],
    [selectedGuidedSchema]
  )

  const composeGuidedContent = () => {
    if (!selectedGuidedSchema) return ''
    const lines: string[] = []
    lines.push(form.record_type)
    lines.push('')
    lines.push(`时间：${form.record_date || ''}`)
    lines.push(`地点：${form.record_location || ''}`)
    lines.push(`询/讯问人：${form.interrogator_id || ''}`)
    lines.push(`记录人：${form.recorder_id || ''}`)
    lines.push(`被询/讯问人：${selectedCriminalName()}`)
    for (const field of selectedGuidedSchema.headerFields ?? []) {
      lines.push(`${field.label}：${guidedMeta[field.key] ?? ''}`)
    }
    lines.push('')
    for (const q of guidedQuestions) {
      lines.push(`问：${q.prompt}`)
      lines.push(`答：${guidedAnswers[q.id] ?? ''}`)
      lines.push('')
    }
    // 纸面预览底部已有固定「以上笔录…」+「被询问人签名」栏，此处不再写入 schema 中的签名占位，避免重复
    return lines.join('\n')
  }

  const guidedDraftContent = isGuidedTemplate ? composeGuidedContent() : ''
  const guidedHasUnsyncedChanges =
    isGuidedTemplate && guidedDraftContent.trim() !== '' && guidedDraftContent !== guidedSyncSnapshot

  const dossierHeaderList = selectedGuidedSchema?.headerFields ?? []
  const dossierShortFields = dossierHeaderList.filter(isGuidedHeaderShortField)
  const dossierLongFields = dossierHeaderList.filter(f => !isGuidedHeaderShortField(f))
  const dossierHeaderTotal = dossierHeaderList.length
  const dossierHeaderFilledCount = dossierHeaderList.filter(f => (guidedMeta[f.key] ?? '').trim()).length

  const clampGuidedStep = useCallback(
    (next: number) => {
      if (guidedQuestionCount <= 0) return 0
      return Math.max(0, Math.min(guidedQuestionCount - 1, next))
    },
    [guidedQuestionCount]
  )

  const markGuidedAutosaved = useCallback((msg = '进度已暂存') => {
    setGuidedLastAutosaveAt(Date.now())
    setGuidedHint(msg)
  }, [])

  useEffect(() => {
    if (!guidedHint) return
    const t = window.setTimeout(() => setGuidedHint(''), 1500)
    return () => window.clearTimeout(t)
  }, [guidedHint])

  const goToGuidedStep = useCallback(
    (next: number) => {
      setGuidedCurrentStepIndex(clampGuidedStep(next))
    },
    [clampGuidedStep]
  )

  const isGuidedQuestionAnswered = useCallback(
    (questionId: string) => {
      return Boolean((guidedAnswers[questionId] ?? '').trim())
    },
    [guidedAnswers]
  )

  const guidedUnansweredIds = useMemo(
    () =>
      guidedQuestions
        .filter(q => !isGuidedQuestionAnswered(q.id) && !guidedSkippedMap[q.id])
        .map(q => q.id),
    [guidedQuestions, isGuidedQuestionAnswered, guidedSkippedMap]
  )

  const guidedStepStateMap = useMemo(() => {
    const map: { [key: string]: GuidedStepState } = {}
    for (const q of guidedQuestions) {
      if (guidedCurrentQuestion?.id === q.id) {
        map[q.id] = 'current'
      } else if (isGuidedQuestionAnswered(q.id)) {
        map[q.id] = 'done'
      } else if (guidedSkippedMap[q.id]) {
        map[q.id] = 'skipped'
      } else {
        map[q.id] = 'pending'
      }
    }
    return map
  }, [guidedQuestions, guidedCurrentQuestion, isGuidedQuestionAnswered, guidedSkippedMap])
  const guidedProgressCount = useMemo(
    () =>
      guidedQuestions.filter(
        q => isGuidedQuestionAnswered(q.id) || Boolean(guidedSkippedMap[q.id])
      ).length,
    [guidedQuestions, isGuidedQuestionAnswered, guidedSkippedMap]
  )
  const guidedProgressRatio = guidedQuestionCount > 0 ? guidedProgressCount / guidedQuestionCount : 0
  const isGuidedLastStep =
    guidedQuestionCount > 0 && guidedCurrentStepIndex === guidedQuestionCount - 1
  const guidedAllHandled = guidedQuestionCount > 0 && guidedUnansweredIds.length === 0

  useEffect(() => {
    if (
      guidedOverviewFocusedId &&
      !guidedQuestions.some(q => q.id === guidedOverviewFocusedId)
    ) {
      setGuidedOverviewFocusedId(null)
    }
  }, [guidedQuestions, guidedOverviewFocusedId])

  const templateBodyForType = (typeName: string): string => {
    const t = templates.find(x => x.name === typeName)
    return t?.content ?? ''
  }

  const applyTemplateWithConfirm = (nextType: string, nextBody: string) => {
    const go = () => setForm(f => ({ ...f, record_type: nextType, content: nextBody }))
    // 仅当用户真的修改过正文（dirty）才需要覆盖确认
    if (!contentDirty || !editorText.trim()) {
      setContentBaseline('')
      setContentDirty(false)
      go()
      return
    }
    // 覆盖确认弹窗必须处于最前，避免被“基本信息抽屉”遮挡
    setDrawerOpen(false)
    setOverwritePrompt({ kind: 'recordType', nextType, nextBody: nextBody })
  }

  const handleRecordTypeSelect = (nextType: string) => {
    if (nextType === form.record_type) return
    const nextTemplate = templates.find(t => t.name === nextType)
    const schema = resolveGuidedSchema(nextTemplate, nextType)
    if (schema) {
      const nextMeta: { [key: string]: string } = {}
      for (const hf of schema?.headerFields ?? []) nextMeta[hf.key] = ''
      setGuidedMeta(nextMeta)
      setGuidedAnswers({})
      setGuidedSessionQuestions(normalizeGuidedQuestions(schema.questions ?? []))
      setGuidedSessionDirty(false)
      setGuidedCurrentStepIndex(0)
      setGuidedSkippedMap({})
      setGuidedHint('')
      setGuidedSyncSnapshot('')
      applyTemplateWithConfirm(nextType, '')
      return
    }
    applyTemplateWithConfirm(nextType, templateBodyForType(nextType))
  }

  /** 切换类型且不弹覆盖确认（用于模板库校正孤儿 record_type） */
  const applyProgrammaticRecordType = useCallback(
    (nextType: string) => {
      const list = templates.length > 0 ? templates : fallbackTemplatesStub()
      const nextTemplate = list.find(t => t.name === nextType)
      const schema = resolveGuidedSchema(nextTemplate, nextType)
      const nextMeta: { [key: string]: string } = {}
      for (const hf of schema?.headerFields ?? []) nextMeta[hf.key] = ''
      setGuidedMeta(nextMeta)
      setGuidedAnswers({})
      setGuidedSessionQuestions(normalizeGuidedQuestions(schema?.questions ?? []))
      setGuidedSessionDirty(false)
      setGuidedCurrentStepIndex(0)
      setGuidedSkippedMap({})
      setGuidedSyncSnapshot('')
      setContentBaseline('')
      setContentDirty(false)
      setForm(f => ({ ...f, record_type: nextType, content: '' }))
    },
    [templates]
  )

  /** record_type 不在当前模板库时自动对齐（新建异步加载 / 编辑旧数据） */
  useLayoutEffect(() => {
    if (!detailOpen || detailLoading) return
    if (!form.record_type.trim()) return
    const list = templates.length > 0 ? templates : fallbackTemplatesStub()
    if (!list.length) return
    if (list.some(t => t.name === form.record_type)) return
    const next = pickDefaultRecordType(list)
    if (!next) return
    setGuidedHint(`原笔录类型已不在模板库中，已切换为「${next}」。`)
    applyProgrammaticRecordType(next)
  }, [detailOpen, detailLoading, templates, form.record_type, applyProgrammaticRecordType])

  const handleApplyTemplateClick = () => {
    if (isGuidedTemplate) {
      setContentBaseline('')
      setContentDirty(false)
      const next = composeGuidedContent()
      setForm(f => ({ ...f, content: next }))
      setGuidedSyncSnapshot(next)
      setGuidedLastSyncedAt(Date.now())
      setGuidedHint('任务已同步到正文')
      return
    }
    const body = templateBodyForType(form.record_type)
    if (!body) {
      alert('当前类型暂无模板正文')
      return
    }
    if (!contentDirty || !editorText.trim()) {
      setContentBaseline('')
      setContentDirty(false)
      setForm(f => ({ ...f, content: body }))
      return
    }
    // 覆盖确认弹窗必须处于最前，避免被“基本信息抽屉”遮挡
    setDrawerOpen(false)
    setOverwritePrompt({ kind: 'applyTemplate', body })
  }

  useEffect(() => {
    if (!detailOpen) return
    setGuidedMode(getPreferredGuidedMode())
    setGuidedOverviewManageOn(getPreferredOverviewManageOn())
  }, [detailOpen, getPreferredGuidedMode, getPreferredOverviewManageOn])

  useEffect(() => {
    try {
      localStorage.setItem(GUIDED_OVERVIEW_MANAGE_KEY, guidedOverviewManageOn ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [guidedOverviewManageOn])

  useEffect(() => {
    // 仅总览需要该开关；切回单题/只读时收起，避免视觉干扰
    if (guidedMode !== 'overview' || detailReadonly) {
      setGuidedOverviewManageOn(false)
      setGuidedPromptEditId(null)
      setGuidedOverviewDraggingId(null)
      setGuidedOverviewDragOverId(null)
    }
  }, [guidedMode, detailReadonly])

  useEffect(() => {
    try {
      localStorage.setItem(GUIDED_MODE_KEY, guidedMode)
    } catch {
      /* ignore */
    }
  }, [guidedMode])

  useEffect(() => {
    setGuidedCurrentStepIndex(prev => clampGuidedStep(prev))
  }, [guidedQuestionCount, clampGuidedStep])

  useEffect(() => {
    if (!detailOpen || !isGuidedTemplate) return
    if (guidedSyncSnapshot) return
    if (!form.content.trim()) return
    setGuidedSyncSnapshot(form.content)
    setGuidedLastSyncedAt(Date.now())
  }, [detailOpen, isGuidedTemplate, guidedSyncSnapshot, form.content])

  const cancelOverwrite = () => setOverwritePrompt(null)

  const confirmOverwrite = () => {
    if (!overwritePrompt) return
    if (overwritePrompt.kind === 'recordType') {
      setContentBaseline('')
      setContentDirty(false)
      setForm(f => ({
        ...f,
        record_type: overwritePrompt.nextType,
        content: overwritePrompt.nextBody,
      }))
    } else {
      setContentBaseline('')
      setContentDirty(false)
      setForm(f => ({ ...f, content: overwritePrompt.body }))
    }
    setOverwritePrompt(null)
  }

  const handleInsertDateClick = () => {
    if (!editorApi) return
    const today = todayYmd()
    const placeholder = PLACEHOLDER_INTERVIEW_DATE
    const html = editorApi.getHTML()
    editorApi.commands.focus()
    if (editorApi.getText().includes(placeholder) && html.includes(placeholder)) {
      const nextHtml = html.split(placeholder).join(today)
      editorApi.commands.setContent(nextHtml)
      return
    }
    editorApi.commands.insertContent(today)
  }

  const handleReplaceNameClick = () => {
    if (!form.criminal_id) {
      alert('请先选择服刑人员')
      return
    }
    if (!editorApi) return
    const placeholder = PLACEHOLDER_PRISONER_NAME
    const name = selectedCriminalName()
    const html = editorApi.getHTML()
    editorApi.commands.focus()
    if (editorApi.getText().includes(placeholder) && html.includes(placeholder)) {
      const nextHtml = html.split(placeholder).join(name)
      editorApi.commands.setContent(nextHtml)
      return
    }
    editorApi.commands.insertContent(name)
  }

  const handleSearchSubmit = () => {
    setAppliedSearch(searchInput.trim())
    setPage(0)
  }

  const setGuidedAnswer = (questionId: string, value: string) => {
    setGuidedAnswers(prev => ({
      ...prev,
      [questionId]: value,
    }))
    setGuidedSkippedMap(prev => ({
      ...prev,
      [questionId]: false,
    }))
  }

  const setGuidedQuestionPrompt = (questionId: string, prompt: string) => {
    setGuidedSessionQuestions(prev =>
      prev.map(q => (q.id === questionId ? { ...q, prompt } : q))
    )
    setGuidedSessionDirty(true)
  }

  const moveGuidedQuestion = useCallback((fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return
    setGuidedSessionQuestions(prev => {
      const from = prev.findIndex(q => q.id === fromId)
      const to = prev.findIndex(q => q.id === toId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)

      // 保持“当前题”指向同一个 id（避免拖拽后单题索引跳题）
      const curId = guidedCurrentQuestionIdRef.current
      if (curId) {
        const nextIndex = next.findIndex(q => q.id === curId)
        if (nextIndex >= 0) setGuidedCurrentStepIndex(nextIndex)
      }
      return next
    })
    setGuidedSessionDirty(true)
  }, [])

  useEffect(() => {
    if (detailReadonly) return
    if (guidedMode !== 'overview') return
    if (!guidedOverviewManageOn) return
    if (!guidedOverviewDraggingId) return
    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const hit = el?.closest?.('[data-guided-overview-qid]') as HTMLElement | null
      const toId = hit?.dataset?.guidedOverviewQid
      if (!toId) return
      if (toId === guidedOverviewDragOverId) return
      setGuidedOverviewDragOverId(toId)
      moveGuidedQuestion(guidedOverviewDraggingId, toId)
    }
    const onUp = () => {
      setGuidedOverviewDraggingId(null)
      setGuidedOverviewDragOverId(null)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [
    detailReadonly,
    guidedMode,
    guidedOverviewManageOn,
    guidedOverviewDraggingId,
    guidedOverviewDragOverId,
    moveGuidedQuestion,
  ])

  useLayoutEffect(() => {
    if (guidedMode !== 'overview') return
    if (!guidedOverviewManageOn) return
    const ids = guidedQuestions.map(q => q.id)
    const nextRects = new Map<string, DOMRect>()
    for (const id of ids) {
      const el = guidedOverviewRowEls.current.get(id)
      if (!el) continue
      nextRects.set(id, el.getBoundingClientRect())
    }
    for (const id of ids) {
      const el = guidedOverviewRowEls.current.get(id)
      const prev = guidedOverviewPrevRects.current.get(id)
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
    guidedOverviewPrevRects.current = nextRects
  }, [guidedMode, guidedOverviewManageOn, guidedQuestions])

  const addGuidedQuestion = () => {
    if (detailReadonly) return
    const nextId = `q_manual_${Date.now().toString(36)}`
    const nextQuestion = {
      id: nextId,
      prompt: `新增问题 ${guidedSessionQuestions.length + 1}`,
      multiline: true,
    }
    setGuidedSessionQuestions(prev => [...prev, nextQuestion])
    setGuidedCurrentStepIndex(guidedSessionQuestions.length)
    setGuidedSessionDirty(true)
    markGuidedAutosaved('已新增问题')
  }

  const removeGuidedQuestion = (questionId: string) => {
    if (detailReadonly) return
    setGuidedSessionQuestions(prev => {
      const idx = prev.findIndex(q => q.id === questionId)
      if (idx < 0) return prev
      const next = prev.filter(q => q.id !== questionId)
      setGuidedCurrentStepIndex(cur => {
        if (next.length === 0) return 0
        if (cur > idx) return cur - 1
        return Math.min(cur, next.length - 1)
      })
      return next
    })
    setGuidedAnswers(prev => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
    setGuidedSkippedMap(prev => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
    setGuidedSessionDirty(true)
    markGuidedAutosaved('已删除问题')
  }

  const openGuidedDeleteConfirm = (questionId: string) => {
    setGuidedPromptEditId(null)
    const q = guidedSessionQuestions.find(x => x.id === questionId)
    setGuidedDeleteConfirm({
      id: questionId,
      prompt: (q?.prompt ?? '').trim() || '（无标题）',
    })
  }

  const confirmGuidedAddQuestion = () => {
    addGuidedQuestion()
    setGuidedAddQuestionConfirmOpen(false)
  }

  const confirmGuidedDeleteQuestion = () => {
    if (!guidedDeleteConfirm) return
    removeGuidedQuestion(guidedDeleteConfirm.id)
    setGuidedDeleteConfirm(null)
  }

  const openGuidedSaveTemplateDialog = () => {
    if (!selectedTemplate || detailReadonly) return
    if (!isTauri()) {
      alert('保存模板仅支持桌面端运行。')
      return
    }
    const schema = resolveGuidedSchema(selectedTemplate, form.record_type)
    if (!schema) {
      alert('当前模板缺少可用的引导式 schema，无法保存。')
      return
    }
    const normalized = normalizeGuidedQuestions(guidedSessionQuestions)
    if (!normalized.length) {
      alert('至少保留一个问题后再保存到模板。')
      return
    }
    setGuidedTemplateSaveAsNew(false)
    setGuidedTemplateNewName(`${selectedTemplate.name}（副本）`)
    setGuidedTemplateSaveOpen(true)
  }

  const confirmGuidedSaveTemplateToLibrary = async () => {
    if (!selectedTemplate || detailReadonly) return
    const schema = resolveGuidedSchema(selectedTemplate, form.record_type)
    if (!schema) {
      alert('当前模板缺少可用的引导式 schema，无法保存。')
      return
    }
    const normalized = normalizeGuidedQuestions(guidedSessionQuestions)
    if (!normalized.length) {
      alert('至少保留一个问题后再保存到模板。')
      return
    }
    const nextSchema: GuidedSchema = {
      ...schema,
      questions: normalized.map(q => ({ id: q.id, prompt: q.prompt.trim(), multiline: Boolean(q.multiline) })),
    }
    const guideJson = JSON.stringify(nextSchema)

    if (guidedTemplateSaveAsNew) {
      const name = guidedTemplateNewName.trim()
      if (!name) {
        alert('请输入新模板名称。')
        return
      }
      if (templates.some(t => t.name.trim() === name)) {
        alert('已存在同名模板，请更换名称。')
        return
      }
    }

    setTemplateSyncing(true)
    try {
      if (guidedTemplateSaveAsNew) {
        const name = guidedTemplateNewName.trim()
        const created = await addTemplate({
          name,
          category: selectedTemplate.category,
          content: '',
          template_kind: 'guided',
          guide_schema_json: guideJson,
        })
        setForm(f => ({ ...f, record_type: created.name }))
        setGuidedSessionQuestions(nextSchema.questions ?? [])
        setGuidedSessionDirty(false)
        setGuidedHint(`已新建模板「${created.name}」并已切换到该类型`)
        setGuidedTemplateSaveOpen(false)
      } else {
        await updateTemplate({
          ...selectedTemplate,
          content: '',
          template_kind: 'guided',
          guide_schema_json: guideJson,
        })
        setGuidedSessionQuestions(nextSchema.questions ?? [])
        setGuidedSessionDirty(false)
        setGuidedHint('已覆盖保存到当前模板')
        setGuidedTemplateSaveOpen(false)
      }
      const list = await getTemplates()
      setTemplates(list)
    } catch (e) {
      alert(String(e))
    } finally {
      setTemplateSyncing(false)
    }
  }

  const stepAndAutosave = (nextStep: number) => {
    if (detailReadonly) return
    if (isGuidedTemplate) {
      syncGuidedDraftToContent({ silent: true })
    }
    markGuidedAutosaved()
    goToGuidedStep(nextStep)
  }

  const skipCurrentGuidedStep = () => {
    if (!guidedCurrentQuestion || detailReadonly) return
    setGuidedSkippedMap(prev => ({
      ...prev,
      [guidedCurrentQuestion.id]: true,
    }))
    markGuidedAutosaved('已标记为稍后补充')
    if (isGuidedTemplate) {
      syncGuidedDraftToContent({ silent: true })
    }
    goToGuidedStep(guidedCurrentStepIndex + 1)
  }

  const syncGuidedDraftToContent = (options?: { silent?: boolean }) => {
    if (!isGuidedTemplate || detailReadonly) return
    const next = guidedDraftContent
    setContentBaseline('')
    setContentDirty(false)
    setForm(f => ({ ...f, content: next }))
    setGuidedSyncSnapshot(next)
    setGuidedLastSyncedAt(Date.now())
    if (!options?.silent) {
      setGuidedHint('任务已同步到正文')
    }
    setGuidedPreviewOpen(false)
  }

  const finishGuidedFlow = () => {
    if (detailReadonly) return
    if (guidedHasUnsyncedChanges) syncGuidedDraftToContent()
    setGuidedPreviewOpen(true)
    setGuidedMode('overview')
  }

  const onPrimaryGuidedStep = () => {
    if (detailReadonly) return
    if (guidedQuestionCount === 0) return
    if (isGuidedLastStep && guidedAllHandled) {
      finishGuidedFlow()
      return
    }
    if (isGuidedLastStep && !guidedAllHandled) return
    stepAndAutosave(guidedCurrentStepIndex + 1)
  }

  const resetNewRecordDraft = () => {
    setResolvedCriminalName('')
    setEditingId(null)
    setEditingRecordId('')
    setEditingRecordStatus('')
    setDetailCaseNumberDisplay('')
    setDetailReadonly(false)
    setDrawerOpen(false)
    setContentBaseline('')
    setContentDirty(false)
    setGuidedMeta({})
    setGuidedAnswers({})
    setGuidedSessionQuestions([])
    setGuidedSessionDirty(false)
    setGuidedMode(getPreferredGuidedMode())
    setGuidedCurrentStepIndex(0)
    setGuidedSkippedMap({})
    setGuidedPreviewOpen(false)
    setGuidedChecklistOpen(false)
    setGuidedChecklistFilter('pending')
    setGuidedLastAutosaveAt(null)
    setGuidedLastSyncedAt(null)
    setGuidedHint('')
    setGuidedSyncSnapshot('')
    setGuidedSchemaHeaderExpanded(true)
    const effectiveTemplates = templates.length > 0 ? templates : fallbackTemplatesStub()
    const firstType = pickDefaultRecordType(effectiveTemplates)
    const tpl = effectiveTemplates.find(t => t.name === firstType)
    setForm({
      record_type: firstType,
      criminal_id: 0,
      record_date: localValueToDbDateTime(nowLocalValue()),
      record_location: PRISON_RECORD_LOCATION_PRESETS[0],
      interrogator_id: '',
      recorder_id: '',
      present_persons: '',
      content: tpl?.content ?? '',
      case_id: null,
    })
  }

  const openCreatePreflight = () => {
    resetNewRecordDraft()
    setCreatePreflightOpen(true)
  }

  const confirmCreatePreflight = () => {
    setCreatePreflightOpen(false)
    setDetailOpen(true)
  }

  const cancelCreatePreflight = () => {
    setCreatePreflightOpen(false)
    setOverwritePrompt(null)
  }

  const openViewOrEdit = async (id: number, readonly: boolean) => {
    if (!isTauri()) return
    guidedRehydratedForEditRef.current = null
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailReadonly(readonly)
    setDrawerOpen(false)
    setContentBaseline('')
    setContentDirty(false)
    setGuidedMeta({})
    setGuidedAnswers({})
    setGuidedSessionQuestions([])
    setGuidedSessionDirty(false)
    setGuidedMode(getPreferredGuidedMode())
    setGuidedCurrentStepIndex(0)
    setGuidedSkippedMap({})
    setGuidedPreviewOpen(false)
    setGuidedChecklistOpen(false)
    setGuidedChecklistFilter('pending')
    setGuidedLastAutosaveAt(null)
    setGuidedLastSyncedAt(null)
    setGuidedHint('')
    setGuidedSyncSnapshot('')
    setGuidedSchemaHeaderExpanded(true)
    setGuidedOverviewFocusedId(null)
    setGuidedOverviewDraggingId(null)
    setGuidedOverviewDragOverId(null)
    try {
      const r = await getRecordById(id)
      setEditingId(r.id)
      setEditingRecordId(r.record_id)
      setEditingRecordStatus(r.status || '')
      setResolvedCriminalName(r.criminal_name || '')
      setDetailCaseNumberDisplay(r.case_number ?? '')
      const cid = r.case_id != null && r.case_id > 0 ? r.case_id : null
      setForm({
        record_type: r.record_type,
        criminal_id: r.criminal_id,
        record_date: r.record_date,
        record_location: r.record_location || PRISON_RECORD_LOCATION_PRESETS[0],
        interrogator_id: r.interrogator_id,
        recorder_id: r.recorder_id,
        present_persons: r.present_persons,
        content: r.content,
        case_id: cid,
      })
    } catch (e) {
      alert(String(e))
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const openListPaperPreview = useCallback(async (id: number) => {
    if (!isTauri()) return
    setListPaperLoadingId(id)
    try {
      const r = await getRecordById(id)
      const { sessionNo, totalPages } = extractPaperSessionAndPagesFromRecordContent(r.content)
      setListPaperPreview({
        recordType: r.record_type,
        content: r.content,
        recordId: r.record_id,
        criminalName: r.criminal_name || '',
        recordDate: dbDateTimeToLocalValue(r.record_date),
        recordLocation: r.record_location || '',
        interrogatorId: r.interrogator_id,
        recorderId: r.recorder_id,
        caseNumber: (r.case_number ?? '').trim(),
        sessionNo,
        totalPages,
        approvalInfo: {
          statusLabel: statusLabel(r.status),
          approver1Id: r.approver1_id || '',
          approver1Result: r.approver1_result || '',
          approver2Id: r.approver2_id || '',
          approver2Result: r.approver2_result || '',
        },
        rejectReason: r.reject_reason || '',
      })
    } catch (e) {
      alert(String(e))
    } finally {
      setListPaperLoadingId(null)
    }
  }, [])

  // 支持从首页跳转过来：打开待查看的笔录（只读走纸面；可显式要求编辑弹窗）
  useEffect(() => {
    if (!isTauri()) return
    if (detailOpen || listPaperPreview) return
    if (pendingOpenedRef.current) return

    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return

    let pending: { id: number; readonly?: boolean } | null = null
    try {
      pending = JSON.parse(raw)
    } catch {
      pending = null
    }

    if (!pending?.id) return

    const openAsPaper = pending.readonly !== false

    pendingOpenedRef.current = true
    void (async () => {
      try {
        if (openAsPaper) {
          await openListPaperPreview(pending!.id)
        } else {
          await openViewOrEdit(pending!.id, false)
        }
      } finally {
        try {
          localStorage.removeItem(PENDING_KEY)
        } catch {
          /* ignore */
        }
      }
    })()
  }, [detailOpen, listPaperPreview, openListPaperPreview])

  const buildPersistRecord = (contentOverride?: string): Record => ({
    id: editingId!,
    record_id: editingRecordId,
    record_type: form.record_type,
    criminal_id: form.criminal_id,
    criminal_name: '',
    record_date: form.record_date,
    record_location: form.record_location,
    interrogator_id: form.interrogator_id,
    recorder_id: form.recorder_id,
    present_persons: form.present_persons,
    content: contentOverride ?? form.content,
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
    case_id: form.case_id != null && form.case_id > 0 ? form.case_id : null,
    case_number: '',
    created_at: '',
  })

  const saveDetail = async (): Promise<boolean> => {
    if (!isTauri()) return false
    if (!form.record_type.trim()) {
      alert('请选择笔录类型')
      return false
    }
    if (!form.criminal_id) {
      alert('请选择服刑人员')
      return false
    }
    let contentOverride: string | undefined
    if (isGuidedTemplate && guidedUnansweredIds.length > 0) {
      setGuidedChecklistOpen(true)
      const proceed = window.confirm(`当前仍有 ${guidedUnansweredIds.length} 个待补问题，是否继续保存？`)
      if (!proceed) return false
    }
    if (isGuidedTemplate && guidedHasUnsyncedChanges) {
      const syncNow = window.confirm('任务草稿尚未同步到正文，是否先同步再保存？')
      if (syncNow) {
        const next = guidedDraftContent
        contentOverride = next
        setContentBaseline('')
        setContentDirty(false)
        setForm(f => ({ ...f, content: next }))
        setGuidedSyncSnapshot(next)
        setGuidedLastSyncedAt(Date.now())
        setGuidedHint('任务已同步到正文')
      }
    }
    try {
      if (editingId == null) {
        await addRecord({ ...form, content: contentOverride ?? form.content })
      } else {
        await updateRecord(buildPersistRecord(contentOverride))
      }
      setDetailOpen(false)
      await loadRecords()
      return true
    } catch (e) {
      alert(String(e))
      return false
    }
  }

  const hasUnsavedRecordWork = useMemo(() => {
    if (detailReadonly) return false
    if (!detailOpen && !createPreflightOpen) return false

    if (contentDirty) return true
    if (guidedSessionDirty) return true
    if (isGuidedTemplate && guidedHasUnsyncedChanges) return true

    // 新建/预填期间的“已开始填”也算未保存，避免误触导航丢失
    const hasAnyHeader = Object.values(guidedMeta).some(v => (v || '').trim())
    const hasAnyAnswer = Object.values(guidedAnswers).some(v => (v || '').trim())
    if (hasAnyHeader || hasAnyAnswer) return true

    if ((editorText || '').trim()) return true
    if (form.criminal_id) return true
    if (form.case_id != null && form.case_id > 0) return true
    return false
  }, [
    detailReadonly,
    detailOpen,
    createPreflightOpen,
    contentDirty,
    guidedSessionDirty,
    isGuidedTemplate,
    guidedHasUnsyncedChanges,
    guidedMeta,
    guidedAnswers,
    editorText,
    form.criminal_id,
    form.case_id,
  ])

  useEffect(() => {
    setGuard({
      blocking: hasUnsavedRecordWork,
      message: '当前笔录尚未保存，离开将丢失未保存内容。',
      save: hasUnsavedRecordWork ? saveDetail : undefined,
      discard: hasUnsavedRecordWork ? discardEditingSession : undefined,
    })
    return () => setGuard({ blocking: false })
  }, [setGuard, hasUnsavedRecordWork, saveDetail, discardEditingSession])

  const handleSubmitForApproval = async () => {
    let contentOverride: string | undefined
    if (!isTauri() || editingId == null) return
    if (editingRecordStatus !== 'Draft') return
    if (!form.record_type.trim()) {
      alert('请选择笔录类型')
      return
    }
    if (!form.criminal_id) {
      alert('请选择服刑人员')
      return
    }
    if (!editorText.trim()) {
      alert('正文不能为空，请填写后再提交审批')
      return
    }
    if (isGuidedTemplate && guidedUnansweredIds.length > 0) {
      setGuidedChecklistOpen(true)
      const proceed = window.confirm(`当前仍有 ${guidedUnansweredIds.length} 个待补问题，是否继续提交审批？`)
      if (!proceed) return
    }
    if (isGuidedTemplate && guidedHasUnsyncedChanges) {
      const syncNow = window.confirm('任务草稿尚未同步到正文，是否先同步再提交审批？')
      if (syncNow) {
        const next = guidedDraftContent
        contentOverride = next
        setContentBaseline('')
        setContentDirty(false)
        setForm(f => ({ ...f, content: next }))
        setGuidedSyncSnapshot(next)
        setGuidedLastSyncedAt(Date.now())
        setGuidedHint('任务已同步到正文')
      }
    }
    try {
      await updateRecord(buildPersistRecord(contentOverride))
      await submitRecordForApproval(editingId)
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

  /** 仅新建或草稿可改关联案件（与后端「仅草稿可编辑」一致） */
  const caseFieldEditable =
    !detailReadonly && (editingId === null || editingRecordStatus === 'Draft')

  const templateListForSelect = templates.length > 0 ? templates : fallbackTemplatesStub()

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title">笔录制作</h1>
        <button className="glass-btn primary" type="button" onClick={() => openCreatePreflight()} disabled={!isTauri()}>
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
            className="glass-input glass-input--search"
            style={{ minWidth: 200 }}
            placeholder="编号 / 服刑人员"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearchSubmit()}
          />
          <IconButton label="搜索" onClick={handleSearchSubmit} disabled={!isTauri()}>
            <Icon name="search" />
          </IconButton>
        </div>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>案号</th>
                <th>服刑人员</th>
                <th>笔录类型</th>
                <th>谈话日期</th>
                <th>地点</th>
                <th>承办人</th>
                <th>状态</th>
                <th className="data-table__col--actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    加载中...
                  </td>
                </tr>
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    {!isTauri() ? '仅桌面端可查库' : '暂无数据'}
                  </td>
                </tr>
              )}
              {!loading &&
                records.map(r => (
                  <tr key={r.id}>
                    <td className="cell-mono">{r.record_id}</td>
                    <td className="cell-mono">{r.case_number?.trim() ? r.case_number : '—'}</td>
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
                    <td className="data-table__col--actions">
                      <div className="table-actions">
                        <button
                          type="button"
                          className="glass-btn small"
                          onClick={() => void openListPaperPreview(r.id)}
                          disabled={!isTauri() || listPaperLoadingId != null}
                        >
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

      {createPreflightOpen && (
        <div
          className="record-modal__confirm-layer record-create-preflight-layer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-create-preflight-title"
          style={{ zIndex: 12500 }}
        >
          <div className="record-modal__confirm-backdrop" role="presentation" onMouseDown={cancelCreatePreflight} />
          <div
            className="record-modal__confirm-box record-create-preflight"
            onMouseDown={e => e.stopPropagation()}
          >
            <h3 id="record-create-preflight-title" className="record-modal__confirm-title">
              新建笔录 · 先选对象再填信息
            </h3>
            <p className="record-modal__confirm-text" style={{ marginBottom: 12 }}>
              请先选择服刑人员，再填写笔录类型、时间与是否关联案件等；完成后点击「进入笔录制作」。侧栏仍可修改。
            </p>
            <div className="record-create-preflight__scroll">
              <div className="record-settings-group">
                <div className="record-settings-group__title">对象信息</div>
                <div className="record-modal__criminal-strip">
                  <div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      服刑人员
                    </span>
                    <strong>{selectedCriminalName()}</strong>
                  </div>
                  <button type="button" className="glass-btn small" onClick={() => setPickerOpen(true)}>
                    选择
                  </button>
                </div>
              </div>

              <div className="record-settings-group">
                <div className="record-settings-group__title">基本信息</div>
                <div className="record-modal__grid">
                  <label className="record-modal__field">
                    <span>笔录类型</span>
                    <select
                      className="glass-input glass-input--select"
                      value={form.record_type}
                      onChange={e => handleRecordTypeSelect(e.target.value)}
                    >
                      {templateListForSelect.map(t => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="record-modal__field">
                    <span>谈话日期 / 时间</span>
                    <input
                      type="datetime-local"
                      className="glass-input glass-input--datetime"
                      value={dbDateTimeToLocalValue(form.record_date)}
                      onChange={e =>
                        setForm(f => ({ ...f, record_date: localValueToDbDateTime(e.target.value) }))
                      }
                    />
                  </label>
                  {caseFieldEditable ? (
                    <label className="record-modal__field record-modal__field--full">
                      <span>关联案件（可选）</span>
                      <select
                        className="glass-input glass-input--select"
                        value={form.case_id != null && form.case_id > 0 ? String(form.case_id) : ''}
                        onChange={e => {
                          const v = e.target.value
                          setForm(f => ({
                            ...f,
                            case_id: v === '' ? null : Number(v),
                          }))
                        }}
                      >
                        <option value="">不关联</option>
                        {caseOptions.map(c => (
                          <option key={c.id} value={String(c.id)}>
                            {c.case_number}
                            {c.title ? ` · ${c.title}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="record-modal__field record-modal__field--full">
                    <span>地点</span>
                    <select
                      className="glass-input glass-input--select"
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
                      value={form.interrogator_id}
                      onChange={e => setForm(f => ({ ...f, interrogator_id: e.target.value }))}
                    />
                  </label>
                  <label className="record-modal__field">
                    <span>记录人标识</span>
                    <input
                      type="text"
                      className="glass-input"
                      value={form.recorder_id}
                      onChange={e => setForm(f => ({ ...f, recorder_id: e.target.value }))}
                    />
                  </label>
                  <label className="record-modal__field record-modal__field--full">
                    <span>在场人员</span>
                    <input
                      type="text"
                      className="glass-input"
                      value={form.present_persons}
                      onChange={e => setForm(f => ({ ...f, present_persons: e.target.value }))}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="record-modal__confirm-actions" style={{ marginTop: 14 }}>
              <button type="button" className="glass-btn" onClick={cancelCreatePreflight}>
                取消
              </button>
              <button type="button" className="glass-btn primary" onClick={confirmCreatePreflight}>
                进入笔录制作
              </button>
            </div>
          </div>
        </div>
      )}

      {detailOpen && (
        <div
          className="record-modal-backdrop"
          role="presentation"
          onMouseDown={() => !detailLoading && setDetailOpen(false)}
          style={{ alignItems: 'stretch', justifyContent: 'stretch', padding: 0 }}
        >
          <div
            className="record-modal"
            onMouseDown={e => e.stopPropagation()}
            style={{ width: '100%', height: '100%', maxHeight: 'none', borderRadius: 0 }}
          >
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>{detailReadonly ? '查看笔录' : editingId == null ? '新建笔录' : '编辑草稿'}</h2>
                {detailReadonly && !detailLoading && editingId != null && (
                  <div className="record-modal__meta record-modal__meta--inline">
                    编号 {editingRecordId}
                    {editingRecordStatus ? (
                      <>
                        {' '}
                        ·{' '}
                        <span style={{ color: statusColor(editingRecordStatus) }}>{statusLabel(editingRecordStatus)}</span>
                      </>
                    ) : null}
                  </div>
                )}
                {!detailReadonly && (
                  <div className="record-modal__hint record-modal__hint--inline">
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
                <div className="record-modal__body" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <div className="record-workspace-layout">
                    <div className="record-workspace-main">
                      {!isGuidedTemplate && (
                        <div className="record-main-topbar">
                          <p className="record-main-topbar__muted">
                            当前类型无引导题目。请在侧栏切换笔录类型，或到模板管理配置引导题。
                          </p>
                          <div style={{ flex: 1 }} />
                          <button
                            type="button"
                            className="record-drawer-toggle"
                            aria-label={drawerOpen ? '收起基础信息' : '展开基础信息'}
                            title={drawerOpen ? '收起基础信息' : '展开基础信息'}
                            onClick={() => setDrawerOpen(v => !v)}
                          >
                            {drawerOpen ? '«' : '»'}
                          </button>
                        </div>
                      )}
                      {isGuidedTemplate && (
                        <>
                          <div className="record-toolbar">
                            <div className="record-toolbar__row">
                              <div className="record-toolbar__meta">
                                <span className="record-toolbar__label">引导录入</span>
                                <span className="record-toolbar__counter">
                                  {guidedQuestionCount > 0
                                    ? `${Math.min(guidedCurrentStepIndex + 1, guidedQuestionCount)}/${guidedQuestionCount}`
                                    : '无问题'}
                                </span>
                              </div>
                              <div className="record-toolbar__group record-toolbar__segmented">
                                <button
                                  type="button"
                                  className={`glass-btn small${guidedMode === 'step' ? ' primary' : ''}`}
                                  onClick={() => setGuidedMode('step')}
                                  title="单题推进，低干扰录入"
                                >
                                  单题
                                </button>
                                <button
                                  type="button"
                                  className={`glass-btn small${guidedMode === 'overview' ? ' primary' : ''}`}
                                  onClick={() => setGuidedMode('overview')}
                                  title="批量查看与编辑全部题目"
                                >
                                  总览
                                </button>
                              </div>
                              {guidedMode === 'overview' && !detailReadonly ? (
                                <div className="record-toolbar__group">
                                  <IconButton
                                    type="button"
                                    className={guidedOverviewManageOn ? 'primary' : undefined}
                                    label={guidedOverviewManageOn ? '关闭整理' : '开启整理'}
                                    title={
                                      guidedOverviewManageOn
                                        ? '收起拖拽/编辑/删除按钮，保持简洁'
                                        : '显示拖拽/编辑/删除按钮，用于调整题目顺序与维护'
                                    }
                                    onClick={() => setGuidedOverviewManageOn(v => !v)}
                                  >
                                    <Icon name="sort" size={20} />
                                  </IconButton>
                                </div>
                              ) : null}
                              <div style={{ flex: 1 }} />
                              <button
                                type="button"
                                className="record-drawer-toggle"
                                aria-label={drawerOpen ? '收起基础信息' : '展开基础信息'}
                                title={drawerOpen ? '收起基础信息' : '展开基础信息'}
                                onClick={() => setDrawerOpen(v => !v)}
                              >
                                {drawerOpen ? '«' : '»'}
                              </button>
                            </div>
                          </div>

                          {dossierHeaderTotal > 0 ? (
                            <section className="record-guided-dossier" aria-label="卷宗要素">
                              <button
                                type="button"
                                className="record-guided-dossier__disclosure"
                                aria-expanded={guidedSchemaHeaderExpanded}
                                onClick={() => setGuidedSchemaHeaderExpanded(v => !v)}
                              >
                                <span className="record-guided-dossier__title">卷宗要素</span>
                                <span className="record-guided-dossier__count" aria-live="polite">
                                  已填 {dossierHeaderFilledCount}/{dossierHeaderTotal}
                                </span>
                                <span className="record-guided-dossier__chevron" aria-hidden>
                                  {guidedSchemaHeaderExpanded ? '▼' : '▸'}
                                </span>
                              </button>
                              {guidedSchemaHeaderExpanded ? (
                                <div className="record-guided-dossier__body">
                                  <div className="record-guided-dossier__paper">
                                    {dossierShortFields.length > 0 ? (
                                      <div className="record-guided-dossier__paper-top">
                                        {dossierShortFields.map(field => {
                                          const common = {
                                            disabled: detailReadonly,
                                            placeholder: field.placeholder || '',
                                            value: guidedMeta[field.key] ?? '',
                                            onChange: (e: ChangeEvent<HTMLInputElement>) =>
                                              setGuidedMeta(prev => ({ ...prev, [field.key]: e.target.value })),
                                          } as const
                                          if (field.key === 'session_no') {
                                            return (
                                              <label
                                                key={field.key}
                                                className="record-guided-dossier__paper-session"
                                                aria-label={field.label}
                                                title={field.label}
                                              >
                                                <span>第</span>
                                                <input
                                                  type="text"
                                                  inputMode="numeric"
                                                  className="record-guided-dossier__ink record-guided-dossier__ink--narrow"
                                                  {...common}
                                                />
                                                <span>次</span>
                                              </label>
                                            )
                                          }
                                          if (field.key === 'record_total_pages') {
                                            return (
                                              <label
                                                key={field.key}
                                                className="record-guided-dossier__paper-session"
                                                aria-label={field.label}
                                                title={field.label}
                                              >
                                                <span>本笔录共</span>
                                                <input
                                                  type="text"
                                                  inputMode="numeric"
                                                  className="record-guided-dossier__ink record-guided-dossier__ink--narrow"
                                                  {...common}
                                                />
                                                <span>页</span>
                                              </label>
                                            )
                                          }
                                          return (
                                            <label
                                              key={field.key}
                                              className="record-guided-dossier__paper-inline-short"
                                            >
                                              <span className="record-guided-dossier__paper-label-inline">
                                                {field.label}
                                              </span>
                                              <input
                                                type="text"
                                                className="record-guided-dossier__ink record-guided-dossier__ink--short"
                                                {...common}
                                              />
                                            </label>
                                          )
                                        })}
                                      </div>
                                    ) : null}
                                    {dossierLongFields.map(field => (
                                      <label key={field.key} className="record-guided-dossier__paper-row">
                                        <span className="record-guided-dossier__paper-label">{field.label}</span>
                                        <input
                                          type="text"
                                          className="record-guided-dossier__ink record-guided-dossier__ink--grow"
                                          disabled={detailReadonly}
                                          placeholder={field.placeholder || ''}
                                          value={guidedMeta[field.key] ?? ''}
                                          onChange={e =>
                                            setGuidedMeta(prev => ({ ...prev, [field.key]: e.target.value }))
                                          }
                                        />
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </section>
                          ) : null}

                          <div className="record-toolbar record-toolbar--actions">
                            <div className="record-toolbar__row">
                              <div className="record-toolbar__meta">
                                <span className="record-toolbar__counter">待补：{guidedUnansweredIds.length}</span>
                                <span className="record-toolbar__counter">
                                  完成：{guidedProgressCount}/{guidedQuestionCount}
                                </span>
                              </div>
                              <div className="record-toolbar__group record-toolbar__group--icons">
                                <IconButton
                                  type="button"
                                  className="small"
                                  label="预览"
                                  title="纸面全文阅读 / 打印预览"
                                  onClick={() => setGuidedPreviewOpen(true)}
                                >
                                  <Icon name="view" size={20} />
                                </IconButton>
                                {!detailReadonly ? (
                                  <IconButton
                                    type="button"
                                    className="small"
                                    label="新增"
                                    title="在当前笔录中新增问题"
                                    onClick={() => setGuidedAddQuestionConfirmOpen(true)}
                                  >
                                    <Icon name="plus" size={20} />
                                  </IconButton>
                                ) : null}
                                <IconButton
                                  type="button"
                                  className="small"
                                  label="待补"
                                  title="待补问题清单"
                                  onClick={() => setGuidedChecklistOpen(true)}
                                >
                                  <Icon name="clipboardList" size={20} />
                                </IconButton>
                                {!detailReadonly && selectedTemplate ? (
                                  <IconButton
                                    type="button"
                                    className={`small${guidedSessionDirty ? ' primary' : ''}`}
                                    label={templateSyncing ? '保存中' : '存模板'}
                                    title={
                                      templateSyncing
                                        ? '保存中…'
                                        : '保存题目列表到模板（可覆盖当前模板或另存为新模板）'
                                    }
                                    disabled={!guidedSessionDirty || templateSyncing}
                                    onClick={openGuidedSaveTemplateDialog}
                                  >
                                    <Icon name="saveTemplate" size={20} />
                                  </IconButton>
                                ) : null}
                              </div>
                              <div className="record-toolbar__group record-toolbar__group--right record-toolbar__group--icons">
                                {!detailReadonly && guidedHasUnsyncedChanges ? (
                                  <IconButton
                                    type="button"
                                    className="small"
                                    label="同步正文"
                                    title="侧栏/表头修改后若未换步，可手动写入正文（换步、稍后、完成引导时已自动同步）"
                                    onClick={() => syncGuidedDraftToContent()}
                                  >
                                    <Icon name="refreshCw" size={20} />
                                  </IconButton>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div
                            style={{
                              height: 6,
                              marginTop: 6,
                              borderRadius: 999,
                              background: 'var(--input-bg)',
                              overflow: 'hidden',
                              border: '1px solid var(--glass-border)',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.round(guidedProgressRatio * 100)}%`,
                                background: 'var(--accent-primary)',
                                transition: 'width 180ms ease',
                              }}
                            />
                          </div>
                          {guidedHint ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{guidedHint}</div>
                          ) : null}
                          {guidedLastAutosaveAt ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                              最近暂存：{new Date(guidedLastAutosaveAt).toLocaleTimeString()}
                            </div>
                          ) : null}
                          {guidedLastSyncedAt ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                              最近同步：{new Date(guidedLastSyncedAt).toLocaleTimeString()}
                              {guidedHasUnsyncedChanges ? '（草稿有更新，待同步）' : '（已同步）'}
                            </div>
                          ) : null}
                          {guidedMode === 'step' && isGuidedLastStep && guidedAllHandled && !detailReadonly ? (
                            <div className="record-guided-completion">
                              <p className="record-guided-completion__msg">
                                本题卷已完成。可预览纸面全文；保存草稿后可提交审批。
                              </p>
                              <div className="record-guided-completion__actions">
                                <IconButton
                                  type="button"
                                  className="small"
                                  label="预览"
                                  title="纸面全文阅读 / 打印预览"
                                  onClick={() => setGuidedPreviewOpen(true)}
                                >
                                  <Icon name="view" size={20} />
                                </IconButton>
                                {editingId != null && editingRecordStatus === 'Draft' ? (
                                  <button
                                    type="button"
                                    className="glass-btn small primary"
                                    onClick={() => void handleSubmitForApproval()}
                                  >
                                    提交审批
                                  </button>
                                ) : editingId == null ? (
                                  <span className="record-guided-completion__hint">新建请先点右下角「保存」生成草稿。</span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {guidedMode === 'overview' ? (
                            <div className="record-modal__grid record-modal__grid--guided-overview" style={{ marginTop: 8 }}>
                              {guidedQuestions.map((question, qIdx) => {
                                const isDrag = guidedOverviewDraggingId === question.id
                                const isDrop =
                                  guidedOverviewDragOverId === question.id &&
                                  Boolean(guidedOverviewDraggingId) &&
                                  guidedOverviewDraggingId !== question.id
                                const isSelected =
                                  guidedOverviewFocusedId === question.id && !isDrag
                                return (
                                  <div
                                    key={question.id}
                                    ref={el => {
                                      if (!el) {
                                        guidedOverviewRowEls.current.delete(question.id)
                                        return
                                      }
                                      guidedOverviewRowEls.current.set(question.id, el)
                                    }}
                                    data-guided-overview-qid={question.id}
                                    className={[
                                      'record-guided-overview-card',
                                      isDrag ? 'record-guided-overview-card--dragging' : '',
                                      isDrop ? 'record-guided-overview-card--drop-target' : '',
                                      isSelected ? 'record-guided-overview-card--selected' : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    onClick={e => {
                                      const t = e.target as HTMLElement
                                      if (
                                        t.closest(
                                          'button, textarea, input, a, select, [role="button"]'
                                        )
                                      ) {
                                        return
                                      }
                                      setGuidedOverviewFocusedId(cur =>
                                        cur === question.id ? null : question.id
                                      )
                                    }}
                                  >
                                    <div className="record-guided-overview-card__badge-row">
                                      <span className="record-guided-overview-card__badge">
                                        第 {qIdx + 1} 题
                                      </span>
                                      <span className="record-guided-overview-card__hint">题目与作答</span>
                                    </div>
                                    <div className="record-guided-overview-item__head">
                                      <div className="record-guided-overview-item__title-block">
                                        {!detailReadonly && guidedPromptEditId === question.id ? (
                                          <div
                                            className="record-guided-overview-item__title-row"
                                            aria-label={`第 ${qIdx + 1} 题`}
                                          >
                                            <textarea
                                              className="glass-input glass-textarea glass-input--guided-prompt record-guided-inline-prompt record-guided-inline-prompt--overview"
                                              rows={3}
                                              value={question.prompt}
                                              onChange={e =>
                                                setGuidedQuestionPrompt(question.id, e.target.value)
                                              }
                                              onFocus={() => setGuidedOverviewFocusedId(question.id)}
                                              placeholder="问题题干"
                                              aria-label="编辑问题题干"
                                              autoFocus
                                            />
                                          </div>
                                        ) : (
                                          <div
                                            className="record-guided-overview-item__title-row"
                                            aria-label={`第 ${qIdx + 1} 题：${question.prompt}`}
                                          >
                                            <div className="record-guided-overview-item__title">
                                              {question.prompt}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      {!detailReadonly && guidedOverviewManageOn ? (
                                        <div className="record-guided-overview-item__actions">
                                          <div
                                            role="button"
                                            tabIndex={0}
                                            aria-label="拖拽排序"
                                            title="拖拽排序"
                                            onPointerDown={e => {
                                              e.preventDefault()
                                              if (guidedPromptEditId === question.id) return
                                              setGuidedOverviewDraggingId(question.id)
                                              setGuidedOverviewDragOverId(question.id)
                                            }}
                                            style={{
                                              cursor:
                                                guidedOverviewDraggingId === question.id
                                                  ? 'grabbing'
                                                  : 'grab',
                                              userSelect: 'none',
                                              width: 30,
                                              height: 36,
                                              display: 'flex',
                                              flexDirection: 'column',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              gap: 4,
                                              borderRadius: 10,
                                              border: '1px solid var(--glass-border)',
                                              background: 'var(--glass-bg)',
                                              opacity: guidedPromptEditId === question.id ? 0.55 : 0.9,
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
                                                  opacity: 0.9,
                                                }}
                                              />
                                            ))}
                                          </div>
                                          <IconButton
                                            type="button"
                                            className={`small record-guided-overview-item__edit${
                                              guidedPromptEditId === question.id ? ' primary' : ''
                                            }`}
                                            label={
                                              guidedPromptEditId === question.id
                                                ? '完成编辑题干'
                                                : '编辑题干'
                                            }
                                            title={
                                              guidedPromptEditId === question.id
                                                ? '完成编辑题干'
                                                : '修改本题题干'
                                            }
                                            onClick={e => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              setGuidedPromptEditId(cur =>
                                                cur === question.id ? null : question.id
                                              )
                                            }}
                                          >
                                            <Icon
                                              name={
                                                guidedPromptEditId === question.id ? 'check' : 'edit'
                                              }
                                              size={20}
                                            />
                                          </IconButton>
                                          <IconButton
                                            type="button"
                                            className="small danger record-guided-overview-item__delete"
                                            label="删除本题"
                                            title="删除本题"
                                            onClick={e => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              openGuidedDeleteConfirm(question.id)
                                            }}
                                          >
                                            <Icon name="trash" size={20} />
                                          </IconButton>
                                        </div>
                                      ) : null}
                                    </div>
                                    <AutoSizeTextarea
                                      className="glass-input glass-textarea glass-input--guided-answer glass-textarea--autosize"
                                      disabled={detailReadonly}
                                      value={guidedAnswers[question.id] ?? ''}
                                      onChange={e => setGuidedAnswer(question.id, e.target.value)}
                                      onFocus={() => {
                                        if (!detailReadonly) setGuidedOverviewFocusedId(question.id)
                                      }}
                                      minRows={1}
                                      maxRows={28}
                                      aria-label="回答内容"
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                              <div className="record-task-card">
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginBottom: 10,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: 'var(--text-primary)',
                                      background: 'var(--accent-primary)',
                                      borderRadius: 999,
                                      padding: '2px 8px',
                                      fontWeight: 700,
                                      letterSpacing: 0.2,
                                    }}
                                  >
                                    第 {Math.min(guidedCurrentStepIndex + 1, Math.max(1, guidedQuestionCount))} 题
                                  </span>
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>当前任务问题</span>
                                </div>
                                {guidedCurrentQuestion ? (
                                  <>
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 10,
                                        marginBottom: 10,
                                      }}
                                    >
                                      {!detailReadonly &&
                                      guidedPromptEditId === guidedCurrentQuestion.id ? (
                                        <textarea
                                          className="glass-input glass-textarea glass-input--guided-prompt record-guided-inline-prompt record-guided-inline-prompt--step"
                                          rows={4}
                                          style={{ flex: 1, minWidth: 0 }}
                                          value={guidedCurrentQuestion.prompt}
                                          onChange={e =>
                                            setGuidedQuestionPrompt(guidedCurrentQuestion.id, e.target.value)
                                          }
                                          placeholder="编辑当前问题"
                                          aria-label="编辑当前问题题干"
                                          autoFocus
                                        />
                                      ) : (
                                        <div
                                          style={{
                                            flex: 1,
                                            minWidth: 0,
                                            fontWeight: 700,
                                            lineHeight: 1.55,
                                            fontSize: 16,
                                          }}
                                        >
                                          {guidedCurrentQuestion.prompt}
                                        </div>
                                      )}
                                      {!detailReadonly ? (
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                          <IconButton
                                            type="button"
                                            className={`small${
                                              guidedPromptEditId === guidedCurrentQuestion.id ? ' primary' : ''
                                            }`}
                                            label={
                                              guidedPromptEditId === guidedCurrentQuestion.id
                                                ? '完成编辑题干'
                                                : '编辑题干'
                                            }
                                            title={
                                              guidedPromptEditId === guidedCurrentQuestion.id
                                                ? '完成编辑题干'
                                                : '修改本题题干'
                                            }
                                            onClick={() =>
                                              setGuidedPromptEditId(cur =>
                                                cur === guidedCurrentQuestion.id
                                                  ? null
                                                  : guidedCurrentQuestion.id
                                              )
                                            }
                                          >
                                            <Icon
                                              name={
                                                guidedPromptEditId === guidedCurrentQuestion.id ? 'check' : 'edit'
                                              }
                                              size={20}
                                            />
                                          </IconButton>
                                          <IconButton
                                            type="button"
                                            className="small danger"
                                            label="删除本题"
                                            title="删除本题"
                                            onClick={() => openGuidedDeleteConfirm(guidedCurrentQuestion.id)}
                                          >
                                            <Icon name="trash" size={20} />
                                          </IconButton>
                                        </div>
                                      ) : null}
                                    </div>
                                    <AutoSizeTextarea
                                      className="glass-input glass-textarea glass-input--guided-answer glass-textarea--autosize"
                                      disabled={detailReadonly}
                                      value={guidedAnswers[guidedCurrentQuestion.id] ?? ''}
                                      onChange={e => setGuidedAnswer(guidedCurrentQuestion.id, e.target.value)}
                                      minRows={1}
                                      maxRows={32}
                                      onKeyDown={e => {
                                        if (e.key !== 'Enter' || detailReadonly) return
                                        const qid = guidedCurrentQuestion.id
                                        if (e.ctrlKey || e.metaKey) {
                                          e.preventDefault()
                                          const ta = e.currentTarget
                                          const start = ta.selectionStart ?? 0
                                          const end = ta.selectionEnd ?? 0
                                          const v = guidedAnswers[qid] ?? ''
                                          const next = `${v.slice(0, start)}\n${v.slice(end)}`
                                          setGuidedAnswer(qid, next)
                                          const pos = start + 1
                                          window.setTimeout(() => {
                                            ta.focus()
                                            ta.selectionStart = ta.selectionEnd = pos
                                          }, 0)
                                          return
                                        }
                                        if (e.shiftKey) return
                                        e.preventDefault()
                                        onPrimaryGuidedStep()
                                      }}
                                      aria-label="回答内容"
                                    />
                                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                      快捷键：<span className="cell-mono">Enter</span> 下一题，
                                      <span className="cell-mono">Ctrl+Enter</span> 换行
                                    </div>
                                    {isGuidedLastStep && !guidedAllHandled ? (
                                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--accent-secondary)' }}>
                                        还有 {guidedUnansweredIds.length} 题未完成，可点击题号或「待补」继续。
                                      </div>
                                    ) : null}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                      <button
                                        type="button"
                                        className="glass-btn small"
                                        disabled={guidedCurrentStepIndex <= 0}
                                        onClick={() => goToGuidedStep(guidedCurrentStepIndex - 1)}
                                      >
                                        上一步
                                      </button>
                                      {!detailReadonly && (
                                        <button
                                          type="button"
                                          className="glass-btn small"
                                          onClick={skipCurrentGuidedStep}
                                        >
                                          稍后
                                        </button>
                                      )}
                                      <div style={{ flex: 1 }} />
                                      <button
                                        type="button"
                                        className="glass-btn small primary"
                                        disabled={
                                          guidedQuestionCount === 0 ||
                                          (isGuidedLastStep && !guidedAllHandled)
                                        }
                                        onClick={onPrimaryGuidedStep}
                                      >
                                        {guidedQuestionCount === 0
                                          ? '—'
                                          : isGuidedLastStep && guidedAllHandled
                                            ? '完成引导'
                                            : '下一题'}
                                      </button>
                                    </div>
                                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                      {guidedQuestions.map((q, idx) => {
                                        const s = guidedStepStateMap[q.id]
                                        const current = s === 'current'
                                        const color =
                                          s === 'done'
                                            ? 'var(--accent-success)'
                                            : current
                                              ? 'var(--accent-primary)'
                                              : s === 'skipped'
                                                ? 'var(--accent-warning)'
                                                : 'var(--text-muted)'
                                        return (
                                          <button
                                            key={q.id}
                                            type="button"
                                            className="glass-btn small"
                                            style={{
                                              borderColor: color,
                                              color,
                                              transform: current ? 'translateY(-1px)' : 'translateY(0)',
                                              boxShadow: current ? '0 0 0 1px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.12)' : 'none',
                                              transition: 'transform 120ms ease, box-shadow 120ms ease',
                                            }}
                                            onClick={() => goToGuidedStep(idx)}
                                          >
                                            <span
                                              aria-hidden="true"
                                              style={{
                                                display: 'inline-block',
                                                width: 8,
                                                height: 8,
                                                borderRadius: 99,
                                                background: color,
                                                marginRight: 6,
                                                opacity: s === 'pending' ? 0.45 : 0.95,
                                                transform: current ? 'scale(1.25)' : 'scale(1)',
                                                boxShadow: current ? '0 0 0 2px rgba(255,255,255,0.12)' : 'none',
                                                transition: 'transform 120ms ease',
                                              }}
                                            />
                                            {idx + 1}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </>
                                ) : (
                                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>当前模板未配置引导问题。</div>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {drawerOpen && (
                      <div className="record-workspace-sidebar">
                        <div className="record-settings-group">
                          <div className="record-settings-group__title">对象信息</div>
                          <div className="record-modal__criminal-strip">
                            <div>
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                服刑人员
                              </span>
                              <strong>{selectedCriminalName()}</strong>
                            </div>
                            {!detailReadonly && (
                              <button type="button" className="glass-btn small" onClick={() => setPickerOpen(true)}>
                                选择
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="record-settings-group">
                          <div className="record-settings-group__title">基本信息</div>
                          {editingId != null ? (
                            <div className="record-sidebar-meta-row">
                              <span className="record-sidebar-meta-row__k">笔录编号</span>
                              <span className="record-sidebar-meta-row__v cell-mono">{editingRecordId}</span>
                            </div>
                          ) : null}
                          {editingId != null && editingRecordStatus ? (
                            <div className="record-sidebar-meta-row">
                              <span className="record-sidebar-meta-row__k">状态</span>
                              <span
                                className="record-sidebar-meta-row__v"
                                style={{ color: statusColor(editingRecordStatus) }}
                              >
                                {statusLabel(editingRecordStatus)}
                              </span>
                            </div>
                          ) : null}
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
                            {caseFieldEditable ? (
                              <label className="record-modal__field record-modal__field--full">
                                <span>关联案件（可选）</span>
                                <select
                                  className="glass-input glass-input--select"
                                  value={form.case_id != null && form.case_id > 0 ? String(form.case_id) : ''}
                                  onChange={e => {
                                    const v = e.target.value
                                    setForm(f => ({
                                      ...f,
                                      case_id: v === '' ? null : Number(v),
                                    }))
                                  }}
                                >
                                  <option value="">不关联</option>
                                  {caseOptions.map(c => (
                                    <option key={c.id} value={String(c.id)}>
                                      {c.case_number}
                                      {c.title ? ` · ${c.title}` : ''}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <div className="record-modal__field record-modal__field--full">
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                  关联案件（案号）
                                </span>
                                <strong>{detailCaseNumberDisplay || '—'}</strong>
                              </div>
                            )}
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
                      </div>
                    )}
                  </div>

                  <RecordFullReadingPreview
                    open={guidedPreviewOpen}
                    onClose={() => setGuidedPreviewOpen(false)}
                    headerTitle="笔录预览"
                    recordType={form.record_type}
                    content={form.content}
                    viewMode="guidedDraft"
                    guidedUnsynced={guidedHasUnsyncedChanges}
                    guidedDraftPlain={guidedDraftContent}
                    onSyncToBody={!detailReadonly ? syncGuidedDraftToContent : undefined}
                    readOnly={detailReadonly}
                    criminalName={selectedCriminalName()}
                    recordDate={dbDateTimeToLocalValue(form.record_date)}
                    recordLocation={form.record_location}
                    interrogatorId={form.interrogator_id}
                    recorderId={form.recorder_id}
                    caseNumber={detailCaseNumberDisplay || ''}
                    sessionNo={guidedMeta.session_no || ''}
                    totalPages={guidedMeta.record_total_pages || ''}
                  />
                </div>
                <div className="record-modal__footer">
                  <button type="button" className="glass-btn" onClick={() => setDetailOpen(false)}>
                    {detailReadonly ? '关闭' : '取消'}
                  </button>
                  {!detailReadonly && (
                    <>
                      <button type="button" className="glass-btn primary" onClick={() => saveDetail()}>
                        保存
                      </button>
                      {editingId != null && editingRecordStatus === 'Draft' && (
                        <button type="button" className="glass-btn primary" onClick={() => handleSubmitForApproval()}>
                          提交审批
                        </button>
                      )}
                    </>
                  )}
                </div>
                {guidedChecklistOpen && (
                  <div
                    className="record-modal__confirm-layer"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="guided-unanswered-title"
                  >
                    <div
                      className="record-modal__confirm-backdrop"
                      role="presentation"
                      onMouseDown={() => setGuidedChecklistOpen(false)}
                    />
                    <div className="record-modal__confirm-box record-modal__confirm-box--guided-checklist" onMouseDown={e => e.stopPropagation()}>
                      <h3 id="guided-unanswered-title" className="record-modal__confirm-title">
                        待补问题（{guidedUnansweredIds.length}）
                      </h3>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <button
                          type="button"
                          className={`glass-btn small${guidedChecklistFilter === 'pending' ? ' primary' : ''}`}
                          onClick={() => setGuidedChecklistFilter('pending')}
                        >
                          只看待补
                        </button>
                        <button
                          type="button"
                          className={`glass-btn small${guidedChecklistFilter === 'skipped' ? ' primary' : ''}`}
                          onClick={() => setGuidedChecklistFilter('skipped')}
                        >
                          只看跳过
                        </button>
                        <button
                          type="button"
                          className={`glass-btn small${guidedChecklistFilter === 'all' ? ' primary' : ''}`}
                          onClick={() => setGuidedChecklistFilter('all')}
                        >
                          全部
                        </button>
                      </div>
                      <div className="record-guided-checklist__scroll">
                        <div className="record-guided-checklist__list">
                          {(() => {
                            const filtered = guidedQuestions.filter(q => {
                              const s = guidedStepStateMap[q.id]
                              if (guidedChecklistFilter === 'pending') return s === 'pending'
                              if (guidedChecklistFilter === 'skipped') return s === 'skipped'
                              return true
                            })
                            if (filtered.length === 0) {
                              return <p className="record-modal__confirm-text">当前筛选下无问题。</p>
                            }
                            return filtered.map((q, idx) => (
                                <button
                                  key={q.id}
                                  type="button"
                                  className="record-guided-checklist__row"
                                  onClick={() => {
                                    const questionIndex = guidedQuestions.findIndex(x => x.id === q.id)
                                    setGuidedMode('step')
                                    goToGuidedStep(questionIndex)
                                    setGuidedChecklistOpen(false)
                                  }}
                                >
                                  {idx + 1}. {q.prompt}
                                </button>
                              ))
                          })()}
                        </div>
                      </div>
                      <div className="record-modal__confirm-actions">
                        <button type="button" className="glass-btn" onClick={() => setGuidedChecklistOpen(false)}>
                          关闭
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {guidedAddQuestionConfirmOpen && (
                  <div
                    className="record-modal__confirm-layer"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="guided-add-question-title"
                  >
                    <div
                      className="record-modal__confirm-backdrop"
                      role="presentation"
                      onMouseDown={() => setGuidedAddQuestionConfirmOpen(false)}
                    />
                    <div className="record-modal__confirm-box" onMouseDown={e => e.stopPropagation()}>
                      <h3 id="guided-add-question-title" className="record-modal__confirm-title">
                        新增题目
                      </h3>
                      <p className="record-modal__confirm-text">
                        将在引导列表末尾新增一道题目，并自动跳到该题供您编辑。是否继续？
                      </p>
                      <div className="record-modal__confirm-actions">
                        <button type="button" className="glass-btn" onClick={() => setGuidedAddQuestionConfirmOpen(false)}>
                          取消
                        </button>
                        <button type="button" className="glass-btn primary" onClick={confirmGuidedAddQuestion}>
                          确定新增
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {guidedDeleteConfirm && (
                  <div
                    className="record-modal__confirm-layer"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="guided-delete-question-title"
                  >
                    <div
                      className="record-modal__confirm-backdrop"
                      role="presentation"
                      onMouseDown={() => setGuidedDeleteConfirm(null)}
                    />
                    <div className="record-modal__confirm-box" onMouseDown={e => e.stopPropagation()}>
                      <h3 id="guided-delete-question-title" className="record-modal__confirm-title">
                        删除题目
                      </h3>
                      <p className="record-modal__confirm-text">
                        删除后本题题干、已填回答及跳题标记将一并移除，且无法撤销。请确认是否删除。
                      </p>
                      <p
                        className="record-modal__confirm-text"
                        style={{
                          marginTop: 0,
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          maxHeight: 120,
                          overflowY: 'auto',
                          lineHeight: 1.5,
                          wordBreak: 'break-word',
                        }}
                      >
                        「{guidedDeleteConfirm.prompt}」
                      </p>
                      <div className="record-modal__confirm-actions">
                        <button type="button" className="glass-btn" onClick={() => setGuidedDeleteConfirm(null)}>
                          取消
                        </button>
                        <button type="button" className="glass-btn danger" onClick={confirmGuidedDeleteQuestion}>
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {guidedTemplateSaveOpen && selectedTemplate && (
                  <div
                    className="record-modal__confirm-layer"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="guided-template-save-title"
                  >
                    <div
                      className="record-modal__confirm-backdrop"
                      role="presentation"
                      onMouseDown={() => !templateSyncing && setGuidedTemplateSaveOpen(false)}
                    />
                    <div
                      className="record-modal__confirm-box record-modal__confirm-box--guided-checklist"
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <h3 id="guided-template-save-title" className="record-modal__confirm-title">
                        保存题目到模板
                      </h3>
                      <p className="record-modal__confirm-text">
                        请选择保存方式：直接覆盖将更新库中的「{selectedTemplate.name}」；另存为将新建一条模板记录，当前笔录类型会切换为新模板名称。
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          marginBottom: 14,
                          fontSize: 14,
                          color: 'var(--text-primary)',
                        }}
                      >
                        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <input
                            type="radio"
                            name="guided-template-save-mode"
                            checked={!guidedTemplateSaveAsNew}
                            disabled={templateSyncing}
                            onChange={() => setGuidedTemplateSaveAsNew(false)}
                          />
                          <span>覆盖当前模板「{selectedTemplate.name}」</span>
                        </label>
                        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <input
                            type="radio"
                            name="guided-template-save-mode"
                            checked={guidedTemplateSaveAsNew}
                            disabled={templateSyncing}
                            onChange={() => setGuidedTemplateSaveAsNew(true)}
                          />
                          <span>另存为新模板（需填写名称）</span>
                        </label>
                      </div>
                      {guidedTemplateSaveAsNew ? (
                        <label className="record-modal__field record-modal__field--full" style={{ marginBottom: 4 }}>
                          <span>新模板名称</span>
                          <input
                            type="text"
                            className="glass-input"
                            value={guidedTemplateNewName}
                            disabled={templateSyncing}
                            onChange={e => setGuidedTemplateNewName(e.target.value)}
                            placeholder="请输入新模板名称"
                            autoComplete="off"
                          />
                        </label>
                      ) : null}
                      <div className="record-modal__confirm-actions">
                        <button
                          type="button"
                          className="glass-btn"
                          disabled={templateSyncing}
                          onClick={() => setGuidedTemplateSaveOpen(false)}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="glass-btn primary"
                          disabled={
                            templateSyncing || (guidedTemplateSaveAsNew && !guidedTemplateNewName.trim())
                          }
                          onClick={() => void confirmGuidedSaveTemplateToLibrary()}
                        >
                          {templateSyncing ? '保存中…' : '确定保存'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {listPaperPreview && (
        <RecordFullReadingPreview
          open
          zIndex={12100}
          onClose={() => setListPaperPreview(null)}
          headerTitle="查看笔录"
          viewMode="recordReadonly"
          readOnly
          recordType={listPaperPreview.recordType}
          content={listPaperPreview.content}
          recordId={listPaperPreview.recordId}
          criminalName={listPaperPreview.criminalName}
          recordDate={listPaperPreview.recordDate}
          recordLocation={listPaperPreview.recordLocation}
          interrogatorId={listPaperPreview.interrogatorId}
          recorderId={listPaperPreview.recorderId}
          caseNumber={listPaperPreview.caseNumber}
          sessionNo={listPaperPreview.sessionNo}
          totalPages={listPaperPreview.totalPages}
          approvalInfo={listPaperPreview.approvalInfo}
          rejectReason={listPaperPreview.rejectReason}
        />
      )}

      {overwritePrompt && !detailLoading && (detailOpen || createPreflightOpen) && (
        <div
          className="record-modal__confirm-layer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-overwrite-title"
          style={{ zIndex: 13000 }}
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
