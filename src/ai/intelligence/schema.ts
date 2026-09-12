import { z } from 'zod'
import { POST_PLATFORMS } from '@/lib/meta/platforms'

/**
 * One change on a platform this week, as the brief stores and shows it: which network, one
 * headline naming the change, and the page it was read on.
 *
 * The single definition of the shape. The generator parses the model's JSON through it, the
 * writer stores exactly this in `intelligence_briefings.items`, the dashboard reader parses the
 * jsonb back through it (so no `as` on a `Json` column), and the bar renders it. Three fields,
 * because a row shows three things — a stored field nothing renders is the defect the 2026-09
 * rebuild removed.
 *
 * `network` is the publishing vocabulary (`POST_PLATFORMS`), not a second list of the same two
 * strings, so it indexes `PLATFORM_NAMES` directly. `source_url` becomes an `href`, hence the
 * protocol guard.
 */
export const briefingItemSchema = z.object({
  network: z.enum(POST_PLATFORMS),
  title: z.string().trim().min(1).max(120),
  source_url: z.url({ protocol: /^https?$/ }),
})

/** The `items` column: what a week's brief holds. */
export const briefingItemsSchema = z.array(briefingItemSchema)

export type BriefingItem = z.infer<typeof briefingItemSchema>
