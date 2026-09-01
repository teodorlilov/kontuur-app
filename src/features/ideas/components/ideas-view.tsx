'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lightbulb } from 'lucide-react'
import { ActionLink } from '@/components/ui/action-link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DiscardToast, DISCARD_TOAST_MS } from '@/components/ui/discard-toast'
import { toast } from '@/components/ui/toast'
import { EmptyState } from '@/components/layout/empty-state'
import { HeaderMeta, MetaFlag, PageHeader } from '@/components/layout/page-header/page-header'
import { SelectControl } from '@/components/layout/page-header/select-control'
import { TabRail, type TabItem } from '@/components/layout/page-header/tab-rail'
import { PAGE_SHELL } from '@/components/layout/page-header/shared'
import { IdeaDetailDialog } from './idea-detail-dialog'
import { IdeaRow } from './idea-row'
import { IDEA_GRID, IDEA_GRID_DROP } from './grid'
import { dismissIdeas, markIdeasRead, restoreIdeas } from '@/features/ideas/actions/idea-actions'
import {
  DEFAULT_IDEA_TAB,
  IDEA_TABS,
  IDEA_TAB_LABELS,
  IDEAS_PAGE_SIZE,
  MAX_IDEA_PAGES,
  applyPendingStatuses,
  countForTab,
  statusesForTab,
  type IdeaTab,
} from '@/features/ideas/lib/idea-filters'
import { CLIENT_COLORS } from '@/utils/constants'
import { hashIndex } from '@/utils/hash-index'
import { cn } from '@/utils/cn'
import type { ClientIdea, IdeaStatus } from '@/types/api'

/**
 * Not the shared `ClientFilter`'s empty-string sentinel, and not a candidate for
 * it: this scope lives in the URL, so it needs a value a query string can carry,
 * and changing it navigates for a fresh server fetch rather than filtering rows
 * already in hand. The review queue and the calendar share that component
 * because they are both state-backed; this one is a different mechanism wearing
 * the same clothes.
 */
const ALL_CLIENTS = 'all'

interface IdeasViewProps {
  /** Already filtered by the Server Component — this list is what the tab shows. */
  initialIdeas: ClientIdea[]
  /** Per-status tally for the current client scope, so every tab count agrees. */
  countsByStatus: Record<string, number>
  tab: IdeaTab
  clientId?: string
  clients: Array<{ id: string; name: string }>
  /** Pages of `IDEAS_PAGE_SIZE` currently loaded — 1 unless "Show older" was pressed. */
  pages: number
  /** Whether the server has rows beyond the loaded pages, so the control can say so. */
  hasOlder: boolean
  /** Pinned server-side so every relative time on the page ages from one instant. */
  loadedAt: string
}

/**
 * Only non-default state reaches the URL, so /ideas stays the canonical view.
 *
 * `pages` is deliberately not carried by the tab and client links: changing what the list
 * shows resets how deep it goes, because "10 pages of Inbox" says nothing about how much
 * of Dismissed anyone wanted to see.
 */
function buildHref(tab: IdeaTab, clientId: string, pages = 1): string {
  const params = new URLSearchParams()
  if (tab !== DEFAULT_IDEA_TAB) params.set('tab', tab)
  if (clientId !== ALL_CLIENTS) params.set('client', clientId)
  if (pages > 1) params.set('pages', String(pages))
  const query = params.toString()
  return query ? `/ideas?${query}` : '/ideas'
}

/**
 * The ideas inbox.
 *
 * The header lives in this client component rather than the page because the meta
 * line is where selection is reported — "3 selected · Dismiss 3" replaces it. The
 * filtering itself is still the server's: tabs are links, and the list arrives
 * already scoped.
 */
export function IdeasView({
  initialIdeas,
  countsByStatus,
  tab,
  clientId,
  clients,
  pages,
  hasOlder,
  loadedAt,
}: IdeasViewProps) {
  const router = useRouter()
  const [ideas, setIdeas] = useState(initialIdeas)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [openIdeaId, setOpenIdeaId] = useState<string | null>(null)

  const now = useMemo(() => new Date(loadedAt), [loadedAt])
  const scope = clientId ?? ALL_CLIENTS

  // Dismissals inside their undo window: id → commit. Unmount commits them all;
  // leaving the tab must not resurrect an idea the agency already dismissed.
  const pendingRef = useRef(new Map<string, () => void>())
  // The optimistic status each pending row carries, so a fresh server payload —
  // which has not been told yet — can be re-shaped instead of trusted verbatim.
  // State rather than a ref because the render-time reset below reads it, and
  // reading a ref during render is forbidden.
  const [pendingStatuses, setPendingStatuses] = useState<ReadonlyMap<string, IdeaStatus>>(new Map())
  useEffect(() => {
    const pending = pendingRef.current
    return () => {
      for (const commit of pending.values()) commit()
      pending.clear()
    }
  }, [])

  // A new server payload supersedes local optimism — except for rows whose undo
  // window is still open: their commit has not fired, so the fresh list still
  // contains them and would resurrect them on screen.
  //
  // Adjusted during render rather than in an effect: setting state from an effect
  // renders once with the stale list and again with the fresh one, so the row the
  // user just dismissed would flash back before disappearing. Setting state while
  // rendering *this* component is the supported form and re-runs before any commit.
  const [renderedFrom, setRenderedFrom] = useState(initialIdeas)
  if (renderedFrom !== initialIdeas) {
    setRenderedFrom(initialIdeas)
    setIdeas(applyPendingStatuses(initialIdeas, pendingStatuses, tab))
    setSelected(new Set())
  }

  // Mark what is on screen as read, and reflect it locally — the previous version
  // fired the request and never touched state, so rows kept their unread dot until
  // a hard load contradicted it. Chunked to the action's schema cap: one oversize
  // call would be rejected whole and silently mark nothing.
  useEffect(() => {
    const unreadIds = initialIdeas.filter((idea) => !idea.readAt).map((idea) => idea.id)
    if (unreadIds.length === 0) return

    const chunks: string[][] = []
    for (let i = 0; i < unreadIds.length; i += IDEAS_PAGE_SIZE) {
      chunks.push(unreadIds.slice(i, i + IDEAS_PAGE_SIZE))
    }
    void Promise.all(
      chunks.map(async (chunk) => ({ chunk, result: await markIdeasRead(chunk) }))
    ).then((outcomes) => {
      // Only rows whose chunk actually landed lose the dot.
      const marked = new Set(outcomes.filter((o) => o.result.ok).flatMap((o) => o.chunk))
      if (marked.size === 0) return
      const readAt = new Date().toISOString()
      setIdeas((prev) => prev.map((i) => (marked.has(i.id) ? { ...i, readAt } : i)))
    })
  }, [initialIdeas])

  /**
   * Apply a status change to the rows on screen.
   *
   * Whether the row leaves depends on the tab, not on the action: dismissing from
   * Inbox removes it, dismissing from All flips its status in place. Deriving that
   * from `statusesForTab` is what keeps the list honest under every filter.
   */
  function applyStatus(ids: ReadonlySet<string>, status: IdeaStatus) {
    const statuses = statusesForTab(tab)
    const stays = statuses === null || statuses.includes(status)
    setIdeas((prev) =>
      stays
        ? prev.map((idea) => (ids.has(idea.id) ? { ...idea, status } : idea))
        : prev.filter((idea) => !ids.has(idea.id))
    )
  }

  /**
   * Put snapshotted rows back after an undo or a failed write. Per-item, never a
   * whole-list snapshot: two overlapping undo windows would otherwise restore each
   * other's stale copies — undoing A resurrected a still-pending B, then undoing B
   * vanished A again. A row still on screen gets its snapshot back in place; a row
   * the tab removed is spliced back where it was. The `some` guard makes a double
   * restore a no-op, mirroring review-queue's discard pattern.
   */
  function restoreRows(snapshots: Array<{ idea: ClientIdea; index: number }>) {
    setIdeas((prev) => {
      let next = prev
      for (const { idea, index } of snapshots) {
        if (next.some((row) => row.id === idea.id)) {
          next = next.map((row) => (row.id === idea.id ? idea : row))
        } else {
          const at = Math.min(index, next.length)
          next = [...next.slice(0, at), idea, ...next.slice(at)]
        }
      }
      return next
    })
  }

  function snapshotRows(ids: ReadonlySet<string>): Array<{ idea: ClientIdea; index: number }> {
    return ideas.flatMap((idea, index) => (ids.has(idea.id) ? [{ idea, index }] : []))
  }

  function dismiss(ids: string[]) {
    const targets = new Set(ids.filter((id) => !pendingRef.current.has(id)))
    if (targets.size === 0) return

    const snapshots = snapshotRows(targets)
    applyStatus(targets, 'dismissed')
    setSelected((prev) => new Set([...prev].filter((id) => !targets.has(id))))

    const clearPending = () => {
      for (const id of targets) pendingRef.current.delete(id)
      setPendingStatuses((prev) => {
        const next = new Map(prev)
        for (const id of targets) next.delete(id)
        return next
      })
    }
    let settled = false
    const commit = () => {
      if (settled) return
      settled = true
      clearPending()
      // No router.refresh() on success: the action already revalidated the
      // 'client-ideas' tag, so the next navigation renders fresh — and a refresh
      // here re-delivered rows whose own undo windows were still open.
      void dismissIdeas([...targets]).then((result) => {
        if (!result.ok) {
          toast.error(result.error)
          restoreRows(snapshots)
        }
      })
    }
    const undo = () => {
      if (settled) return
      settled = true
      clearPending()
      restoreRows(snapshots)
    }
    for (const id of targets) pendingRef.current.set(id, commit)
    setPendingStatuses((prev) => {
      const next = new Map(prev)
      for (const id of targets) next.set(id, 'dismissed')
      return next
    })

    const toastId = toast.custom(
      () => (
        <DiscardToast
          title={targets.size === 1 ? 'Idea dismissed' : `${targets.size} ideas dismissed`}
          onUndo={() => {
            toast.dismiss(toastId)
            undo()
          }}
        />
      ),
      { duration: DISCARD_TOAST_MS, onAutoClose: () => commit() }
    )
  }

  function restore(ideaId: string) {
    const snapshots = snapshotRows(new Set([ideaId]))
    applyStatus(new Set([ideaId]), 'new')
    void restoreIdeas([ideaId]).then((result) => {
      if (!result.ok) {
        toast.error(result.error)
        restoreRows(snapshots)
      }
    })
  }

  function toggleSelect(ideaId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(ideaId)) next.add(ideaId)
      return next
    })
  }

  // Grouped only when the page is showing every client: with one selected, the
  // header already says whose ideas these are, and a group band would repeat it.
  const groups = useMemo(() => {
    if (scope !== ALL_CLIENTS) return null
    const byClient = new Map<string, { name: string; ideas: ClientIdea[] }>()
    for (const idea of ideas) {
      const group = byClient.get(idea.clientId) ?? { name: idea.clientName, ideas: [] }
      group.ideas.push(idea)
      byClient.set(idea.clientId, group)
    }
    return [...byClient.entries()]
  }, [ideas, scope])

  const tabs: Array<TabItem<IdeaTab>> = IDEA_TABS.map((id) => ({
    id,
    label: IDEA_TAB_LABELS[id],
    count: countForTab(id, countsByStatus),
    flag: id === DEFAULT_IDEA_TAB && countForTab(id, countsByStatus) > 0,
    href: buildHref(id, scope),
  }))

  const inboxCount = countForTab('inbox', countsByStatus)
  const totalCount = countForTab('all', countsByStatus)
  const openIdea = ideas.find((idea) => idea.id === openIdeaId) ?? null

  return (
    <>
      <PageHeader
        crumb={[{ label: 'Client ideas' }]}
        title="Client ideas"
        count={totalCount}
        meta={
          selected.size > 0 ? (
            <div className="flex items-center gap-2.5">
              <span className="text-caption font-semibold text-ink">{selected.size} selected</span>
              <Button variant="secondary" size="sm" onClick={() => dismiss([...selected])}>
                Dismiss {selected.size}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          ) : (
            <HeaderMeta
              parts={[
                inboxCount > 0 ? (
                  <MetaFlag>{inboxCount} waiting on you</MetaFlag>
                ) : (
                  'Ideas your clients submit land here'
                ),
                groups &&
                  groups.length > 0 &&
                  `${groups.length} client${groups.length === 1 ? '' : 's'}`,
              ]}
            />
          )
        }
        actions={
          clients.length > 1 ? (
            <SelectControl
              label="Client"
              value={scope}
              options={[
                { value: ALL_CLIENTS, label: 'All clients' },
                ...clients.map((client) => ({ value: client.id, label: client.name })),
              ]}
              onChange={(value) => router.push(buildHref(tab, value))}
            />
          ) : null
        }
        tabs={<TabRail items={tabs} active={tab} label="Filter ideas" />}
      />

      <div className={cn(PAGE_SHELL, 'pb-10 pt-5')}>
        <Card className="overflow-hidden">
          {ideas.length === 0 ? (
            <IdeasEmptyState tab={tab} hasAnyIdeas={totalCount > 0} scope={scope} />
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className={cn(IDEA_GRID, 'h-9 border-b border-line bg-sunken text-left')}>
                  <th scope="col">
                    <span className="sr-only">Select</span>
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    Idea
                  </th>
                  <th scope="col" className={cn(HEADER_CELL, IDEA_GRID_DROP)}>
                    Platform
                  </th>
                  <th scope="col" className={cn(HEADER_CELL, IDEA_GRID_DROP)}>
                    Target
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    Age
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups
                  ? groups.map(([groupClientId, group]) => (
                      <IdeaGroup
                        key={groupClientId}
                        clientId={groupClientId}
                        name={group.name}
                        ideas={group.ideas}
                        now={now}
                        selected={selected}
                        onToggleSelect={toggleSelect}
                        onSelectGroup={(ids, checked) =>
                          setSelected((prev) => {
                            const next = new Set(prev)
                            for (const id of ids) {
                              if (checked) next.add(id)
                              else next.delete(id)
                            }
                            return next
                          })
                        }
                        onOpen={setOpenIdeaId}
                        onDismiss={(id) => dismiss([id])}
                        onRestore={restore}
                      />
                    ))
                  : ideas.map((idea) => (
                      <IdeaRow
                        key={idea.id}
                        idea={idea}
                        now={now}
                        selected={selected.has(idea.id)}
                        onToggleSelect={() => toggleSelect(idea.id)}
                        onOpen={() => setOpenIdeaId(idea.id)}
                        onDismiss={() => dismiss([idea.id])}
                        onRestore={() => restore(idea.id)}
                      />
                    ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Says what is loaded rather than only offering more: the list used to be every
            idea the agency had ever received, so a bounded one has to be honest that it is
            bounded. At the ceiling the answer is a narrower filter, not another page. */}
        {hasOlder && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <span className="text-caption text-text3">Showing the {ideas.length} most recent.</span>
            {pages < MAX_IDEA_PAGES ? (
              <ActionLink
                href={buildHref(tab, scope, pages + 1)}
                variant="secondary"
                size="sm"
                scroll={false}
              >
                Show older
              </ActionLink>
            ) : (
              <span className="text-caption text-text3">
                Filter by client to reach older ideas.
              </span>
            )}
          </div>
        )}
      </div>

      <IdeaDetailDialog
        idea={openIdea}
        now={now}
        onClose={() => setOpenIdeaId(null)}
        onDismiss={(id) => dismiss([id])}
        onRestore={restore}
      />
    </>
  )
}

const HEADER_CELL = 'text-label font-semibold uppercase text-text3'

interface IdeaGroupProps {
  clientId: string
  name: string
  ideas: ClientIdea[]
  now: Date
  selected: ReadonlySet<string>
  onToggleSelect: (ideaId: string) => void
  onSelectGroup: (ideaIds: string[], checked: boolean) => void
  onOpen: (ideaId: string) => void
  onDismiss: (ideaId: string) => void
  onRestore: (ideaId: string) => void
}

/** One client's band of ideas, with a header that selects the whole group. */
function IdeaGroup({
  clientId,
  name,
  ideas,
  now,
  selected,
  onToggleSelect,
  onSelectGroup,
  onOpen,
  onDismiss,
  onRestore,
}: IdeaGroupProps) {
  const ids = ideas.map((idea) => idea.id)
  const chosen = ids.filter((id) => selected.has(id)).length
  // Hashed, not indexed by list position: a client keeps its colour when the
  // roster changes. DESIGN.md § Client colours.
  const dot = CLIENT_COLORS[hashIndex(clientId, CLIENT_COLORS.length)]

  return (
    <>
      <tr className="flex items-center gap-3.5 border-t border-line bg-paper px-4 py-2 first:border-t-0">
        <td>
          <input
            type="checkbox"
            checked={chosen === ids.length}
            ref={(el) => {
              if (el) el.indeterminate = chosen > 0 && chosen < ids.length
            }}
            onChange={(e) => onSelectGroup(ids, e.target.checked)}
            aria-label={`Select all ideas from ${name}`}
            className="size-3.5 accent-forest"
          />
        </td>
        <td className="flex min-w-0 flex-1 items-center gap-2">
          <span
            aria-hidden
            className="size-1.75 flex-none rounded-full"
            style={{ background: dot }}
          />
          <span className="truncate text-caption font-semibold text-ink">{name}</span>
        </td>
        <td className="text-micro tabular-nums text-text3">
          {ids.length} idea{ids.length === 1 ? '' : 's'}
        </td>
      </tr>
      {ideas.map((idea) => (
        <IdeaRow
          key={idea.id}
          idea={idea}
          now={now}
          selected={selected.has(idea.id)}
          onToggleSelect={() => onToggleSelect(idea.id)}
          onOpen={() => onOpen(idea.id)}
          onDismiss={() => onDismiss(idea.id)}
          onRestore={() => onRestore(idea.id)}
        />
      ))}
    </>
  )
}

/**
 * Per tab, and each one offers the way out of itself.
 *
 * One state said "No ideas yet — ideas submitted by clients will appear here" to
 * every tab, including an agency holding forty of them who had simply cleared this
 * one.
 */
function IdeasEmptyState({
  tab,
  hasAnyIdeas,
  scope,
}: {
  tab: IdeaTab
  hasAnyIdeas: boolean
  scope: string
}) {
  const icon = <Lightbulb size={28} aria-hidden />

  if (!hasAnyIdeas) {
    return (
      <EmptyState
        icon={icon}
        title="No ideas yet"
        description="Send a client their idea link and whatever they submit lands here."
        action={
          <ActionLink href="/clients" size="sm">
            Choose a client
          </ActionLink>
        }
      />
    )
  }

  if (tab === 'inbox') {
    return (
      <EmptyState
        icon={icon}
        title="Inbox zero"
        description="Every idea has been generated or dismissed."
        action={
          <ActionLink href={buildHref('all', scope)} variant="secondary" size="sm">
            View all ideas
          </ActionLink>
        }
      />
    )
  }

  return (
    <EmptyState
      icon={icon}
      title={tab === 'generated' ? 'Nothing generated yet' : 'Nothing dismissed'}
      description={
        tab === 'generated'
          ? 'Ideas you generate and approve a post from show up here.'
          : 'Ideas you set aside show up here, and can be restored.'
      }
      action={
        <ActionLink href={buildHref('inbox', scope)} variant="secondary" size="sm">
          Go to inbox
        </ActionLink>
      }
    />
  )
}
