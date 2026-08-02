const agencies = ['About Social Media', 'Agency 2', 'Agency 3', 'Agency 4', 'Agency 5']

export function SocialProof() {
  return (
    <section
      className="mkt-pad"
      style={{
        background: 'var(--sunken)',
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
        paddingTop: 20,
        paddingBottom: 20,
        textAlign: 'center',
      }}
    >
      <p className="text-caption" style={{ color: 'var(--text3)', marginBottom: 12 }}>
        Trusted by agencies in Bulgaria and across Europe
      </p>
      <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
        {agencies.map((name) => (
          <span
            key={name}
            style={{ fontSize: 13, color: 'var(--text3)', opacity: 0.6, fontWeight: 500 }}
          >
            {name}
          </span>
        ))}
      </div>
    </section>
  )
}
