import { cache } from 'react'
import { countNewIdeas } from './ideas'

/**
 * Returns count of new (unread) client ideas for the sidebar badge.
 * - React cache(): deduplicates within a single SSR request
 */
export const getCachedNewIdeasCount = cache(async (agencyId: string): Promise<number> => {
  return countNewIdeas(agencyId)
})
