import Link from 'next/link'

interface ClientRowProps {
  name: string
  niche: string | null
  status: 'active' | 'setup' | 'paused'
  pendingCount: number
  href: string
}

/** Extracts up to 2-letter initials from a name. */
function extractInitials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z\u0400-\u04FF\s]/g, '').trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/)
  const first = parts[0] ?? ''
  const second = parts[1] ?? ''
  if (!second) return first.slice(0, 2).toUpperCase()
  return (first.charAt(0) + second.charAt(0)).toUpperCase()
}

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'var(--status-ok)' },
  setup: { label: 'Setup', color: 'var(--status-warn)' },
  paused: { label: 'Paused', color: 'var(--status-warn)' },
} as const

/** Single client row for the dashboard clients section. */
export function ClientRow({ name, niche, status, pendingCount, href }: ClientRowProps) {
  const statusCfg = STATUS_CONFIG[status]

  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 0',
        borderBottom: '0.5px solid rgba(44,62,80,0.06)',
        textDecoration: 'none',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'linear-gradient(135deg,rgba(44,62,80,0.12),rgba(44,62,80,0.06))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 500,
          color: '#2C3E50',
          flexShrink: 0,
        }}
      >
        {extractInitials(name)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#1A2630' }}>{name}</div>
        {niche && (
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>{niche}</div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusCfg.color,
          }}
        />
        <span style={{ fontSize: 11, color: statusCfg.color }}>{statusCfg.label}</span>
      </div>

      {pendingCount > 0 ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            background: 'rgba(192,123,85,0.12)',
            color: 'var(--color-terracotta)',
            padding: '2px 7px',
            borderRadius: 4,
          }}
        >
          {pendingCount}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>—</span>
      )}
    </Link>
  )
}
