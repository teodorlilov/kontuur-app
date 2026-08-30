'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Modal } from '@/components/ui/modal'
import { mapImageRow } from '@/lib/posts/map-image-row'
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

  const fetchDesigns = useCallback(async (searchQuery: string, cont?: string) => {
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
  }, [])

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
      <form onSubmit={handleSearch} className="mb-4">
        <div className="flex items-center gap-2 rounded-sm border border-line2 bg-sunken px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-text2" />
          <input
            className="flex-1 border-0 bg-transparent text-body text-ink"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your Canva designs..."
            // Stays inline: an `outline-none` class would lose to the unlayered
            // `:focus-visible` ring in globals.css, so the field would gain a ring it
            // does not have today. Inline is the only expression that still wins.
            style={{ outline: 'none' }}
          />
        </div>
      </form>

      {error && (
        <div className="mb-3 rounded-[6px] bg-danger-bg px-3 py-2 text-caption text-danger">
          {error}
        </div>
      )}

      {/* Designs grid */}
      <div className="grid max-h-[400px] grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 overflow-y-auto">
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
        <div className="flex justify-center p-6 text-text2">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {!loading && designs.length === 0 && (
        <div className="p-8 text-center text-body text-text2">
          No designs found. Create one in Canva first.
        </div>
      )}

      {/* Load more */}
      {continuation && !loading && (
        <div className="mt-3 flex justify-center">
          <button
            className="cursor-pointer border-0 bg-transparent px-3 py-1.5 text-caption text-forest"
            type="button"
            onClick={() => fetchDesigns(query, continuation)}
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
      className={cn(
        'flex flex-col overflow-hidden rounded-sm border border-line bg-surface p-0 text-left transition-[border-color,box-shadow] duration-150 ease-[ease]',
        // Gated on `disabled` because the JS hover it replaces never fired on a
        // disabled button — mouse events are suppressed there, but :hover is not.
        !disabled && 'hover:border-forest'
      )}
      type="button"
      onClick={onImport}
      disabled={disabled}
      style={{
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled && !isImporting ? 0.5 : 1,
      }}
    >
      {/* Thumbnail */}
      <div className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden bg-sunken">
        {isImporting ? (
          <Loader2 className="h-5 w-5 animate-spin text-forest" />
        ) : design.thumbnailUrl ? (
          // Deliberately a plain <img>. Canva serves these thumbnails from a signed,
          // expiring URL on a host it rotates, so `next/image` would need a wildcard
          // remotePatterns entry and would then proxy and cache URLs built to expire.
          // It is a picker tile behind a dialog, never the LCP element, so the
          // optimisation this rule is protecting does not apply.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="h-full w-full object-cover"
            src={design.thumbnailUrl}
            alt={design.title}
          />
        ) : (
          <ImageIcon className="h-6 w-6 text-text2" />
        )}
      </div>

      {/* Title */}
      <div className="truncate px-2.5 py-2 text-micro font-medium text-ink">
        {isImporting ? 'Importing...' : design.title || 'Untitled'}
      </div>
    </button>
  )
}
