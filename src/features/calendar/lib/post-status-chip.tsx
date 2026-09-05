import { PILL_TONES, type PillTone } from '@/components/ui/status-pill'
import { cn } from '@/utils/cn'
import type { PostDisplayState } from '@/lib/posts/publish-state'

/**
 * What a post's status looks like and what it is called.
 *
 * DESIGN.md § Chips/Badges fixes these pairs in prose — published = Wash on Deep Pine,
 * scheduled = Marker on Pine Deep, pending = Amber Bg on Amber, draft = Sunken on Ink
 * Secondary, error = Clay Bg on Clay — and until now nothing in the codebase implemented
 * them. Seven surfaces each derived their own, so the same status wore different colours
 * on the calendar, the dashboard and the review queue.
 *
 * Resolved onto `PILL_TONES` rather than restating class strings, so this stays one
 * indirection away from the tone vocabulary instead of becoming an eighth definition.
 *
 * Feature-owned: both consumers are calendar surfaces — the lane's `post-card` and the detail
 * `schedule-card`, which stopped hand-rolling its own labels. It moves to `components/posts/`
 * when a surface OUTSIDE this feature adopts it.
 */
export const POST_STATUS_CHIP: Record<PostDisplayState, { tone: PillTone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  pending_review: { tone: 'warn', label: 'In review' },
  approved: { tone: 'ok', label: 'Approved' },
  scheduled: { tone: 'marker', label: 'Scheduled' },
  /** In flight. Reads as proceeding, not as a problem — the label carries the motion. */
  publishing: { tone: 'ok', label: 'Publishing' },
  published: { tone: 'ok', label: 'Published' },
  /**
   * Live on one network, not on another. Its own chip because collapsing it either way
   * lies: 'Published' hides a destination that needs attention, 'Failed' denies media that
   * is already public.
   */
  partly: { tone: 'warn', label: 'Partly published' },
  failed: { tone: 'bad', label: 'Failed' },
}

/**
 * A post's status as a chip.
 *
 * Its own geometry rather than `StatusPill`'s: a lane chip sits at Micro on a card
 * measured in single pixels, where that component's 23px pill and full-round radius
 * would dominate the card it annotates. The *tones* are shared, which is the part that
 * must not drift.
 */
export function PostStatusChip({
  status,
  className,
}: {
  status: PostDisplayState
  className?: string
}) {
  const { tone, label } = POST_STATUS_CHIP[status]
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center rounded-chip px-1.5 py-px text-micro font-medium',
        PILL_TONES[tone],
        className
      )}
    >
      {label}
    </span>
  )
}
