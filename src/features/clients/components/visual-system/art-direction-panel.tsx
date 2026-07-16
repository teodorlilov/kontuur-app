'use client'

import type { ArtDirection } from '@/lib/brand-kit/art-direction'
import { Button } from '@/components/ui/button'

/**
 * Read-only view of the brand's **art direction** — the AI-composed design spec that drives every post —
 * with a Recompose action. Shown in the settings Visual system tab (and reusable at onboarding review).
 * Per-axis editing is a later enhancement; here the operator sees the direction and can regenerate it.
 */

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
}

const chip: React.CSSProperties = {
  fontSize: 11,
  padding: '3px 9px',
  borderRadius: 999,
  border: '0.5px solid var(--color-border-1)',
  background: 'var(--color-sunken)',
  color: 'var(--color-text-2)',
  textTransform: 'capitalize',
}

function Quality({ label, value }: { label: string; value: string }) {
  return (
    <span style={chip}>
      <span style={{ color: 'var(--color-muted)' }}>{label} </span>
      {value}
    </span>
  )
}

export function ArtDirectionPanel({
  artDirection,
  recomposing,
  onRecompose,
}: {
  artDirection: ArtDirection | null
  recomposing?: boolean
  onRecompose?: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={sectionLabel}>Art direction</div>
        {onRecompose && (
          <Button size="sm" variant="secondary" loading={recomposing} onClick={onRecompose}>
            {recomposing ? 'Recomposing…' : 'Recompose'}
          </Button>
        )}
      </div>

      {artDirection ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-1)', textTransform: 'capitalize' }}>
            {artDirection.personality}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Quality label="feel" value={artDirection.formality} />
            <Quality label="imagery" value={artDirection.imagery} />
            <Quality label="grade" value={artDirection.treatment} />
            <Quality label="density" value={artDirection.density} />
            <Quality label="type" value={artDirection.typeCase} />
            <Quality label="palette" value={artDirection.paletteDiscipline} />
          </div>
          {artDirection.ornamentBrief && (
            <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-2)', margin: 0 }}>
              <span style={{ color: 'var(--color-muted)' }}>Ornament — </span>
              {artDirection.ornamentBrief}
            </p>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-2)', margin: 0 }}>
          No art direction composed yet. Recompose to generate one from this brand&apos;s identity and business.
        </p>
      )}
    </div>
  )
}
