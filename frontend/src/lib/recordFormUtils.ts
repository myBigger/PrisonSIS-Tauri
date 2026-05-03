/** 正文占位符（须与 init_db.sql 种子模板一致） */
export const PLACEHOLDER_INTERVIEW_DATE = '[谈话日期]'
export const PLACEHOLDER_PRISONER_NAME = '[服刑人员姓名]'

/** DB：`YYYY-MM-DD HH:mm`（不写秒）；控件：`YYYY-MM-DDTHH:mm` */
export function dbDateTimeToLocalValue(db: string): string {
  const s = db.trim()
  if (!s) return ''
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?/)
  if (m) return `${m[1]}T${m[2]}:${m[3]}`
  return ''
}

export function localValueToDbDateTime(local: string): string {
  const s = local.trim()
  if (!s) return ''
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  if (m) return `${m[1]} ${m[2]}:${m[3]}`
  return s
}

export function nowLocalValue(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 正文内日期：统一 YYYY-MM-DD */
export function todayYmd(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 插入日期：正文中含 `[谈话日期]` 则全局替换为今天；否则在 cursor 处插入 `todayYmd`。
 */
export function applyInsertDate(
  content: string,
  cursorPos: number,
  today: string
): { content: string; newCursor: number } {
  if (content.includes(PLACEHOLDER_INTERVIEW_DATE)) {
    const newContent = content.split(PLACEHOLDER_INTERVIEW_DATE).join(today)
    return { content: newContent, newCursor: Math.min(cursorPos, newContent.length) }
  }
  const before = content.slice(0, cursorPos)
  const after = content.slice(cursorPos)
  const ins = today
  const newContent = before + ins + after
  return { content: newContent, newCursor: cursorPos + ins.length }
}

export function replacePrisonerNamePlaceholders(content: string, name: string): string {
  return content.split(PLACEHOLDER_PRISONER_NAME).join(name)
}
