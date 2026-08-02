'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Lightbulb } from 'lucide-react'
import { EmptyState } from '@/components/layout/empty-state'
import { HeaderMeta, MetaFlag, PageHeader } from '@/components/layout/page-header/page-header'
import { SelectControl } from '@/components/layout/page-header/select-control'
import { TabRail, type TabItem } from '@/components/layout/page-header/tab-rail'
import { PAGE_SHELL } from '@/components/layout/page-header/shared'
import { IdeaCard } from './idea-card'
import { IDEA_STATUS_TABS, type IdeaStatusFilter } from '@/features/ideas/lib/idea-filters'
import { CLIENT_COLORS } from '@/utils/constants'
import { cn } from '@/utils/cn'
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

  const filteredIdeas = useMemo(
    () =>
      ideas.filter((i) => {
        const matchClient = activeClient === 'all' || i.clientId === activeClient
        const matchStatus =
          activeStatus === 'all'
            ? true
            : activeStatus === 'new'
              ? i.status === 'new' || i.status === 'generating'
              : i.status === 'generated' || i.status === 'dismissed'
        return matchClient && matchStatus
      }),
    [ideas, activeClient, activeStatus]
  )

  const { clientOptions, totalNewCount, tabCounts } = useMemo(() => {
    const scoped = activeClient === 'all' ? ideas : ideas.filter((i) => i.clientId === activeClient)
    return {
      clientOptions: [
        { value: 'all', label: 'All clients' },
        ...clients.map((c) => {
          const newCount = ideas.filter((i) => i.clientId === c.id && i.status === 'new').length
          return { value: c.id, label: newCount > 0 ? `${c.name} (${newCount} new)` : c.name }
        }),
      ],
      totalNewCount: ideas.filter((i) => i.status === 'new').length,
      tabCounts: {
        new: scoped.filter((i) => i.status === 'new' || i.status === 'generating').length,
        all: scoped.length,
        used: scoped.filter((i) => i.status === 'generated' || i.status === 'dismissed').length,
      },
    }
  }, [ideas, clients, activeClient])

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

  const tabs: Array<TabItem<IdeaStatusFilter>> = IDEA_STATUS_TABS.map((tab) => ({
    ...tab,
    count: tabCounts[tab.id],
    flag: tab.id === 'new' && tabCounts.new > 0,
  }))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        crumb={[{ label: 'Client ideas' }]}
        title="Client ideas"
        count={totalNewCount}
        meta={
          <HeaderMeta
            parts={[
              totalNewCount > 0 ? (
                <MetaFlag>
                  {totalNewCount} new idea{totalNewCount === 1 ? '' : 's'}
                </MetaFlag>
              ) : (
                'Ideas your clients submit land here'
              ),
              // Beside the title rather than in a band of its own: it scopes what the
              // page is showing, which is what the header states.
              activeClient === 'all' &&
                filteredIdeas.length > 0 &&
                `${new Set(filteredIdeas.map((i) => i.clientId)).size} client${
                  new Set(filteredIdeas.map((i) => i.clientId)).size === 1 ? '' : 's'
                }`,
            ]}
          />
        }
        actions={
          clients.length > 1 ? (
            <SelectControl
              label="Client"
              value={activeClient}
              options={clientOptions}
              onChange={setActiveClient}
            />
          ) : null
        }
        tabs={
          <TabRail
            items={tabs}
            active={activeStatus}
            onSelect={setActiveStatus}
            label="Filter ideas"
          />
        }
      />

      <div
        className={cn(PAGE_SHELL, 'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-8 pt-5')}
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
