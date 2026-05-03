// tauri.ts — PrisonSIS Tauri 命令桥接层
import { invoke } from '@tauri-apps/api/core'
import type {
  User,
  Criminal,
  Record,
  RecordInput,
  DashboardStats,
  LoginResult,
  Template,
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

export async function getRecentRecords(limit: number = 10): Promise<Record[]> {
  return invoke<Record[]>('get_recent_records', { limit })
}

export async function getTemplates(): Promise<Template[]> {
  return invoke<Template[]>('get_templates')
}

// ── 仪表盘 ──────────────────────────────────────────────
export async function getDashboardStats(): Promise<DashboardStats> {
  return invoke<DashboardStats>('get_dashboard_stats')
}
