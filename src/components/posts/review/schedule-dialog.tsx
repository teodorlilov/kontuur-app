'use client'

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import {
  CONTROL_SURFACE,
  CONTROL_FOCUS,
  CONTROL_TEXT,
  LABEL_CLASS,
} from '@/components/ui/form/control-classes'
import { formatScheduledAt, getNextDateForDay, toDateKey } from '@/utils/date-helpers'
import { WeekStrip } from './week-strip'
import type { BestTimePlatform } from '@/types/api'

type ScheduleChoice = 'next' | 'best' | 'pick' | 'none'

export interface ScheduleWeekContext {
  /** Monday of the current week, YYYY-MM-DD. */
  weekStart: string
  /** Scheduled-post count per day, Monday-first, length 7. */
  countsByDay: number[]
  /** The client's posts-per-week target; 0 = no target. */
  target: number
  /** The picker's recommendation, or null when best-time data cannot produce one. */
  nextOpenSlot: string | null
}

interface ScheduleDialogProps {
  open: boolean
  platform: string | null
  bestTimeData: BestTimePlatform[] | null
  approving: boolean
  /** The client's week — surfaces the strip and the "next open slot" default (queue only for now). */
  weekContext?: ScheduleWeekContext
  /**
   * The date a priority brief asked for, 'YYYY-MM-DD'. Preselects the manual pick,
   * because a date the client named outranks any slot we would recommend.
   */
  requestedDate?: string | null
  /**
   * The agency zone, and required.
   *
   * Every date this dialog produces became a `scheduled_at` resolved in the *browser's*
   * zone, while the calendar buckets that column in the agency's — so an operator whose
   * machine disagreed with their agency scheduled posts at the wrong instant, silently.
   * Required rather than defaulted, because a default would let a caller that forgot it
   * keep writing the old wrong answer.
   */
  timeZone: string
  /** Resolves the decision: an ISO timestamp schedules, null approves unscheduled. */
  onConfirm: (scheduledAt: string | null) => void
  onClose: () => void
}

function formatSlotLabel(iso: string): string {
  const date = new Date(iso)
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}

/**
 * Approve is also the moment the post gets (or declines) a slot, so the two
 * decisions share one dialog: the week's shape with a recommended open slot
 * when the caller supplies it, the platform's best time, a manual pick, or no
 * slot at all.
 */
export function ScheduleDialog({
  open,
  platform,
  bestTimeData,
  approving,
  weekContext,
  requestedDate,
  timeZone,
  onConfirm,
  onClose,
}: ScheduleDialogProps) {
  const best = useMemo(() => {
    if (!platform || !bestTimeData) return null
    const entry = bestTimeData.find((b) => b.platform.toLowerCase() === platform.toLowerCase())
    const day = entry?.best_days[0]
    const window = entry?.best_time_windows[0]
    if (!entry || !day || !window) return null
    return { day, time: window.time, reason: entry.reasoning_summary }
  }, [platform, bestTimeData])

  const [choice, setChoice] = useState<ScheduleChoice>('none')
  const [pickedDate, setPickedDate] = useState('')
  const [pickedTime, setPickedTime] = useState('')

  // Fresh decision per opening — best-time data arrives async, so the default
  // can only be decided when the dialog actually opens. Adjusted during render
  // (the documented pattern), not in an effect.
  const nextOpenSlot = weekContext?.nextOpenSlot ?? null

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      // A date the client asked for wins: it is a commitment, not a recommendation.
      setChoice(requestedDate ? 'pick' : nextOpenSlot ? 'next' : best ? 'best' : 'none')
      setPickedDate(requestedDate ?? '')
      setPickedTime('')
    }
  }

  function handleConfirm() {
    if (choice === 'next' && nextOpenSlot) {
      onConfirm(nextOpenSlot)
    } else if (choice === 'best' && best) {
      onConfirm(formatScheduledAt(getNextDateForDay(best.day, timeZone), best.time, timeZone))
    } else if (choice === 'pick' && pickedDate) {
      onConfirm(formatScheduledAt(pickedDate, pickedTime, timeZone))
    } else {
      onConfirm(null)
    }
  }

  const confirmDisabled = approving || (choice === 'pick' && !pickedDate)

  return (
    <Modal open={open} onClose={onClose} title="Approve — and when does it go out?" maxWidth={460}>
      <div className="flex flex-col gap-4 p-7 pt-4">
        <p className="text-caption text-text2">
          Approved drafts sit in the review queue until they have a slot. Pick one now or leave it
          unscheduled.
        </p>

        {weekContext && (
          <WeekStrip
            weekStart={weekContext.weekStart}
            countsByDay={weekContext.countsByDay}
            target={weekContext.target}
            timeZone={timeZone}
          />
        )}

        <div role="radiogroup" aria-label="Schedule" className="flex flex-col gap-2">
          {nextOpenSlot && (
            <OptionCard
              checked={choice === 'next'}
              title={`Next open slot — ${formatSlotLabel(nextOpenSlot)}`}
              sub="Fills this client's week"
              onSelect={() => setChoice('next')}
            />
          )}
          {best && (
            <OptionCard
              checked={choice === 'best'}
              title={`Best time — ${best.day} ${best.time}`}
              sub="From this client’s own engagement history"
              onSelect={() => setChoice('best')}
            />
          )}
          <OptionCard
            checked={choice === 'pick'}
            title="Pick a date & time"
            sub="Choose the slot yourself"
            onSelect={() => setChoice('pick')}
          >
            {choice === 'pick' && (
              <span className="mt-3 flex flex-wrap gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className={LABEL_CLASS.default}>Date</span>
                  <input
                    type="date"
                    min={toDateKey(new Date(), timeZone)}
                    value={pickedDate}
                    onChange={(e) => setPickedDate(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(CONTROL_SURFACE, CONTROL_FOCUS, CONTROL_TEXT, 'h-10 w-auto px-3')}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={LABEL_CLASS.default}>Time</span>
                  <input
                    type="time"
                    value={pickedTime}
                    onChange={(e) => setPickedTime(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(CONTROL_SURFACE, CONTROL_FOCUS, CONTROL_TEXT, 'h-10 w-auto px-3')}
                  />
                </label>
              </span>
            )}
          </OptionCard>
          <OptionCard
            checked={choice === 'none'}
            title="Leave unscheduled"
            sub="Sits in the review queue until you give it a slot"
            onSelect={() => setChoice('none')}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={approving} disabled={confirmDisabled} onClick={handleConfirm}>
            Approve
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function OptionCard({
  checked,
  title,
  sub,
  onSelect,
  children,
}: {
  checked: boolean
  title: string
  sub: string
  onSelect: () => void
  children?: React.ReactNode
}) {
  return (
    <div
      role="radio"
      aria-checked={checked}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'cursor-pointer rounded-chip border p-3 transition-colors duration-150 ease-contour',
        checked
          ? 'border-forest bg-wash shadow-[inset_0_0_0_1px_var(--forest)]'
          : 'border-line2 bg-surface hover:border-text3/45 hover:bg-sunken'
      )}
    >
      <span className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium text-ink">{title}</span>
          <span className="mt-0.5 block text-caption text-text2">{sub}</span>
        </span>
        <Check
          aria-hidden
          className={cn('size-4 flex-none text-forest', !checked && 'opacity-0')}
          strokeWidth={2}
        />
      </span>
      {children}
    </div>
  )
}
