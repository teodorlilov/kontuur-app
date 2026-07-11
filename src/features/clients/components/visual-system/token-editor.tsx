'use client'

import type { ExtractionReport } from '@/lib/brand-kit/extract/report'
import { filterFamiliesForLanguages } from '@/lib/render/font-filter'
import type { BrandTokens, ColorRole } from '@/lib/scene-graph'
import { ConfidenceBadge } from './confidence-badge'

const ROLES: { role: ColorRole; label: string }[] = [
  { role: 'surface', label: 'Surface' },
  { role: 'ink', label: 'Ink' },
  { role: 'accent', label: 'Accent' },
  { role: 'accent-deep', label: 'Accent deep' },
  { role: 'line', label: 'Line' },
]

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  marginBottom: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 13,
  padding: '7px 9px',
  borderRadius: 8,
  border: '0.5px solid var(--color-border-1)',
  background: 'var(--color-surface)',
  color: 'var(--color-text-1)',
  fontFamily: 'inherit',
}

/**
 * Edit the five colour roles + display/body families + scale. Controlled: every change calls
 * `onChange` with the next tokens, so the caller's `<PreviewGrid/>` recolours instantly. Font options
 * are language-filtered (§3.2) — a Bulgarian client is never offered a Latin-only face.
 */
export function TokenEditor({
  tokens,
  onChange,
  primaryLanguage,
  secondaryLanguage,
  report,
}: {
  tokens: BrandTokens
  onChange: (next: BrandTokens) => void
  primaryLanguage: string
  secondaryLanguage?: string | null
  report?: ExtractionReport
}) {
  const families = filterFamiliesForLanguages(primaryLanguage, secondaryLanguage).map((f) => f.family)
  const withCurrent = (current: string) => (families.includes(current) ? families : [current, ...families])

  const setColor = (role: ColorRole, hex: string) => onChange({ ...tokens, color: { ...tokens.color, [role]: hex } })
  const setDisplayFamily = (family: string) =>
    onChange({ ...tokens, type: { ...tokens.type, display: { ...tokens.type.display, family } } })
  const setBodyFamily = (family: string) =>
    onChange({ ...tokens, type: { ...tokens.type, body: { ...tokens.type.body, family } } })
  const setScale = (scale: number) => onChange({ ...tokens, type: { ...tokens.type, scale } })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <div style={sectionLabel}>
          Colour
          {report?.confidence.colors && <ConfidenceBadge confidence={report.confidence.colors} />}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {ROLES.map(({ role, label }) => (
            <label key={role} style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
              <input
                type="color"
                value={tokens.color[role]}
                onChange={(e) => setColor(role, e.target.value)}
                style={{ width: 44, height: 44, border: '0.5px solid var(--color-border-1)', borderRadius: 10, cursor: 'pointer', background: 'none', padding: 2 }}
              />
              <span style={{ fontSize: 10, color: 'var(--color-text-2)' }}>{label}</span>
              <span style={{ fontSize: 9, color: 'var(--color-muted)', fontVariantNumeric: 'tabular-nums' }}>{tokens.color[role]}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div style={sectionLabel}>
          Type
          {report?.confidence.fonts && <ConfidenceBadge confidence={report.confidence.fonts} />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Display">
            <select value={tokens.type.display.family} onChange={(e) => setDisplayFamily(e.target.value)} style={selectStyle}>
              {withCurrent(tokens.type.display.family).map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Body">
            <select value={tokens.type.body.family} onChange={(e) => setBodyFamily(e.target.value)} style={selectStyle}>
              {withCurrent(tokens.type.body.family).map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label={`Scale ratio · ${tokens.type.scale.toFixed(3)}`}>
            <input
              type="range"
              min={1.1}
              max={1.7}
              step={0.001}
              value={tokens.type.scale}
              onChange={(e) => setScale(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </Field>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-2)' }}>{label}</span>
      {children}
    </label>
  )
}
