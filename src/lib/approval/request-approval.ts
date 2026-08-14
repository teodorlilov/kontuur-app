import type { ApprovalRequest } from './schema'

/**
 * Ask the server for an approval link, or to email one.
 *
 * The same twelve lines existed four times — `use-approval` for each of its two
 * channels, the generate flow's done view, and the review queue's send-to-client dialog.
 * All four built the same body, unwrapped `{ error }` the same way, and disagreed only in
 * what they did with the result: two threw, one toasted inline, and one read the response
 * body before checking `res.ok`.
 *
 * Both functions **throw** with the server's own message. Deciding what a failure looks
 * like belongs to the surface that failed — a dialog toasts, a hook sets an error — and
 * a helper that toasts on their behalf would take that decision away from all four.
 */

type Channel = 'send' | 'email'

/** What to say when the server fails without saying why. Per channel, because they differ. */
const FALLBACK: Record<Channel, string> = {
  send: 'Failed to generate approval link',
  email: 'Failed to send approval email',
}

async function post<T>(channel: Channel, request: ApprovalRequest): Promise<T> {
  const res = await fetch(`/api/approval/${channel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  // Tolerated rather than awaited blindly: a 502 from the edge has no JSON body, and
  // `res.json()` throwing there would surface a SyntaxError instead of the failure.
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null

  if (!res.ok || !data) throw new Error(data?.error || FALLBACK[channel])
  return data
}

/** A shareable link the agency copies. Also reports how many posts it covers. */
export function requestApprovalLink(
  request: ApprovalRequest
): Promise<{ url: string; postCount: number }> {
  return post('send', request)
}

/** The same batch, sent to the client's contact address. */
export function requestApprovalEmail(request: ApprovalRequest): Promise<{ postCount: number }> {
  return post('email', request)
}
