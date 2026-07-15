'use client'

export type BrandVector = { svg: string; label: string }

/**
 * The editor's Elements picker: the brand's vector library as clickable thumbnails. Clicking drops the
 * vector onto the current slide as a mark layer. SVGs are sanitised at ingest (svg.ts) and shown via a
 * data-URL `<img>`, so no script executes.
 */
export function ElementPicker({ vectors, onInsert }: { vectors: BrandVector[]; onInsert: (svg: string) => void }) {
  if (vectors.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--color-muted)' }}>
        Brand elements
      </div>
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
    </div>
  )
}
