'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircleIcon, ClockCircleIcon } from '@solar-icons/react/linear'
import { Icon } from '@/components/ui/icon'
import { StatusPill } from '@/components/ui/status-pill'
import { toast } from '@/components/ui/toast'
import { CHECKOUT_ARRIVAL, type PlanFact } from '@/lib/billing/copy'
import { cn } from '@/utils/cn'
import { clearQueryParams } from '@/utils/url'

export type BillingReturn = 'success' | 'cancelled'

interface CheckoutReturnProps {
  /** The `billing` query param Checkout sent the admin back with, read once by the server page. */
  billingReturn: BillingReturn | null
  /** Whether the row already says the plan is live (`isPaying`); the page re-reads it on every refresh. */
  paid: boolean
  /** The activated card's words, from copy.ts (`checkoutActivated`). */
  activated: { title: string; facts: PlanFact[]; text: string }
}

type Moment = 'activating' | 'active' | 'waiting'

const POLL_EVERY_MS = 3_000
const POLL_FOR_MS = 60_000
const LINGER_MS = 8_000
const FADE_MS = 500

/**
 * What the admin lands on when Checkout sends them back — under the tabs, in view before any
 * scrolling, with no button. Stripe shows no page of its own, and the row is written by the
 * webhook a few seconds later, so the card has three moments: the payment is confirmed and the
 * plan is being written; the plan is live, with the facts a person wants confirmed; or the
 * webhook is later than a minute and a refresh is the way. It leaves on its own: eight seconds
 * after the plan shows, and never on a later visit — the return flag is captured once and
 * cleared from the address bar, which is why it lives in state and not in the URL. A cancelled
 * Checkout gets a toast, since nothing changed. While the row still says trial the page is
 * refreshed every few seconds for a minute; the settings page reads the row uncached.
 */
export function CheckoutReturn({ billingReturn, paid, activated }: CheckoutReturnProps) {
  const router = useRouter()
  const [returned] = useState(billingReturn)
  const [exhausted, setExhausted] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!returned) return
    clearQueryParams(['billing'])
    if (returned === 'cancelled') toast('Checkout was cancelled — nothing was charged.')
  }, [returned])

  useEffect(() => {
    if (returned !== 'success' || paid || exhausted) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const deadline = Date.now() + POLL_FOR_MS
    const schedule = () => {
      timer = setTimeout(() => {
        if (!active) return
        if (Date.now() > deadline) {
          setExhausted(true)
          return
        }
        router.refresh()
        schedule()
      }, POLL_EVERY_MS)
    }
    schedule()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [returned, paid, exhausted, router])

  useEffect(() => {
    if (returned !== 'success' || !paid) return
    const leave = setTimeout(() => setLeaving(true), LINGER_MS)
    const hide = setTimeout(() => setGone(true), LINGER_MS + FADE_MS)
    return () => {
      clearTimeout(leave)
      clearTimeout(hide)
    }
  }, [returned, paid])

  if (returned !== 'success' || gone) return null

  const moment: Moment = paid ? 'active' : exhausted ? 'waiting' : 'activating'
  const words = moment === 'active' ? activated : CHECKOUT_ARRIVAL[moment]

  return (
    <section
      key={moment}
      role="status"
      aria-live="polite"
      className={cn(
        'flash-confirm mb-4 flex items-start gap-5 rounded-panel border border-ink/[0.05] bg-surface px-[22px] py-[18px]',
        'transition-opacity duration-500 ease-contour',
        leaving && 'opacity-0'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-9 flex-none place-items-center rounded-full',
          moment === 'waiting' ? 'bg-pending-bg text-pending' : 'bg-wash text-forest'
        )}
      >
        {moment === 'activating' && <span className="live-dot size-2.5 rounded-full bg-spring" />}
        {moment === 'active' && <Icon glyph={CheckCircleIcon} size="lg" />}
        {moment === 'waiting' && <Icon glyph={ClockCircleIcon} size="lg" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h2 className="text-title font-semibold text-ink">{words.title}</h2>
          <StatusPill tone={moment === 'active' ? 'ok' : 'warn'}>
            {moment === 'active' ? 'Active' : CHECKOUT_ARRIVAL[moment].pill}
          </StatusPill>
        </div>
        <p className="mt-1 text-body text-text2">{words.text}</p>
        {moment === 'active' && (
          <dl className="mt-2 flex flex-wrap gap-x-[18px] gap-y-1.5 text-body font-medium tabular-nums text-ink">
            {activated.facts.map((fact) => (
              <div key={fact.label} className="flex items-baseline gap-1.5">
                <dt className="text-caption font-normal text-text3">{fact.label}</dt>
                <dd className="m-0">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}
