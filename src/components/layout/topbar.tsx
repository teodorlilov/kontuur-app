interface TopbarProps {
  title: string
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '0 40px',
        borderBottom: '0.5px solid var(--color-border-1)',
        background: 'var(--color-page)',
        flexShrink: 0,
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          fontWeight: 400,
          color: 'var(--color-text-1)',
          letterSpacing: '-0.02em',
          margin: 0,
        }}
      >
        {title}
      </h1>
    </header>
  )
}
