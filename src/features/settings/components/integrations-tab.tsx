'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { FormSection, RailBox, RailText } from '@/components/ui/form'
import { StatusPill } from '@/components/ui/status-pill'
import { ConnectLink, ServiceTile } from '@/components/ui/service-row'
import { toast } from '@/components/ui/toast'
import { capitalize } from '@/utils/format'
import { disconnectCanvaConnection } from '@/features/settings/actions/canva-actions'
import type { CanvaTeamMember } from '@/features/settings/lib/canva-team'

interface IntegrationsTabProps {
  currentUserId: string
  /** Resolved server-side by the settings page. */
  members: CanvaTeamMember[]
}

/** Third-party connections. Each manager links their own account. */
export function IntegrationsTab({ currentUserId, members }: IntegrationsTabProps) {
  const router = useRouter()
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  // Optimistic only — derived from props so a refresh is always the source of truth.
  const [disconnectedIds, setDisconnectedIds] = useState<Set<string>>(new Set())

  const visible = members.map((m) =>
    m.connectionId && disconnectedIds.has(m.connectionId)
      ? { ...m, canvaConnected: false, canvaAccountName: null, connectionId: null }
      : m
  )
  const currentUser = visible.find((m) => m.id === currentUserId)

  async function handleDisconnect(connectionId: string) {
    setDisconnecting(connectionId)
    try {
      const result = await disconnectCanvaConnection(connectionId)
      if (!result.ok) throw new Error(result.error)
      setDisconnectedIds((prev) => new Set(prev).add(connectionId))
      toast.success('Canva disconnected')
      router.refresh()
    } catch {
      toast.error('Failed to disconnect Canva')
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <>
      <FormSection>
        <div className="col-span-12 flex items-center gap-3.5 py-[15px]">
          <ServiceTile>C</ServiceTile>
          <div className="min-w-0 flex-1">
            <b className="block text-body-lg font-semibold text-ink">Canva</b>
            <span className="text-stat-label text-text3">
              Designs are created in your own Canva account and exported to Kontuur posts
            </span>
          </div>
          {currentUser?.canvaConnected ? (
            <StatusPill tone="ok">Connected</StatusPill>
          ) : (
            <StatusPill tone="bad">Not connected</StatusPill>
          )}
          {!currentUser?.canvaConnected && (
            <ConnectLink href="/api/canva/connect">Connect</ConnectLink>
          )}
        </div>
      </FormSection>

      <FormSection
        legend="Team connections"
        description="Who on the team has linked their Canva account."
      >
        <div className="col-span-12">
          {visible.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 border-t border-line py-3.5 first:border-t-0"
            >
              <Avatar name={member.email} size="md" />
              <div className="min-w-0 flex-1">
                <b className="block truncate text-body-lg font-semibold text-ink">
                  {member.email}
                </b>
                <span className="text-stat-label text-text3">
                  {capitalize(member.role)}
                  {member.id === currentUserId && ' · you'}
                  {member.canvaAccountName && ` · ${member.canvaAccountName}`}
                </span>
              </div>

              {member.tokenExpired ? (
                <StatusPill tone="warn">Expired</StatusPill>
              ) : member.canvaConnected ? (
                <StatusPill tone="ok">Connected</StatusPill>
              ) : (
                <StatusPill tone="bad">Not connected</StatusPill>
              )}

              {/* Only your own connection is yours to sever. */}
              {member.id === currentUserId && member.connectionId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDisconnect(member.connectionId!)}
                  loading={disconnecting === member.connectionId}
                >
                  Disconnect
                </Button>
              )}
            </div>
          ))}
        </div>

        <p className="col-span-12 rounded-panel bg-wash px-4 py-3.5 text-stat-label leading-relaxed text-text2">
          The <b className="font-semibold text-ink">Design in Canva</b> button uses whichever
          account the logged-in manager has connected. Designs stay in that person&rsquo;s Canva
          library.
        </p>
      </FormSection>
    </>
  )
}

/** Context rail for the Integrations panel. */
export function IntegrationsRail() {
  return (
    <RailBox title="Why connect">
      <RailText>
        Send a post straight into a Canva design with the brand palette pre-applied, then export
        the result back into the post.
      </RailText>
    </RailBox>
  )
}
