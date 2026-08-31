import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScheduleDialog } from '../schedule-dialog'
import { MIN_BEST_TIME_DAYS } from '@/utils/constants'
import type { MeasuredBestTimes } from '@/lib/suggested-times/schemas'

/**
 * The moment someone actually publishes against these hours.
 *
 * Two things have to be true here and neither is obvious from the markup. The option only exists
 * when there are measured times — it used to exist for everyone, because a model invented them for
 * clients with no connected account. And when it does exist it has to say how old the measurement
 * is, because `best_time_json` never expires: hours derived in June render exactly like hours
 * derived last night, at the one screen where the difference changes what a person does.
 */

const measured = (measuredAt: string | null): MeasuredBestTimes => ({
  platforms: [
    {
      platform: 'Instagram',
      best_days: ['Tuesday'],
      best_time_windows: [{ time: '21:00' }],
      confidence: 'observed',
    },
  ],
  measuredAt,
})

function renderDialog(bestTime: MeasuredBestTimes | null) {
  return render(
    <ScheduleDialog
      open
      platform="Instagram"
      bestTime={bestTime}
      timeZone="Europe/Sofia"
      onConfirm={vi.fn()}
      onClose={vi.fn()}
    />
  )
}

describe('ScheduleDialog — the best-time option', () => {
  it('dates the measurement it is offering', () => {
    renderDialog(measured('2026-08-14T02:10:00.000Z'))
    expect(screen.getByText(/best time — tuesday 21:00/i)).toBeInTheDocument()
    expect(screen.getByText(/last updated 14 aug 2026 · from instagram/i)).toBeInTheDocument()
  })

  it('still offers the time when the stamp is missing', () => {
    // Rows written before the column was populated. Losing the option over a missing date would
    // be worse than showing an undated one.
    renderDialog(measured(null))
    expect(screen.getByText(/best time — tuesday 21:00/i)).toBeInTheDocument()
    expect(screen.queryByText(/last updated/i)).not.toBeInTheDocument()
  })

  it('explains itself instead of quietly dropping the option', () => {
    renderDialog(null)
    expect(screen.queryByText(/best time —/i)).not.toBeInTheDocument()
    // A missing row reads as "this client has no best time" — a claim about the client rather than
    // about what we have measured.
    expect(screen.getByText(new RegExp(`${MIN_BEST_TIME_DAYS} days`, 'i'))).toBeInTheDocument()
    expect(screen.getByText(/we never guess/i)).toBeInTheDocument()
  })

  it('offers nothing for a platform with no measured times of its own', () => {
    // The stored value can hold entries for platforms this post is not going to.
    render(
      <ScheduleDialog
        open
        platform="Facebook"
        bestTime={measured('2026-08-14T02:10:00.000Z')}
        timeZone="Europe/Sofia"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryByText(/best time —/i)).not.toBeInTheDocument()
    expect(screen.getByText(/we never guess/i)).toBeInTheDocument()
  })
})
