'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { regenerateReport } from '../actions/report-actions'
import type { AnalyticsPeriod } from '../lib/period'

/**
 * The on-demand re-roll: rewrites the period's summary from the current
 * numbers instead of waiting for tonight's sync — and moves an exported
 * report's wording forward if this exact period has one.
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
          router.refresh()
        })
      }
      className="print-hide text-micro font-medium text-forest transition-colors hover:underline disabled:opacity-60"
    >
      {pending ? 'Rewriting…' : 'Regenerate'}
    </button>
  )
}
