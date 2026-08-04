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
import type { BestTimePlatform } from '@/types/api'

type ScheduleChoice = 'best' | 'pick' | 'none'

interface ScheduleDialogProps {
  open: boolean
  platform: string | null
  bestTimeData: BestTimePlatform[] | null
  approving: boolean
  /** Resolves the decision: an ISO timestamp schedules, null approves unscheduled. */
  onConfirm: (scheduledAt: string | null) => void
  onClose: () => void
}

/**
 * Approve is also the moment the post gets (or declines) a slot, so the two
 * decisions share one dialog: option cards for the recommendation, a manual
 * pick, or no slot at all. "Next open slot" is deliberately absent — deriving
 * it needs the client's scheduled posts, which this surface does not load yet.
 */
export function ScheduleDialog({
  open,
  platform,
  bestTimeData,
  approving,
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
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setChoice(best ? 'best' : 'none')
      setPickedDate('')
      setPickedTime('')
    }
  }

  function handleConfirm() {
    if (choice === 'best' && best) {
      onConfirm(formatScheduledAt(getNextDateForDay(best.day), best.time))
    } else if (choice === 'pick' && pickedDate) {
      onConfirm(formatScheduledAt(pickedDate, pickedTime))
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

        <div role="radiogroup" aria-label="Schedule" className="flex flex-col gap-2">
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
                    min={toDateKey(new Date())}
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
