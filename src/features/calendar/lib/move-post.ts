import { formatScheduledAt, isoToDateTimeFields, shiftDateKey } from '@/utils/date-helpers'

/**
 * Move a scheduled instant by whole days, keeping the wall-clock time it was set for.
 *
 * "Keeping the time" is the entire specification, and it is why this cannot be
 * `new Date(iso).getTime() + days * 86_400_000`. Across a DST boundary a day is 23 or 25
 * hours: adding 86,400,000ms to a Sunday 09:00 in Sofia lands on Monday 10:00 in one
 * direction and 08:00 in the other. A post scheduled for nine in the morning stays
 * scheduled for nine in the morning.
 *
 * The calendar's previous move path — an HTML5 drop handler nothing could trigger,
 * deleted in Phase 1 — did not preserve the time at all: it hardcoded noon, so every
 * dragged post silently lost the hour someone had chosen for it.
 *
 * Round-tripped through the zone rather than through UTC: the date and the time both
 * come back out in the agency's zone, get shifted as a bare date key, and are resolved
 * to an instant again by the same two-pass helper every other write uses.
 */
export function shiftScheduledByDays(
  scheduledAt: string,
  days: number,
  timeZone: string
): string {
  const { date, time } = isoToDateTimeFields(scheduledAt, timeZone)
  return formatScheduledAt(shiftDateKey(date, days), time, timeZone)
}
