import { z } from 'zod'
import type { BestTimePlatform } from '@/types/api'

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
 * Parse a stored `best_time_json` blob into usable entries.
 *
 * Returns `null` for anything unusable rather than throwing: the calendar's answer to
 * "no suggestion available" is to draw nothing, and a corrupt row should reach that same
 * quiet outcome instead of taking the grid down.
 */
export function parseBestTimes(value: unknown): BestTimePlatform[] | null {
  const result = z.array(bestTimePlatformSchema).safeParse(value)
  if (!result.success || result.data.length === 0) return null
  // The picker reads platform/best_days/best_time_windows; the optional tail is carried
  // through untouched for callers that display it.
  return result.data as BestTimePlatform[]
}
