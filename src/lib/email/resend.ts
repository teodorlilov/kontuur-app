import { Resend } from 'resend'
import { renderEmail, type EmailContent } from './layout'

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
 * The one send path: every email Kontuur sends at runtime — the approval link, the billing
 * reminders, the invoices — is a piece of `templates.ts` content rendered through the shared shell and posted
 * here, so there is one place the sender, the key and the provider's failures are handled.
 *
 * **The SDK does not throw.** `resend.emails.send()` resolves with `{ data, error }`
 * whatever happens — an unverified sending domain, a sandbox restriction, a bad key, a
 * rate limit all come back as a resolved promise carrying an error object. Awaiting it
 * and discarding the result once meant a route returned 200, the UI toasted "Approval
 * email sent!" and a notification row recorded a send that never happened.
 *
 * So the error is read and thrown, named: an unverified `from` domain and a sandbox key
 * that may only mail its owner both return 403, and only the message distinguishes them.
 * The caller turns it into its own failure carrying the provider's words.
 */
export async function sendEmail({
  to,
  content,
  attachments,
  idempotencyKey,
}: {
  to: string | string[]
  content: EmailContent
  /** The invoice PDF. Resend takes the bytes as they are; the cap is 40 MB per email. */
  attachments?: Array<{ filename: string; content: Buffer }>
  /** Resend keeps it 24 h: a retry after a lost "sent" write does not mail twice. */
  idempotencyKey?: string
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set')
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send(
    {
      from: senderAddress(),
      to,
      subject: content.subject,
      html: renderEmail(content),
      attachments,
    },
    idempotencyKey ? { idempotencyKey } : undefined
  )

  if (error) {
    throw new Error(`${error.name ?? 'send failed'}: ${error.message ?? 'no detail returned'}`)
  }
}
