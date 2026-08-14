'use client'

import type { ElementType } from 'react'
import { Button } from '@/components/ui/button'
import type { ClientEntry } from '@/features/calendar/hooks/use-approval'

/**
 * Sending the viewed week to a client, at either of two weights.
 *
 * Both channels started as rail utilities, and that was wrong twice over. It left the
 * page with **no primary action at all** — an outlined Today, a dashed filter and two
 * ghost labels — and it put a popover inside the crumb row, which is `overflow-hidden`
 * so it can collapse to zero height when the header sticks. The client picker opened
 * into a 44px-tall clipping box and was invisible, which read as "Copy link does
 * nothing" for any week holding more than one client's posts.
 *
 * Both now live in the actions row: emailing is the page's one Deep Pine commitment,
 * copying the link is the quieter way to do the same job.
 *
 * One component rather than two, because only the button's weight differs — the picker,
 * the single-client shortcut and the disabled reasoning are the same object twice.
 */
export function ApprovalAction({
  variant,
  icon: Icon,
  label,
  loadingLabel,
  loading,
  disabled,
  disabledReason,
  clients,
  pickerOpen,
  onTogglePicker,
  onSelectClient,
}: {
  variant: 'primary' | 'secondary'
  icon: ElementType
  label: string
  loadingLabel: string
  loading: boolean
  disabled?: boolean
  disabledReason?: string
  /** Clients with something in the viewed week — the only ones there is anything to send. */
  clients: ClientEntry[]
  pickerOpen: boolean
  onTogglePicker: () => void
  onSelectClient: (id: string) => void
}) {
  return (
    <div className="relative">
      <Button
        variant={variant}
        size="sm"
        disabled={disabled}
        loading={loading}
        title={disabled ? disabledReason : undefined}
        onClick={() => {
          if (disabled || loading) return
          // One client needs no menu — the choice is already made.
          if (clients.length === 1) onSelectClient(clients[0]!.id)
          else onTogglePicker()
        }}
      >
        <Icon className="size-3.5 shrink-0" />
        {loading ? loadingLabel : label}
      </Button>

      {pickerOpen && clients.length > 1 && (
        <div className="absolute right-0 top-full z-30 mt-1.5 min-w-[180px] rounded-panel border border-line bg-surface py-1 shadow-pop">
          <p className="px-3 py-1.5 text-label font-semibold uppercase text-text3">Select client</p>
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectClient(c.id)}
              className="w-full px-3 py-2 text-left text-body text-ink transition-colors hover:bg-wash"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
