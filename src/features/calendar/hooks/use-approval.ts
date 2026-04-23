'use client'

import { useState, useMemo } from 'react'
import { toast } from '@/components/ui/toast'
import { getMondayISO } from '@/utils/date-helpers'
import type { CalendarPost } from '@/types/api'

export interface ClientEntry {
  id: string
  name: string
  contact_email: string | null
}

interface UseApprovalArgs {
  clients: ClientEntry[]
  filteredScheduled: CalendarPost[]
  allPosts: CalendarPost[]
}

/** POST to the approval email API and return post count, or throw on failure. */
async function sendApprovalEmail(clientId: string, weekStart: string): Promise<{ postCount: number }> {
  const res = await fetch('/api/approval/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, weekStart }),
  })
  if (!res.ok) {
    const err = (await res.json()) as { error: string }
    throw new Error(err.error || 'Failed to send approval email')
  }
  return (await res.json()) as { postCount: number }
}

function formatPostCount(count: number): string {
  return `${count} post${count === 1 ? '' : 's'}`
}

/** Manages approval state: week scoping, copy-link, email, and per-post approval. */
export function useApproval({ clients, filteredScheduled, allPosts }: UseApprovalArgs) {
  const [copyLinkSending, setCopyLinkSending] = useState(false)
  const [copyLinkPicker, setCopyLinkPicker] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailPicker, setEmailPicker] = useState(false)
  const [approvalSending, setApprovalSending] = useState(false)

  const currentWeekStart = useMemo(() => getMondayISO(), [])
  const currentWeekEnd = useMemo(() => {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() + 6)
    d.setHours(23, 59, 59, 999)
    return d
  }, [currentWeekStart])

  const currentWeekScheduled = useMemo(
    () => {
      const start = new Date(currentWeekStart)
      return filteredScheduled.filter((p) => {
        const d = new Date(p.scheduled_at!)
        return d >= start && d <= currentWeekEnd
      })
    },
    [filteredScheduled, currentWeekStart, currentWeekEnd],
  )

  const currentWeekClients = useMemo(() => {
    const ids = new Set(currentWeekScheduled.map((p) => p.client_id))
    return clients.filter((c) => ids.has(c.id))
  }, [currentWeekScheduled, clients])

  const noPostsThisWeek = currentWeekClients.length === 0

  function hasClientEmail(clientId: string): boolean {
    return !!clients.find((c) => c.id === clientId)?.contact_email
  }

  async function handleCopyLink(clientId: string) {
    setCopyLinkSending(true)
    setCopyLinkPicker(false)
    try {
      const res = await fetch('/api/approval/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, weekStart: currentWeekStart }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error: string }
        toast.error(err.error || 'Failed to generate approval link')
        return
      }
      const data = (await res.json()) as { url: string; postCount: number }
      await navigator.clipboard.writeText(data.url)
      toast.success(`Approval link copied! (${formatPostCount(data.postCount)})`)
    } catch {
      toast.error('Failed to generate approval link')
    } finally {
      setCopyLinkSending(false)
    }
  }

  async function handleEmailClient(clientId: string) {
    if (!hasClientEmail(clientId)) {
      toast.error('No contact email configured for this client. Add one in Client Settings.')
      return
    }
    setEmailSending(true)
    setEmailPicker(false)
    try {
      const data = await sendApprovalEmail(clientId, currentWeekStart)
      toast.success(`Approval email sent! (${formatPostCount(data.postCount)})`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send approval email')
    } finally {
      setEmailSending(false)
    }
  }

  async function handleSendApproval(postId: string) {
    const post = allPosts.find((p) => p.id === postId)
    if (!post?.scheduled_at) return
    if (!hasClientEmail(post.client_id)) {
      toast.error('No contact email configured for this client. Add one in Client Settings.')
      return
    }
    setApprovalSending(true)
    try {
      const weekStart = getMondayISO(new Date(post.scheduled_at))
      const data = await sendApprovalEmail(post.client_id, weekStart)
      toast.success(`Approval email sent! (${formatPostCount(data.postCount)})`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send approval email')
    } finally {
      setApprovalSending(false)
    }
  }

  return {
    copyLinkSending,
    copyLinkPicker,
    setCopyLinkPicker,
    emailSending,
    emailPicker,
    setEmailPicker,
    approvalSending,
    currentWeekClients,
    noPostsThisWeek,
    handleCopyLink,
    handleEmailClient,
    handleSendApproval,
  }
}
