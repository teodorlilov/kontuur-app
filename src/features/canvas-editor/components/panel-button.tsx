'use client'

import { Spinner } from '@/components/ui/spinner'
import { PANEL_CONTROL } from './panel-styles'

interface PanelButtonProps {
  onClick: () => void
  /** Busy shows a spinner in the icon slot and disables the button (an action in flight). */
  busy?: boolean
  disabled?: boolean
  title?: string
  icon?: React.ReactNode
  /** Layout tweaks only (marginTop, width) — the control chrome stays uniform. */
  style?: React.CSSProperties
  children?: React.ReactNode
}

/** The properties panel's standard action button: PANEL_CONTROL chrome + icon/spinner slot. */
export function PanelButton({
  onClick,
  busy,
  disabled,
  title,
  icon,
  style,
  children,
}: PanelButtonProps) {
  const inactive = Boolean(busy || disabled)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inactive}
      title={title}
      style={{
        ...PANEL_CONTROL,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        cursor: inactive ? 'default' : 'pointer',
        opacity: inactive ? 0.6 : 1,
        ...style,
      }}
    >
      {busy ? <Spinner size="sm" /> : icon}
      {children}
    </button>
  )
}
