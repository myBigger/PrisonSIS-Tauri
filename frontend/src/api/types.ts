// types.ts — PrisonSIS 数据类型定义 (匹配 Rust 后端)

export interface User {
  id: number
  user_id: string
  username: string
  real_name: string
  role: string
  department: string
  position: string
  phone: string
  enabled: boolean
}

/** 用户管理列表行（含软删字段，与 Rust `ManagedUserRow` 一致） */
export interface ManagedUserRow {
  id: number
  userId: string
  username: string
  realName: string
  role: string
  department: string
  position: string
  phone: string
  enabled: boolean
  createdAt: string
  deletedAt?: string | null
}

export interface UserCreateInput {
  userId: string
  username: string
  realName: string
  role: string
  department?: string
  position?: string
  phone?: string
  password: string
}

export interface UserUpdateInput {
  id: number
  userId: string
  username: string
  realName: string
  role: string
  department?: string
  position?: string
  phone?: string
}

export interface Criminal {
  id: number
  criminal_id: string
  name: string
  gender: string
  ethnicity: string
  birth_date: string
  id_card_number: string
  native_place: string
  education: string
  crime: string
  sentence_years: number
  sentence_months: number
  entry_date: string
  original_court: string
  district: string
  cell: string
  crime_type: string
  manage_level: string
  handler_id: string
  photo_path: string
  remark: string
  archived: boolean
  case_number: string
  custody_date: string
  custody_location: string
  bed_number: string
  contact_phone: string
  created_at: string
}

/** 新增服刑人员输入（与 Rust `CriminalCreateInput` 对齐，不含 id/created_at） */
export type CriminalCreateInput = Omit<Criminal, 'id' | 'created_at'>

/** 新建笔录（由后端生成 record_id，默认草稿） */
export interface RecordInput {
  record_type: string
  criminal_id: number
  record_date: string
  record_location: string
  interrogator_id: string
  recorder_id: string
  present_persons: string
  content: string
  /** 可选关联案件（后端校验 FK）；不传或 null 表示不关联 */
  case_id?: number | null
}

export interface Record {
  id: number
  record_id: string
  record_type: string
  criminal_id: number
  criminal_name: string
  record_date: string
  record_location: string
  interrogator_id: string
  recorder_id: string
  present_persons: string
  content: string
  content_encrypted: boolean
  signed_interrogator: boolean
  signed_recorder: boolean
  signed_subject: boolean
  status: string
  approver1_id: string
  approver2_id: string
  approver1_result: string
  approver2_result: string
  reject_reason: string
  case_id?: number | null
  case_number?: string
  created_at: string
}

/** 案件（与 SQLite `cases` 表一致） */
export interface Case {
  id: number
  case_number: string
  title: string
  status: string
  remark: string
  created_at: string
  updated_at: string
}

/** 新建案件 */
export interface CaseInput {
  case_number: string
  title: string
  status?: string
  remark?: string
}

export interface DashboardStats {
  today_records: number
  pending_approvals: number
  total_criminals: number
  total_cases: number
  closed_cases: number
  active_cases: number
  yesterday_delta: number
  expired_count: number
  month_new_criminals: number
  month_new_cases: number
  month_records: number
  approval_rate: number
  avg_approval_hours: number
  archive_rate: number
  monthly_trends: Array<{
    month: string
    records: number
    criminals: number
  }>
  crime_distribution: Array<{
    label: string
    count: number
    percent: number
  }>
}

export interface LoginResult {
  success: boolean
  message: string
  user: User | null
}

export interface PageResult<T> {
  data: T[]
  total: number
}

/** 与 SQLite `templates` 表及 Rust `Template` 一致 */
export interface Template {
  id: number
  name: string
  category: string
  content: string
  template_kind: 'guided'
  guide_schema_json: string
  created_at: string
  deleted_at?: string
}

export interface TemplateInput {
  name: string
  category?: string
  content?: string
  template_kind?: 'guided'
  guide_schema_json?: string
}

export interface ExportRecordFilter {
  keyword?: string
  status?: string
  start_date?: string
  end_date?: string
  criminal_code?: string
  case_number?: string
}

export interface ExportResult {
  file_path: string
  exported_count: number
}

export interface AuditLog {
  id: number
  user_id: string
  action: string
  target_type: string
  target_id: string
  detail: string
  ip_address: string
  created_at: string
}

/** 审批中心统计（与 Rust `ApprovalSummary` 一致） */
export interface ApprovalSummary {
  pending: number
  approved_total: number
  rejected_total: number
}
