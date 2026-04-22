export function LogoMark() {
  return (
    <div
      style={{
        borderLeft: '1.5px solid var(--color-terracotta)',
        borderRight: '1.5px solid var(--color-terracotta)',
        borderTop: '0.5px solid rgba(236,232,225,0.18)',
        borderBottom: '0.5px solid rgba(236,232,225,0.18)',
        padding: '11px 16px',
        display: 'inline-block',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 18,
          fontWeight: 400,
          color: '#ECE8E1',
          letterSpacing: '4px',
        }}
      >
        KONTUUR
      </div>
      <div
        style={{
          fontSize: 7,
          color: 'var(--color-terracotta)',
          letterSpacing: '6px',
          marginTop: 4,
        }}
      >
        SOCIAL INTELLIGENCE
      </div>
    </div>
  )
}
