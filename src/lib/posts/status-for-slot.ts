import type { PostStatus } from '@/lib/validation'

/**
 * The status a post takes from whether it has a calendar slot.
 *
 * A post with an instant is `scheduled` — the publish cron's due query only ever looks at
 * `scheduled`/`publishing` rows with a `scheduled_at`. A post without one is `approved`: signed
 * off, waiting in the calendar's unscheduled tray for someone to drop it on a slot.
 *
 * Written out in three places before this: the wizard's approve (client-side), the create route
 * (as a nested ternary that also handles `pending_review`), and `schedulePosts` — twice. The
 * client-side copy is the one that mattered: it meant the browser had to know the status
 * vocabulary to build a create payload, so a change to that vocabulary had to be made in a place
 * that ships to users.
 */
export function statusForSlot(scheduledAt: string | null | undefined): PostStatus {
  return scheduledAt ? 'scheduled' : 'approved'
}
