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
        // The selected row is "where you are standing", but a 2.5px lime bar on
        // light is 1.35:1 and invisible — thin active marks are Deep Pine.
        background: 'var(--forest)',
        borderRadius: '0 var(--radius-xs) var(--radius-xs) 0',
      }}
    />
  )
}

export function CaptionPreview({ caption }: { caption: string | null }) {
  return (
    <div
      className="text-micro"
      style={{
        color: 'var(--text2)',
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
