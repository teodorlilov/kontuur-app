'use client'

import { useState, useMemo } from 'react'
import { toast } from '@/components/ui/toast'
import { requestApprovalEmail, requestApprovalLink } from '@/lib/approval/request-approval'
import { getMondayISO } from '@/utils/date-helpers'
import { postsInWeek } from '@/features/calendar/lib/week-model'
import { pluralise } from '@/utils/format'
import type { CalendarPost } from '@/types/api'
import type { BestTimePlatform } from '@/lib/suggested-times/schemas'

export interface ClientEntry {
  id: string
  name: string
  contact_email: string | null
  /** The agency's weekly target for this client. 0 means no cadence has been set. */
  posts_per_week: number
  /**
   * Times this client might post, suggested from `best_time_json` — a model guess off
   * four profile fields, not Meta data. Null when there is nothing usable stored.
   */
  best_times: BestTimePlatform[] | null
}

interface UseApprovalArgs {
  clients: ClientEntry[]
  filteredScheduled: CalendarPost[]
  allPosts: CalendarPost[]
  /** Monday of the week currently on screen, 'YYYY-MM-DD'. */
  weekStartISO: string
  /** The agency zone. Both the membership filter and the server's query resolve in it. */
  timeZone: string
}

/** Manages approval state: week scoping, copy-link, email, and per-post approval. */
export function useApproval({
  clients,
  filteredScheduled,
  allPosts,
  weekStartISO,
  timeZone,
}: UseApprovalArgs) {
  const [copyLinkSending, setCopyLinkSending] = useState(false)
  const [copyLinkPicker, setCopyLinkPicker] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailPicker, setEmailPicker] = useState(false)
  const [approvalSending, setApprovalSending] = useState(false)

  // The week on screen, not the wall-clock week. These buttons used to call
  // getMondayISO() with no arguments, so navigating to September and clicking Email
  // sent August — silently, with nothing on screen to say so.
  const currentWeekStart = weekStartISO

  // `postsInWeek`, not a hand-rolled +6 days and setHours(23,59,59,999): that end was
  // computed in the browser's zone while the grid labelled the agency's, and it was
  // inclusive where the server's query is half-open. Both halves now read the same
  // helper, so the button and the batch cannot disagree about which posts they mean —
  // and it compares instants rather than the two spellings of one.
  const currentWeekScheduled = useMemo(
    () => postsInWeek(filteredScheduled, currentWeekStart, timeZone),
    [filteredScheduled, currentWeekStart, timeZone]
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
      const data = await requestApprovalLink({ clientId, weekStart: currentWeekStart })
      await navigator.clipboard.writeText(data.url)
      toast.success(`Approval link copied! (${pluralise(data.postCount, 'post')})`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate approval link')
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
      const data = await requestApprovalEmail({ clientId, weekStart: currentWeekStart })
      toast.success(`Approval email sent! (${pluralise(data.postCount, 'post')})`)
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
      const weekStart = getMondayISO(new Date(post.scheduled_at), timeZone)
      const data = await requestApprovalEmail({ clientId: post.client_id, weekStart })
      toast.success(`Approval email sent! (${pluralise(data.postCount, 'post')})`)
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
