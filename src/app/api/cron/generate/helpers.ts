import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getZonedParts } from '@/utils/date-helpers'
import type { BrandProfileRow, ClientRow, PostingScheduleRow } from '@/types'

type AdminClient = ReturnType<typeof createAdminSupabaseClient>

type ScheduleRow = Pick<
  PostingScheduleRow,
  'id' | 'client_id' | 'is_active' | 'frequency_value' | 'auto_generate_day' | 'auto_generate_time'
>

// Named *Context rather than *Row: the barrel already exports ClientRow and
// BrandProfileRow as the full table types, and these are the cron's projections of them.
type ClientContext = Pick<ClientRow, 'id' | 'agency_id' | 'name' | 'niche' | 'language'>

type BrandProfileContext = Pick<
  BrandProfileRow,
  | 'client_id'
  | 'weekly_mix_json'
  | 'default_post_type'
  | 'default_carousel_slides'
  | 'best_time_updated_at'
>

export interface ScheduleContext {
  clients: Map<string, ClientContext>
  brandProfiles: Map<string, BrandProfileContext>
  agencyTimezones: Map<string, string>
}

/** Batch-fetch all clients, brand profiles, and agency timezones for active schedules. */
export async function fetchScheduleContext(
  supabase: AdminClient,
  schedules: ScheduleRow[]
): Promise<ScheduleContext> {
  const clientIds = schedules.map((s) => s.client_id)

  const [clientResult, profileResult] = await Promise.all([
    supabase.from('clients').select('id, agency_id, name, niche, language').in('id', clientIds),
    supabase
      .from('brand_profiles')
      .select(
        'client_id, weekly_mix_json, default_post_type, default_carousel_slides, best_time_updated_at'
      )
      .in('client_id', clientIds),
  ])

  // An empty context is indistinguishable from "no client row" downstream, which
  // silently skips every due schedule and reports the run as clean.
  if (clientResult.error)
    throw new Error(`client context query failed: ${clientResult.error.message}`)
  if (profileResult.error) {
    throw new Error(`brand profile context query failed: ${profileResult.error.message}`)
  }

  const clients = new Map<string, ClientContext>()
  // as: explicit column projection — Supabase types from the table, not the select
  for (const row of (clientResult.data ?? []) as ClientContext[]) {
    clients.set(row.id, row)
  }

  const agencyIds = [...new Set([...clients.values()].map((c) => c.agency_id))]
  const { data: agencyRows, error: agencyError } = await supabase
    .from('agencies')
    .select('id, timezone, mode')
    .in('id', agencyIds)
  // Falling back to UTC for every agency would fire each slot at the wrong local hour.
  if (agencyError) throw new Error(`agency timezone query failed: ${agencyError.message}`)

  const agencyTimezones = new Map<string, string>()
  // as: explicit column projection — Supabase types from the table, not the select
  for (const row of (agencyRows ?? []) as Array<{ id: string; timezone: string }>) {
    agencyTimezones.set(row.id, row.timezone)
  }

  const brandProfiles = new Map<string, BrandProfileContext>()
  for (const row of (profileResult.data ?? []) as BrandProfileContext[]) {
    brandProfiles.set(row.client_id, row)
  }

  return { clients, brandProfiles, agencyTimezones }
}

/** Rows saved before the time column was honoured match the historical 09:00 fire. */
const DEFAULT_GENERATE_HOUR = 9

export interface ScheduleDue {
  due: boolean
  /** Instant of today's slot — the top of the configured hour in the agency's zone. */
  scheduledAt: Date
  /** Current hour in the agency's zone — lets the caller order scarce-retry slots first. */
  localHour: number
}

/**
 * Day + hour due-check: today is the configured weekday in the agency's zone
 * and the configured hour has passed. Due-since rather than equal-to, so one
 * missed or failed tick retries every hour for the rest of the local day
 * instead of silently skipping the week. The caller pairs `scheduledAt` with
 * the client's latest generation run to decide whether the slot already
 * produced its batch. Minutes in `auto_generate_time` are deliberately
 * ignored — slots are whole hours.
 */
export function getScheduleDue(
  schedule: ScheduleRow,
  agencyTimezone: string,
  now: Date = new Date()
): ScheduleDue {
  const { weekday, hour, minute } = getZonedParts(now, agencyTimezone)
  const parsedHour = Number.parseInt(schedule.auto_generate_time ?? '', 10)
  const scheduledHour =
    Number.isInteger(parsedHour) && parsedHour >= 0 && parsedHour <= 23
      ? parsedHour
      : DEFAULT_GENERATE_HOUR
  const due = schedule.auto_generate_day.toLowerCase() === weekday && hour >= scheduledHour
  // Clock arithmetic inside one zoned day, so no zoned-date construction needed.
  const minutesPastSlot = (hour - scheduledHour) * 60 + minute
  return { due, scheduledAt: new Date(now.getTime() - minutesPastSlot * 60_000), localHour: hour }
}
