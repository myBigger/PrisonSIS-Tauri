export type AutoInkTokenRule = {
  key: string
  className: string
}

// 可配置：按业务标签自动分色。后续新增字段只需在这里加 key。
export const DEFAULT_AUTO_INK_TOKEN_RULES: AutoInkTokenRule[] = [
  { key: '问', className: 'tiptap-ink-token-question' },
  { key: '答', className: 'tiptap-ink-token-answer' },
  { key: '时间', className: 'tiptap-ink-token-time' },
  { key: '地点', className: 'tiptap-ink-token-location' },
  { key: '询问人', className: 'tiptap-ink-token-role' },
  { key: '讯问人', className: 'tiptap-ink-token-role' },
  { key: '询/讯问人', className: 'tiptap-ink-token-role' },
  { key: '记录人', className: 'tiptap-ink-token-recorder' },
  { key: '被询问人', className: 'tiptap-ink-token-person' },
  { key: '被讯问人', className: 'tiptap-ink-token-person' },
  { key: '被询/讯问人', className: 'tiptap-ink-token-person' },
  { key: '第几次询问', className: 'tiptap-ink-token-meta' },
  { key: '第几次讯问', className: 'tiptap-ink-token-meta' },
  { key: '询问人工作单位', className: 'tiptap-ink-token-meta' },
  { key: '讯问人工作单位', className: 'tiptap-ink-token-meta' },
  { key: '记录人工作单位', className: 'tiptap-ink-token-meta' },
  { key: '居民身份证号', className: 'tiptap-ink-token-meta' },
  { key: '户籍地址', className: 'tiptap-ink-token-meta' },
  { key: '性别', className: 'tiptap-ink-token-meta' },
  { key: '民族', className: 'tiptap-ink-token-meta' },
  { key: '出生日期', className: 'tiptap-ink-token-meta' },
  { key: '罪名', className: 'tiptap-ink-token-meta' },
  { key: '罪犯编号', className: 'tiptap-ink-token-meta' },
]
