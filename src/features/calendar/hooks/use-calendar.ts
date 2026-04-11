'use client'

import { useState, useMemo, useCallback } from 'react'
import { toast } from '@/components/ui/toast'
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

  async function schedulePost(postId: string, scheduledAt: string, platform?: string) {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        status: 'scheduled',
        scheduled_at: scheduledAt,
      }
      if (platform) body.platform = platform

      const res = await fetch(`/api/posts/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
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

  async function unschedulePost(postId: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', scheduled_at: null }),
      })

      if (!res.ok) {
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
    handleDrop,
    saving,
  }
}
