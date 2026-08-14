'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import { batchSchedulePosts } from '@/lib/actions/post-actions'
import { formatScheduledAt } from '@/utils/date-helpers'

/** The post fields the batch-schedule modal renders and the hook writes. */
export interface BatchPost {
  id: string
  client_name: string
  caption: string | null
  platform: string | null
}

interface Assignment {
  date: string
  time: string
}

export function useBatchSchedule(
  posts: BatchPost[],
  onComplete: () => void,
  /** The agency zone. Each date/time pair is a wall clock in it, not in the browser's. */
  timeZone: string,
  initialAssignments?: Record<string, Assignment>
) {
  const [assignments, setAssignments] = useState<Map<string, Assignment>>(
    () => new Map(Object.entries(initialAssignments ?? {}))
  )
  const [loading, setLoading] = useState(false)

  /** Re-seed for a fresh opening — the modal stays mounted across batches. */
  function resetAssignments(initial?: Record<string, Assignment>) {
    setAssignments(new Map(Object.entries(initial ?? {})))
  }

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
      const items = toSchedule.map((p) => {
        const a = assignments.get(p.id)!
        return { postId: p.id, scheduledAt: formatScheduledAt(a.date, a.time, timeZone) }
      })

      const result = await batchSchedulePosts(items)

      if (result.ok) {
        toast.success(`Scheduled ${result.data.succeeded} of ${result.data.total} posts`)
        if (result.data.succeeded > 0) onComplete()
      } else {
        toast.error('Failed to schedule posts')
      }
    } catch {
      toast.error('Failed to schedule posts')
    } finally {
      setLoading(false)
    }
  }

  return { assignments, setDate, setTime, scheduleAll, resetAssignments, loading }
}
