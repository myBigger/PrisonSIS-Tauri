import type { CSSProperties } from 'react'
import { ICONS, type IconName } from './icons'

type Props = {
  name: IconName
  size?: number
  title?: string
  className?: string
  style?: CSSProperties
}

export default function Icon({ name, size = 18, title, className, style }: Props) {
  const def = ICONS[name]
  return (
    <svg
      className={className}
      style={{ display: 'block', ...style }}
      width={size}
      height={size}
      viewBox={def.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
    >
      {title ? <title>{title}</title> : null}
      {def.paths.map((d, idx) => (
        <path key={idx} d={d} />
      ))}
    </svg>
  )
}

