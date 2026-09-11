'use client'

import { useState } from 'react'
import { UnreadIcon } from '@solar-icons/react/linear'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/utils/cn'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import {
  CONTROL_SURFACE,
  CONTROL_FOCUS,
  CONTROL_TEXT,
  LABEL_CLASS,
} from '@/components/ui/form/control-classes'
import { formatScheduledAt, toDateKey } from '@/utils/date-helpers'
import { WeekStrip } from './week-strip'

type ScheduleChoice = 'pick' | 'none'

interface ScheduleWeekContext {
  /** Monday of the current week, YYYY-MM-DD. */
  weekStart: string
  /** Scheduled-post count per day, Monday-first, length 7. */
  countsByDay: number[]
  /** The client's posts-per-week target; 0 = no target. */
  target: number
}

interface ScheduleDialogProps {
  open: boolean
  /** Blocks confirm while a blocking approve runs. The queue omits it — its approve is optimistic. */
  approving?: boolean
  /** The client's week, for the strip that shows how full it already is (queue only for now). */
  weekContext?: ScheduleWeekContext
  /** The date a priority brief asked for, 'YYYY-MM-DD'. Preselects the manual pick. */
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

/**
 * Approve is also the moment the post gets (or declines) a slot, so the two decisions share
 * one dialog: the week's shape, a manual pick, or no slot at all.
 *
 * It used to offer two recommended slots as well — a "next open slot" and a "best time",
 * both derived from `brand_profiles.best_time_json`. That column was removed (migration
 * 20260848) once measurement showed only the hour half of it was real, so the reviewer
 * picks against the week strip rather than against a suggestion.
 */
export function ScheduleDialog({
  open,
  approving = false,
  weekContext,
  requestedDate,
  timeZone,
  onConfirm,
  onClose,
}: ScheduleDialogProps) {
  const [choice, setChoice] = useState<ScheduleChoice>('none')
  const [pickedDate, setPickedDate] = useState('')
  const [pickedTime, setPickedTime] = useState('')

  // Fresh decision per opening. Adjusted during render (the documented pattern), not
  // in an effect.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      // A date the client asked for preselects the manual pick.
      setChoice(requestedDate ? 'pick' : 'none')
      setPickedDate(requestedDate ?? '')
      setPickedTime('')
    }
  }

  function handleConfirm() {
    if (choice === 'pick' && pickedDate) {
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
        <Icon glyph={UnreadIcon} className={cn('flex-none text-forest', !checked && 'opacity-0')} />
      </span>
      {children}
    </div>
  )
}
