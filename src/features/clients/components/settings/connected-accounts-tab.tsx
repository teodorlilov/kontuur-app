'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { createModuleCache } from '@/utils/module-cache'
import { PanelHeader } from './basic-info-tab'

interface MetaConnection {
  id: string
  platform: string
  account_id: string
  account_name: string
  token_expires_at: string | null
}

// Module-level cache — prevents double-fetch from React Strict Mode (dev) and remounts
const connectionsCache = createModuleCache<MetaConnection[]>(30_000)

/** Bust the connections cache for a client (e.g. after OAuth redirect). */
export function bustConnectionsCache(clientId: string) {
  connectionsCache.delete(clientId)
}

interface ConnectedAccountsTabProps {
  clientId: string
}

/** Connected accounts tab: Instagram and Facebook OAuth cards. */
export function ConnectedAccountsTab({ clientId }: ConnectedAccountsTabProps) {
  const [connections, setConnections] = useState<MetaConnection[]>([])
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    const cached = connectionsCache.get(clientId)
    if (cached) {
      setConnections(cached)
      return
    }
    fetch(`/api/meta/connections?client_id=${clientId}`)
      .then((r) => r.json())
      .then((data: { connections?: MetaConnection[] }) => {
        const result = data.connections ?? []
        connectionsCache.set(clientId, result)
        setConnections(result)
      })
      .catch(() => {
        /* silently ignore — user can retry via connect buttons */
      })
  }, [clientId])

  async function handleDisconnect(connectionId: string) {
    setDisconnecting(connectionId)
    try {
      const res = await fetch(`/api/meta/connections/${connectionId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to disconnect')
      setConnections((prev) => {
        const updated = prev.filter((c) => c.id !== connectionId)
        connectionsCache.patch(clientId, updated)
        return updated
      })
      toast.success('Account disconnected')
    } catch {
      toast.error('Failed to disconnect account')
    } finally {
      setDisconnecting(null)
    }
  }

  const connectedPlatforms = new Set(connections.map((c) => c.platform))

  return (
    <>
      <PanelHeader
        title="Connected accounts"
        subtitle="Link social accounts for publishing and analytics"
      />
      <div style={{ padding: '20px 22px' }}>
        {connections.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {connections.map((conn) => (
              <ConnectionCard
                key={conn.id}
                connection={conn}
                isDisconnecting={disconnecting === conn.id}
                onDisconnect={() => handleDisconnect(conn.id)}
              />
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <ConnectButton
            href={`/api/meta/connect?platform=instagram&client_id=${clientId}`}
            label="Instagram"
            isConnected={connectedPlatforms.has('instagram')}
          />
          <ConnectButton
            href={`/api/meta/connect?platform=facebook&client_id=${clientId}`}
            label="Facebook Page"
            isConnected={connectedPlatforms.has('facebook')}
          />
        </div>

        <div
          style={{
            fontSize: 11,
            color: 'var(--color-muted)',
            lineHeight: 1.65,
            padding: '12px 14px',
            background: 'var(--color-sunken)',
            borderRadius: 8,
          }}
        >
          Connected accounts enable real-time analytics on the Analytics page and allow
          publishing approved posts directly to Instagram.
        </div>
      </div>
    </>
  )
}

function ConnectionCard({
  connection,
  isDisconnecting,
  onDisconnect,
}: {
  connection: MetaConnection
  isDisconnecting: boolean
  onDisconnect: () => void
}) {
  const isExpired = connection.token_expires_at
    ? new Date(connection.token_expires_at) < new Date()
    : false
  const platformLabel = connection.platform === 'instagram' ? 'Instagram' : 'Facebook'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: 'rgba(122,154,106,0.06)',
        border: '0.5px solid rgba(122,154,106,0.25)',
        borderRadius: 10,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)', marginBottom: 2 }}>
          {platformLabel} connected
          <span style={{ fontWeight: 400, color: 'var(--color-text-2)', marginLeft: 6 }}>
            {connection.account_name}
          </span>
        </div>
        {isExpired && (
          <div style={{ fontSize: 11, color: 'var(--color-error-fg)' }}>
            Token expired — reconnect to refresh
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        disabled={isDisconnecting}
        style={{
          fontSize: 11,
          color: 'var(--color-terracotta)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          opacity: isDisconnecting ? 0.5 : 1,
        }}
      >
        {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
      </button>
    </div>
  )
}

function ConnectButton({
  href,
  label,
  isConnected,
}: {
  href: string
  label: string
  isConnected: boolean
}) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
        isConnected
          ? 'border-[var(--color-brand)] text-[var(--color-brand)] hover:bg-[var(--color-overlay)]'
          : 'border-[var(--color-border-2)] text-[var(--color-text-1)] hover:border-[var(--color-border-3)]'
      )}
      style={{ textDecoration: 'none', fontFamily: 'inherit' }}
    >
      {isConnected ? `Reconnect ${label}` : `Connect ${label}`}
    </a>
  )
}
