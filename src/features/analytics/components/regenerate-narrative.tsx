'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { regenerateReport } from '../actions/report-actions'
import type { AnalyticsPeriod } from '../lib/period'

/**
 * The full on-demand regeneration: pulls the selected period's data from
 * Instagram again (both windows), rewrites the summary, and moves an exported
 * report's stored numbers and wording forward if this exact period has one.
 */
export function RegenerateNarrative({
  clientId,
  period,
}: {
  clientId: string
  period: AnalyticsPeriod
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <button
      type="button"
      disabled={pending}
      title="Pull this period's data from Instagram again and rewrite the summary"
      onClick={() =>
        startTransition(async () => {
          const result = await regenerateReport({
            clientId,
            preset: period.preset,
            start: period.start,
            end: period.end,
          })
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          if (result.data.note) {
            toast.warning(result.data.note)
          } else if (result.data.rateLimited) {
            toast.warning(
              'Instagram rate-limited the refresh — it filled what it allowed; regenerate again later for older days.'
            )
          } else {
            toast.success('Report refreshed from Instagram')
          }
          router.refresh()
        })
      }
      className="print-hide text-micro font-medium text-forest transition-colors hover:underline disabled:opacity-60"
    >
      {pending ? 'Refreshing from Instagram…' : 'Regenerate'}
    </button>
  )
}
