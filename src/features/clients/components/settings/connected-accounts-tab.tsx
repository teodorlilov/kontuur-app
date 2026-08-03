'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { ConnectLink, ServiceTile } from '@/components/ui/service-row'
import { toast } from '@/components/ui/toast'
import { disconnectConnection } from '@/features/clients/actions/connection-actions'
import { isTokenExpired } from '@/lib/meta/token-expiry'
import { cn } from '@/utils/cn'
import { PLATFORM_ACCOUNTS, type PlatformAccount } from '@/utils/constants'
import type { MetaConnection } from '@/types/api'

interface ConnectedAccountsTabProps {
  clientId: string
  /** Resolved server-side by the page, which already needs them for the header pill. */
  connections: MetaConnection[]
}

/** Where posts publish: Instagram and Facebook OAuth links. */
export function ConnectedAccountsTab({ clientId, connections }: ConnectedAccountsTabProps) {
  const router = useRouter()
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  // Optimistic removal only. Derived from props rather than mirrored into state, so a server
  // refresh is always the source of truth and there is no prop/state sync to get wrong.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const visible = connections.filter((c) => !removedIds.has(c.id))

  async function handleDisconnect(connectionId: string) {
    setDisconnecting(connectionId)
    try {
      const result = await disconnectConnection(connectionId)
      if (!result.ok) throw new Error(result.error)
      setRemovedIds((prev) => new Set(prev).add(connectionId))
      toast.success('Account disconnected')
      router.refresh()
    } catch {
      toast.error('Failed to disconnect account')
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <>
      <div>
        {PLATFORM_ACCOUNTS.map((platform) => {
          const connection = visible.find((c) => c.platform === platform.id)
          return (
            <AccountRow
              key={platform.id}
              platform={platform}
              connection={connection}
              clientId={clientId}
              isDisconnecting={!!connection && disconnecting === connection.id}
              onDisconnect={() => connection && handleDisconnect(connection.id)}
            />
          )
        })}
      </div>

      <p className="mt-[18px] rounded-panel bg-wash px-4 py-3.5 text-caption leading-relaxed text-text2">
        Connected accounts enable real-time analytics and let approved posts publish directly.
        Without one, Kontuur can still draft and schedule — it just can&rsquo;t post.
      </p>
    </>
  )
}

function AccountRow({
  platform,
  connection,
  clientId,
  isDisconnecting,
  onDisconnect,
}: {
  platform: PlatformAccount
  connection: MetaConnection | undefined
  clientId: string
  isDisconnecting: boolean
  onDisconnect: () => void
}) {
  const expired = connection ? isTokenExpired(connection.token_expires_at) : false

  return (
    <div
      className={cn(
        'flex items-center gap-3.5 border-t border-line py-[15px] first:border-t-0',
        !platform.supported && 'opacity-55'
      )}
    >
      <ServiceTile>{platform.initials}</ServiceTile>

      <div className="min-w-0 flex-1">
        <b className="block text-body font-semibold text-ink">{platform.label}</b>
        <span className="text-caption text-text3">
          {connection ? connection.account_name : platform.note}
        </span>
      </div>

      {!platform.supported ? (
        <StatusPill tone="warn">Coming soon</StatusPill>
      ) : expired ? (
        <StatusPill tone="warn">Token expired</StatusPill>
      ) : connection ? (
        <StatusPill tone="ok">Connected</StatusPill>
      ) : (
        <StatusPill tone="bad">Not connected</StatusPill>
      )}

      {platform.supported &&
        (connection && !expired ? (
          <Button variant="ghost" size="sm" onClick={onDisconnect} loading={isDisconnecting}>
            Disconnect
          </Button>
        ) : (
          <ConnectLink href={`/api/meta/connect?platform=${platform.id}&client_id=${clientId}`}>
            {expired ? 'Reconnect' : 'Connect'}
          </ConnectLink>
        ))}
    </div>
  )
}
