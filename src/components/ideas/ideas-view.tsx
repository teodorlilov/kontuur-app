'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Lightbulb } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { EmptyState } from '@/components/layout/empty-state'
import { IdeaFilterBar, type IdeaStatusFilter } from './idea-filter-bar'
import { IdeaCard } from './idea-card'
import { CLIENT_COLORS } from '@/utils/constants'
import type { ClientIdea } from '@/types/api'

interface ClientInfo {
  id: string
  name: string
}

interface IdeasViewProps {
  initialIdeas: ClientIdea[]
  clients: ClientInfo[]
}

/** Main ideas inbox view with filtering and actions. */
export function IdeasView({ initialIdeas, clients }: IdeasViewProps) {
  const router = useRouter()
  const [ideas, setIdeas] = useState<ClientIdea[]>(initialIdeas)
  const [activeClient, setActiveClient] = useState('all')
  const [activeStatus, setActiveStatus] = useState<IdeaStatusFilter>('new')

  // Mark unread ideas as read on mount
  useEffect(() => {
    const unreadIds = ideas.filter((i) => !i.readAt).map((i) => i.id)
    if (unreadIds.length === 0) return

    fetch('/api/ideas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', ids: unreadIds }),
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredIdeas = useMemo(() => ideas.filter((i) => {
    const matchClient = activeClient === 'all' || i.clientId === activeClient
    const matchStatus =
      activeStatus === 'all'
        ? true
        : activeStatus === 'new'
          ? i.status === 'new' || i.status === 'generating'
          : i.status === 'generated' || i.status === 'dismissed'
    return matchClient && matchStatus
  }), [ideas, activeClient, activeStatus])

  const { clientFilters, totalNewCount } = useMemo(() => {
    const filters = clients.map((c) => ({
      ...c,
      newCount: ideas.filter((i) => i.clientId === c.id && i.status === 'new').length,
    }))
    return { clientFilters: filters, totalNewCount: ideas.filter((i) => i.status === 'new').length }
  }, [ideas, clients])

  function handleGenerate(idea: ClientIdea) {
    router.push(`/generate?ideaId=${idea.id}`)
  }

  async function handleDismiss(ideaId: string) {
    setIdeas((prev) => prev.map((i) => (i.id === ideaId ? { ...i, status: 'dismissed' } : i)))

    await fetch('/api/ideas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId, status: 'dismissed' }),
    })
  }

  function getClientColor(clientId: string) {
    const idx = clients.findIndex((c) => c.id === clientId)
    return CLIENT_COLORS[idx % CLIENT_COLORS.length] ?? CLIENT_COLORS[0]
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Topbar title="Client ideas" />

      <IdeaFilterBar
        clients={clientFilters}
        activeClient={activeClient}
        activeStatus={activeStatus}
        totalNewCount={totalNewCount}
        onClientChange={setActiveClient}
        onStatusChange={setActiveStatus}
      />

      <CountBar count={filteredIdeas.length} activeStatus={activeStatus} activeClient={activeClient} clientCount={new Set(filteredIdeas.map((i) => i.clientId)).size} />

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '18px 24px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {filteredIdeas.length === 0 ? (
          <EmptyState
            icon={<Lightbulb size={28} />}
            title={activeStatus === 'new' ? 'No new ideas' : 'No ideas yet'}
            description="Ideas submitted by clients will appear here."
          />
        ) : (
          filteredIdeas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              clientDotColor={getClientColor(idea.clientId)}
              onGenerate={handleGenerate}
              onDismiss={handleDismiss}
            />
          ))
        )}
      </div>
    </div>
  )
}

function CountBar({
  count,
  activeStatus,
  activeClient,
  clientCount,
}: {
  count: number
  activeStatus: IdeaStatusFilter
  activeClient: string
  clientCount: number
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderBottom: '0.5px solid rgba(44,62,80,0.07)',
        padding: '8px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 12, color: '#8A8070' }}>
        <strong style={{ color: '#1A2630' }}>
          {count} {activeStatus === 'new' ? 'new ' : ''}
          idea{count !== 1 ? 's' : ''}
        </strong>
        {activeClient === 'all' && clientCount > 0 ? ` · ${clientCount} clients` : ''}
      </span>
    </div>
  )
}
