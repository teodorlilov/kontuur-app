'use client'

import type { ArtDirection } from '@/lib/brand-kit/art-direction'
import { Button } from '@/components/ui/button'

/**
 * The brand's **art direction** — the AI-composed design spec that drives every post. Read-only when no
 * `onChange` is given; otherwise each general quality is an editable chip row and the personality /
 * ornament are editable text, so the operator can override the AI's call per axis. A Recompose action
 * regenerates the whole spec from the brand. (Named devices never appear here — ornament is a free-text
 * directive that's *generated*, not a fixed menu.)
 */

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
}
const axisLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  marginBottom: 5,
}
const field: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '6px 8px',
  borderRadius: 7,
  border: '0.5px solid var(--color-border-1)',
  background: 'var(--color-surface)',
  color: 'var(--color-text-1)',
}

const AXES: { key: keyof ArtDirection; label: string; options: string[] }[] = [
  { key: 'formality', label: 'Feel', options: ['clinical', 'corporate', 'editorial', 'expressive'] },
  { key: 'treatment', label: 'Photo grade', options: ['none', 'duotone', 'tint', 'grain', 'mono', 'halftone'] },
  { key: 'density', label: 'Density', options: ['airy', 'balanced', 'dense'] },
  { key: 'paletteDiscipline', label: 'Palette', options: ['mono-accent', 'multi'] },
]

function Chip({ active, onClick, children }: { active: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        fontSize: 11,
        padding: '3px 9px',
        borderRadius: 999,
        border: `0.5px solid ${active ? 'var(--color-ink)' : 'var(--color-border-1)'}`,
        background: active ? 'var(--color-ink)' : 'transparent',
        color: active ? 'var(--color-surface)' : 'var(--color-text-2)',
        cursor: onClick ? 'pointer' : 'default',
        textTransform: 'capitalize',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

export function ArtDirectionPanel({
  artDirection,
  recomposing,
  onRecompose,
  onChange,
}: {
  artDirection: ArtDirection | null
  recomposing?: boolean
  onRecompose?: () => void
  /** When provided, the panel is editable — per-axis overrides call this with the updated spec. */
  onChange?: (next: ArtDirection) => void
}) {
  const editable = Boolean(onChange && artDirection)
  const set = (patch: Partial<ArtDirection>) => artDirection && onChange?.({ ...artDirection, ...patch })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={sectionLabel}>Art direction</div>
        {onRecompose && (
          <Button size="sm" variant="secondary" loading={recomposing} onClick={onRecompose}>
            {recomposing ? 'Recomposing…' : 'Recompose'}
          </Button>
        )}
      </div>

      {!artDirection ? (
        <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-2)', margin: 0 }}>
          No art direction composed yet. Recompose to generate one from this brand&apos;s identity and business.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={axisLabel}>Personality</div>
            {editable ? (
              <input style={field} value={artDirection.personality} onChange={(e) => set({ personality: e.target.value })} />
            ) : (
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-1)', textTransform: 'capitalize' }}>{artDirection.personality}</div>
            )}
          </div>

          {AXES.map((axis) => {
            const current = String(artDirection[axis.key])
            return (
              <div key={axis.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={axisLabel}>{axis.label}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {(editable ? axis.options : [current]).map((o) => (
                    <Chip
                      key={o}
                      active={current === o}
                      onClick={editable ? () => set({ [axis.key]: o } as Partial<ArtDirection>) : undefined}
                    >
                      {o}
                    </Chip>
                  ))}
                </div>
              </div>
            )
          })}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={axisLabel}>Ornament (generated per brand)</div>
            {editable ? (
              <textarea
                style={{ ...field, resize: 'vertical', lineHeight: 1.4 }}
                rows={2}
                placeholder="Describe the brand's marks/patterns to generate, or leave empty for none."
                value={artDirection.ornamentBrief}
                onChange={(e) => set({ ornamentBrief: e.target.value })}
              />
            ) : artDirection.ornamentBrief ? (
              <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-2)', margin: 0 }}>{artDirection.ornamentBrief}</p>
            ) : (
              <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>None</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
