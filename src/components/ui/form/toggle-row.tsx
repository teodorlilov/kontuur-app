'use client'

import { cn } from '@/utils/cn'

interface ToggleRowProps {
  title: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

/**
 * A labelled on/off setting.
 *
 * `role="switch"` with `aria-checked`, not `aria-pressed`: this is a state toggle, not a button
 * that stays depressed, and the switch role is what a screen reader needs to announce "on"/"off".
 */
export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
  className,
}: ToggleRowProps) {
  return (
    <div className={cn('col-span-12 flex items-start gap-4 py-3', className)}>
      <div className="flex-1">
        <b className="block text-body font-semibold text-ink">{title}</b>
        {description && <span className="text-caption text-text3">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'flex h-6 w-[42px] flex-none rounded-full p-[3px] transition-colors duration-200 ease-contour',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring',
          checked ? 'bg-forest' : 'bg-line2',
          disabled && 'cursor-not-allowed opacity-40'
        )}
      >
        <span
          className={cn(
            'size-[18px] rounded-full bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.18)]',
            'transition-transform duration-200 ease-contour motion-reduce:transition-none',
            checked && 'translate-x-[18px]'
          )}
        />
      </button>
    </div>
  )
}
