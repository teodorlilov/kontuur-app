import { pluralise } from '@/utils/format'

/** What a client delete destroys, in the numbers the settings page has already queried. */
export interface ClientDeletionCounts {
  publishedCount: number
  pendingCount: number
  scheduledCount: number
  sourceCount: number
  connectionCount: number
  ideaCount: number
}

/**
 * The concrete list of what deleting a client takes with it, for the confirm dialog.
 *
 * Zero-count groups are dropped rather than rendered as "0 sources": a list of things the
 * client does not have buries the ones it does, and the point of the dialog is that the reader
 * sees what they are about to lose.
 *
 * Deliberately not a total. `fetchClientPostStats` returns four status buckets, and summing
 * them would silently omit `draft` and `failed` — a number that is wrong in a confirm dialog
 * for an irreversible action is worse than no number. The caller's copy carries the remainder
 * in prose instead.
 */
export function buildDeletionSummary(counts: ClientDeletionCounts): string[] {
  const parts: string[] = []
  if (counts.publishedCount > 0) parts.push(`${pluralise(counts.publishedCount, 'published post')}`)
  if (counts.pendingCount > 0)
    parts.push(`${pluralise(counts.pendingCount, 'post')} awaiting review`)
  if (counts.scheduledCount > 0) parts.push(`${pluralise(counts.scheduledCount, 'scheduled post')}`)
  if (counts.sourceCount > 0) parts.push(pluralise(counts.sourceCount, 'source'))
  if (counts.connectionCount > 0) {
    parts.push(`${pluralise(counts.connectionCount, 'connected account')}`)
  }
  if (counts.ideaCount > 0) parts.push(`${pluralise(counts.ideaCount, 'client idea')}`)
  return parts
}
