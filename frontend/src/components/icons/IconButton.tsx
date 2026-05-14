import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string
  children: ReactNode
}

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(' ')
}

export default function IconButton({ label, children, title, className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={cx('glass-btn', 'icon-btn', className)}
      aria-label={label}
      title={title || label}
      {...rest}
    >
      {children}
    </button>
  )
}

