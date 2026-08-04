import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getZonedParts } from '@/utils/date-helpers'

type AdminClient = ReturnType<typeof createAdminSupabaseClient>

interface ScheduleRow {
  id: string
  client_id: string
  is_active: boolean
  frequency_value: number
  auto_generate_day: string
  auto_generate_time: string | null
}

interface ClientRow {
  id: string
  agency_id: string
  name: string
  niche: string | null
  language: string
}

interface BrandProfileRow {
  client_id: string
  weekly_mix_json: unknown
  default_post_type: string | null
  default_carousel_slides: number | null
  best_time_updated_at: string | null
}

export interface ScheduleContext {
  clients: Map<string, ClientRow>
  brandProfiles: Map<string, BrandProfileRow>
  agencyTimezones: Map<string, string>
}

/** Batch-fetch all clients, brand profiles, and agency timezones for active schedules. */
export async function fetchScheduleContext(
  supabase: AdminClient,
  schedules: ScheduleRow[]
): Promise<ScheduleContext> {
  const clientIds = schedules.map((s) => s.client_id)

  const [{ data: clientRows }, { data: profileRows }] = await Promise.all([
    supabase.from('clients').select('id, agency_id, name, niche, language').in('id', clientIds),
    supabase
      .from('brand_profiles')
      .select(
        'client_id, weekly_mix_json, default_post_type, default_carousel_slides, best_time_updated_at'
      )
      .in('client_id', clientIds),
  ])

  const clients = new Map<string, ClientRow>()
  for (const row of (clientRows ?? []) as ClientRow[]) {
    clients.set(row.id, row)
  }

  const agencyIds = [...new Set([...clients.values()].map((c) => c.agency_id))]
  const { data: agencyRows } = await supabase
    .from('agencies')
    .select('id, timezone, mode')
    .in('id', agencyIds)

  const agencyTimezones = new Map<string, string>()
  for (const row of (agencyRows ?? []) as Array<{ id: string; timezone: string | null }>) {
    agencyTimezones.set(row.id, row.timezone ?? 'UTC')
  }

  const brandProfiles = new Map<string, BrandProfileRow>()
  for (const row of (profileRows ?? []) as BrandProfileRow[]) {
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
