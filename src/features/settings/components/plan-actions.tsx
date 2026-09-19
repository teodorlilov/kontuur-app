'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { openBillingPortal, startCheckout } from '@/features/settings/actions/billing-actions'
import { PlanEndControl } from '@/features/settings/components/plan-end-control'
import type { ActionResult } from '@/lib/actions/types'
import type { EntitlementState } from '@/lib/billing/entitlement'
import type { PlanId } from '@/lib/billing/plans'
import { clearQueryParams } from '@/utils/url'

export type BillingReturn = 'success' | 'cancelled'

interface PlanActionsProps {
  state: EntitlementState
  plan: PlanId
  /** What choosing the plan bills, worded by copy.ts on the server: "€19.00 a month per client · 3 clients today". */
  summary: string
  /** The `billing` query param Checkout sent the admin back with, read once by the server page. */
  billingReturn: BillingReturn | null
  /** Whether a paid plan is already set to end (`Entitlement.endsOn`) — picks Cancel plan or Keep plan. */
  ending: boolean
  /** What cancelling means, worded by copy.ts (`cancelPlanConsequence`). */
  cancelConsequence: string
}

const POLL_EVERY_MS = 2_000
const POLL_FOR_MS = 10_000

/**
 * The plan panel's actions: "Choose plan" while the workspace does not pay (trial, grace, or
 * paused — a re-subscription is a fresh Checkout); "Manage billing" (card, address, tax ID in
 * Stripe's portal) and the plan's own end (`PlanEndControl` — cancelling never leaves the app)
 * while it does; nothing on a house workspace. The Stripe buttons call their server action and
 * follow the URL it hands back.
 *
 * The return flag is captured once, because clearing it from the address bar makes
 * `useSearchParams` re-read at once and every `router.refresh()` re-renders the page without it.
 * After a successful Checkout the page is refreshed every two seconds for ten, until the
 * webhook's row shows the plan active — the settings page reads the row uncached.
 */
export function PlanActions({
  state,
  plan,
  summary,
  billingReturn,
  ending,
  cancelConsequence,
}: PlanActionsProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [returned] = useState(billingReturn)
  const paid = plan === 'pro' && (state === 'active' || state === 'past_due')

  useEffect(() => {
    if (!returned) return
    clearQueryParams(['billing'])
    if (returned === 'cancelled') toast('Checkout was cancelled — nothing was charged.')
    else toast.success('Payment received — your plan is being activated.')
  }, [returned])

  useEffect(() => {
    if (returned !== 'success' || paid) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const deadline = Date.now() + POLL_FOR_MS
    const schedule = () => {
      timer = setTimeout(() => {
        if (!active || Date.now() > deadline) return
        router.refresh()
        schedule()
      }, POLL_EVERY_MS)
    }
    schedule()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [returned, paid, router])

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

  if (plan === 'house') return null

  if (paid) {
    return (
      <div className="flex items-center justify-end gap-2 pt-4">
        <PlanEndControl ending={ending} consequence={cancelConsequence} />
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={() => void follow(openBillingPortal)}
        >
          Manage billing
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-caption text-text2">{summary}</p>
      <Button loading={busy} onClick={() => void follow(startCheckout)}>
        Choose plan
      </Button>
    </div>
  )
}
