import type { Confidence } from '@/lib/brand-kit/extract/report'

const STYLES: Record<Confidence, { label: string; bg: string; fg: string }> = {
  measured: { label: 'measured', bg: 'var(--color-published-bg)', fg: 'var(--color-published-fg)' },
  inferred: { label: 'inferred', bg: 'var(--color-scheduled-bg)', fg: 'var(--color-scheduled-fg)' },
  guessed: { label: 'guessed · confirm', bg: 'var(--color-pending-bg)', fg: 'var(--color-pending-fg)' },
}

/** How an extracted value was arrived at (§2.4): measured off the site, inferred by vision, or guessed. */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const s = STYLES[confidence]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        padding: '2px 6px',
        borderRadius: 20,
        background: s.bg,
        color: s.fg,
      }}
    >
      {s.label}
    </span>
  )
}
