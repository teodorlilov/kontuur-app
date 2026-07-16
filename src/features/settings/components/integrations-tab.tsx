'use client'

import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { disconnectCanvaConnection } from '@/features/settings/actions/canva-actions'
import { capitalize } from '@/utils/format'

interface CanvaMember {
  id: string
  email: string
  role: string
  canvaConnected: boolean
  canvaAccountName: string | null
  connectionId: string | null
  tokenExpired: boolean
}

interface IntegrationsTabProps {
  currentUserId: string
}

/** Integrations tab: manage third-party connections for the team. */
export function IntegrationsTab({ currentUserId }: IntegrationsTabProps) {
  const [members, setMembers] = useState<CanvaMember[]>([])
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/canva/team-status')
      .then((r) => r.json())
      .then((data: { members?: CanvaMember[] }) => {
        setMembers(data.members ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleDisconnect(connectionId: string) {
    setDisconnecting(connectionId)
    try {
      const result = await disconnectCanvaConnection(connectionId)
      if (!result.ok) throw new Error(result.error)
      setMembers((prev) =>
        prev.map((m) =>
          m.connectionId === connectionId
            ? { ...m, canvaConnected: false, canvaAccountName: null, connectionId: null }
            : m
        )
      )
      toast.success('Canva disconnected')
    } catch {
      toast.error('Failed to disconnect Canva')
    } finally {
      setDisconnecting(null)
    }
  }

  const currentUser = members.find((m) => m.id === currentUserId)
  const isCurrentUserConnected = currentUser?.canvaConnected ?? false

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Manage third-party connections for your team"
      />

      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid rgba(44,62,80,0.10)',
          borderRadius: 13,
          overflow: 'hidden',
          marginBottom: 14,
        }}
      >
        {/* Card header with Canva icon */}
        <div
          style={{
            padding: '22px 22px 18px',
            borderBottom: '0.5px solid rgba(44,62,80,0.07)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#7B2FBE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 16,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              C
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-1)' }}>
              Canva
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.55 }}>
            Each manager connects their own Canva account. Designs are created in their
            account and exported directly to Kontuur posts.
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '24px 22px', textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Loading...</span>
          </div>
        ) : (
          <>
            {/* Team Canva connections */}
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.8px',
                color: 'var(--color-muted)',
                padding: '14px 22px 8px',
                textTransform: 'uppercase',
              }}
            >
              Team Canva connections
            </div>

            {members.map((member, i) => (
              <CanvaMemberRow
                key={member.id}
                member={member}
                isCurrentUser={member.id === currentUserId}
                isDisconnecting={disconnecting === member.connectionId}
                onDisconnect={() => member.connectionId && handleDisconnect(member.connectionId)}
                isLast={i === members.length - 1}
              />
            ))}

            {/* Current user connect button */}
            {!isCurrentUserConnected && (
              <div style={{ padding: '14px 22px' }}>
                <a
                  href="/api/canva/connect"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    border: '1px solid #00C3CC',
                    borderRadius: 8,
                    background: 'rgba(0, 195, 204, 0.04)',
                    color: '#00A8B0',
                    fontSize: 12,
                    fontWeight: 500,
                    textDecoration: 'none',
                    fontFamily: 'inherit',
                    transition: 'background 120ms ease',
                    cursor: 'pointer',
                  }}
                >
                  Connect your Canva account
                </a>
              </div>
            )}

            {/* Info note */}
            <div
              style={{
                margin: '8px 22px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontSize: 12,
                color: 'var(--color-muted)',
                lineHeight: 1.65,
                padding: '14px 16px',
                background: 'rgba(123, 47, 190, 0.04)',
                borderRadius: 10,
                border: '0.5px solid rgba(123, 47, 190, 0.10)',
              }}
            >
              <Clock style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2, opacity: 0.5 }} />
              <span>
                Each manager connects their own Canva account — designs are saved to their
                personal Canva library. The &quot;Design in Canva&quot; button in the topbar uses
                whichever account is connected to the currently logged-in manager.
              </span>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function CanvaMemberRow({
  member,
  isCurrentUser,
  isDisconnecting,
  onDisconnect,
  isLast,
}: {
  member: CanvaMember
  isCurrentUser: boolean
  isDisconnecting: boolean
  onDisconnect: () => void
  isLast: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '13px 22px',
        borderBottom: isLast ? 'none' : '0.5px solid rgba(44,62,80,0.055)',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#F9F6F2')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Avatar name={member.email} size="md" color="brand" />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-text-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {member.email}
          {isCurrentUser && <Badge variant="default">you</Badge>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
          {member.canvaAccountName ?? member.email}
        </div>
      </div>

      <Badge variant={member.role === 'admin' ? 'info' : 'default'}>
        {capitalize(member.role)}
      </Badge>

      {member.canvaConnected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: '#5A8A4A',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: member.tokenExpired ? '#C07B55' : '#5A8A4A',
                flexShrink: 0,
              }}
            />
            {member.tokenExpired ? 'Expired' : 'Canva connected'}
          </span>

          {isCurrentUser && (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={isDisconnecting}
              style={{
                padding: '4px 10px',
                background: 'none',
                border: '0.5px solid rgba(44,62,80,0.14)',
                borderRadius: 6,
                fontSize: 11,
                color: 'var(--color-muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                opacity: isDisconnecting ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#E8C4BB'
                e.currentTarget.style.color = '#A04030'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(44,62,80,0.14)'
                e.currentTarget.style.color = 'var(--color-muted)'
              }}
            >
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
          Not connected
        </span>
      )}
    </div>
  )
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
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
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.55 }}>
        {subtitle}
      </div>
    </div>
  )
}
