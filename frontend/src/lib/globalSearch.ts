import {
  getCasesByPage,
  getCriminalsByPage,
  getLogsByPage,
  getRecordsByPage,
  getTemplatesByPage,
  listPendingRecords,
  type AuditLog,
  type Case,
  type Criminal,
  type Record,
  type Template,
} from '../api'
import { localizeLogAction, localizeLogTargetType, normalizeLogSearchKeyword } from './logI18n'

export type GlobalSearchPage = 'records' | 'criminals' | 'cases' | 'approvals' | 'logs' | 'templates'

export type GlobalSearchGroupKey = GlobalSearchPage

export type GlobalSearchResultItem = {
  id: string
  title: string
  subtitle: string
  targetPage: GlobalSearchPage
  search: string
}

export type GlobalSearchResultGroup = {
  group: GlobalSearchGroupKey
  totalHint: number
  items: GlobalSearchResultItem[]
}

const MAX_PER_GROUP = 8

function hasKeyword(text: string, keyword: string) {
  return text.toLowerCase().includes(keyword.toLowerCase())
}

function pickText(parts: Array<string | number | null | undefined>) {
  return parts
    .filter(Boolean)
    .map(x => String(x).trim())
    .filter(Boolean)
    .join(' · ')
}

function mapRecords(rows: Record[], search: string): GlobalSearchResultGroup {
  return {
    group: 'records',
    totalHint: rows.length,
    items: rows.map(r => ({
      id: `record-${r.id}`,
      title: `${r.record_id} · ${r.criminal_name || '未知人员'}`,
      subtitle: pickText([r.record_type, r.case_number, r.record_location, r.status]),
      targetPage: 'records',
      search,
    })),
  }
}

function mapCriminals(rows: Criminal[], search: string): GlobalSearchResultGroup {
  return {
    group: 'criminals',
    totalHint: rows.length,
    items: rows.map(c => ({
      id: `criminal-${c.id}`,
      title: `${c.criminal_id} · ${c.name}`,
      subtitle: pickText([c.crime, c.district, c.cell, c.case_number]),
      targetPage: 'criminals',
      search,
    })),
  }
}

function mapCases(rows: Case[], search: string): GlobalSearchResultGroup {
  return {
    group: 'cases',
    totalHint: rows.length,
    items: rows.map(c => ({
      id: `case-${c.id}`,
      title: `${c.case_number} · ${c.title || '未命名案件'}`,
      subtitle: pickText([c.status, c.remark]),
      targetPage: 'cases',
      search,
    })),
  }
}

function mapTemplates(rows: Template[], search: string): GlobalSearchResultGroup {
  return {
    group: 'templates',
    totalHint: rows.length,
    items: rows.map(t => ({
      id: `template-${t.id}`,
      title: `${t.name} · ${t.category || '未分类'}`,
      subtitle: pickText([t.template_kind === 'guided' ? '引导式' : '自由文本', t.content.slice(0, 40)]),
      targetPage: 'templates',
      search,
    })),
  }
}

function mapLogs(rows: AuditLog[], search: string): GlobalSearchResultGroup {
  return {
    group: 'logs',
    totalHint: rows.length,
    items: rows.map(l => ({
      id: `log-${l.id}`,
      title: `${localizeLogAction(l.action)} · ${l.user_id}`,
      subtitle: pickText([localizeLogTargetType(l.target_type), l.created_at]),
      targetPage: 'logs',
      search,
    })),
  }
}

function mapApprovals(rows: Record[], search: string): GlobalSearchResultGroup {
  return {
    group: 'approvals',
    totalHint: rows.length,
    items: rows.map(r => ({
      id: `approval-${r.id}`,
      title: `${r.record_id} · ${r.criminal_name || '未知人员'}`,
      subtitle: pickText([r.record_type, r.created_at, '待审批']),
      targetPage: 'approvals',
      search,
    })),
  }
}

function emptyGroup(group: GlobalSearchGroupKey): GlobalSearchResultGroup {
  return { group, totalHint: 0, items: [] }
}

export async function runGlobalSearch(search: string): Promise<GlobalSearchResultGroup[]> {
  const keyword = search.trim()
  if (!keyword) return []

  const tasks = await Promise.allSettled([
    getRecordsByPage(0, MAX_PER_GROUP, keyword, ''),
    getCriminalsByPage(0, MAX_PER_GROUP, keyword, '', ''),
    getCasesByPage(0, MAX_PER_GROUP, keyword),
    getTemplatesByPage(0, MAX_PER_GROUP, keyword, false),
    getLogsByPage(0, MAX_PER_GROUP, normalizeLogSearchKeyword(keyword), '', ''),
    listPendingRecords(),
  ])

  const recordsGroup =
    tasks[0].status === 'fulfilled' ? mapRecords(tasks[0].value[0], keyword) : emptyGroup('records')
  const criminalsGroup =
    tasks[1].status === 'fulfilled' ? mapCriminals(tasks[1].value[0], keyword) : emptyGroup('criminals')
  const casesGroup =
    tasks[2].status === 'fulfilled' ? mapCases(tasks[2].value[0], keyword) : emptyGroup('cases')
  const templatesGroup =
    tasks[3].status === 'fulfilled' ? mapTemplates(tasks[3].value[0], keyword) : emptyGroup('templates')
  const logsGroup =
    tasks[4].status === 'fulfilled' ? mapLogs(tasks[4].value[0], keyword) : emptyGroup('logs')
  const approvalsGroup = (() => {
    if (tasks[5].status !== 'fulfilled') return emptyGroup('approvals')
    const filtered = tasks[5].value
      .filter(r => {
        const joined = pickText([
          r.record_id,
          r.criminal_name,
          r.record_type,
          r.record_location,
          r.interrogator_id,
          r.recorder_id,
          r.present_persons,
          r.content,
        ])
        return hasKeyword(joined, keyword)
      })
      .slice(0, MAX_PER_GROUP)
    return mapApprovals(filtered, keyword)
  })()

  return [recordsGroup, criminalsGroup, casesGroup, approvalsGroup, logsGroup, templatesGroup]
}

