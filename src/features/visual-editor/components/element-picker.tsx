'use client'

import { useState } from 'react'
import type { DesignVector } from '@/types/api'

/**
 * The editor's Elements picker: the brand's vector library as clickable thumbnails, plus an on-demand
 * "add an element" prompt that generates a fresh on-brand vector via Recraft (`POST /clients/:id/vectors`).
 * Clicking a thumbnail (or generating) drops the vector onto the current slide as a mark layer. SVGs are
 * sanitised at ingest (svg.ts) and shown via a data-URL `<img>`, so no script executes.
 */
export function ElementPicker({
  vectors,
  onInsert,
  clientId,
}: {
  vectors: DesignVector[]
  onInsert: (svg: string) => void
  /** The client, for the on-demand generate endpoint. Absent → the prompt input is hidden. */
  clientId?: string
}) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)

  const generate = async () => {
    const motif = prompt.trim()
    if (!clientId || !motif || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/vectors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: motif }),
      })
      const data = (await res.json().catch(() => ({}))) as { svg?: string | null }
      if (data.svg) {
        onInsert(data.svg)
        setPrompt('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--color-muted)' }}>
        Brand elements
      </div>
      {vectors.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {vectors.map((v, i) => (
            <button
              key={i}
              title={v.label || 'Insert element'}
              onClick={() => onInsert(v.svg)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                border: '0.5px solid var(--color-border-1)',
                background: 'var(--color-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 5,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URL, not a remote asset */}
              <img src={`data:image/svg+xml;utf8,${encodeURIComponent(v.svg)}`} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} />
            </button>
          ))}
        </div>
      )}
      {clientId && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void generate()
            }}
            placeholder="Describe an element…"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              padding: '5px 7px',
              borderRadius: 7,
              border: '0.5px solid var(--color-border-1)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-1)',
            }}
          />
          <button
            onClick={() => void generate()}
            disabled={busy || !prompt.trim()}
            style={{
              fontSize: 11,
              padding: '4px 9px',
              borderRadius: 7,
              border: '0.5px solid var(--color-ink)',
              background: 'var(--color-ink)',
              color: 'var(--color-surface)',
              cursor: busy || !prompt.trim() ? 'default' : 'pointer',
              opacity: busy || !prompt.trim() ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            {busy ? '…' : 'Add'}
          </button>
        </div>
      )}
    </div>
  )
}
