import Link from 'next/link'
import { cn } from '@/utils/cn'
import { PLAN_AND_BILLING_PATH } from '@/utils/constants'

/**
 * The one-line strip above every dashboard page while the workspace's billing needs a person's
 * attention — a trial about to end, a trial in its grace days, a failed renewal. Amber is
 * attention, Clay is the state that already costs something (DESIGN.md, Muted Status). The
 * sentence itself comes from `shellNotice` (src/lib/billing/copy.ts); the layout passes it in so
 * this stays a plain server component with nothing to fetch. `relative z-[1]` lifts it above the
 * ContourField canvas the way `<main>` is lifted in src/app/(dashboard)/layout.tsx.
 */
export function BillingBanner({ tone, text }: { tone: 'warn' | 'bad'; text: string }) {
  return (
    <div
      role="status"
      className={cn(
        'relative z-[1] flex items-center justify-between gap-4 rounded-panel border px-4 py-2.5 text-caption',
        tone === 'bad'
          ? 'border-danger-line bg-danger-bg text-danger'
          : 'border-pending/20 bg-pending-bg text-pending'
      )}
    >
      <span>{text}</span>
      <Link
        href={PLAN_AND_BILLING_PATH}
        className="flex-none font-semibold underline underline-offset-2 hover:opacity-80"
      >
        Plan &amp; billing
      </Link>
    </div>
  )
}
