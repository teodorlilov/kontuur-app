import { z } from 'zod'

/**
 * The shape of `brand_profiles.best_time_json`, validated where it is read.
 *
 * Still validated even though the only writer is now our own `deriveObservedBestTime`
 * rather than a model. The column is `jsonb`, so it holds whatever any past writer left
 * there — including rows a deleted Haiku path wrote, which are still in production and
 * still parse. Validation is what stops one of those reaching `suggestWeekSlots` and
 * throwing inside a render.
 *
 * Deliberately lenient about extra keys and about `confidence`: the retired model writer
 * returned values outside its own enum, those rows survive, and a slot suggestion never
 * depended on the field. The fields the picker actually reads are the ones held to a type.
 */
const bestTimeWindowSchema = z.object({
  time: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM'),
  label: z.string().optional(),
  reason: z.string().optional(),
})

const bestTimePlatformSchema = z.object({
  platform: z.string().min(1),
  best_days: z.array(z.string()),
  best_time_windows: z.array(bestTimeWindowSchema),
  avoid: z.string().optional(),
  confidence: z.string().optional(),
  reasoning_summary: z.string().optional(),
})

/**
 * The stored shape, INFERRED rather than restated — `types/api.ts` used to declare these by hand.
 *
 * The two disagreed, and in the direction that hides the problem: the interface made `label`,
 * `reason`, `avoid` and `reasoning_summary` required and `confidence` a two-member union, while the
 * schema above makes every one of them optional and `confidence` a plain string. `parseBestTimes`
 * then closed the gap with a bare `as`, so a row that legally parsed WITHOUT `reasoning_summary`
 * reached eight consumers typed as certainly having it. The union was false too — `schemas.test.ts`
 * pins `confidence: 'very-sure'` as a value the model has actually returned.
 *
 * Deriving them removes the possibility. What the model is ASKED for is a different contract and
 * still reads as required, in `generate-best-time.ts`'s prompt; what a reader may TRUST is this.
 *
 * Only the platform is named: the window shape rides along structurally, and the standalone
 * `BestTimeWindow` the old file exported never had an importer.
 */
export type BestTimePlatform = z.infer<typeof bestTimePlatformSchema>

/**
 * Measured posting times together with WHEN they were measured.
 *
 * One value rather than two props, because the two come from one row and are meaningless apart: a
 * date belonging to a different client's times is worse than no date, and two parallel props are
 * how that happens. `measuredAt` is null for rows written before the stamp existed — surfaces omit
 * the age rather than inventing one.
 */
export interface MeasuredBestTimes {
  platforms: BestTimePlatform[]
  measuredAt: string | null
}

/**
 * The column holds `{ platforms: [...], upgrade_note }` — both writers have always
 * wrapped it, and every reader has always passed the whole column. This accepted only
 * the bare array, so `z.array(...).safeParse({ platforms })` failed on an object that
 * is not an array, and EVERY client's suggestions resolved to null. The calendar's
 * designed response to unusable data is to draw nothing, so the feature was simply
 * off, everywhere, silently, and looked exactly like a client with no data.
 *
 * A bare array still parses: the tests below were written against that shape, and
 * accepting both is what makes the fix independent of which writer produced a row.
 */
const storedBestTimesSchema = z.union([
  z.array(bestTimePlatformSchema),
  z.object({ platforms: z.array(bestTimePlatformSchema) }),
])

/**
 * Parse a stored `best_time_json` blob into usable entries.
 *
 * Returns `null` for anything unusable rather than throwing: the calendar's answer to
 * "no suggestion available" is to draw nothing, and a corrupt row should reach that same
 * quiet outcome instead of taking the grid down.
 */
export function parseBestTimes(value: unknown): BestTimePlatform[] | null {
  const result = storedBestTimesSchema.safeParse(value)
  if (!result.success) return null
  // Returned as parsed. This used to be `as BestTimePlatform[]`, which was not a narrowing but a
  // widening — the parsed rows and the hand-written interface were different shapes, and the cast
  // was the only thing making them agree.
  const entries = Array.isArray(result.data) ? result.data : result.data.platforms
  return entries.length === 0 ? null : entries
}
