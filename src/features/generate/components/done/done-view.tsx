'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CalendarDays, Mail, RotateCcw } from 'lucide-react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { getMondayISO } from '@/utils/date-helpers'

interface DoneViewProps {
  approvedCount: number
  discardedCount: number
  skippedPillarCount: number
  /** Covered pillars the run was too small to schedule — rotation, not a skip. */
  restingPillarCount: number
  clientName: string
  clientId: string
  onNewRun: () => void
}

/**
 * The run's close. The one surface in this flow with nothing competing for the
 * eye, so it is the one that earns Prompt — and its serif strings are
 * English-only by construction: the client name appears only in the sans
 * sub-line, so no hasCyrillic gate is needed.
 */
export function DoneView({
  approvedCount,
  discardedCount,
  skippedPillarCount,
  restingPillarCount,
  clientName,
  clientId,
  onNewRun,
}: DoneViewProps) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const nothingKept = approvedCount === 0

  async function handleSendApproval() {
    setSending(true)
    try {
      const res = await fetch('/api/approval/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, weekStart: getMondayISO() }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error: string }
        throw new Error(err.error || 'Failed to send approval email')
      }
      const data = (await res.json()) as { postCount: number }
      toast.success(`Approval sent — ${data.postCount} post${data.postCount !== 1 ? 's' : ''}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send approval email')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rv mx-auto mt-[8vh] w-full max-w-[480px] px-4 pb-16 text-center">
      <div className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-wash text-forest">
        <Check aria-hidden className="size-7" strokeWidth={2} />
      </div>
      <h1 className="font-display text-prompt text-ink [text-wrap:balance]">
        {nothingKept
          ? 'Nothing kept this time'
          : `${approvedCount} post${approvedCount === 1 ? '' : 's'} approved`}
      </h1>
      <p className="mt-3 text-lead text-text2">
        {nothingKept
          ? 'Every draft was discarded. The sources behind them are noted, so the next run leans elsewhere.'
          : `They are in the review queue for ${clientName}.`}
      </p>

      <div className="mt-8 flex justify-center gap-8 border-y border-line py-5">
        <Tally value={approvedCount} label="Approved" />
        <Tally value={discardedCount} label="Discarded" />
        <Tally value={skippedPillarCount} label="Pillars skipped" />
      </div>
      {/* Answers "where are my other pillars?" — skipped counts failures only,
          and a small run leaving covered pillars unscheduled is rotation. */}
      {restingPillarCount > 0 && (
        <p className="mt-3 text-caption text-text3">
          {restingPillarCount === 1
            ? '1 covered pillar wasn’t scheduled this run — it takes its turn next time.'
            : `${restingPillarCount} covered pillars weren’t scheduled this run — they take their turn next time.`}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-2 text-left">
        <NextAction
          primary
          icon={<CalendarDays aria-hidden className="size-4" strokeWidth={1.6} />}
          title="Open the calendar"
          sub={
            nothingKept
              ? 'See what is already scheduled'
              : `${approvedCount} draft${approvedCount === 1 ? '' : 's'} waiting for a slot`
          }
          onClick={() => router.push('/calendar')}
        />
        <NextAction
          icon={<Mail aria-hidden className="size-4" strokeWidth={1.6} />}
          title={sending ? 'Sending…' : 'Send for client approval'}
          sub="A link the client opens without an account"
          disabled={sending || nothingKept}
          onClick={handleSendApproval}
        />
        <NextAction
          icon={<RotateCcw aria-hidden className="size-4" strokeWidth={1.6} />}
          title="Generate another run"
          sub="Same client, or switch to a different one"
          onClick={onNewRun}
        />
      </div>
    </div>
  )
}

function Tally({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-metric font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-label font-semibold uppercase text-text2">{label}</p>
    </div>
  )
}

function NextAction({
  icon,
  title,
  sub,
  primary,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  primary?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-panel border p-4 text-left transition-colors duration-150 ease-contour',
        primary
          ? 'border-forest bg-forest text-white hover:bg-forest-deep'
          : 'border-line bg-surface hover:border-forest hover:bg-wash',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <span
        className={cn(
          'grid size-8 flex-none place-items-center rounded-chip',
          primary ? 'bg-white/[0.14] text-accent' : 'bg-wash text-forest'
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold">{title}</span>
        <span className={cn('mt-0.5 block text-caption', primary ? 'text-white/75' : 'text-text2')}>
          {sub}
        </span>
      </span>
    </button>
  )
}
