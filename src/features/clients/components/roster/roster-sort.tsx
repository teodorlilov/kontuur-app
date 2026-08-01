'use client'

import { useRouter } from 'next/navigation'
import { SelectControl } from '@/components/layout/page-header/select-control'
import type { RosterSort as RosterSortValue } from '@/features/clients/lib/roster'

const OPTIONS = [
  { value: 'attention' as const, label: 'Needs attention' },
  { value: 'name' as const, label: 'Name A–Z' },
]

/**
 * Sort control for the roster header.
 *
 * Takes pre-built hrefs rather than a builder function: sort lives in the URL
 * so /clients stays server-rendered and shareable, and a function prop cannot
 * cross the server/client boundary.
 */
export function RosterSort({
  value,
  hrefs,
}: {
  value: RosterSortValue
  hrefs: Record<RosterSortValue, string>
}) {
  const router = useRouter()

  return (
    <SelectControl
      label="Sort"
      value={value}
      options={OPTIONS}
      onChange={(next) => router.push(hrefs[next])}
    />
  )
}
