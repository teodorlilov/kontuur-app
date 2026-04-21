'use client'

import { useState, useMemo, useCallback } from 'react'
import { toast } from '@/components/ui/toast'
import { updatePost } from '@/lib/actions/post-actions'
import type { CalendarPost } from '@/types/api'

export function useCalendar(initialPosts: CalendarPost[]) {
  const [posts, setPosts] = useState(initialPosts)
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const unscheduledPosts = useMemo(
    () => posts.filter((p) => p.status === 'approved' && !p.scheduled_at),
    [posts]
  )

  const scheduledPosts = useMemo(
    () => posts.filter((p) => p.status === 'scheduled' && p.scheduled_at),
    [posts]
  )

  const selectedPost = useMemo(
    () => posts.find((p) => p.id === selectedPostId) ?? null,
    [posts, selectedPostId]
  )

  const selectPost = useCallback((postId: string) => {
    setSelectedPostId(postId)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedPostId(null)
  }, [])

  async function schedulePost(
    postId: string,
    scheduledAt: string,
    platform?: string,
    contentUpdates?: { caption?: string; slides_json?: unknown }
  ) {
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
  }

  /** Save content edits (caption/slides) without changing schedule */
  async function savePostContent(
    postId: string,
    updates: { caption?: string; slides_json?: unknown }
  ) {
    setSaving(true)
    try {
      const result = await updatePost(postId, updates)
      if (!result.ok) {
        toast.error('Failed to save changes')
        return
      }
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                ...(updates.caption !== undefined && { caption: updates.caption }),
                ...(updates.slides_json !== undefined && {
                  slides_json: updates.slides_json as CalendarPost['slides_json'],
                }),
              }
            : p
        )
      )
      toast.success('Post updated')
    } catch {
      toast.error('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  async function unschedulePost(postId: string) {
    setSaving(true)
    try {
      const result = await updatePost(postId, { status: 'approved', scheduled_at: null })

      if (!result.ok) {
        toast.error('Failed to unschedule post')
        return
      }

      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, status: 'approved', scheduled_at: null } : p))
      )
      toast.success('Post moved to unscheduled')
    } catch {
      toast.error('Failed to unschedule post')
    } finally {
      setSaving(false)
    }
  }

  function handleDrop(postId: string, dateString: string) {
    const scheduledAt = new Date(`${dateString}T12:00:00`).toISOString()
    void schedulePost(postId, scheduledAt)
  }

  return {
    posts,
    unscheduledPosts,
    scheduledPosts,
    selectedPost,
    selectedPostId,
    selectPost,
    clearSelection,
    schedulePost,
    unschedulePost,
    savePostContent,
    handleDrop,
    saving,
  }
}
