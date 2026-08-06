'use client'

import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/utils/cn'
import { PANEL_CONTROL } from './panel-styles'

interface PanelButtonProps {
  onClick: () => void
  /** Busy shows a spinner in the icon slot and disables the button (an action in flight). */
  busy?: boolean
  disabled?: boolean
  title?: string
  icon?: React.ReactNode
  /** Layout tweaks only (margin, width) — the control chrome stays uniform. */
  className?: string
  children?: React.ReactNode
}

/** The properties panel's standard action button: PANEL_CONTROL chrome + icon/spinner slot. */
export function PanelButton({
  onClick,
  busy,
  disabled,
  title,
  icon,
  className,
  children,
}: PanelButtonProps) {
  const inactive = Boolean(busy || disabled)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inactive}
      title={title}
      className={cn(
        PANEL_CONTROL,
        'flex items-center justify-center gap-1.5',
        inactive ? 'cursor-default opacity-60' : 'cursor-pointer',
        className
      )}
    >
      {busy ? <Spinner size="sm" /> : icon}
      {children}
    </button>
  )
}
