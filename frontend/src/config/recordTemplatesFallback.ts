import type { Template } from '../api/types'

/** Web 预览或未读到库时的笔录类型名（与 init_db.sql 种子一致） */
export const FALLBACK_TEMPLATE_NAMES = [
  '入监谈话笔录',
  '个别教育谈话笔录',
  '提押（出庭）谈话笔录',
  '出监前谈话笔录',
] as const

/** 无正文内容，仅用于下拉兜底 */
export function fallbackTemplatesStub(): Template[] {
  return FALLBACK_TEMPLATE_NAMES.map((name, i) => ({
    id: i + 1,
    name,
    category: `RT-0${i + 1}`,
    content: '',
    template_kind: 'free_text',
    guide_schema_json: '',
    created_at: '',
  }))
}
