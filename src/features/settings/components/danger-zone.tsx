'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { SectionCard } from './section-card'

interface DangerZoneProps {
  workspaceName: string
  isAdmin: boolean
}

/** Two-step delete workspace confirmation card. */
export function DangerZone({ workspaceName, isAdmin }: DangerZoneProps) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (!isAdmin) return null

  async function handleDelete() {
    setDeleting(true)
    try {
      toast.error('Workspace deletion is not yet available')
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <SectionCard
      title="Danger zone"
      subtitle="These actions are permanent and cannot be undone"
      danger
    >
      <div
        style={{
          padding: '14px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-1)', marginBottom: 3 }}>
            Delete workspace
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5 }}>
            Permanently delete the {workspaceName} workspace, all client profiles, generated content,
            and analytics data.
          </div>
        </div>

        {!confirming ? (
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)} style={{ flexShrink: 0 }}>
            Delete workspace
          </Button>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#A04030', fontWeight: 500 }}>Are you sure?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: '8px 14px',
                background: '#A04030',
                border: 'none',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 500,
                color: '#fff',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {deleting ? 'Deleting\u2026' : 'Yes, delete'}
            </button>
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </SectionCard>
  )
}
