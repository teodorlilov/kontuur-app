import { z } from 'zod'

/**
 * The shape of `brand_profiles.best_time_json`, validated where it is read.
 *
 * It needs validating because of where it comes from: `generateBestTime` casts a Claude
 * Haiku response with `parseJsonResponse<BestTimeResult>` — an unchecked assertion over
 * model output — and stores it as `Json`. Nothing between the model and the grid has
 * ever checked it, and three readers each hand-rolled
 * `Array.isArray(x) ? (x as BestTimePlatform[]) : null`, which proves the array is an
 * array and nothing else. A malformed entry reaching `suggestWeekSlots` would throw
 * inside a render.
 *
 * Deliberately lenient about extra keys and about `confidence`: the model has returned
 * values outside its own enum before, and a slot suggestion does not depend on it. The
 * fields the picker actually reads are the ones held to a type.
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
 * Parse a stored `best_time_json` blob into usable entries.
 *
 * Returns `null` for anything unusable rather than throwing: the calendar's answer to
 * "no suggestion available" is to draw nothing, and a corrupt row should reach that same
 * quiet outcome instead of taking the grid down.
 */
export function parseBestTimes(value: unknown): BestTimePlatform[] | null {
  const result = z.array(bestTimePlatformSchema).safeParse(value)
  if (!result.success || result.data.length === 0) return null
  // Returned as parsed. This used to be `as BestTimePlatform[]`, which was not a narrowing but a
  // widening — the parsed rows and the hand-written interface were different shapes, and the cast
  // was the only thing making them agree.
  return result.data
}
