import { Resend } from 'resend'
import { renderEmail } from './layout'
import { approvalEmail } from './templates'

/**
 * The `From` header, as `Kontuur <hello@kontuur.app>`.
 *
 * **No fallback.** This used to default to `noreply@postflow.app`, a domain this project
 * does not own, so an unset variable did not fail here — it failed inside Resend, as
 * "The postflow.app domain is not verified", naming a domain nobody was looking at. An
 * unset variable is a deployment mistake and is now reported as one.
 *
 * The display name is what an inbox actually renders; a bare address shows as `hello`.
 * It is added only when the variable carries a plain address, so a value that already
 * spells out its own `Name <addr>` is passed through untouched rather than nested.
 */
function senderAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL
  if (!from) {
    throw new Error('RESEND_FROM_EMAIL is not set')
  }
  return from.includes('<') ? from : `Kontuur <${from}>`
}

/**
 * Send the client their approval link.
 *
 * **The SDK does not throw.** `resend.emails.send()` resolves with `{ data, error }`
 * whatever happens — an unverified sending domain, a sandbox restriction, a bad key, a
 * rate limit all come back as a resolved promise carrying an error object. Awaiting it
 * and discarding the result, which is what this did, meant the route's `try/catch`
 * caught nothing, the API returned 200, the UI toasted "Approval email sent!" and a
 * notification row recorded a send that never happened.
 *
 * So the error is read and thrown. The route above turns it into a 500 carrying the
 * provider's own words, because "your domain is not verified" is the answer, and
 * "check RESEND_API_KEY" was a guess.
 *
 * The markup lives in `layout.ts` and the copy in `templates.ts`, shared with the three
 * Supabase auth templates. It used to be a 60-line HTML literal inlined here, which is
 * why the auth mail could not reuse a line of it.
 */
export async function sendApprovalEmail({
  to,
  clientName,
  approvalUrl,
  postCount,
}: {
  to: string
  clientName: string
  approvalUrl: string
  postCount: number
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set')
  }
  const content = approvalEmail({ clientName, approvalUrl, postCount })
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: senderAddress(),
    to,
    subject: content.subject,
    html: renderEmail(content),
  })

  if (error) {
    // Named, because the two most common failures say very different things: an
    // unverified `from` domain and a sandbox key that may only mail its owner both
    // return 403, and only the message distinguishes them.
    throw new Error(`${error.name ?? 'send failed'}: ${error.message ?? 'no detail returned'}`)
  }
}
