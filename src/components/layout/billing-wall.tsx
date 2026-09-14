'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { ActionLink } from '@/components/ui/action-link'
import { Card } from '@/components/ui/card'
import { WORKSPACE_LOCKED, WORKSPACE_LOCKED_DETAIL } from '@/lib/billing/copy'
import { PLAN_AND_BILLING_PATH } from '@/utils/constants'

/**
 * What a paused workspace sees in place of every page but Settings: one card, one action.
 *
 * A wall rather than per-page refusals because the state is the workspace's, not the page's —
 * and the gates behind it already refuse every spend, publish and create, so this is the
 * explanation, not the enforcement. Settings stays reachable, since that is where a plan is
 * chosen. Client-side only for the pathname check; it renders the children untouched otherwise.
 */
export function BillingWall({ locked, children }: { locked: boolean; children: ReactNode }) {
  const pathname = usePathname()
  if (!locked || pathname.startsWith('/settings')) return <>{children}</>

  return (
    <div className="mx-auto flex max-w-xl flex-col px-6 py-16">
      <Card className="flex flex-col gap-4 p-6">
        <h1 className="text-title font-semibold text-ink">Workspace paused</h1>
        <p className="text-body text-text2">{WORKSPACE_LOCKED}</p>
        <p className="text-caption text-text3">{WORKSPACE_LOCKED_DETAIL}</p>
        <div>
          <ActionLink href={PLAN_AND_BILLING_PATH}>Choose a plan</ActionLink>
        </div>
      </Card>
    </div>
  )
}
