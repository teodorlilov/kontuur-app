'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import type { ActionResult } from '@/lib/actions/types'

/**
 * Call a server action that answers with a URL, and go there — Stripe's Checkout or its portal.
 * A refusal is one toast and the button comes back; a URL is a full navigation, so `busy` stays
 * true through it and the button cannot be pressed twice. Shared by the plan panel and the
 * danger zone's "Manage billing", so a Stripe hand-off is written once.
 */
export function useFollowUrl() {
  const [busy, setBusy] = useState(false)

  async function follow(action: () => Promise<ActionResult<{ url: string }>>) {
    setBusy(true)
    const result = await action()
    if (!result.ok) {
      toast.error(result.error)
      setBusy(false)
      return
    }
    window.location.assign(result.data.url)
  }

  return { busy, follow }
}
