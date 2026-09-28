'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { ActionLink } from '@/components/ui/action-link'
import { Card } from '@/components/ui/card'
import { WORKSPACE_LOCKED_DETAIL, WORKSPACE_PAUSED_HEADING } from '@/lib/billing/copy'
import { PLAN_AND_BILLING_PATH } from '@/utils/constants'

/**
 * What a paused workspace sees in place of every page but Settings: one card, one action.
 *
 * A wall rather than per-page refusals because the state is the workspace's, not the page's —
 * and the gates behind it already refuse every spend, publish and create, so this is the
 * explanation, not the enforcement. `paused` is `pausedNotice` (src/lib/billing/copy.ts): the
 * reason and the one action, or null while the workspace is not paused. Settings stays
 * reachable, since that is where a plan is chosen or a card updated. Client-side only for the
 * pathname check; it renders the children untouched otherwise.
 */
export function BillingWall({
  paused,
  children,
}: {
  paused: { text: string; cta: string } | null
  children: ReactNode
}) {
  const pathname = usePathname()
  if (!paused || pathname.startsWith('/settings')) return <>{children}</>

  return (
    <div className="mx-auto flex max-w-xl flex-col px-6 py-16">
      <Card className="flex flex-col gap-4 p-6">
        <h1 className="text-title font-semibold text-ink">{WORKSPACE_PAUSED_HEADING}</h1>
        <p className="text-body text-text2">{paused.text}</p>
        <p className="text-caption text-text3">{WORKSPACE_LOCKED_DETAIL}</p>
        <div>
          <ActionLink href={PLAN_AND_BILLING_PATH}>{paused.cta}</ActionLink>
        </div>
      </Card>
    </div>
  )
}
