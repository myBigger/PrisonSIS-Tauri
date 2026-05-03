/** 监狱常见谈话/笔录地点；末项为「其他」 */
export const PRISON_RECORD_LOCATION_PRESETS = [
  '谈话教育室',
  '监区会议室',
  '监区办公室',
  '医院执勤点',
  '心理矫治中心',
  '出监教育室',
] as const

export const PRISON_RECORD_LOCATION_OTHER = '其他'

export const PRISON_RECORD_LOCATIONS: readonly string[] = [
  ...PRISON_RECORD_LOCATION_PRESETS,
  PRISON_RECORD_LOCATION_OTHER,
]

export function isPresetLocation(loc: string): boolean {
  if (!loc) return false
  return (PRISON_RECORD_LOCATION_PRESETS as readonly string[]).includes(loc)
}
