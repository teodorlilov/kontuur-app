import type { z } from 'zod'
import { readErrorMessage } from '@/utils/read-error-message'

/**
 * An app route's success body, parsed by `schema`, or an Error thrown in the route's own words
 * (`readErrorMessage`). `fallback` is the sentence when a failure carries none, or when a success is
 * not the shape asked for — an edge page, an empty body, a deploy mid-flight. Reads the body, so the
 * response is spent.
 */
export async function readRouteBody<T>(
  res: Response,
  schema: z.ZodType<T>,
  fallback: string
): Promise<T> {
  if (!res.ok) throw new Error((await readErrorMessage(res)) ?? fallback)
  const parsed = schema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new Error(fallback)
  return parsed.data
}
