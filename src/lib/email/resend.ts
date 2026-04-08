import { Resend } from 'resend'

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
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@postflow.app',
    to,
    subject: 'Your content is ready for approval',
    html: `
      <p>Hi,</p>
      <p>Your scheduled social media content is ready for review.</p>
      <p><strong>${postCount} post${postCount === 1 ? '' : 's'}</strong>
         for ${clientName} ${postCount === 1 ? 'is' : 'are'} awaiting your approval.</p>
      <p>
        <a href="${approvalUrl}"
           style="background:#534AB7;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
          Review &amp; Approve
        </a>
      </p>
      <p style="color:#666;font-size:12px;">This link expires in 48 hours.</p>
    `,
  })
}
