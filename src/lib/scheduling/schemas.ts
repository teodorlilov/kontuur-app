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

/** The value `deriveObservedBestTime` stamps on every entry it builds off the follower-online grid. */
export const OBSERVED_CONFIDENCE = 'observed'

/**
 * Whether a stored blob was measured from Meta rather than imagined by a model.
 *
 * Two things write this column and they are not equal in authority: `deriveObservedBestTime` reads
 * a real weekday x hour grid of when a client's followers are online, while `generateBestTime` asks
 * Haiku to guess from four profile fields. `sync-metrics` already states the precedence — "observed
 * data outranks the model-invented best_time_json" — but stating it is all it did, because the only
 * other writer had no way to ask the question. This is that question, in one place, so the rule is
 * enforced rather than described.
 */
export function isObservedBestTime(value: unknown): boolean {
  const entries = parseBestTimes(value)
  return entries !== null && entries.some((entry) => entry.confidence === OBSERVED_CONFIDENCE)
}
