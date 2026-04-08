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
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:0;background:#f5f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3;padding:40px 0;">
          <tr><td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

              <!-- Logo header -->
              <tr><td style="background:#000;padding:32px 40px;text-align:center;border-radius:12px 12px 0 0;">
                <table cellpadding="0" cellspacing="0" style="display:inline-table;margin:0 auto 6px;">
                  <tr>
                    <!-- Donut icon -->
                    <td style="padding-right:10px;vertical-align:middle;">
                      <div style="width:26px;height:26px;border-radius:50%;border:7px solid #fff;display:inline-block;"></div>
                    </td>
                    <!-- Two vertical bars -->
                    <td style="vertical-align:middle;">
                      <table cellpadding="0" cellspacing="0"><tr>
                        <td style="padding-right:3px;">
                          <div style="width:7px;height:34px;background:#fff;border-radius:4px;display:block;"></div>
                        </td>
                        <td>
                          <div style="width:7px;height:24px;background:#fff;border-radius:4px;display:block;"></div>
                        </td>
                      </tr></table>
                    </td>
                  </tr>
                </table>
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:400;color:#fff;letter-spacing:6px;line-height:1;">kontuur</div>
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;color:#888780;letter-spacing:4px;margin-top:6px;">social intelligence</div>
              </td></tr>

              <!-- Body -->
              <tr><td style="background:#fff;padding:40px;border-radius:0 0 12px 12px;">
                <p style="margin:0 0 16px;font-size:15px;color:#111;line-height:1.6;">Hi,</p>
                <p style="margin:0 0 16px;font-size:15px;color:#111;line-height:1.6;">
                  Your scheduled social media content is ready for review.
                </p>
                <p style="margin:0 0 32px;font-size:15px;color:#111;line-height:1.6;">
                  <strong>${postCount} post${postCount === 1 ? '' : 's'}</strong> for <strong>${clientName}</strong>
                  ${postCount === 1 ? 'is' : 'are'} awaiting your approval.
                </p>
                <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                  <tr><td>
                    <a href="${approvalUrl}"
                       style="background:#000;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-size:14px;font-weight:500;letter-spacing:0.3px;">
                      Review &amp; Approve
                    </a>
                  </td></tr>
                </table>
                <p style="margin:0;font-size:12px;color:#999;">This link expires in 48 hours.</p>
              </td></tr>

            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `,
  })
}
