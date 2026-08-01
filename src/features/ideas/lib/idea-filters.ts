export type IdeaStatusFilter = 'new' | 'all' | 'used'

/**
 * The ideas inbox tabs, in reading order.
 *
 * Data rather than a component, so the page header's tab rail and the filter
 * applied to the list read one list instead of two.
 */
export const IDEA_STATUS_TABS: ReadonlyArray<{ id: IdeaStatusFilter; label: string }> = [
  { id: 'new', label: 'New' },
  { id: 'all', label: 'All' },
  { id: 'used', label: 'Used' },
]
