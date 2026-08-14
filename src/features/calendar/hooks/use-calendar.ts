'use client'

import { useState, useMemo, useCallback } from 'react'
import { toast } from '@/components/ui/toast'
import { updatePost, resolveChangeRequest } from '@/lib/actions/post-actions'
import { upsertImageAtPosition } from '@/features/publishing/lib/image-list'
import type { CalendarPost, PostImage } from '@/types/api'
import type { PostStatus } from '@/lib/validation'

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

export function useCalendar(initialPosts: CalendarPost[]) {
  const [posts, setPosts] = useState(initialPosts)
  const [saving, setSaving] = useState(false)

  const unscheduledPosts = useMemo(
    () => posts.filter((p) => p.status === 'approved' && !p.scheduled_at),
    [posts]
  )

  const scheduledPosts = useMemo(
    () => posts.filter((p) => ON_CALENDAR_STATUSES.includes(p.status) && p.scheduled_at),
    [posts]
  )

  /**
   * One optimistic post mutation: call the action, patch local state, toast either way.
   *
   * The three mutations below were the same twenty lines three times — `setSaving`, the
   * `updatePost` call, an `!ok` toast-and-bail, a `setPosts` map keyed on the same id, a
   * success toast, a catch that repeats the failure toast, and a `finally` that clears
   * `saving`. Only the fields, the patch and the two strings ever differed.
   *
   * Collapsing them now is also what makes the per-post pending state a one-function
   * change later, instead of the same edit made three times and one of them forgotten.
   */
  const runPostMutation = useCallback(
    async (opts: {
      postId: string
      fields: Parameters<typeof updatePost>[1]
      patch: (post: CalendarPost) => CalendarPost
      successMessage: string
      failureMessage: string
      /** Answer an outstanding change request, when this mutation is the answer. */
      resolvesChangeRequest?: boolean
    }): Promise<boolean> => {
      setSaving(true)
      try {
        const result = await updatePost(opts.postId, opts.fields)
        if (!result.ok) {
          toast.error(opts.failureMessage)
          return false
        }

        if (opts.resolvesChangeRequest) {
          const post = posts.find((p) => p.id === opts.postId)
          if (post?.approval_status === 'changes_requested') {
            void resolveChangeRequest(opts.postId)
          }
        }

        setPosts((prev) => prev.map((p) => (p.id === opts.postId ? opts.patch(p) : p)))
        toast.success(opts.successMessage)
        return true
      } catch {
        toast.error(opts.failureMessage)
        return false
      } finally {
        setSaving(false)
      }
    },
    [posts]
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
        fields: {
          status: 'scheduled',
          scheduled_at: scheduledAt,
          ...(platform ? { platform } : {}),
          ...(contentUpdates?.caption !== undefined ? { caption: contentUpdates.caption } : {}),
          ...(contentUpdates?.slides_json !== undefined
            ? { slides_json: contentUpdates.slides_json }
            : {}),
        },
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
        fields: { status: 'approved', scheduled_at: null },
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
        fields: contentUpdates,
        patch: (p) => ({
          ...p,
          ...(contentUpdates.caption !== undefined && { caption: contentUpdates.caption }),
          ...(contentUpdates.slides_json !== undefined && {
            // Supabase REST returns untyped JSON — slides_json matches CarouselSlide[] by schema
            slides_json: contentUpdates.slides_json as CalendarPost['slides_json'],
          }),
          ...CLEARED_APPROVAL,
        }),
        successMessage: 'Changes saved',
        failureMessage: 'Failed to save changes',
        resolvesChangeRequest: true,
      }),
    [runPostMutation]
  )

  /** Remove a post from local state (called after successful deletion). */
  const removePost = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }, [])

  /** Merge one uploaded/generated image into a post's images. Functional update so concurrent
   *  completions (bulk visual generation) never clobber each other via stale snapshots. */
  const upsertPostImage = useCallback((postId: string, image: PostImage) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, images: upsertImageAtPosition(p.images, image) } : p))
    )
  }, [])

  /** Remove one image from a post's images in local state. */
  const removePostImage = useCallback((postId: string, imageId: string) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, images: p.images.filter((img) => img.id !== imageId) } : p))
    )
  }, [])

  /** Mark a post as published in local state (called after successful manual publish). */
  const markPostPublished = useCallback((postId: string) => {
    const now = new Date().toISOString()
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, status: 'published', scheduled_at: p.scheduled_at ?? now }
          : p
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
    removePost,
    upsertPostImage,
    removePostImage,
    markPostPublished,
    saving,
  }
}
