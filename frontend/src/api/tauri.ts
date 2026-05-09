// tauri.ts — PrisonSIS Tauri 命令桥接层
import { invoke } from '@tauri-apps/api/core'
import type {
  User,
  ManagedUserRow,
  UserCreateInput,
  UserUpdateInput,
  Criminal,
  CriminalCreateInput,
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
  AuditLog,
  ApprovalSummary,
} from './types'

function getCurrentAuth() {
  try {
    const raw = localStorage.getItem('prisonsis_user')
    if (!raw) return { userRole: '', userId: '' }
    const user = JSON.parse(raw) as { role?: string; user_id?: string }
    return { userRole: user.role ?? '', userId: user.user_id ?? '' }
  } catch {
    return { userRole: '', userId: '' }
  }
}

/** 与 `#[tauri::command(rename_all = "snake_case")]` 的日志类 command 对齐 */
function getCurrentAuthSnake() {
  try {
    const raw = localStorage.getItem('prisonsis_user')
    if (!raw) return { user_role: '', user_id: '' }
    const user = JSON.parse(raw) as { role?: string; user_id?: string }
    return { user_role: user.role ?? '', user_id: user.user_id ?? '' }
  } catch {
    return { user_role: '', user_id: '' }
  }
}

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
  search: string = '',
  statusFilter: '' | 'active' | 'archived' = '',
  typeFilter: string = ''
): Promise<[Criminal[], number]> {
  return invoke<[Criminal[], number]>('get_criminals_by_page', {
    page,
    pageSize,
    search,
    statusFilter,
    typeFilter,
  })
}

export async function addCriminal(criminal: CriminalCreateInput): Promise<number> {
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
  return invoke<Record>('submit_record_for_approval', { id, ...getCurrentAuth() })
}

export async function listPendingRecords(): Promise<Record[]> {
  return invoke<Record[]>('list_pending_records', getCurrentAuth())
}

export async function approveRecord(id: number): Promise<void> {
  return invoke<void>('approve_record', { id, ...getCurrentAuth() })
}

export async function rejectRecord(id: number, reason: string): Promise<void> {
  return invoke<void>('reject_record', { id, reason, ...getCurrentAuth() })
}

export async function getApprovalSummary(): Promise<ApprovalSummary> {
  return invoke<ApprovalSummary>('get_approval_summary', getCurrentAuth())
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
  return invoke<ExportResult>('export_records_csv', { filter, filePath, ...getCurrentAuth() })
}

export async function exportRecordsCount(filter: ExportRecordFilter): Promise<number> {
  return invoke<number>('export_records_count', { filter, ...getCurrentAuth() })
}

export async function getLogsByPage(
  page: number,
  pageSize: number,
  search: string = '',
  startDate: string = '',
  endDate: string = ''
): Promise<[AuditLog[], number]> {
  return invoke<[AuditLog[], number]>('get_logs_by_page', {
    page,
    page_size: pageSize,
    search,
    start_date: startDate,
    end_date: endDate,
    ...getCurrentAuthSnake(),
  })
}

export async function exportLogsCsv(
  search: string,
  startDate: string,
  endDate: string,
  filePath: string
): Promise<ExportResult> {
  return invoke<ExportResult>('export_logs_csv', {
    search,
    start_date: startDate,
    end_date: endDate,
    file_path: filePath,
    ...getCurrentAuthSnake(),
  })
}

export async function clearLogs(): Promise<number> {
  return invoke<number>('clear_logs', { ...getCurrentAuth() })
}

// ── 用户管理与备份（阶段 5）──────────────────────────────
export async function suggestNextUserId(): Promise<string> {
  return invoke<string>('suggest_next_user_id', { ...getCurrentAuth() })
}

export async function getUsersByPage(
  page: number,
  pageSize: number,
  search: string,
  includeDeleted: boolean
): Promise<[ManagedUserRow[], number]> {
  return invoke<[ManagedUserRow[], number]>('get_users_by_page', {
    page,
    pageSize,
    search,
    includeDeleted,
    ...getCurrentAuth(),
  })
}

export async function addUser(input: UserCreateInput, privilegedElevated: boolean): Promise<number> {
  return invoke<number>('add_user', {
    input,
    privilegedElevated,
    ...getCurrentAuth(),
  })
}

export async function updateUser(input: UserUpdateInput, privilegedRoleEdit: boolean): Promise<void> {
  return invoke<void>('update_user', {
    input,
    privilegedRoleEdit,
    ...getCurrentAuth(),
  })
}

export async function softDeleteUser(id: number): Promise<void> {
  return invoke<void>('soft_delete_user', { id, ...getCurrentAuth() })
}

export async function restoreSoftDeletedUser(id: number): Promise<void> {
  return invoke<void>('restore_soft_deleted_user', { id, ...getCurrentAuth() })
}

export async function setUserEnabled(id: number, enabled: boolean): Promise<void> {
  return invoke<void>('set_user_enabled', { id, enabled, ...getCurrentAuth() })
}

export async function resetPasswordAdmin(targetId: number, newPassword: string): Promise<void> {
  return invoke<void>('reset_password_admin', {
    targetId,
    newPassword,
    ...getCurrentAuth(),
  })
}

export async function changeOwnPassword(oldPassword: string, newPassword: string): Promise<void> {
  return invoke<void>('change_own_password', {
    oldPassword,
    newPassword,
    ...getCurrentAuth(),
  })
}

export async function exportDatabaseBackup(destPath: string): Promise<string> {
  return invoke<string>('export_database_backup', {
    destPath,
    ...getCurrentAuth(),
  })
}

export async function restoreDatabaseBackup(backupPath: string): Promise<void> {
  return invoke<void>('restore_database_backup', {
    backupPath,
    ...getCurrentAuth(),
  })
}

// ── 仪表盘 ──────────────────────────────────────────────
export async function getDashboardStats(): Promise<DashboardStats> {
  return invoke<DashboardStats>('get_dashboard_stats')
}
