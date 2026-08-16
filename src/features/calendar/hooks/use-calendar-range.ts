'use client'

import { useCallback, useState } from 'react'
import {
  formatMonthLabel,
  formatWeekRange,
  monthViewIn,
  monthViewOfWeek,
  nextMonthView,
  nextWeekView,
  prevMonthView,
  prevWeekView,
  weekViewIn,
  weekViewOfMonth,
  type MonthView,
  type WeekView,
} from '@/features/calendar/lib/calendar-range'

/** Which unit the calendar is showing. */
type CalendarMode = 'week' | 'month' | 'clients'

/**
 * What range the calendar is looking at, and every way of moving it.
 *
 * One concern, so it is one hook: the month, the week and the mode are three pieces of
 * state that only ever change together, and every rule about how they interact — a week
 * straddles two months, switching views must not lose the reader's place, stepping means
 * something different per mode — lived as loose callbacks in the middle of `CalendarView`
 * alongside dialog state and delete handlers.
 *
 * The month and the week are separate state rather than one derived from the other:
 * stepping weeks must not drag the month grid around behind it, and a week straddling
 * two months has no single month to be derived from.
 */
export function useCalendarRange(timeZone: string) {
  // One piece of state, not two: stepping across a year boundary changes both, and
  // splitting them forced the month updater to call setYear from inside itself. Updaters
  // must be pure — React double-invokes them under StrictMode, so that fired twice and
  // skipped a whole year.
  const [view, setView] = useState<MonthView>(() => monthViewIn(timeZone))
  const [weekStart, setWeekStart] = useState<WeekView>(() => weekViewIn(timeZone))
  const [mode, setMode] = useState<CalendarMode>('week')
  const { year, month } = view

  /**
   * Switching views keeps the reader where they were.
   *
   * Opening Month from a week in September lands on September; opening Week from a month
   * lands on a week inside it, unless the week already showing is in that month. Landing
   * on today instead would lose the place they navigated to, which is the only reason
   * they switched.
   */
  const selectMode = useCallback(
    (next: CalendarMode) => {
      setMode(next)
      if (next === 'month') {
        setView(monthViewOfWeek(weekStart))
        return
      }
      const weeksMonth = monthViewOfWeek(weekStart)
      if (weeksMonth.year !== year || weeksMonth.month !== month) {
        setWeekStart(weekViewOfMonth({ year, month }))
      }
    },
    [weekStart, year, month]
  )

  /**
   * Month is a way into a week, not a place to work.
   *
   * Sets the week *and* the mode together rather than reusing `selectMode`: that
   * reconciles the week to the month it is leaving, which is exactly the correction this
   * must not apply — the whole point is landing on the week that was clicked.
   */
  const openWeek = useCallback((weekStartISO: WeekView) => {
    setWeekStart(weekStartISO)
    setMode('week')
  }, [])

  const stepBack = useCallback(
    () => (mode === 'month' ? setView(prevMonthView) : setWeekStart(prevWeekView)),
    [mode]
  )

  const stepForward = useCallback(
    () => (mode === 'month' ? setView(nextMonthView) : setWeekStart(nextWeekView)),
    [mode]
  )

  /** Both units, so returning by either route lands in the same place. */
  const goToToday = useCallback(() => {
    setView(monthViewIn(timeZone))
    setWeekStart(weekViewIn(timeZone))
  }, [timeZone])

  return {
    year,
    month,
    weekStart,
    mode,
    /** The header's title — whichever unit is on screen names itself. */
    title: mode === 'month' ? formatMonthLabel(view) : formatWeekRange(weekStart),
    /** What `stepBack`/`stepForward` actually move, so the buttons can say so. */
    stepUnit: mode === 'month' ? ('month' as const) : ('week' as const),
    selectMode,
    openWeek,
    stepBack,
    stepForward,
    goToToday,
  }
}
