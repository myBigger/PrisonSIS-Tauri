/** 将笔录正文（Tiptap JSON 或纯文本）转为通读用纯文本（保留段落换行） */

function walkTiptapNode(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { type?: string; content?: unknown[]; text?: string; attrs?: { level?: number } }
  if (n.type === 'text') return n.text ?? ''
  if (n.type === 'hardBreak') return '\n'
  if (n.type === 'heading') {
    const inner = (n.content ?? []).map(walkTiptapNode).join('').trim()
    const level = Math.min(3, Math.max(1, n.attrs?.level ?? 1))
    const hashes = '#'.repeat(level)
    return inner ? `${hashes} ${inner}\n\n` : '\n'
  }
  if (n.type === 'paragraph') {
    const inner = (n.content ?? []).map(walkTiptapNode).join('')
    return `${inner.replace(/\n+/g, ' ').trimEnd()}\n\n`
  }
  if (n.type === 'bulletList' || n.type === 'orderedList') {
    return (n.content ?? []).map(walkTiptapNode).join('')
  }
  if (n.type === 'listItem') {
    const inner = (n.content ?? []).map(walkTiptapNode).join('').trim()
    return inner ? `• ${inner}\n` : ''
  }
  if (n.type === 'doc') {
    return (n.content ?? []).map(walkTiptapNode).join('')
  }
  if (Array.isArray(n.content)) {
    return n.content.map(walkTiptapNode).join('')
  }
  return ''
}

export function recordContentToPlainReadingText(content: string): string {
  const t = content?.trim() ?? ''
  if (!t) return ''
  if (t.startsWith('{')) {
    try {
      const parsed = JSON.parse(t) as { type?: string }
      if (parsed && parsed.type === 'doc') {
        return walkTiptapNode(parsed).replace(/\n{3,}/g, '\n\n').trim()
      }
    } catch {
      /* fallthrough */
    }
  }
  return content
}

/** composeGuidedContent 及卷宗要素中与纸面表头重复的「标签：值」行（标签部分，不含冒号） */
const GUIDED_PAPER_DUPLICATE_META_LABELS = ['时间', '地点', '询/讯问人', '记录人', '被询/讯问人'] as const

const GUIDED_PAPER_DUPLICATE_META_LABELS_EXTRA = [
  '询问时间',
  '讯问时间',
  '询问地点',
  '讯问地点',
  '询问人',
  '讯问人',
  '被询问人',
  '被讯问人',
  '案号',
  '编号',
  '页数',
] as const

function isGuidedDuplicateMetaLabel(label: string): boolean {
  const t = label.trim()
  if (!t) return false
  if ((GUIDED_PAPER_DUPLICATE_META_LABELS as readonly string[]).includes(t)) return true
  if ((GUIDED_PAPER_DUPLICATE_META_LABELS_EXTRA as readonly string[]).includes(t)) return true
  // 次第、页数类卷宗行（模板「卷宗要素」写入正文，纸面表头已展示）
  if (/^第[一二三四五六七八九十百千万零〇两\d]*次$/.test(t) || /^第几次/.test(t)) return true
  if (t.includes('询问次数') || t.includes('讯问次数')) return true
  if (/笔录共/.test(t) || /本笔录/.test(t)) return true
  return false
}

function splitLabelFromKeyedLine(line: string): string | null {
  const t = line.trim()
  if (!t) return null
  const idxCn = t.indexOf('：')
  const idxEn = t.indexOf(':')
  const idx = idxCn >= 0 && (idxEn < 0 || idxCn <= idxEn) ? idxCn : idxEn >= 0 ? idxEn : -1
  if (idx <= 0) return null
  return t.slice(0, idx).trim()
}

function isGuidedDuplicateMetaLine(line: string): boolean {
  const label = splitLabelFromKeyedLine(line)
  if (!label) return false
  return isGuidedDuplicateMetaLabel(label)
}

/**
 * 纸面预览：表头已展示时间/地点/人、次第、案号等时，去掉正文前缀里与 composeGuidedContent 重复的行（仅展示，不改存库）。
 * 兼容 Tiptap 转纯文本时段落间的空行。
 */
export function stripGuidedPaperDuplicatePreamble(plain: string, recordType: string): string {
  const raw = (plain ?? '').replace(/\r\n/g, '\n')
  if (!raw.trim()) return plain ?? ''

  const lines = raw.split('\n')
  let i = 0
  const rt = (recordType ?? '').trim()

  while (i < lines.length && lines[i].trim() === '') i++

  if (rt && i < lines.length && lines[i].trim() === rt) {
    i++
    while (i < lines.length && lines[i].trim() === '') i++
  }

  // 正文里段落常为「一行 + 空行」；表头多行元数据之间也可能有空行，须一并跳过以免残留重复表头
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      let j = i + 1
      while (j < lines.length && lines[j].trim() === '') j++
      if (j < lines.length && isGuidedDuplicateMetaLine(lines[j])) {
        i = j
      } else {
        break
      }
    }
    if (!isGuidedDuplicateMetaLine(lines[i])) break
    i++
  }

  while (i < lines.length && lines[i].trim() === '') i++

  const rest = lines.slice(i).join('\n')
  if (!rest.trim() && raw.trim()) return raw
  return rest
}

/** 纸面预览底部已渲染「被询问人签名」等固定栏，去掉正文末尾与之一类的签名占位行（仅展示用，可与 composeGuidedContent 历史数据配合） */
export function stripGuidedPaperDuplicateSignatureTail(plain: string): string {
  const raw = (plain ?? '').replace(/\r\n/g, '\n')
  if (!raw.trim()) return plain ?? ''

  const lines = raw.split('\n')

  const isRemovableSignatureLine = (line: string): boolean => {
    const t = line.trim()
    if (!t) return false
    if (/(签名|捺印)[：:]/.test(t) && /[_＿]{2,}/.test(t)) return true
    if (/^[_＿\s]+$/.test(t)) return true
    return false
  }

  let end = lines.length
  while (end > 0 && lines[end - 1].trim() === '') end -= 1
  while (end > 0 && isRemovableSignatureLine(lines[end - 1])) end -= 1
  while (end > 0 && lines[end - 1].trim() === '') end -= 1

  return lines.slice(0, end).join('\n').trimEnd()
}

/** 从正文转成的纯文本中宽松匹配「第几次」「笔录页数」等表头行，供列表纸面只读展示。 */
export function extractPaperSessionAndPagesFromRecordContent(content: string): { sessionNo: string; totalPages: string } {
  const plain = recordContentToPlainReadingText(content)
  let sessionNo = ''
  let totalPages = ''
  for (const raw of plain.split('\n')) {
    const t = raw.trim()
    const idxCn = t.indexOf('：')
    const idxEn = t.indexOf(':')
    const idx = idxCn >= 0 && (idxEn < 0 || idxCn <= idxEn) ? idxCn : idxEn >= 0 ? idxEn : -1
    if (idx <= 0) continue
    const lab = t.slice(0, idx).trim()
    const val = t.slice(idx + 1).trim()
    if (/第[一二三四五六七八九十百千万零〇两\d]+次|第几次|讯问次数|询问次数/.test(lab)) sessionNo = val
    if (/笔录共|本笔录共|页数|共\s*\d*\s*页/.test(lab)) totalPages = val
  }
  return { sessionNo, totalPages }
}

const COMPOSE_FIXED_META_LABELS = new Set(['时间', '地点', '询/讯问人', '记录人', '被询/讯问人'])

function splitLabelValueLine(line: string): { label: string; value: string } | null {
  const t = line.trim()
  if (!t) return null
  const idxCn = t.indexOf('：')
  const idxEn = t.indexOf(':')
  const idx = idxCn >= 0 && (idxEn < 0 || idxCn <= idxEn) ? idxCn : idxEn >= 0 ? idxEn : -1
  if (idx <= 0) return null
  const label = t.slice(0, idx).trim()
  const value = t.slice(idx + 1).trim()
  return { label, value }
}

/**
 * 从 composeGuidedContent 写入的纯文本正文恢复卷宗要素与问答（用于再次打开编辑时回填 UI）。
 */
export function parseGuidedComposeFromPlaintext(
  plain: string,
  recordType: string,
  headerFields: Array<{ key: string; label: string }>,
  questions: Array<{ id: string; prompt: string }>
): { meta: Record<string, string>; answers: Record<string, string> } {
  const meta: Record<string, string> = {}
  const answers: Record<string, string> = {}
  const raw = (plain ?? '').replace(/\r\n/g, '\n')
  if (!raw.trim() || questions.length === 0) return { meta, answers }

  const labelToKey = new Map<string, string>()
  for (const hf of headerFields) {
    const lb = (hf.label || '').trim()
    if (lb) labelToKey.set(lb, hf.key)
  }

  const lines = raw.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++

  const rt = (recordType ?? '').trim()
  if (rt && i < lines.length && lines[i].trim() === rt) {
    i++
    while (i < lines.length && lines[i].trim() === '') i++
  }

  while (i < lines.length) {
    if (lines[i].trim() === '') {
      let j = i + 1
      while (j < lines.length && lines[j].trim() === '') j++
      if (j < lines.length) {
        const peek = lines[j].trim()
        if (/^问[：:]/.test(peek)) break
        if (splitLabelValueLine(lines[j])) {
          i = j
        } else {
          break
        }
      } else {
        break
      }
    }
    const kv = splitLabelValueLine(lines[i])
    if (!kv) break
    if (COMPOSE_FIXED_META_LABELS.has(kv.label)) {
      i++
      continue
    }
    const key = labelToKey.get(kv.label)
    if (key) {
      meta[key] = kv.value
      i++
      continue
    }
    break
  }

  while (i < lines.length && lines[i].trim() === '') i++

  const used = new Set<string>()
  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === '') i++
    if (i >= lines.length) break
    const ask = lines[i].trim()
    const m = /^问[：:]\s*(.*)$/.exec(ask)
    if (!m) break
    const prompt = m[1].trim()
    i++
    while (i < lines.length && lines[i].trim() === '') i++
    if (i >= lines.length) break
    const ansLine = lines[i].trim()
    const am = /^答[：:]\s*(.*)$/.exec(ansLine)
    const answer = am ? am[1].trim() : ''
    i++

    let qid: string | null = null
    for (const q of questions) {
      if (used.has(q.id)) continue
      if ((q.prompt || '').trim() === prompt) {
        qid = q.id
        break
      }
    }
    if (!qid) {
      for (const q of questions) {
        if (!used.has(q.id)) {
          qid = q.id
          break
        }
      }
    }
    if (qid) {
      answers[qid] = answer
      used.add(qid)
    }
  }

  return { meta, answers }
}
