import type { ClientIdea, IdeaStatus } from '@/types/api'

/** The inbox tabs, in reading order. `all` sits last, matching /clients. */
export const IDEA_TABS = ['inbox', 'generated', 'dismissed', 'all'] as const

export type IdeaTab = (typeof IDEA_TABS)[number]

export const DEFAULT_IDEA_TAB: IdeaTab = 'inbox'

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

/**
 * One page of the inbox — and, because they are the same thing, the cap on the ids one
 * server action may carry.
 *
 * The list used to be unbounded: `/ideas` selected the agency's entire idea history,
 * including everything already generated or dismissed, and shipped it to the browser to be
 * filtered in memory. Both the payload and the action caps were sized by that read rather
 * than by a page, which is why the caps were a loose 500.
 *
 * There is deliberately no second `MARK_READ_MAX` name aliasing this: the client sends what
 * it rendered, it renders in pages, so a bulk dismiss and a mark-as-read are both bounded by
 * the page. The view chunks to this size, so loading more pages still sends whole-page
 * requests rather than one oversize call the schema would reject.
 *
 * Lives here rather than beside the schemas that cap on it, because `schemas.ts` imports
 * zod: the view needs this number, and importing it from there put the ~280 KB zod chunk in
 * the /ideas client bundle to read one integer. This module is types-only, so it costs
 * nothing to reach from a client component. `schemas.ts` imports it back.
 */
export const IDEAS_PAGE_SIZE = 100

/**
 * Ceiling on how deep "Show older" goes.
 *
 * Not a technical limit — past a thousand rows the useful answer is a client filter or a
 * tab, and an uncapped `?pages=` is a way to ask the server for the unbounded read this
 * page was built to stop making.
 */
export const MAX_IDEA_PAGES = 10

/**
 * How many pages of the inbox to load, from the URL.
 *
 * `parseParam` cannot do this one — it narrows against a closed set of strings, and this is
 * a bounded number. Anything absent, repeated, non-numeric, or out of range reads as the
 * first page, which is the only safe direction: the fallback must never be "load more".
 */
export function pagesShown(raw: string | string[] | undefined): number {
  if (typeof raw !== 'string') return 1
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1) return 1
  return Math.min(parsed, MAX_IDEA_PAGES)
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
