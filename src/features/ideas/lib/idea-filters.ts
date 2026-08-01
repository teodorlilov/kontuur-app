export type IdeaStatusFilter = 'new' | 'all' | 'used'

/**
 * The ideas inbox tabs, in reading order.
 *
 * Data rather than a component: these used to render as a filter bar above the
 * list and now feed the page header's tab rail.
 */
export const IDEA_STATUS_TABS: ReadonlyArray<{ id: IdeaStatusFilter; label: string }> = [
  { id: 'new', label: 'New' },
  { id: 'all', label: 'All' },
  { id: 'used', label: 'Used' },
]
