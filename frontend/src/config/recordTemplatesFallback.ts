import type { Template } from '../api/types'
import {
  GUIDED_SCHEMA_RT01,
  GUIDED_SCHEMA_RT02,
  GUIDED_SCHEMA_RT03,
  GUIDED_SCHEMA_RT04,
} from './guidedPrisonSchemas'

/** Web 预览或未读到库时的笔录类型名（与 init_db.sql 种子一致） */
export const FALLBACK_TEMPLATE_NAMES = [
  '入监谈话笔录',
  '个别教育谈话笔录',
  '提押（出庭）谈话笔录',
  '出监前谈话笔录',
] as const

const FALLBACK_GUIDED_SCHEMAS = [
  GUIDED_SCHEMA_RT01,
  GUIDED_SCHEMA_RT02,
  GUIDED_SCHEMA_RT03,
  GUIDED_SCHEMA_RT04,
] as const

/** 无库时与桌面端迁移一致的引导式兜底 */
export function fallbackTemplatesStub(): Template[] {
  return FALLBACK_TEMPLATE_NAMES.map((name, i) => ({
    id: i + 1,
    name,
    category: `RT-0${i + 1}`,
    content: '',
    template_kind: 'guided',
    guide_schema_json: FALLBACK_GUIDED_SCHEMAS[i],
    created_at: '',
  }))
}
