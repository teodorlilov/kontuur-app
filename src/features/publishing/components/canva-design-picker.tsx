'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, Image as ImageIcon } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { mapImageRow } from '@/features/publishing/lib/map-image-row'
import type { PostImage } from '@/types/api'

interface CanvaDesign {
  id: string
  title: string
  thumbnailUrl: string | null
  editUrl: string
  updatedAt: string
}

interface CanvaDesignPickerProps {
  open: boolean
  onClose: () => void
  postId: string
  position: number
  onImported: (image: PostImage) => void
}

/**
 * Modal that lets users browse their Canva designs, select one,
 * and import it as a post image (exported as PNG from Canva).
 * Uses the current user's Canva connection (not per-client).
 */
export function CanvaDesignPicker({
  open,
  onClose,
  postId,
  position,
  onImported,
}: CanvaDesignPickerProps) {
  const [query, setQuery] = useState('')
  const [designs, setDesigns] = useState<CanvaDesign[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [continuation, setContinuation] = useState<string | null>(null)

  const fetchDesigns = useCallback(
    async (searchQuery: string, cont?: string) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (searchQuery) params.set('query', searchQuery)
        if (cont) params.set('continuation', cont)

        const res = await fetch(`/api/canva/designs?${params}`)
        const data = await res.json()

        if (!res.ok) throw new Error(data.error ?? 'Failed to load designs')

        if (cont) {
          setDesigns((prev) => [...prev, ...data.designs])
        } else {
          setDesigns(data.designs)
        }
        setContinuation(data.continuation)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load designs')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Load designs when modal opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setDesigns([])
      setContinuation(null)
      fetchDesigns('')
    }
  }, [open, fetchDesigns])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setContinuation(null)
    await fetchDesigns(query)
  }

  async function handleImport(design: CanvaDesign) {
    setImporting(design.id)
    setError(null)
    try {
      const res = await fetch(`/api/canva/designs/${design.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, position }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      onImported(mapImageRow(data.image))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import from Canva" maxWidth={600}>
      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: '8px 12px',
            border: '1px solid var(--color-border-2)',
            borderRadius: 8,
            background: 'var(--color-sunken)',
          }}
        >
          <Search style={{ width: 14, height: 14, color: 'var(--color-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your Canva designs..."
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: 13,
              color: 'var(--color-text-1)',
              fontFamily: 'inherit',
            }}
          />
        </div>
      </form>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: '#A32D2D',
            background: '#FCEBEB',
            padding: '8px 12px',
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Designs grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 10,
          maxHeight: 400,
          overflowY: 'auto',
        }}
      >
        {designs.map((design) => (
          <DesignCard
            key={design.id}
            design={design}
            isImporting={importing === design.id}
            disabled={importing !== null}
            onImport={() => handleImport(design)}
          />
        ))}
      </div>

      {loading && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: 24,
            color: 'var(--color-muted)',
          }}
        >
          <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {!loading && designs.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: 32,
            color: 'var(--color-muted)',
            fontSize: 13,
          }}
        >
          No designs found. Create one in Canva first.
        </div>
      )}

      {/* Load more */}
      {continuation && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button
            type="button"
            onClick={() => fetchDesigns(query, continuation)}
            style={{
              fontSize: 12,
              color: 'var(--color-brand)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '6px 12px',
            }}
          >
            Load more
          </button>
        </div>
      )}
    </Modal>
  )
}

function DesignCard({
  design,
  isImporting,
  disabled,
  onImport,
}: {
  design: CanvaDesign
  isImporting: boolean
  disabled: boolean
  onImport: () => void
}) {
  return (
    <button
      type="button"
      onClick={onImport}
      disabled={disabled}
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--color-border-1)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--color-surface)',
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled && !isImporting ? 0.5 : 1,
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        fontFamily: 'inherit',
        padding: 0,
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.borderColor = 'var(--color-brand)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-1)'
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          width: '100%',
          aspectRatio: '4/5',
          background: 'var(--color-sunken)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {isImporting ? (
          <Loader2
            style={{ width: 20, height: 20, color: 'var(--color-brand)', animation: 'spin 1s linear infinite' }}
          />
        ) : design.thumbnailUrl ? (
          <img
            src={design.thumbnailUrl}
            alt={design.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <ImageIcon style={{ width: 24, height: 24, color: 'var(--color-muted)' }} />
        )}
      </div>

      {/* Title */}
      <div
        style={{
          padding: '8px 10px',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--color-text-1)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {isImporting ? 'Importing...' : design.title || 'Untitled'}
      </div>
    </button>
  )
}
