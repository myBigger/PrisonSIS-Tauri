const ACTION_LABELS: Record<string, string> = {
  login: '登录',
  logout: '登出',
  add_record: '新增笔录',
  update_record: '更新笔录',
  submit_pending: '提交审批',
  record_submit_pending: '提交审批',
  approve_record: '审批通过',
  reject_record: '审批驳回',
  record_approve: '审批通过',
  record_reject: '审批驳回',
  export_records_csv: '导出笔录',
  export_logs_csv: '导出日志',
  clear_logs: '清空日志',
  logs_clear: '清空日志',
  permission_deny: '权限拒绝',
  user_add: '新增用户',
  user_update: '更新用户',
  user_soft_delete: '用户软删除',
  user_restore: '恢复用户',
  user_enable: '启用用户',
  user_disable: '禁用用户',
  reset_password_admin: '重置密码',
  password_change_self: '修改本人密码',
  database_backup: '数据库备份',
  database_restore: '数据库恢复',
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  record: '笔录',
  records: '笔录',
  command: '接口命令',
  logs: '日志',
  user: '用户',
  users: '用户',
  case: '案件',
  cases: '案件',
  criminal: '服刑人员',
  criminals: '服刑人员',
  template: '模板',
  templates: '模板',
  auth: '认证',
  database: '数据库',
}

const DETAIL_KEY_LABELS: Record<string, string> = {
  result: '结果',
  role: '角色',
  allowed: '允许角色',
  count: '数量',
  scope: '范围',
  search: '关键字',
  keyword: '关键字',
  status: '状态',
  start_date: '开始日期',
  end_date: '结束日期',
  criminal_code: '服刑人员编号',
  case_number: '案件编号',
  command: '命令',
  reason: '原因',
  record_id: '笔录编号',
}

const SEARCH_ALIAS_TO_RAW: Record<string, string> = {
  权限拒绝: 'permission_deny',
  导出日志: 'export_logs_csv',
  导出笔录: 'export_records_csv',
  清空日志: 'logs_clear',
  接口命令: 'command',
  日志: 'logs',
  笔录: 'record',
  用户: 'user',
  审批通过: 'record_approve',
  审批驳回: 'record_reject',
}

const SEARCH_FUZZY_HINTS: Array<{ zh: string; raw: string }> = [
  { zh: '拒绝', raw: 'permission_deny' },
  { zh: '权限', raw: 'permission_deny' },
  { zh: '导出', raw: 'export_' },
  { zh: '导出日志', raw: 'export_logs_csv' },
  { zh: '导出笔录', raw: 'export_records_csv' },
  { zh: '清空', raw: 'logs_clear' },
  { zh: '日志', raw: 'logs' },
  { zh: '命令', raw: 'command' },
  { zh: '接口', raw: 'command' },
  { zh: '审批通过', raw: 'record_approve' },
  { zh: '审批驳回', raw: 'record_reject' },
  { zh: '审批', raw: 'record_' },
  { zh: '笔录', raw: 'record' },
]

export function localizeLogAction(action: string): string {
  const key = action.trim()
  if (!key) return '—'
  return ACTION_LABELS[key] || key
}

export function localizeLogTargetType(targetType: string): string {
  const key = targetType.trim()
  if (!key) return '—'
  return TARGET_TYPE_LABELS[key] || key
}

export function formatLogDetailForDisplay(detail: string): string {
  const text = detail.trim()
  if (!text) return '—'

  // 后端 detail 约定主要是 key=value;key2=value2
  const segments = text
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(seg => {
      const idx = seg.indexOf('=')
      if (idx <= 0) return seg
      const key = seg.slice(0, idx).trim()
      const value = seg.slice(idx + 1).trim()
      const keyLabel = DETAIL_KEY_LABELS[key] || key
      return `${keyLabel}=${value}`
    })

  return segments.join('；')
}

export function normalizeLogSearchKeyword(keyword: string): string {
  const text = keyword.trim()
  if (!text) return ''
  if (SEARCH_ALIAS_TO_RAW[text]) return SEARCH_ALIAS_TO_RAW[text]

  // 支持中文模糊词：追加一个原始值关键词，后端 LIKE 可命中
  // 例如 "拒绝" => "拒绝 permission_deny"
  const hit = SEARCH_FUZZY_HINTS.find(item => text.includes(item.zh))
  if (hit) {
    return `${text} ${hit.raw}`.trim()
  }
  return text
}

