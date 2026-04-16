const agencies = ['About Social Media', 'Agency 2', 'Agency 3', 'Agency 4', 'Agency 5']

export function SocialProof() {
  return (
    <section
      className="mkt-pad"
      style={{
        background: 'var(--color-sunken)',
        borderTop: '0.5px solid var(--color-border-1)',
        borderBottom: '0.5px solid var(--color-border-1)',
        paddingTop: 20,
        paddingBottom: 20,
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 12 }}>
        Trusted by agencies in Bulgaria and across Europe
      </p>
      <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
        {agencies.map((name) => (
          <span
            key={name}
            style={{ fontSize: 13, color: 'var(--color-text-3)', opacity: 0.6, fontWeight: 500 }}
          >
            {name}
          </span>
        ))}
      </div>
    </section>
  )
}
