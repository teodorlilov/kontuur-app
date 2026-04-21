type BriefingTag = 'algorithm' | 'trend' | 'action'

interface BriefingItemProps {
  tag: BriefingTag
  text: string
}

const TAG_STYLES: Record<BriefingTag, { label: string; bg: string; color: string }> = {
  algorithm: { label: 'Algorithm', bg: 'rgba(44,94,138,0.10)', color: '#2C5F8A' },
  trend: { label: 'Trend', bg: 'rgba(122,154,106,0.10)', color: '#4A7A3A' },
  action: { label: 'Action', bg: 'rgba(192,123,85,0.10)', color: '#A05A35' },
}

/** Single briefing bullet with a coloured tag badge. */
export function BriefingItem({ tag, text }: BriefingItemProps) {
  const style = TAG_STYLES[tag]

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
      <div
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'var(--color-terracotta)',
          flexShrink: 0,
          marginTop: 6,
        }}
      />
      <div style={{ fontSize: 12, color: '#5A5050', lineHeight: 1.75 }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 10,
            fontWeight: 500,
            padding: '2px 7px',
            borderRadius: 4,
            marginRight: 4,
            background: style.bg,
            color: style.color,
          }}
        >
          {style.label}
        </span>
        {text}
      </div>
    </div>
  )
}
