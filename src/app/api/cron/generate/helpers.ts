import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getTodayWeekday } from '@/utils/date-helpers'

type AdminClient = ReturnType<typeof createAdminSupabaseClient>

interface ScheduleRow {
  id: string
  client_id: string
  is_active: boolean
  frequency_value: number
  auto_generate_day: string
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
      .select('client_id, weekly_mix_json, default_post_type, default_carousel_slides, best_time_updated_at')
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

/** Check if today matches the schedule's configured generation day. */
export function shouldGenerateToday(schedule: ScheduleRow, agencyTimezone: string): boolean {
  const todayWeekday = getTodayWeekday(agencyTimezone)
  return schedule.auto_generate_day.toLowerCase() === todayWeekday
}
