'use client'

import { SelectControl } from './select-control'

interface ClientFilterProps {
  /** Structural on purpose — callers pass their own richer client rows unchanged. */
  clients: ReadonlyArray<{ id: string; name: string }>
  /** Null is "all clients". */
  value: string | null
  onChange: (clientId: string | null) => void
}

/**
 * "All clients, or one" — the scoping control the dashboard queues share.
 *
 * It exists because the same block was copied verbatim into the review queue and
 * the calendar, down to the empty-string sentinel and the `id || null` coercion,
 * and the comments queue would have been the third.
 *
 * The sentinel stays in here. Listbox needs a string for "no selection" and
 * every caller wants `string | null`, so this is the one place that translates
 * between them.
 *
 * Renders nothing for a single-client agency: there is nothing to scope.
 *
 * Deliberately NOT used by the ideas view. That one holds the selection in the
 * URL rather than in state, uses an 'all' sentinel because a query string cannot
 * carry an empty value meaningfully, and navigates on change instead of
 * filtering rows it already has. Covering both shapes here would make this
 * component worse than the duplication it removes.
 */
export function ClientFilter({ clients, value, onChange }: ClientFilterProps) {
  if (clients.length < 2) return null

  return (
    <SelectControl
      label="Client"
      value={value ?? ''}
      options={[
        { value: '', label: 'All clients' },
        ...clients.map((client) => ({ value: client.id, label: client.name })),
      ]}
      onChange={(id) => onChange(id || null)}
    />
  )
}
