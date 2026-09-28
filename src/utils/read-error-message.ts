import { z } from 'zod'

/** The `{ error }` body every app route answers a failure with. */
const errorBodySchema = z.object({ error: z.string() })

/**
 * The sentence a failed app route gave, or null when its body carries none — an edge 502's HTML
 * page, an empty body, or JSON without a string `error`. Never throws, so the caller's own fallback
 * is what shows when the server did not say why. Reads the body, so the response is spent.
 */
export async function readErrorMessage(res: Response): Promise<string | null> {
  const body: unknown = await res.json().catch(() => null)
  const parsed = errorBodySchema.safeParse(body)
  return parsed.success ? parsed.data.error : null
}
