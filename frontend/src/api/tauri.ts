// tauri.ts — PrisonSIS Tauri 命令桥接层
import { invoke } from '@tauri-apps/api/core'
import type {
  User,
  Criminal,
  Case,
  CaseInput,
  Record,
  RecordInput,
  DashboardStats,
  LoginResult,
  Template,
  TemplateInput,
  ExportRecordFilter,
  ExportResult,
  ApprovalSummary,
} from './types'

// ── 认证 ────────────────────────────────────────────────
export async function login(username: string, password: string): Promise<LoginResult> {
  return invoke<LoginResult>('login', { username, password })
}

// ── 服刑人员 ─────────────────────────────────────────────
export async function getCriminals(): Promise<Criminal[]> {
  return invoke<Criminal[]>('get_criminals')
}

export async function getCriminalsByPage(
  page: number,
  pageSize: number,
  search: string = ''
): Promise<[Criminal[], number]> {
  return invoke<[Criminal[], number]>('get_criminals_by_page', {
    page,
    pageSize,
    search,
  })
}

export async function addCriminal(criminal: Omit<Criminal, 'id' | 'created_at'>): Promise<number> {
  return invoke<number>('add_criminal', { c: criminal })
}

export async function updateCriminal(criminal: Criminal): Promise<void> {
  return invoke<void>('update_criminal', { c: criminal })
}

export async function getArchiveCriminalsByPage(
  page: number,
  pageSize: number,
  search: string = '',
  archivedFilter: '' | 'archived' | 'active' = ''
): Promise<[Criminal[], number]> {
  return invoke<[Criminal[], number]>('get_archive_criminals_by_page', {
    page,
    pageSize,
    search,
    archivedFilter,
  })
}

export async function archiveCriminal(id: number): Promise<void> {
  return invoke<void>('archive_criminal', { id })
}

export async function unarchiveCriminal(id: number, userRole: string): Promise<void> {
  return invoke<void>('unarchive_criminal', { id, userRole })
}

// ── 案件 ────────────────────────────────────────────────
export async function getCasesByPage(
  page: number,
  pageSize: number,
  search: string = ''
): Promise<[Case[], number]> {
  return invoke<[Case[], number]>('get_cases_by_page', { page, pageSize, search })
}

export async function getCaseById(id: number): Promise<Case> {
  return invoke<Case>('get_case_by_id', { id })
}

export async function addCase(input: CaseInput): Promise<Case> {
  return invoke<Case>('add_case', { input })
}

export async function updateCase(item: Case): Promise<void> {
  return invoke<void>('update_case', { c: item })
}

export async function listRecordsByCase(caseId: number): Promise<Record[]> {
  return invoke<Record[]>('list_records_by_case', { caseId })
}

// ── 笔录 ────────────────────────────────────────────────
/** @param statusFilter 空字符串=全部；否则为 Draft/Pending/Approved/Rejected */
export async function getRecordsByPage(
  page: number,
  pageSize: number,
  search: string = '',
  statusFilter: string = ''
): Promise<[Record[], number]> {
  return invoke<[Record[], number]>('get_records', {
    page,
    pageSize,
    search,
    statusFilter,
  })
}

export async function getRecordById(id: number): Promise<Record> {
  return invoke<Record>('get_record_by_id', { id })
}

export async function addRecord(input: RecordInput): Promise<Record> {
  return invoke<Record>('add_record', { input })
}

export async function updateRecord(record: Record): Promise<void> {
  return invoke<void>('update_record', { record })
}

export async function submitRecordForApproval(id: number): Promise<Record> {
  return invoke<Record>('submit_record_for_approval', { id })
}

export async function listPendingRecords(): Promise<Record[]> {
  return invoke<Record[]>('list_pending_records')
}

export async function approveRecord(id: number): Promise<void> {
  return invoke<void>('approve_record', { id })
}

export async function rejectRecord(id: number, reason: string): Promise<void> {
  return invoke<void>('reject_record', { id, reason })
}

export async function getApprovalSummary(): Promise<ApprovalSummary> {
  return invoke<ApprovalSummary>('get_approval_summary')
}

export async function getRecentRecords(limit: number = 10): Promise<Record[]> {
  return invoke<Record[]>('get_recent_records', { limit })
}

export async function getTemplates(): Promise<Template[]> {
  return invoke<Template[]>('get_templates')
}

export async function getTemplatesByPage(
  page: number,
  pageSize: number,
  search: string = '',
  includeDisabled: boolean = false
): Promise<[Template[], number]> {
  return invoke<[Template[], number]>('get_templates_by_page', {
    page,
    pageSize,
    search,
    includeDisabled,
  })
}

export async function addTemplate(input: TemplateInput): Promise<Template> {
  return invoke<Template>('add_template', { input })
}

export async function updateTemplate(item: Template): Promise<void> {
  return invoke<void>('update_template', { t: item })
}

export async function disableTemplate(id: number): Promise<void> {
  return invoke<void>('disable_template', { id })
}

export async function exportRecordsCsv(
  filter: ExportRecordFilter,
  filePath: string
): Promise<ExportResult> {
  return invoke<ExportResult>('export_records_csv', { filter, filePath })
}

// ── 仪表盘 ──────────────────────────────────────────────
export async function getDashboardStats(): Promise<DashboardStats> {
  return invoke<DashboardStats>('get_dashboard_stats')
}
