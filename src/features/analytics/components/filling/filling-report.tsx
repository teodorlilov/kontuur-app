import type { ReactNode } from 'react'
import { AutoFill } from './auto-fill'
import { FillingDocument } from './filling-document'
import type { AnalyticsPeriod } from '../../lib/compute/period'

/**
 * The whole-document state while a window is still pulling from Meta: the report's silhouette
 * instead of numbers that are about to change.
 *
 * One component because it was two, in two different layers — Instagram decided and rendered it
 * inside its view, Facebook decided and rendered it in the page — and the copies had already
 * drifted. The Facebook branch carried no masthead and no sync line, so a filling Facebook
 * window showed a bare skeleton: no client name, no period range, no "last synced" footer, and
 * nothing to print. Both views now hold their own decision and hand the chrome here, so the two
 * cannot diverge again.
 */
export function FillingReport({
  masthead,
  syncLine,
  clientId,
  period,
  unfilledDays,
  network,
  networkLabel,
}: {
  masthead: ReactNode
  syncLine: ReactNode
  clientId: string
  period: AnalyticsPeriod
  unfilledDays: number
  network?: 'instagram' | 'facebook'
  networkLabel?: string
}) {
  return (
    <div id="analytics-print-area">
      <AutoFill
        clientId={clientId}
        period={period}
        unfilledDays={unfilledDays}
        network={network}
        networkLabel={networkLabel}
      />
      {masthead}
      <FillingDocument
        unfilledDays={unfilledDays}
        clientId={clientId}
        period={period}
        network={network}
        networkLabel={networkLabel}
      />
      {syncLine}
    </div>
  )
}
