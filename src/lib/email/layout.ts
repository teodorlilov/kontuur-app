/**
 * The one email shell. Every message Kontuur sends is this markup with a
 * different body — the approval mail sent through Resend at runtime, and the
 * three Supabase auth templates generated from it in `__tests__/templates.test.ts`.
 *
 * Written as tables with inline styles because that is what email clients
 * support: Gmail strips `<style>` blocks and custom fonts, Outlook ignores
 * flexbox and box-shadow. The design tokens in DESIGN.md cannot reach here, so
 * every value below is the literal it resolves to. Georgia stands in for
 * Instrument Serif and the system stack for Geist, since webfonts do not
 * survive the trip and embedding them would pass Gmail's 102KB clipping limit.
 *
 * Mocked and agreed as docs/redesign-mocks/emails.html.
 */

/** Near-White Paper. The ground, never flat white. */
const PAPER = '#fbfcfa'
const SURFACE = '#ffffff'
const FOREST = '#164430'
const INK = '#0f1512'
const INK_2 = '#57625a'
const INK_3 = '#667068'
const HAIRLINE = '#e7ece7'
/**
 * New Growth, and legitimate because it is the ground under Forest Ink at
 * 13.65:1 — never the ink itself. The header used to be a Pine Deep plate
 * carrying a white wordmark, which made the logo two different things depending
 * on where you met it; this is the same lockup the app renders.
 */
const LIME = '#cfea45'

const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
const SERIF = "Georgia, 'Times New Roman', serif"

/**
 * Escape a value for interpolation into email HTML.
 *
 * The approval mail carries a client name straight out of the database, and the
 * template it replaced dropped that into markup unescaped — an apostrophe or an
 * ampersand in an agency's name was enough to produce broken output, and a `<`
 * would have ended the paragraph early.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Emphasis inside a paragraph, with the value escaped on the way in. */
export function strong(value: string): string {
  return `<strong style="font-weight:600">${escapeHtml(value)}</strong>`
}

export interface EmailContent {
  /** Subject line. Also the `<title>`. */
  subject: string
  /**
   * The line inboxes show beside the subject. Without one they preview the
   * first words of the body, which is why the old Supabase mail previewed as
   * "Reset Password Follow this link to res…".
   */
  preview: string
  /** Uppercase label on the plate, opposite the wordmark. */
  label: string
  /** Split so the accent half can be set in the serif italic. */
  headline: { lead: string; accent: string }
  /**
   * Paragraph HTML, first in ink and the rest secondary. **Trusted markup** —
   * anything interpolated from data must go through `strong()` or
   * `escapeHtml()` first. Literal copy written here is author-controlled.
   */
  paragraphs: readonly string[]
  cta: { label: string; url: string }
  /** Small print under the hairline. Trusted markup, as above. */
  footnote: string
  /** Centred line outside the card. */
  signoff: string
}

/** Render one email to a complete HTML document. */
export function renderEmail(content: EmailContent): string {
  const { subject, preview, label, headline, paragraphs, cta, footnote, signoff } = content

  const [lead, ...rest] = paragraphs
  const leadHtml = lead
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">${lead}</p>`
    : ''
  const restHtml = rest
    .map(
      (p, i) =>
        `<p style="margin:0 0 ${i === rest.length - 1 ? '28px' : '14px'};font-size:15px;line-height:1.6;color:${INK_2}">${p}</p>`
    )
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<!-- Preview text: shown in the inbox list, hidden in the open message. The
     non-breaking spaces stop clients padding the preview with body copy. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}${'&nbsp;&zwnj;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};padding:40px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

<tr><td style="background:${SURFACE};border:1px solid ${HAIRLINE};border-bottom:1px solid ${HAIRLINE};border-radius:14px 14px 0 0;padding:22px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td><span style="background:${LIME};color:${INK};font-family:${SERIF};font-style:italic;font-size:26px;letter-spacing:0.01em;padding:3px 10px 5px;border-radius:4px;">kontuur<span style="color:${FOREST}">.</span></span></td>
<td align="right" style="font-family:${SANS};font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${INK_3};">${escapeHtml(label)}</td>
</tr></table>
</td></tr>

<tr><td style="background:${SURFACE};border:1px solid ${HAIRLINE};border-top:none;border-radius:0 0 14px 14px;padding:36px;font-family:${SANS};">
<h1 style="margin:0 0 18px;font-size:28px;font-weight:600;line-height:1.15;letter-spacing:-0.02em;color:${INK};">${escapeHtml(headline.lead)} <span style="font-family:${SERIF};font-style:italic;font-weight:400;color:${FOREST};letter-spacing:-0.01em;">${escapeHtml(headline.accent)}</span></h1>
${leadHtml}${restHtml}
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-radius:8px;background:${FOREST};"><a href="${cta.url}" style="display:inline-block;padding:14px 24px;font-family:${SANS};font-size:14px;font-weight:500;line-height:1;color:${SURFACE};text-decoration:none;border-radius:8px;">${escapeHtml(cta.label)}</a></td>
</tr></table>
<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid ${HAIRLINE};font-size:12px;line-height:1.6;color:${INK_3};">${footnote}<br><span style="color:${FOREST};word-break:break-all;">${cta.url}</span></p>
</td></tr>

<tr><td align="center" style="padding:22px 36px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${INK_3};">${signoff}</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`
}
