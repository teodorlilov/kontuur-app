'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { toast } from '@/components/ui/toast'
import { updatePost, resolveChangeRequest } from '@/lib/actions/post-actions'
import { rearmFailedPost } from '@/features/calendar/actions/post-recovery'
import { reconcilePosts } from '@/features/calendar/lib/reconcile-posts'
import { moveScheduledToDay, shiftScheduledByDays } from '@/features/calendar/lib/move-post'
import { upsertImageAtPosition } from '@/lib/posts/image-list'
import type { ActionResult } from '@/lib/actions/types'
import type { CalendarPost, PostImage } from '@/types/api'
import type { PostStatus } from '@/lib/validation'

/** Where a moved post came from and went, so the caller can offer to put it back. */
type MoveResult = { from: string; to: string } | null

const CLEARED_APPROVAL = {
  approval_status: null,
  approval_client_note: null,
  approval_responded_at: null,
} as const

/** Statuses that occupy a calendar slot. Typed `readonly string[]` rather than the
 *  narrowed literal union so `.includes()` still accepts a plain status string; the
 *  `satisfies` is what checks the members against the vocabulary. */
const ON_CALENDAR_STATUSES: readonly string[] = [
  'scheduled',
  'publishing',
  'published',
  'failed',
] satisfies readonly PostStatus[]

export function useCalendar(initialPosts: CalendarPost[], timeZone: string) {
  const [posts, setPosts] = useState(initialPosts)
  /**
   * Which posts have a write in flight, not whether *any* does.
   *
   * The shared boolean this replaces put every card in the grid into a loading state
   * because one of them was saving — and on a week holding twelve posts, scheduling one
   * disabled the other eleven.
   */
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set())

  /**
   * The current posts, readable from a callback that outlives the render that made it.
   *
   * Every mutation below used to close over `posts` directly, which meant two things.
   * Each one changed identity on every state change, so the memoised grid re-rendered
   * whenever any post did. And worse, a callback held past its render read a stale list:
   * the Undo offered after a move ran `posts.find(...)` against the array from *before*
   * the move, found the post at its original time, and computed the reversal from there —
   * so a keyboard nudge undone landed a day earlier than it started, and a drag undone
   * resolved to the position it was already at and silently did nothing.
   *
   * A ref makes "the latest posts" a stable reference, so the callbacks are stable and
   * always read the current list.
   */
  const postsRef = useRef(posts)
  useEffect(() => {
    postsRef.current = posts
  }, [posts])

  const unscheduledPosts = useMemo(
    () => posts.filter((p) => p.status === 'approved' && !p.scheduled_at),
    [posts]
  )

  const scheduledPosts = useMemo(
    () => posts.filter((p) => ON_CALENDAR_STATUSES.includes(p.status) && p.scheduled_at),
    [posts]
  )

  const setPending = useCallback((postId: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (pending) next.add(postId)
      else next.delete(postId)
      return next
    })
  }, [])

  /**
   * One optimistic post mutation: call the action, patch local state, toast either way.
   *
   * The three mutations below were the same twenty lines three times — a saving flag,
   * the action call, an `!ok` toast-and-bail, a `setPosts` map keyed on the same id, a
   * success toast, a catch that repeats the failure toast, and a `finally` that clears
   * the flag. Only the action, the patch and the two strings ever differed.
   *
   * It takes the call itself rather than a field payload, so `rearmFailedPost` — a
   * different action entirely — reuses this instead of restating the dance. That was
   * the point of collapsing them: the per-post pending state below became one edit
   * here rather than four, with one of them forgotten.
   */
  const runPostMutation = useCallback(
    async (opts: {
      postId: string
      run: () => Promise<ActionResult>
      patch: (post: CalendarPost) => CalendarPost
      /** Omitted when the caller raises its own — a move offers Undo, not a sentence. */
      successMessage?: string
      failureMessage: string
      /** Answer an outstanding change request, when this mutation is the answer. */
      resolvesChangeRequest?: boolean
    }): Promise<boolean> => {
      setPending(opts.postId, true)
      try {
        const result = await opts.run()
        if (!result.ok) {
          // The action's own message when it has one — "This post is no longer failed"
          // says something the caller's generic string cannot.
          toast.error(result.error || opts.failureMessage)
          return false
        }

        if (opts.resolvesChangeRequest) {
          const post = postsRef.current.find((p) => p.id === opts.postId)
          if (post?.approval_status === 'changes_requested') {
            void resolveChangeRequest(opts.postId)
          }
        }

        setPosts((prev) => prev.map((p) => (p.id === opts.postId ? opts.patch(p) : p)))
        if (opts.successMessage) toast.success(opts.successMessage)
        return true
      } catch {
        toast.error(opts.failureMessage)
        return false
      } finally {
        setPending(opts.postId, false)
      }
    },
    [setPending]
  )

  const schedulePost = useCallback(
    async (
      postId: string,
      scheduledAt: string,
      platform?: string,
      contentUpdates?: { caption?: string; slides_json?: unknown }
    ) => {
      await runPostMutation({
        postId,
        run: () =>
          updatePost(postId, {
            status: 'scheduled',
            scheduled_at: scheduledAt,
            ...(platform ? { platform } : {}),
            ...(contentUpdates?.caption !== undefined ? { caption: contentUpdates.caption } : {}),
            ...(contentUpdates?.slides_json !== undefined
              ? { slides_json: contentUpdates.slides_json }
              : {}),
          }),
        patch: (p) => ({
          ...p,
          status: 'scheduled',
          scheduled_at: scheduledAt,
          platform: platform ?? p.platform,
          ...(contentUpdates?.caption !== undefined && { caption: contentUpdates.caption }),
          ...(contentUpdates?.slides_json !== undefined && {
            slides_json: contentUpdates.slides_json as CalendarPost['slides_json'],
          }),
        }),
        successMessage: 'Post scheduled',
        failureMessage: 'Failed to schedule post',
      })
    },
    [runPostMutation]
  )

  const unschedulePost = useCallback(
    async (postId: string) => {
      await runPostMutation({
        postId,
        run: () => updatePost(postId, { status: 'approved', scheduled_at: null }),
        patch: (p) => ({
          ...p,
          status: 'approved',
          scheduled_at: null,
          ...(p.approval_status === 'changes_requested' ? CLEARED_APPROVAL : {}),
        }),
        successMessage: 'Post moved to unscheduled',
        failureMessage: 'Failed to unschedule post',
        resolvesChangeRequest: true,
      })
    },
    [runPostMutation]
  )

  /** Save caption/slides without changing schedule state. */
  const updatePostContent = useCallback(
    async (
      postId: string,
      contentUpdates: { caption?: string; slides_json?: unknown }
    ): Promise<boolean> =>
      runPostMutation({
        postId,
        run: () => updatePost(postId, contentUpdates),
        patch: (p) => ({
          ...p,
          ...(contentUpdates.caption !== undefined && { caption: contentUpdates.caption }),
          ...(contentUpdates.slides_json !== undefined && {
            // Supabase REST returns untyped JSON — slides_json matches CarouselSlide[] by schema
            slides_json: contentUpdates.slides_json as CalendarPost['slides_json'],
          }),
          // Only when there is a change request to answer, matching `unschedulePost` above
          // and — more to the point — matching what the server does. `resolveChangeRequest`
          // touches tokens in `changes_requested` and nothing else, so clearing this
          // unconditionally dropped the "Client approved" chip off an approved post the
          // moment its caption was edited, and the next focus refresh put it straight back.
          // A patch the server will contradict is not optimism, it is a flicker.
          ...(p.approval_status === 'changes_requested' ? CLEARED_APPROVAL : {}),
        }),
        successMessage: 'Changes saved',
        failureMessage: 'Failed to save changes',
        resolvesChangeRequest: true,
      }),
    [runPostMutation]
  )

  /**
   * Put a failed post back in the publish queue.
   *
   * Not `schedulePost`: `updatePost` refuses to move a post out of `'failed'`, and even
   * if it did, `publish_attempts` would still be at the scheduler's limit and the post
   * would sit there looking queued forever. See `rearmFailedPost` for both halves.
   */
  const rearmPost = useCallback(
    async (postId: string, scheduledAt: string): Promise<boolean> =>
      runPostMutation({
        postId,
        run: () => rearmFailedPost(postId, { scheduledAt }),
        patch: (p) => ({
          ...p,
          status: 'scheduled',
          scheduled_at: scheduledAt,
          publish_error: null,
          publish_attempts: 0,
        }),
        successMessage: 'Back in the publish queue',
        failureMessage: 'Could not retry this post',
      }),
    [runPostMutation]
  )

  /**
   * Move a scheduled post by whole days, keeping the time it was set for.
   *
   * The fast path beside the dialog's date field, which remains the discoverable one —
   * WCAG 2.5.7 requires that any drag affordance have a non-dragging equivalent, and
   * this is what a future drag handler will call rather than writing its own date maths.
   * The last time those were two paths, the drop handler hardcoded noon and silently
   * threw away the hour someone had chosen.
   *
   * Refuses anything not `scheduled`. A published post's `scheduled_at` is a record of
   * when it went out, and a failed one needs `rearmFailedPost` to clear its attempt
   * count — moving either would produce a row that lies about itself.
   *
   * Returns where it went, so the caller can offer to put it back.
   */
  const commitMove = useCallback(
    async (
      postId: string,
      /** Where it should land, given where it is now. */
      resolve: (from: string) => string
    ): Promise<MoveResult> => {
      const post = postsRef.current.find((p) => p.id === postId)
      if (!post?.scheduled_at) return null
      if (post.status !== 'scheduled') {
        toast.error(
          post.status === 'failed'
            ? 'Retry this post to put it back in the queue.'
            : 'Only scheduled posts can be moved.'
        )
        return null
      }

      const from = post.scheduled_at
      const to = resolve(from)
      // Dropping a card back on the day it came from is not a move. Writing it anyway
      // would spend a round-trip and raise an Undo window for nothing.
      if (to === from) return null

      const ok = await runPostMutation({
        postId,
        run: () => updatePost(postId, { scheduled_at: to }),
        patch: (p) => ({ ...p, scheduled_at: to }),
        failureMessage: 'Could not move this post',
      })

      // The patch is applied by `runPostMutation` only after the write succeeds, so a
      // failure needs no rollback — the card never left its day.
      return ok ? { from, to } : null
    },
    [runPostMutation]
  )

  /** Nudge it, as the keyboard does. */
  const movePostByDays = useCallback(
    (postId: string, days: number): Promise<MoveResult> =>
      commitMove(postId, (from) => shiftScheduledByDays(from, days, timeZone)),
    [commitMove, timeZone]
  )

  /** Drop it on a day, as the pointer does. Same guards, same write, same Undo. */
  const movePostToDay = useCallback(
    (postId: string, dayKey: string): Promise<MoveResult> =>
      commitMove(postId, (from) => moveScheduledToDay(from, dayKey, timeZone)),
    [commitMove, timeZone]
  )

  /**
   * Put a post back at an instant it already held. What Undo does.
   *
   * Takes the instant rather than re-deriving it. `commitMove` answers "where should this
   * land, given where it is now", which is the right question for a nudge or a drop and
   * the wrong one for a reversal: the caller is holding the exact `from` the move
   * returned, so recomputing it from state is a chance to get a different answer — and it
   * did. Undoing a nudge re-applied the shift to the *original* time instead of restoring
   * it, and undoing a drop resolved to a value equal to the one already stored, which
   * `commitMove` correctly declines to write, so nothing happened at all.
   */
  const restoreSchedule = useCallback(
    async (postId: string, instant: string): Promise<boolean> =>
      runPostMutation({
        postId,
        run: () => updatePost(postId, { scheduled_at: instant }),
        patch: (p) => ({ ...p, scheduled_at: instant }),
        failureMessage: 'Could not put this post back',
      }),
    [runPostMutation]
  )

  /** Remove a post from local state (called after successful deletion). */
  const removePost = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }, [])

  /**
   * Take a fresh server list, keeping the posts the user is still working on.
   *
   * The reconciliation itself lives in `lib/` and is tested there; this is the seam
   * where it meets state.
   */
  const adoptServerPosts = useCallback(
    (server: CalendarPost[], keepLocalIds: ReadonlySet<string>) => {
      setPosts((prev) => reconcilePosts(prev, server, keepLocalIds))
    },
    []
  )

  /** Merge one uploaded/generated image into a post's images. Functional update so concurrent
   *  completions (bulk visual generation) never clobber each other via stale snapshots. */
  const upsertPostImage = useCallback((postId: string, image: PostImage) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, images: upsertImageAtPosition(p.images, image) } : p
      )
    )
  }, [])

  /** Remove one image from a post's images in local state. */
  const removePostImage = useCallback((postId: string, imageId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, images: p.images.filter((img) => img.id !== imageId) } : p
      )
    )
  }, [])

  /** Mark a post as published in local state (called after successful manual publish). */
  const markPostPublished = useCallback((postId: string) => {
    const now = new Date().toISOString()
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, status: 'published', scheduled_at: p.scheduled_at ?? now } : p
      )
    )
    toast.success('Post published to Instagram')
  }, [])

  return {
    posts,
    unscheduledPosts,
    scheduledPosts,
    schedulePost,
    unschedulePost,
    updatePostContent,
    movePostByDays,
    movePostToDay,
    restoreSchedule,
    rearmPost,
    removePost,
    upsertPostImage,
    removePostImage,
    markPostPublished,
    adoptServerPosts,
    pendingIds,
  }
}
