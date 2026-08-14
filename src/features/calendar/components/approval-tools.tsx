'use client'

import type { Dispatch, ElementType, SetStateAction } from 'react'
import { Link, Mail } from 'lucide-react'
import { cn } from '@/utils/cn'
import { TOOL_ROW } from '@/components/layout/page-header/shared'
import type { ClientEntry } from '@/features/calendar/hooks/use-approval'

/**
 * The two header utilities that send the viewed week to a client.
 *
 * Lifted out of `CalendarView` so that file stays the composer the plan asked for: it
 * held the button *and* two fourteen-line call sites differing in an icon, two strings
 * and which pair of state setters they closed over. That is a list, not a pair of
 * components.
 *
 * The open/sending state stays in `useApproval` rather than moving in here — the
 * handlers close their own picker on success, so the hook that performs the send is the
 * only thing that knows when it is done.
 */
export function ApprovalTools({
  clients,
  disabled,
  copyLinkSending,
  copyLinkPicker,
  setCopyLinkPicker,
  emailSending,
  emailPicker,
  setEmailPicker,
  onCopyLink,
  onEmailClient,
}: {
  /** Clients with something in the viewed week — the only ones there is anything to send. */
  clients: ClientEntry[]
  disabled: boolean
  copyLinkSending: boolean
  copyLinkPicker: boolean
  setCopyLinkPicker: Dispatch<SetStateAction<boolean>>
  emailSending: boolean
  emailPicker: boolean
  setEmailPicker: Dispatch<SetStateAction<boolean>>
  onCopyLink: (clientId: string) => void
  onEmailClient: (clientId: string) => void
}) {
  const tools = [
    {
      key: 'copy-link',
      icon: Link,
      label: 'Copy link',
      loadingLabel: 'Generating…',
      loading: copyLinkSending,
      open: copyLinkPicker,
      toggle: () => setCopyLinkPicker((v) => !v),
      select: onCopyLink,
    },
    {
      key: 'email',
      icon: Mail,
      label: 'Email client',
      loadingLabel: 'Sending…',
      loading: emailSending,
      open: emailPicker,
      toggle: () => setEmailPicker((v) => !v),
      select: onEmailClient,
    },
  ]

  return (
    <>
      {tools.map((tool) => (
        <ApprovalButton
          key={tool.key}
          icon={tool.icon}
          label={tool.label}
          loadingLabel={tool.loadingLabel}
          loading={tool.loading}
          disabled={disabled}
          disabledReason="No posts scheduled this week"
          clients={clients}
          pickerOpen={tool.open}
          onTogglePicker={tool.toggle}
          onSelectClient={tool.select}
        />
      ))}
    </>
  )
}

/** A rail utility that sends the week to a client, with a picker when several qualify. */
function ApprovalButton({
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
  icon: ElementType
  label: string
  loadingLabel: string
  loading: boolean
  disabled?: boolean
  disabledReason?: string
  clients: ClientEntry[]
  pickerOpen: boolean
  onTogglePicker: () => void
  onSelectClient: (id: string) => void
}) {
  const isDisabled = disabled || loading

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          // One client needs no menu — the choice is already made.
          if (isDisabled) return
          if (clients.length === 1) onSelectClient(clients[0]!.id)
          else onTogglePicker()
        }}
        disabled={isDisabled}
        title={disabled ? disabledReason : undefined}
        className={cn(
          TOOL_ROW,
          'text-caption',
          isDisabled &&
            'cursor-not-allowed text-text3 opacity-60 hover:bg-transparent hover:text-text3'
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        {loading ? loadingLabel : label}
      </button>

      {pickerOpen && clients.length > 1 && (
        <div className="absolute right-0 top-9 z-30 min-w-[180px] rounded-panel border border-line bg-surface py-1 shadow-pop">
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
