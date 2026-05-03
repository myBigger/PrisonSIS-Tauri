/** 将 Tauri invoke / 任意异常转为可读中文文案（避免 alert 出现 [object Object]）。 */
export function formatInvokeError(e: unknown): string {
  if (e == null) return '未知错误'
  if (typeof e === 'string') return e.trim() || '未知错误'
  if (e instanceof Error) {
    const m = e.message?.trim()
    return m || '未知错误'
  }
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim()
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim()
  }
  try {
    const s = JSON.stringify(e)
    return s === '{}' ? '未知错误' : s
  } catch {
    return String(e)
  }
}
