import type { AdminClient } from '@/lib/supabase/admin'
import { getZonedParts } from '@/utils/date-helpers'
import type { BrandProfileRow, ClientRow, PostingScheduleRow } from '@/types'
import { AGENCY_ENTITLEMENT_COLUMNS } from '@/lib/queries/select-columns'
import { entitlementFor, type Entitlement } from '@/lib/billing/entitlement'
import { readUsage } from '@/lib/billing/usage'
import type { Allowance } from '@/lib/billing/plans'
import { notify } from '@/lib/notifications/notify'

type ScheduleRow = Pick<
  PostingScheduleRow,
  'id' | 'client_id' | 'is_active' | 'frequency_value' | 'auto_generate_day' | 'auto_generate_time'
>

// Named *Context rather than *Row: the barrel already exports ClientRow and
// BrandProfileRow as the full table types, and these are the cron's projections of them.
type ClientContext = Pick<ClientRow, 'id' | 'agency_id' | 'name' | 'niche' | 'language'>

type BrandProfileContext = Pick<
  BrandProfileRow,
  'client_id' | 'weekly_mix_json' | 'default_post_type' | 'default_carousel_slides'
>

/**
 * What an agency has committed this period, read once per tick — both pools, because a post is
 * text AND its pictures and the cron used to budget only the first, writing posts the visuals
 * cron then refused whole. The route moves these as it claims batches, so a second client of the
 * same agency sees what the first one took.
 */
type CommittedUsage = Allowance

interface ScheduleContext {
  /** Per agency, what it may do this tick — absent means the agency cannot spend. */
  entitlements: Map<string, Entitlement>
  /** Per entitled agency, what is already committed — the route draws these down per batch. */
  committed: Map<string, CommittedUsage>
  clients: Map<string, ClientContext>
  brandProfiles: Map<string, BrandProfileContext>
  agencyTimezones: Map<string, string>
}

/**
 * Batch-fetch all clients, brand profiles, and agency timezones for active schedules — and each
 * agency's entitlement from the same read, so the route can drop clients whose workspace cannot
 * spend before it claims a slot for them, plus one usage read per entitled agency so a client
 * whose period cannot pay for its whole schedule — in drafts or in the pictures its slides need —
 * gets a smaller batch rather than none.
 */
export async function fetchScheduleContext(
  supabase: AdminClient,
  schedules: ScheduleRow[]
): Promise<ScheduleContext> {
  const clientIds = schedules.map((s) => s.client_id)

  const [clientResult, profileResult] = await Promise.all([
    supabase.from('clients').select('id, agency_id, name, niche, language').in('id', clientIds),
    supabase
      .from('brand_profiles')
      .select('client_id, weekly_mix_json, default_post_type, default_carousel_slides')
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
    .select(AGENCY_ENTITLEMENT_COLUMNS)
    .in('id', agencyIds)
  // Falling back to UTC for every agency would fire each slot at the wrong local hour.
  if (agencyError) throw new Error(`agency timezone query failed: ${agencyError.message}`)

  const agencyTimezones = new Map<string, string>()
  const entitlements = new Map<string, Entitlement>()
  const now = new Date()
  for (const row of agencyRows ?? []) {
    agencyTimezones.set(row.id, row.timezone)
    const entitlement = entitlementFor(row, now)
    if (entitlement.canSpend) entitlements.set(row.id, entitlement)
  }

  const committed = new Map<string, CommittedUsage>()
  await Promise.all(
    [...entitlements].map(async ([agencyId, entitlement]) => {
      const usage = await readUsage(agencyId, entitlement.periodKey)
      committed.set(agencyId, usage.committed)
    })
  )

  const brandProfiles = new Map<string, BrandProfileContext>()
  for (const row of (profileResult.data ?? []) as BrandProfileContext[]) {
    brandProfiles.set(row.client_id, row)
  }

  return { clients, brandProfiles, agencyTimezones, entitlements, committed }
}

/**
 * The one bell for a period a scheduled run cannot be paid for. The sentence is the caller's,
 * because the two who raise it know different things — the budget knows which pool ran out, the
 * reservation race is handed the refusal itself — and both come from `allowanceUsedUp`, so a
 * workspace stopped by its pictures is never told it is out of drafts. `notify` dedups on the
 * message for a month, so it lands once per period per client however many ticks find it empty.
 */
export async function notifyAllowanceExhausted(
  supabase: AdminClient,
  input: { agencyId: string; clientId: string; message: string }
): Promise<void> {
  await notify(supabase, {
    agencyId: input.agencyId,
    clientId: input.clientId,
    type: 'allowance_reached',
    message: input.message,
    cooldownDays: 31,
  })
}

/** Rows saved before the time column was honoured match the historical 09:00 fire. */
const DEFAULT_GENERATE_HOUR = 9

interface ScheduleDue {
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
