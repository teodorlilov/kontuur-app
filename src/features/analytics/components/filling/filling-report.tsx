import type { ReactNode } from 'react'
import { AutoFill } from './auto-fill'
import { FillingDocument } from './filling-document'
import type { AnalyticsPeriod } from '../../lib/compute/period'

/**
 * The whole-document state while a window is still pulling from Meta: the report's silhouette
 * instead of numbers that are about to change.
 *
 * `masthead` and `syncLine` are passed in rather than built here so that a filling document
 * keeps the client name, the period range and the "last synced" footer of the finished one —
 * and so neither network's view can quietly drop them.
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
