'use client'

import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Avatar } from '@/components/ui/avatar'
import { Listbox } from '@/components/ui/listbox'

export interface PickerClient {
  id: string
  name: string
  niche: string | null
  posts_per_week: number
}

interface ClientPickerProps {
  clients: PickerClient[]
  selectedId: string
  /** The selected client's meta line — niche · language · tone, from ClientData. */
  meta: string
  onSelect: (id: string) => void
  /** Idea runs lock the client — the idea belongs to one. */
  disabled?: boolean
}

/**
 * The setup sheet's client control: the shared Listbox with an Avatar-led
 * trigger showing who the run is for.
 */
export function ClientPicker({ clients, selectedId, meta, onSelect, disabled }: ClientPickerProps) {
  const selected = clients.find((c) => c.id === selectedId)
  if (!selected) return null

  return (
    <Listbox
      value={selectedId}
      onChange={onSelect}
      label="Client"
      disabled={disabled}
      options={clients.map((client) => ({
        value: client.id,
        label: client.name,
        description: [
          client.niche,
          `${client.posts_per_week} post${client.posts_per_week === 1 ? '' : 's'} a week`,
        ]
          .filter(Boolean)
          .join(' · '),
        leading: <Avatar name={client.name} size="sm" />,
      }))}
      renderTrigger={(_, open) => (
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            'flex w-full items-center gap-3 rounded-panel border border-line2 bg-surface p-3 text-left',
            'transition-colors duration-150 ease-contour',
            disabled ? 'cursor-default opacity-70' : 'hover:border-text3/45 hover:bg-sunken'
          )}
        >
          <Avatar name={selected.name} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-title font-semibold text-ink">
              {selected.name}
            </span>
            <span className="block truncate text-caption text-text2">{meta}</span>
          </span>
          {!disabled && (
            <ChevronDown
              aria-hidden
              className={cn(
                'size-3.5 flex-none text-text3 transition-transform duration-150 ease-contour',
                open && 'rotate-180'
              )}
            />
          )}
        </button>
      )}
    />
  )
}
