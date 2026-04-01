'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import { formatScheduledAt } from '@/utils/date-helpers'

interface BatchPost {
  id: string
  client_name: string
  caption: string | null
  platform: string | null
}

interface Assignment {
  date: string
  time: string
}

export function useBatchSchedule(posts: BatchPost[], onComplete: () => void) {
  const [assignments, setAssignments] = useState<Map<string, Assignment>>(new Map())
  const [loading, setLoading] = useState(false)

  function setDate(postId: string, date: string) {
    setAssignments((prev) => {
      const next = new Map(prev)
      const existing = next.get(postId) ?? { date: '', time: '' }
      next.set(postId, { ...existing, date })
      return next
    })
  }

  function setTime(postId: string, time: string) {
    setAssignments((prev) => {
      const next = new Map(prev)
      const existing = next.get(postId) ?? { date: '', time: '' }
      next.set(postId, { ...existing, time })
      return next
    })
  }

  async function scheduleAll() {
    const toSchedule = posts.filter((p) => {
      const a = assignments.get(p.id)
      return a?.date
    })

    if (toSchedule.length === 0) {
      toast.error('Pick at least one date')
      return
    }

    setLoading(true)
    try {
      const results = await Promise.allSettled(
        toSchedule.map((p) => {
          const a = assignments.get(p.id)!
          return fetch(`/api/posts/${p.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'scheduled',
              scheduled_at: formatScheduledAt(a.date, a.time),
            }),
          })
        })
      )

      const succeeded = results.filter((r) => r.status === 'fulfilled' && (r.value as Response).ok).length
      toast.success(`Scheduled ${succeeded} of ${toSchedule.length} posts`)
      if (succeeded > 0) onComplete()
    } catch {
      toast.error('Failed to schedule posts')
    } finally {
      setLoading(false)
    }
  }

  return { assignments, setDate, setTime, scheduleAll, loading }
}
