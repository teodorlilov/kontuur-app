import type { ClientIdea, IdeaStatus } from '@/types/api'

/** The inbox tabs, in reading order. `all` sits last, matching /clients. */
export const IDEA_TABS = ['inbox', 'generated', 'dismissed', 'all'] as const

export type IdeaTab = (typeof IDEA_TABS)[number]

export const DEFAULT_IDEA_TAB: IdeaTab = 'inbox'

/**
 * The one definition of what each tab shows, and the only place a tab is mapped
 * to a status.
 *
 * This existed six times before, in four files, and had drifted into three
 * different meanings: the list filter counted `generated` + `dismissed` as
 * "used", the settings rail counted `generated` alone under the same word, and
 * the tab counts were scoped to the selected client while the title count was
 * not. Tab label, tab count and list query now read this table, so they cannot
 * disagree about the same idea.
 *
 * `null` means no status filter at all — not "every status listed here" — so a
 * value outside the union still appears under All rather than vanishing from
 * every tab at once.
 */
/**
 * Ideas still waiting on a human decision.
 *
 * Read by the Inbox tab and by the sidebar badge, which is the point: the badge
 * used to count its own `status = 'new'` predicate, so a stranded row could be in
 * the number the sidebar showed or the list the tab showed, but not reliably both.
 * One value today ('generating' was retired by 20260817), but the seam stays —
 * the badge and the tab must never grow separate definitions of "awaiting" again.
 */
export const AWAITING_DECISION: readonly IdeaStatus[] = ['new']

const TAB_STATUSES: Record<IdeaTab, readonly IdeaStatus[] | null> = {
  inbox: AWAITING_DECISION,
  generated: ['generated'],
  dismissed: ['dismissed'],
  all: null,
}

export const IDEA_TAB_LABELS: Record<IdeaTab, string> = {
  inbox: 'Inbox',
  generated: 'Generated',
  dismissed: 'Dismissed',
  all: 'All',
}

/** The statuses a tab selects, or null for "no filter". */
export function statusesForTab(tab: IdeaTab): readonly IdeaStatus[] | null {
  return TAB_STATUSES[tab]
}

/** How many of a per-status tally belong to a tab. */
export function countForTab(tab: IdeaTab, byStatus: Readonly<Record<string, number>>): number {
  const statuses = TAB_STATUSES[tab]
  const totals = Object.values(byStatus)
  if (statuses === null) return totals.reduce((sum, n) => sum + n, 0)
  return statuses.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0)
}

/**
 * Re-applies in-flight optimistic status changes to a fresh server payload.
 *
 * A tab or client navigation re-renders the mounted view with new `initialIdeas`
 * while a dismissal's undo window is still open — the server has not been told
 * yet, so the fresh list still contains the row and would resurrect it on screen.
 * Same tab rule as the live update: a pending status the tab shows flips in
 * place, one it does not show removes the row.
 */
export function applyPendingStatuses(
  initial: ClientIdea[],
  pending: ReadonlyMap<string, IdeaStatus>,
  tab: IdeaTab
): ClientIdea[] {
  if (pending.size === 0) return initial
  const statuses = statusesForTab(tab)
  return initial.flatMap((idea) => {
    const status = pending.get(idea.id)
    if (status === undefined) return [idea]
    const stays = statuses === null || statuses.includes(status)
    return stays ? [{ ...idea, status }] : []
  })
}
