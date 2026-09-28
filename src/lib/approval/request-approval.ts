import { z } from 'zod'
import type { ApprovalRequest } from './schema'
import { readRouteBody } from '@/utils/read-route-body'

/**
 * Ask the server for an approval link, or to email one — the one client-side approval request, for
 * `use-approval`'s two channels, the generate flow's done view and the review queue's
 * send-to-client dialog.
 *
 * Both functions **throw** with the server's own message (`readRouteBody`). Deciding what a
 * failure looks like belongs to the surface that failed — a dialog toasts, a hook sets an error —
 * and a helper that toasted on their behalf would take that decision away from every caller.
 */

type Channel = 'send' | 'email'

/** What to say when the server fails without saying why. Per channel, because they differ. */
const FALLBACK: Record<Channel, string> = {
  send: 'Failed to generate approval link',
  email: 'Failed to send approval email',
}

/** `/api/approval/send`'s success body: the link, and how many posts it covers. */
const linkAnswerSchema = z.object({ url: z.string(), postCount: z.number() })

/** `/api/approval/email`'s success body: how many posts the email covers. */
const emailAnswerSchema = z.object({ postCount: z.number() })

async function post<T>(
  channel: Channel,
  request: ApprovalRequest,
  answer: z.ZodType<T>
): Promise<T> {
  const res = await fetch(`/api/approval/${channel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return readRouteBody(res, answer, FALLBACK[channel])
}

/** A shareable link the agency copies. Also reports how many posts it covers. */
export function requestApprovalLink(
  request: ApprovalRequest
): Promise<{ url: string; postCount: number }> {
  return post('send', request, linkAnswerSchema)
}

/** The same batch, sent to the client's contact address. */
export function requestApprovalEmail(request: ApprovalRequest): Promise<{ postCount: number }> {
  return post('email', request, emailAnswerSchema)
}
