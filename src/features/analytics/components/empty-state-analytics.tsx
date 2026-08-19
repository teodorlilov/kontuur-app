'use client'

import { AlertTriangle, BarChart3 } from 'lucide-react'
import { cn } from '@/utils/cn'

interface EmptyStateAnalyticsProps {
  variant: 'no-accounts' | 'ready'
  clientName: string
  range?: string
  onConnect?: () => void
  onGenerate?: () => void
}

/** Empty state for analytics — no-accounts or ready-to-generate. */
export function EmptyStateAnalytics({
  variant,
  clientName,
  range,
  onConnect,
  onGenerate,
}: EmptyStateAnalyticsProps) {
  const isTerra = variant === 'ready'

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-paper px-5 py-10 rounded-lg">
      <IconFrame terra={isTerra}>
        {isTerra ? (
          <BarChart3 size={22} color="var(--spring)" strokeWidth={1.5} />
        ) : (
          <AlertTriangle size={22} color="rgba(15,21,18,0.22)" strokeWidth={1.5} />
        )}
      </IconFrame>

      <h2 className="text-headline font-display font-normal text-ink mb-2 text-center">
        {isTerra ? 'Ready to generate' : 'No accounts connected'}
      </h2>

      {/* leading-[1.65] is this paragraph's original line-height — a touch looser
          than text-body's 1.6 because it wraps to several centred lines. */}
      <p className="text-body text-text2 leading-[1.65] text-center max-w-[380px] mb-[26px]">
        {isTerra
          ? `Instagram is connected for ${clientName}. Choose a time range and generate a performance report for the last ${range ?? '30 days'}.`
          : `Connect an Instagram account for ${clientName} to start generating analytics reports.`}
      </p>

      {isTerra ? (
        <button
          type="button"
          onClick={onGenerate}
          className="text-body px-6 py-2.5 bg-spring text-white rounded-[9px] font-medium cursor-pointer"
        >
          Generate {range ?? '30d'} report →
        </button>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          className="text-body px-6 py-2.5 bg-forest-deep text-ink-inv rounded-[9px] font-medium cursor-pointer"
        >
          Connect Instagram →
        </button>
      )}
    </div>
  )
}

function IconFrame({ terra, children }: { terra: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'w-14 h-14 border-x-[1.5px] border-y rounded-[2px] flex items-center justify-center mb-5',
        terra ? 'border-x-spring/35 border-y-spring/15' : 'border-x-ink/18 border-y-ink/9'
      )}
    >
      {children}
    </div>
  )
}
