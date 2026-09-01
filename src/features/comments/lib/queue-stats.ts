import type { CommentGroup, CommentStatus } from '@/types/api'
import { parseTimestamp } from '@/utils/format'

/**
 * The numbers the header and the rail state.
 *
 * Every one is counted from rows already loaded — none is an estimate, and none
 * comes from a source that could disagree with the list underneath it. That is the
 * point: a header saying "7 need a reply" above a list of six is the failure this
 * shape exists to prevent, and the reason the tab counts come from here too.
 */
export interface QueueStats {
  needsReply: number
  answered: number
  hidden: number
  /** How long the oldest unanswered comment has been waiting, in ms. Null when none is. */
  oldestWaitingMs: number | null
  /** Median gap between a question and our answer, in ms. Null until something is answered. */
  medianReplyMs: number | null
}

const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

export function computeQueueStats(groups: readonly CommentGroup[], now: Date): QueueStats {
  const counts: Record<CommentStatus, number> = { needs_reply: 0, answered: 0, hidden: 0 }
  let oldestWaitingMs: number | null = null
  const replyGaps: number[] = []

  for (const group of groups) {
    for (const comment of group.comments) {
      counts[comment.status]++

      if (comment.status === 'needs_reply' && comment.commentedAt) {
        const waited = now.getTime() - parseTimestamp(comment.commentedAt).getTime()
        if (oldestWaitingMs === null || waited > oldestWaitingMs) oldestWaitingMs = waited
      }

      if (comment.status === 'answered' && comment.commentedAt) {
        const gap = firstReplyGap(comment.commentedAt, comment.replies)
        if (gap !== null) replyGaps.push(gap)
      }
    }
  }

  return {
    needsReply: counts.needs_reply,
    answered: counts.answered,
    hidden: counts.hidden,
    oldestWaitingMs,
    medianReplyMs: median(replyGaps),
  }
}

/**
 * How long the FIRST of our replies took.
 *
 * First, not last: a thread we came back to twice was still answered once, and
 * taking the last reply would punish a conversation for continuing.
 */
function firstReplyGap(
  askedAt: string,
  replies: ReadonlyArray<{ fromUs: boolean; commentedAt: string | null }>
): number | null {
  const asked = parseTimestamp(askedAt).getTime()
  const times = replies
    .filter((reply) => reply.fromUs && reply.commentedAt)
    .map((reply) => parseTimestamp(reply.commentedAt!).getTime())
    .filter((at) => at >= asked)
  if (times.length === 0) return null
  return Math.min(...times) - asked
}

/**
 * Median rather than mean, because one comment answered a fortnight late drags an
 * average somewhere no individual reply ever was.
 */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!
}

/**
 * A duration at the coarseness someone actually reasons about. "3h", not "3h 12m":
 * the number is there to answer "is this getting away from us", and a second unit
 * adds precision nobody acts on.
 */
export function formatDuration(ms: number): string {
  if (ms < MS_PER_HOUR) return `${Math.max(1, Math.round(ms / 60_000))}m`
  if (ms < MS_PER_DAY) return `${Math.round(ms / MS_PER_HOUR)}h`
  const days = Math.round(ms / MS_PER_DAY)
  return `${days} day${days === 1 ? '' : 's'}`
}
