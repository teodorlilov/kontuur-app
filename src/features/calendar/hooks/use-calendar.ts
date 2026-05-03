'use client'

import { useState, useMemo, useCallback } from 'react'
import { toast } from '@/components/ui/toast'
import { updatePost, resolveChangeRequest } from '@/lib/actions/post-actions'
import type { CalendarPost } from '@/types/api'

const CLEARED_APPROVAL = {
  approval_status: null,
  approval_client_note: null,
  approval_responded_at: null,
} as const

export function useCalendar(initialPosts: CalendarPost[]) {
  const [posts, setPosts] = useState(initialPosts)
  const [saving, setSaving] = useState(false)

  const unscheduledPosts = useMemo(
    () => posts.filter((p) => p.status === 'approved' && !p.scheduled_at),
    [posts]
  )

  const scheduledPosts = useMemo(
    () => posts.filter((p) =>
      ['scheduled', 'publishing', 'published', 'failed'].includes(p.status) && p.scheduled_at
    ),
    [posts]
  )

  const schedulePost = useCallback(async (
    postId: string,
    scheduledAt: string,
    platform?: string,
    contentUpdates?: { caption?: string; slides_json?: unknown }
  ) => {
    setSaving(true)
    try {
      const result = await updatePost(postId, {
        status: 'scheduled',
        scheduled_at: scheduledAt,
        ...(platform ? { platform } : {}),
        ...(contentUpdates?.caption !== undefined ? { caption: contentUpdates.caption } : {}),
        ...(contentUpdates?.slides_json !== undefined
          ? { slides_json: contentUpdates.slides_json }
          : {}),
      })

      if (!result.ok) {
        toast.error('Failed to schedule post')
        return
      }

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                status: 'scheduled',
                scheduled_at: scheduledAt,
                platform: platform ?? p.platform,
                ...(contentUpdates?.caption !== undefined && { caption: contentUpdates.caption }),
                ...(contentUpdates?.slides_json !== undefined && {
                  slides_json: contentUpdates.slides_json as CalendarPost['slides_json'],
                }),
              }
            : p
        )
      )
      toast.success('Post scheduled')
    } catch {
      toast.error('Failed to schedule post')
    } finally {
      setSaving(false)
    }
  }, [])

  const unschedulePost = useCallback(async (postId: string) => {
    setSaving(true)
    try {
      const result = await updatePost(postId, { status: 'approved', scheduled_at: null })

      if (!result.ok) {
        toast.error('Failed to unschedule post')
        return
      }

      const post = posts.find((p) => p.id === postId)
      if (post?.approval_status === 'changes_requested') {
        void resolveChangeRequest(postId)
      }

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                status: 'approved',
                scheduled_at: null,
                ...(p.approval_status === 'changes_requested' ? CLEARED_APPROVAL : {}),
              }
            : p
        )
      )
      toast.success('Post moved to unscheduled')
    } catch {
      toast.error('Failed to unschedule post')
    } finally {
      setSaving(false)
    }
  }, [posts])

  const handleDrop = useCallback((postId: string, dateString: string) => {
    const scheduledAt = new Date(`${dateString}T12:00:00`).toISOString()
    void schedulePost(postId, scheduledAt)
  }, [schedulePost])

  /** Save caption/slides without changing schedule state. */
  const updatePostContent = useCallback(async (
    postId: string,
    contentUpdates: { caption?: string; slides_json?: unknown }
  ): Promise<boolean> => {
    setSaving(true)
    try {
      const result = await updatePost(postId, contentUpdates)
      if (!result.ok) {
        toast.error('Failed to save changes')
        return false
      }

      const post = posts.find((p) => p.id === postId)
      if (post?.approval_status === 'changes_requested') {
        void resolveChangeRequest(postId)
      }

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                ...(contentUpdates.caption !== undefined && { caption: contentUpdates.caption }),
                ...(contentUpdates.slides_json !== undefined && {
                  // Supabase REST returns untyped JSON — slides_json matches CarouselSlide[] by schema
                  slides_json: contentUpdates.slides_json as CalendarPost['slides_json'],
                }),
                ...CLEARED_APPROVAL,
              }
            : p
        )
      )
      toast.success('Changes saved')
      return true
    } catch {
      toast.error('Failed to save changes')
      return false
    } finally {
      setSaving(false)
    }
  }, [posts])

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
    handleDrop,
    markPostPublished,
    saving,
  }
}
