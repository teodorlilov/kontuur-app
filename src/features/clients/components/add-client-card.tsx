'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'

/** Dashed card that links to the new-client onboarding flow. */
export function AddClientCard() {
  return (
    <Link
      href="/clients/new"
      prefetch={false}
      style={{
        background: 'var(--color-surface)',
        border: '0.5px dashed rgba(44,62,80,0.18)',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '40px 20px',
        minHeight: 220,
        width: '100%',
        transition: 'border-color 0.15s, background 0.15s',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-terracotta)'
        e.currentTarget.style.background = '#FDFAF7'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(44,62,80,0.18)'
        e.currentTarget.style.background = 'var(--color-surface)'
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'rgba(44,62,80,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Plus size={18} style={{ color: 'var(--color-muted)' }} strokeWidth={1.5} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)', textAlign: 'center', marginBottom: 4 }}>
          Add a new client
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-muted)', textAlign: 'center' }}>
          Start the onboarding interview
        </div>
      </div>
    </Link>
  )
}
