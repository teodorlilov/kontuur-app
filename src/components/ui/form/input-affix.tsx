'use client'

import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { CONTROL_FOCUS_WITHIN, CONTROL_SURFACE } from './control-classes'

interface InputAffixProps {
  /** Fixed text before the control, e.g. `https://`. */
  prefix?: ReactNode
  /** Fixed text or an action after the control, e.g. `%` or a Copy button. */
  suffix?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Wraps a control with fixed leading or trailing content.
 *
 * The wrapper owns the border and the focus halo so the whole affixed unit lights up as one
 * control; the input inside drops its own edge via `[&_input]:` resets.
 */
export function InputAffix({ prefix, suffix, className, children }: InputAffixProps) {
  return (
    <div
      className={cn(
        'flex items-center',
        CONTROL_SURFACE,
        CONTROL_FOCUS_WITHIN,
        'hover:border-text3/45',
        // The inner control keeps its typography but gives up the edge to this wrapper.
        '[&_input]:h-10 [&_input]:rounded-none [&_input]:border-0 [&_input]:bg-transparent [&_input]:shadow-none [&_input]:ring-0 [&_input]:focus:ring-0',
        className
      )}
    >
      {prefix && (
        <span className="whitespace-nowrap py-0 pl-3 pr-1 text-body text-text3">{prefix}</span>
      )}
      {children}
      {suffix && (
        <span className="flex items-center whitespace-nowrap py-0 pl-1 pr-3 text-body text-text3">
          {suffix}
        </span>
      )}
    </div>
  )
}
