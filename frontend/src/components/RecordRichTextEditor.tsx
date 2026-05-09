import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import Bold from '@tiptap/extension-bold'
import Underline from '@tiptap/extension-underline'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { DEFAULT_AUTO_INK_TOKEN_RULES, type AutoInkTokenRule } from '../config/recordAutoInkTokens'

type OutlineItem = {
  id: string
  level: number
  text: string
  pos: number
}

function matchAutoTokenPrefix(raw: string, rules: AutoInkTokenRule[]): { className: string; length: number } | null {
  const text = raw.trimStart()
  for (const rule of rules) {
    const withCn = `${rule.key}：`
    if (text.startsWith(withCn)) return { className: rule.className, length: withCn.length }
    const withEn = `${rule.key}:`
    if (text.startsWith(withEn)) return { className: rule.className, length: withEn.length }
  }
  return null
}

const INK_COLORS = [
  { label: '默认', value: '' },
  { label: '青绿', value: '#54d6bb' },
  { label: '天蓝', value: '#7fc8ff' },
  { label: '暖黄', value: '#f3c47c' },
  { label: '淡紫', value: '#c1a8ff' },
  { label: '浅红', value: '#f6a3a3' },
]

const InkColorMark = Mark.create({
  name: 'inkColor',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: element => element.style.color || null,
        renderHTML: attributes => {
          if (!attributes.color) return {}
          return { style: `color: ${attributes.color}` }
        },
      },
    }
  },
  parseHTML() {
    return [{ style: 'color' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

const AutoInkExtension = Extension.create({
  name: 'autoInkTokens',
  addOptions() {
    return {
      getRules: (() => DEFAULT_AUTO_INK_TOKEN_RULES) as () => AutoInkTokenRule[],
    }
  },
  addProseMirrorPlugins() {
    const getRules: () => AutoInkTokenRule[] = this.options.getRules
    return [
      new Plugin({
        key: new PluginKey('autoInkTokens'),
        props: {
          decorations(state) {
            const rules: AutoInkTokenRule[] = getRules?.() ?? []
            if (!rules.length) return null
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'paragraph') return
              const text = node.textContent ?? ''
              if (!text.trim()) return
              const hit = matchAutoTokenPrefix(text, rules)
              if (!hit) return
              const textNode = node.firstChild
              if (!textNode || !textNode.isText) return
              // Do not auto-color token if user already set a color mark.
              const hasUserColor = textNode.marks.some(mark => mark.type.name === 'inkColor' && mark.attrs?.color)
              if (hasUserColor) return
              const rawText = textNode.text ?? ''
              const prefixStartOffset = rawText.search(/\S/)
              if (prefixStartOffset < 0) return
              if (!matchAutoTokenPrefix(rawText.slice(prefixStartOffset), rules)) return
              const from = pos + 1 + prefixStartOffset
              const to = from + hit.length
              decorations.push(Decoration.inline(from, to, { class: hit.className }))
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

function parseOutlineFromParagraphText(textRaw: string): { level: number; text: string } | null {
  const t = (textRaw ?? '').trim()
  if (!t) return null

  // Guided 正文合成约定：问句行以“问：”开头
  const qMatch = t.match(/^问[:：]\s*(.+)$/)
  if (qMatch?.[1]) {
    return { level: 3, text: qMatch[1].trim() }
  }

  // 编号标题：一、xxxx
  const yiMatch = t.match(/^([一二三四五六七八九十])、\s*(.+)$/)
  if (yiMatch?.[2]) {
    return { level: 2, text: yiMatch[2].trim() }
  }

  // 编号标题：（一）xxxx
  const yi2Match = t.match(/^（([一二三四五六七八九十])）\s*(.+)$/)
  if (yi2Match?.[2]) {
    return { level: 3, text: yi2Match[2].trim() }
  }

  return null
}

function plainTextToDoc(text: string) {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(s => s ?? '')

  const paragraphs = lines.length ? lines : ['']
  return {
    type: 'doc',
    content: paragraphs.map(line => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  }
}

/** 将大纲目标块滚入编辑器内层滚动容器（避开嵌套 overflow 下 PM scrollIntoView 失效）。 */
function scrollBlockIntoContainer(targetEl: HTMLElement, scrollEl: HTMLElement, paddingPx = 8) {
  const c = scrollEl.getBoundingClientRect()
  const paddingTop = paddingPx
  const paddingBottom = paddingPx

  const adjustOnce = () => {
    const t = targetEl.getBoundingClientRect()
    const topOverflow = t.top - (c.top + paddingTop)
    const bottomOverflow = t.bottom - (c.bottom - paddingBottom)

    // 只要上沿或下沿任一没露全，就把对应边界推回可视区（instant，避免嵌套滚动双动画）。
    if (topOverflow < 0) {
      scrollEl.scrollTop += topOverflow
      return true
    }
    if (bottomOverflow > 0) {
      scrollEl.scrollTop += bottomOverflow
      return true
    }
    return false
  }

  // 先滚一次，再检查是否仍有边界被裁切（长段落/字体变化/布局抖动时更稳）。
  if (adjustOnce()) adjustOnce()
}

function coerceToDoc(content: string): any {
  const trimmed = content?.trim?.() ?? ''
  if (!trimmed) return plainTextToDoc('')

  // Heuristic: JSON doc usually starts with { type: "doc" ... }
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[')
  if (looksLikeJson) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed
    } catch {
      // fallthrough -> plain text
    }
  }
  return plainTextToDoc(content)
}

export default function RecordRichTextEditor(props: {
  value: string
  editable: boolean
  placeholder?: string
  onChange: (nextValue: string) => void
  onEditorReady?: (editor: TiptapEditor) => void
  onTextChange?: (text: string) => void
  outlineWidth?: number
  editorMinHeight?: number
  autoInkTokenKeys?: string[]
}) {
  const { value, editable, onChange, onEditorReady, onTextChange, outlineWidth = 170, editorMinHeight = 420, autoInkTokenKeys = [] } = props
  const [autoInkEnabled, setAutoInkEnabled] = useState(true)
  const autoRules = useMemo<AutoInkTokenRule[]>(() => {
    if (!autoInkEnabled) return []
    if (!autoInkTokenKeys.length) return DEFAULT_AUTO_INK_TOKEN_RULES
    const seen = new Set(DEFAULT_AUTO_INK_TOKEN_RULES.map(x => `${x.className}:${x.key}`))
    const merged = [...DEFAULT_AUTO_INK_TOKEN_RULES]
    for (const keyRaw of autoInkTokenKeys) {
      const key = (keyRaw || '').trim()
      if (!key) continue
      const token = `tiptap-ink-token-meta:${key}`
      if (seen.has(token)) continue
      seen.add(token)
      merged.push({ key, className: 'tiptap-ink-token-meta' })
    }
    return merged
  }, [autoInkTokenKeys, autoInkEnabled])
  const autoRulesRef = useRef<AutoInkTokenRule[]>(autoRules)

  const initialDoc = useMemo(() => coerceToDoc(value), []) // only used for editor init
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([])
  const outlineRafRef = useRef<number | null>(null)
  const flashTimerRef = useRef<number | null>(null)
  const activeFlashElRef = useRef<HTMLElement | null>(null)
  const editorScrollRef = useRef<HTMLDivElement | null>(null)

  const rebuildOutlineFromDoc = (nextEditor: TiptapEditor) => {
    if (outlineRafRef.current != null) cancelAnimationFrame(outlineRafRef.current)
    outlineRafRef.current = requestAnimationFrame(() => {
      const items: OutlineItem[] = []
      nextEditor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          const level = node.attrs.level ?? 1
          const text = node.textContent ?? ''
          const id = `h-${pos}-${level}`
          if (text.trim()) items.push({ id, level, text: text.trim(), pos })
          return
        }
        if (node.type.name === 'paragraph') {
          const text = node.textContent ?? ''
          const parsed = parseOutlineFromParagraphText(text)
          if (parsed) {
            const id = `p-${pos}-${parsed.level}`
            items.push({ id, level: parsed.level, text: parsed.text, pos })
          }
        }
      })
      setOutlineItems(items)
    })
  }

  const resolveOutlineBlockDOM = (nextEditor: TiptapEditor, safePos: number): HTMLElement | null => {
    const maxPos = Math.max(1, nextEditor.state.doc.content.size)
    const candidates = [safePos, Math.min(maxPos, safePos + 1), Math.max(1, safePos - 1)]
    for (const pos of candidates) {
      const nodeAtPos = nextEditor.view.nodeDOM(pos)
      const fallbackDom = nextEditor.view.domAtPos(pos).node as HTMLElement | Text
      const targetEl =
        nodeAtPos instanceof HTMLElement
          ? nodeAtPos.closest('p,h1,h2,h3,li,blockquote') || nodeAtPos
          : fallbackDom instanceof HTMLElement
            ? fallbackDom.closest('p,h1,h2,h3,li,blockquote') || fallbackDom
            : fallbackDom.parentElement?.closest('p,h1,h2,h3,li,blockquote') || fallbackDom.parentElement
      if (targetEl instanceof HTMLElement) return targetEl
    }
    return null
  }

  const flashTargetElement = (targetEl: HTMLElement | null) => {
    if (!targetEl) return
    if (activeFlashElRef.current && activeFlashElRef.current !== targetEl) {
      activeFlashElRef.current.classList.remove('tiptap-target-flash')
    }
    targetEl.classList.remove('tiptap-target-flash')
    void targetEl.offsetWidth
    targetEl.classList.add('tiptap-target-flash')
    activeFlashElRef.current = targetEl
    if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current)
    flashTimerRef.current = window.setTimeout(() => {
      targetEl.classList.remove('tiptap-target-flash')
      if (activeFlashElRef.current === targetEl) activeFlashElRef.current = null
    }, 1000)
  }

  const editor = useEditor({
    editable,
    extensions: [
      Document,
      Paragraph,
      Text,
      StarterKit.configure({
        document: false,
        paragraph: false,
        text: false,
        heading: false,
        bold: false,
        underline: false,
      }),
      Heading.configure({
        levels: [1, 2, 3],
      }),
      Bold,
      Underline,
      InkColorMark,
      AutoInkExtension.configure({ getRules: () => autoRulesRef.current }),
    ],
    content: initialDoc,
    autofocus: false,
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
    onCreate: ({ editor }) => {
      onEditorReady?.(editor)
      const normalized = JSON.stringify(editor.getJSON())
      // Only sync once when external value isn't already normalized.
      if (normalized !== value) onChange(normalized)
      onTextChange?.(editor.getText())
      rebuildOutlineFromDoc(editor)
    },
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()))
      onTextChange?.(editor.getText())
      rebuildOutlineFromDoc(editor)
    },
  }, [editable])

  useEffect(() => {
    autoRulesRef.current = autoRules
    if (!editor) return
    // Trigger a lightweight re-render so decoration-based auto coloring can refresh
    // without recreating the editor instance.
    const tr = editor.state.tr.setMeta('autoInkRefresh', Date.now())
    editor.view.dispatch(tr)
  }, [autoRules, editor])

  // Keep external value -> editor in sync when opening different records.
  useEffect(() => {
    if (!editor) return
    const next = coerceToDoc(value)
    // Cheap check: compare current top-level type + length.
    const current = editor.getJSON()
    const currentText = JSON.stringify(current)
    const nextText = JSON.stringify(next)
    if (currentText !== nextText) {
      editor.commands.setContent(next)
    }
    rebuildOutlineFromDoc(editor)
  }, [editor, value])

  const scrollToHeading = (item: OutlineItem) => {
    if (!editor) return
    try {
      const maxPos = Math.max(1, editor.state.doc.content.size)
      const safePos = Math.min(Math.max(1, item.pos), maxPos)
      const selectionPos = Math.min(maxPos, safePos + 1)

      if (editable) {
        editor.chain().focus().setTextSelection(selectionPos).run()
      } else {
        const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, selectionPos))
        editor.view.dispatch(tr)
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const targetEl = resolveOutlineBlockDOM(editor, safePos)
          const scrollEl = editorScrollRef.current
          if (targetEl && scrollEl) scrollBlockIntoContainer(targetEl, scrollEl)
          flashTargetElement(targetEl)
        })
      })
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    return () => {
      if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current)
      if (activeFlashElRef.current) {
        activeFlashElRef.current.classList.remove('tiptap-target-flash')
        activeFlashElRef.current = null
      }
    }
  }, [])

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', width: '100%', height: '100%' }}>
      <div
        style={{
          width: outlineWidth,
          flexShrink: 0,
          padding: '8px 10px',
          border: '1px solid var(--glass-border)',
          borderRadius: 10,
          background: 'var(--outline-pane-bg)',
          boxShadow: 'var(--outline-pane-shadow)',
          overflow: 'auto',
          maxHeight: '100%',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>大纲</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>（点击标题定位）</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {outlineItems.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>暂无标题</div>
          ) : (
            outlineItems.slice(0, 40).map(item => (
              <button
                key={item.id}
                type="button"
                className="glass-btn small"
                style={{
                  justifyContent: 'flex-start',
                  width: '100%',
                  padding: '8px 10px',
                  background: 'var(--outline-item-bg)',
                  borderColor: 'var(--outline-item-border)',
                  boxShadow: 'var(--outline-item-shadow)',
                }}
                onClick={() => scrollToHeading(item)}
              >
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 12 }}>
                  {'H' + item.level}
                </span>
                <span style={{ marginLeft: 8, color: 'var(--text-secondary)', fontSize: 12, textAlign: 'left' }}>
                  {item.text}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editable && editor && (
          <div className="record-editor-toolbar">
            <button
              type="button"
              className={`glass-btn small${autoInkEnabled ? ' primary' : ''}`}
              onClick={() => setAutoInkEnabled(v => !v)}
              title="切换结构标签自动分色"
            >
              自动分色{autoInkEnabled ? '开' : '关'}
            </button>
            <button
              type="button"
              className={`glass-btn small${editor.isActive('bold') ? ' primary' : ''}`}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              加粗
            </button>
            <button
              type="button"
              className={`glass-btn small${editor.isActive('underline') ? ' primary' : ''}`}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              下划线
            </button>
            <div style={{ width: 1, height: 18, background: 'var(--editor-toolbar-divider)', margin: '0 2px' }} />
            {INK_COLORS.map(item => (
              <button
                key={item.label}
                type="button"
                className="record-editor-toolbar__color-dot"
                title={item.label}
                aria-label={`设置文字颜色：${item.label}`}
                onClick={() => {
                  const chain = editor.chain().focus()
                  if (!item.value) chain.unsetMark('inkColor').run()
                  else chain.setMark('inkColor', { color: item.value }).run()
                }}
                style={{
                  background: item.value || 'var(--text-primary)',
                  boxShadow: item.value
                    ? '0 0 0 1px var(--editor-color-dot-colored-ring) inset'
                    : '0 0 0 1px var(--editor-color-dot-default-ring) inset',
                }}
              />
            ))}
          </div>
        )}
        <div
          ref={editorScrollRef}
          style={{
            border: '1px solid var(--glass-border)',
            borderRadius: 10,
            background: 'var(--editor-pane-bg)',
            padding: 12,
            minHeight: editorMinHeight,
            height: '100%',
            overflow: 'auto',
          }}
        >
          {editor ? (
            <EditorContent
              editor={editor}
              style={{
                height: '100%',
              }}
            />
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>加载编辑器中...</div>
          )}
        </div>
        <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>
          {editable ? '可编辑' : '只读'}
        </div>
      </div>
    </div>
  )
}

