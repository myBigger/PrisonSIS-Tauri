import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  /** 至少显示几行高的可视区域（用于空内容时占位） */
  minRows?: number
  /** 超过此行数后固定高度并出现纵向滚动条 */
  maxRows?: number
}

/**
 * 随内容增高/减矮的 textarea（用于长短不一的自由文本）。
 * 用 scrollHeight 同步高度，避免固定 rows 与真实篇幅不符。
 */
export default function AutoSizeTextarea({
  value,
  minRows = 1,
  maxRows = 24,
  className,
  onChange,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const sync = () => {
      const cs = getComputedStyle(el)
      const lh = parseFloat(cs.lineHeight)
      const lineHeight = Number.isFinite(lh) && lh > 0 ? lh : 22
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const paddingY = Number.isFinite(padY) ? padY : 24
      const minH = minRows * lineHeight + paddingY
      const maxH = maxRows * lineHeight + paddingY

      el.style.height = '0'
      el.style.overflow = 'hidden'
      const contentH = el.scrollHeight
      const next = Math.min(Math.max(contentH, minH), maxH)
      el.style.height = `${next}px`
      el.style.overflowY = contentH > maxH ? 'auto' : 'hidden'
    }

    sync()
    const ro = new ResizeObserver(() => sync())
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, minRows, maxRows])

  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={value}
      onChange={onChange}
      {...rest}
    />
  )
}
