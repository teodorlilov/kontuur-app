'use client'

import Link from 'next/link'
import { Search, Plus } from 'lucide-react'

interface ClientsToolbarProps {
  clientCount: number
  searchValue: string
  onSearchChange: (value: string) => void
}

/** Toolbar with client count, search input, filter button, and add-client link. */
export function ClientsToolbar({ clientCount, searchValue, onSearchChange }: ClientsToolbarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>
          {clientCount} {clientCount === 1 ? 'client' : 'clients'}
        </span>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: 10,
              color: 'var(--color-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search clients..."
            style={{
              padding: '8px 12px 8px 32px',
              border: '0.5px solid var(--color-border-1)',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'inherit',
              background: 'var(--color-surface)',
              color: 'var(--color-text-1)',
              outline: 'none',
              width: '100%',
              maxWidth: 220,
            }}
          />
        </div>
      </div>

      <Link
        href="/clients/new"
        prefetch={false}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '9px 16px',
          background: 'var(--sidebar-bg)',
          color: '#ECE8E1',
          border: 'none',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          textDecoration: 'none',
          fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-terracotta)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--sidebar-bg)' }}
      >
        <Plus size={13} strokeWidth={2} />
        <span className="hidden sm:inline">Add client</span>
      </Link>
    </div>
  )
}
