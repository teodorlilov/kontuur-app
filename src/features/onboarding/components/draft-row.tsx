'use client'

import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import type { FieldProvenance } from '@/features/onboarding/types'

/**
 * How a row is behaving right now.
 *
 * `asking` is the only state that means "attention", and it is Amber — New Growth never carries
 * that meaning in this system. `resolved` flashes Marker and then clears: the tint confirms the
 * answer landed, and the "your call" chip beside the value is what makes it findable afterwards.
 * A tint that never leaves keeps drawing the eye to the one thing already dealt with.
 */
type DraftRowTone = 'default' | 'asking' | 'resolved'

interface DraftRowProps {
  /** Anchors the save bar's "take me there" jump. */
  fieldId: string
  label: string
  tone?: DraftRowTone
  provenance?: FieldProvenance
  /** Rows holding a picker or a gallery take the full column instead of the label/value grid. */
  block?: boolean
  editing?: boolean
  onToggleEdit?: () => void
  children: ReactNode
}

export function DraftRow({
  fieldId,
  label,
  tone = 'default',
  provenance,
  block = false,
  editing = false,
  onToggleEdit,
  children,
}: DraftRowProps) {
  const open = editing || block

  return (
    <div
      data-field={fieldId}
      className={cn(
        // Every row spans the group's full width, padding compensating so content lands exactly
        // where the grid puts it. Bleeding only the tinted rows was the mistake: an inset tint
        // reads as a floating rectangle rather than a highlighted row, and the rows that did
        // bleed carried dividers wider than the ones that did not.
        'group/row -mx-6 border-t border-line px-6 py-2 first:border-t-0',
        open
          ? 'grid grid-cols-1 gap-2'
          : 'grid grid-cols-[112px_minmax(0,1fr)_auto] items-baseline gap-3',
        tone === 'asking' && 'bg-pending-bg pb-4 pt-3',
        tone === 'resolved' && 'flash-confirm'
      )}
    >
      <span
        className={cn(
          'text-caption font-medium',
          tone === 'asking' && 'font-semibold text-pending',
          // Resolved keeps the default ink: the label has to still read once the tint is gone.
          tone !== 'asking' && 'text-text2'
        )}
      >
        {label}
      </span>

      <span className={cn('flex min-w-0 items-baseline gap-2', open && 'block')}>
        {children}
        {provenance && !open && (
          <span
            className={cn(
              'flex-none text-micro',
              provenance.confidence === 'low' ? 'font-medium text-pending' : 'text-text3'
            )}
          >
            {provenance.source}
          </span>
        )}
      </span>

      {onToggleEdit && (
        <button
          type="button"
          onClick={onToggleEdit}
          className={cn(
            'rounded-xs text-micro text-text3 transition-[background-color,color,opacity] duration-150 ease-contour',
            'focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring',
            open
              ? 'justify-self-start rounded-sm border border-line2 px-3 py-2 font-medium text-ink hover:border-forest hover:bg-wash hover:text-forest'
              : 'px-2 py-1 opacity-0 hover:bg-sunken hover:text-ink group-hover/row:opacity-100'
          )}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      )}
    </div>
  )
}
