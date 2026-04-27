'use client'

import { useState } from 'react'
import { ClientCard } from '@/features/clients/components/client-card'
import { AddClientCard } from '@/features/clients/components/add-client-card'
import { ClientsToolbar } from '@/features/clients/components/clients-toolbar'
import type { ClientCardData } from '@/features/clients/types'

interface ClientsGridProps {
  clients: ClientCardData[]
}

/** Client-side wrapper that owns search state and renders the card grid. */
export function ClientsGrid({ clients }: ClientsGridProps) {
  const [search, setSearch] = useState('')

  const filtered = search
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.niche?.toLowerCase().includes(search.toLowerCase()) ?? false)
      )
    : clients

  return (
    <>
      <ClientsToolbar clientCount={filtered.length} searchValue={search} onSearchChange={setSearch} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {filtered.map((client) => (
          <ClientCard key={client.id} {...client} />
        ))}
        <AddClientCard />
      </div>

      {filtered.length === 0 && search && (
        <div style={{ textAlign: 'center', padding: '60px 0', fontSize: 14, color: 'var(--color-muted)' }}>
          No clients match &ldquo;{search}&rdquo;
        </div>
      )}
    </>
  )
}
