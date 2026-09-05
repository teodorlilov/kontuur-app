'use client'

import { memo } from 'react'
import { cn } from '@/utils/cn'
import { isoToDateTimeFields } from '@/utils/date-helpers'
import { postTypeLabel } from '@/features/review/lib/queue-post'
import { LaneItem, type LaneGround } from './lane-item'
import { PostStatusChip, POST_STATUS_CHIP } from '@/features/calendar/lib/post-status-chip'
import type { PostStatus } from '@/lib/validation'
import type { CalendarPost } from '@/types/api'
import {
  firstFailureReason,
  postDisplayState,
  type PostDisplayState,
} from '@/lib/posts/publish-state'

/**
 * One scheduled post in a day lane.
 *
 * Shows `topic_summary` rather than `pillar`, which is what the month grid's pill showed:
 * a pillar names a category the post belongs to, so a day of three posts read as three
 * repetitions of the same word. The topic is the only field that distinguishes them.
 *
 * Status is carried by **form** before hue — a published card recedes into Wash with no
 * border, a failure takes a clay outline and states its reason in words — so the lane
 * survives a colour-blind reading and a greyscale print.
 *
 * Everything still in play wears its **client's** hue instead of Surface white. A lane
 * of white cards on a white column separates by 1.05:1 and reads as one pale block; the
 * identity tint gives each card an edge and, in a week holding six clients, answers
 * whose post it is before the monogram is read.
 */

/** State decides only whether identity gets to speak: a record and a failure outrank it. */
function groundFor(state: PostDisplayState): LaneGround {
  if (state === 'published' || state === 'partly') return 'wash'
  if (state === 'failed') return 'danger'
  return 'identity'
}
export const PostCard = memo(function PostCard({
  post,
  timeZone,
  tabIndex,
  onClick,
  onDragStateChange,
}: {
  post: CalendarPost
  timeZone: string
  /** The week grid's roving tabindex. Undefined in the agenda list, which is a document. */
  tabIndex?: number
  onClick: (postId: string) => void
  /** Told which post is in flight, so the lanes can show where it may land. */
  onDragStateChange?: (postId: string | null) => void
}) {
  const { time } = isoToDateTimeFields(post.scheduled_at!, timeZone)
  const status = postDisplayState(post.status as PostStatus, post.publications)
  const isPublished = status === 'published' || status === 'partly'
  const isFailed = status === 'failed'

  const title = post.topic_summary ?? post.caption ?? post.pillar ?? 'Untitled post'

  return (
    <LaneItem
      clientName={post.client_name}
      time={time}
      ground={groundFor(status)}
      postId={post.id}
      tabIndex={tabIndex}
      // Only a scheduled post can be dragged, for the same reason only a scheduled post
      // can be nudged: a published one's date is a record and a failed one needs its
      // attempt count cleared first.
      draggable={status === 'scheduled'}
      onDragStart={(event) => {
        // text/plain, not a custom type: Safari drops payloads on unregistered MIME
        // types, and this is one id, not a document.
        event.dataTransfer.setData('text/plain', post.id)
        event.dataTransfer.effectAllowed = 'move'
        onDragStateChange?.(post.id)
      }}
      onDragEnd={() => onDragStateChange?.(null)}
      onClick={() => onClick(post.id)}
      ariaLabel={
        `${post.client_name}, ${time}, ${POST_STATUS_CHIP[status].label}. ${title}` +
        // Announced on the card rather than hidden in a help panel: a shortcut nobody
        // is told about is a shortcut nobody has.
        (status === 'scheduled' ? '. Alt with left or right arrow moves it a day' : '')
      }
    >
      <span
        className={cn(
          'line-clamp-3 text-caption leading-snug',
          isPublished ? 'text-forest-deep' : 'text-ink'
        )}
      >
        {title}
      </span>
      {/* Why it failed, on the card itself. A lane of identical "Failed" chips says the
          week went wrong without saying whether it was one expired token or five posts
          with no images — the difference between one fix and five.
          Read off the destination that failed, since a post can fail on one network and
          be live on another. */}
      {isFailed && firstFailureReason(post.publications) && (
        <span className="line-clamp-2 text-micro text-danger">
          {firstFailureReason(post.publications)}
        </span>
      )}

      <span className="flex flex-wrap items-center gap-1">
        <PostStatusChip status={status} />
        {!isPublished && !isFailed && (
          // Surface, not Sunken: this chip only ever renders on the identity ground, and
          // a white chip reads as a distinct object there where a grey one muddies.
          <span className="rounded-chip bg-surface px-1.5 py-px text-micro font-medium text-text2">
            {postTypeLabel(post.post_type, post.slides_json)}
          </span>
        )}
      </span>
    </LaneItem>
  )
})
