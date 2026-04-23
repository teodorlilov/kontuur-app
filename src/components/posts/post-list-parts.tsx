/** Shared sub-components for post list items (generation results + review). */

export function ActiveBar() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: '10%',
        bottom: '10%',
        width: '2.5px',
        background: 'var(--color-terracotta)',
        borderRadius: '0 3px 3px 0',
      }}
    />
  )
}

export function ScoreLabel({ score }: { score: number }) {
  const color = score >= 9 ? 'var(--status-ok)' : score >= 7 ? 'var(--color-terracotta)' : '#E05A3A'
  return <span style={{ fontSize: '11px', fontWeight: 500, color }}>{score}/10</span>
}

export function CaptionPreview({ caption }: { caption: string | null }) {
  return (
    <div
      style={{
        fontSize: '11px',
        color: 'var(--color-muted)',
        lineHeight: 1.45,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        marginBottom: '7px',
      }}
    >
      {caption ?? ''}
    </div>
  )
}
