'use client'

const UPCOMING_ITEMS = [
  { label: 'Display name and profile photo', icon: 'user' },
  { label: 'Email address', icon: 'mail' },
  { label: 'Password and security', icon: 'lock' },
  { label: 'Email notification preferences', icon: 'bell' },
]

/** Coming-soon profile settings placeholder. */
export function ProfileTab() {
  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontSize: 22,
            fontWeight: 400,
            color: 'var(--color-text-1)',
            marginBottom: 4,
          }}
        >
          Profile
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
          Personal account settings — coming soon
        </div>
      </div>

      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid rgba(44,62,80,0.10)',
          borderRadius: 13,
          overflow: 'hidden',
          marginBottom: 14,
          opacity: 0.55,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            padding: '18px 22px 14px',
            borderBottom: '0.5px solid rgba(44,62,80,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)' }}>
            Personal information
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: 10,
              background: 'rgba(44,62,80,0.06)',
              color: 'var(--color-muted)',
            }}
          >
            Coming soon
          </span>
        </div>
        <div style={{ padding: '8px 22px' }}>
          {UPCOMING_ITEMS.map((item, i) => (
            <div
              key={item.icon}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 0',
                borderBottom:
                  i < UPCOMING_ITEMS.length - 1 ? '0.5px solid rgba(44,62,80,0.05)' : 'none',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: 'rgba(44,62,80,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ProfileIcon name={item.icon} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ProfileIcon({ name }: { name: string }) {
  const props = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'rgba(44,62,80,0.30)',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (name) {
    case 'user':
      return (
        <svg {...props}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'mail':
      return (
        <svg {...props}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...props}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...props}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )
    default:
      return null
  }
}
