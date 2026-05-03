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
  created_at: string
}

export interface DashboardStats {
  today_records: number
  pending_approvals: number
  total_criminals: number
  total_cases: number
  yesterday_delta: number
  expired_count: number
  month_new_criminals: number
  month_new_cases: number
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
  created_at: string
}
