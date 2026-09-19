import { describe, expect, it } from 'vitest'
import { escapeHtml, renderEmail, strong } from '../layout'
import {
  approvalEmail,
  confirmSignupEmail,
  documentEmail,
  inviteEmail,
  reminderEmail,
  resetPasswordEmail,
} from '../templates'

describe('escapeHtml', () => {
  it('neutralises every character that can break out of email markup', () => {
    expect(escapeHtml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&#39;')
  })

  it('escapes the ampersand first, so an escape is not itself escaped', () => {
    // `&lt;` rather than `&amp;lt;`: replacing `<` before `&` would double-encode.
    expect(escapeHtml('<')).toBe('&lt;')
  })
})

describe('approvalEmail', () => {
  it('carries a client name with an ampersand through as text, not markup', () => {
    const html = renderEmail(
      approvalEmail({ clientName: 'Fish & Chips', approvalUrl: 'https://k.app/a/1', postCount: 3 })
    )
    expect(html).toContain('Fish &amp; Chips')
    expect(html).not.toContain('Fish & Chips')
  })

  it('cannot have a client name close the paragraph it sits in', () => {
    const html = renderEmail(
      approvalEmail({
        clientName: '</p><img src=x onerror=alert(1)>',
        approvalUrl: 'https://k.app/a/1',
        postCount: 1,
      })
    )
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;/p&gt;')
  })

  it('agrees the verb with the post count', () => {
    const one = approvalEmail({ clientName: 'A', approvalUrl: 'u', postCount: 1 })
    const many = approvalEmail({ clientName: 'A', approvalUrl: 'u', postCount: 4 })
    expect(one.paragraphs[0]).toContain(
      '1 post</strong> for <strong style="font-weight:600">A</strong> is'
    )
    expect(many.paragraphs[0]).toContain(
      '4 posts</strong> for <strong style="font-weight:600">A</strong> are'
    )
  })
})

describe('reminderEmail', () => {
  const planUrl = 'https://kontuur.app/settings?tab=account'

  it('carries the bell sentence as the first paragraph and the preview, escaped', () => {
    const content = reminderEmail(
      'trial_ending',
      'Your trial ends on 27 September — choose a plan & keep generating.',
      planUrl
    )
    expect(content.subject).toBe('Your Kontuur trial ends soon')
    expect(content.preview).toBe(
      'Your trial ends on 27 September — choose a plan & keep generating.'
    )
    expect(content.paragraphs[0]).toBe(
      'Your trial ends on 27 September — choose a plan &amp; keep generating.'
    )
    expect(content.cta).toEqual({ label: 'Choose a plan', url: planUrl })
  })

  it('says what a paused workspace keeps, in the wall’s own words', () => {
    const content = reminderEmail(
      'workspace_paused',
      'Your workspace was paused on 4 October.',
      planUrl
    )
    expect(content.paragraphs[1]).toContain('Everything you made is still here to read.')
  })

  it.each([
    ['trial_ending', 'Your trial ends on 27 September — choose a plan to keep generating.'],
    [
      'trial_ended',
      'Your trial ended on 27 September. Scheduled posts still go out until 4 October; choose a plan to keep generating.',
    ],
    [
      'workspace_paused',
      'Your workspace was paused on 4 October. Choose a plan to generate, schedule and publish again.',
    ],
    [
      'payment_failed',
      'Your last payment failed. Update your card by 18 September to keep your workspace running.',
    ],
  ] as const)('renders %s to its snapshot', async (kind, sentence) => {
    await expect(renderEmail(reminderEmail(kind, sentence, planUrl))).toMatchFileSnapshot(
      `./__snapshots__/reminder-${kind.replace('_', '-')}.html`
    )
  })
})

describe('documentEmail', () => {
  const planUrl = 'https://kontuur.app/settings?tab=account'
  const invoice = {
    kind: 'invoice',
    number: 1_000_000_001,
    gross_cents: 6840,
    issued_at: '2025-10-01T18:30:05.000Z',
  }

  it('names the document, its amount and its Sofia date, and points at Plan & billing', () => {
    const content = documentEmail(invoice, planUrl)
    expect(content.subject).toBe('Your invoice from Kontuur')
    expect(content.preview).toBe('Invoice 1000000001 for €68.40 is attached.')
    expect(content.paragraphs[0]).toContain('Invoice No. 1000000001')
    expect(content.paragraphs[0]).toContain('dated 1 October 2025')
    expect(content.cta).toEqual({ label: 'Open Plan & billing', url: planUrl })
    expect(documentEmail({ ...invoice, kind: 'credit_note' }, planUrl).subject).toBe(
      'Your credit note from Kontuur'
    )
  })

  it.each(['invoice', 'credit_note'] as const)(
    'renders the %s mail to its snapshot',
    async (kind) => {
      await expect(renderEmail(documentEmail({ ...invoice, kind }, planUrl))).toMatchFileSnapshot(
        `./__snapshots__/document-${kind.replace('_', '-')}.html`
      )
    }
  )
})

describe('strong', () => {
  it('escapes before wrapping, so emphasis cannot smuggle markup', () => {
    expect(strong('<b>x')).toBe('<strong style="font-weight:600">&lt;b&gt;x</strong>')
  })
})

/**
 * The three auth templates are written to disk from the same shell the approval
 * mail uses, so the markup cannot drift between them. Editing `layout.ts` or the
 * copy in `templates.ts` fails these until the files are regenerated with
 * `npx vitest run -u src/lib/email`, and the regenerated file is what gets
 * pasted into Supabase → Authentication → Email Templates.
 *
 * Supabase's own placeholders survive rendering untouched: `{{ .ConfirmationURL }}`
 * and `{{ .Email }}` contain no character `escapeHtml` rewrites.
 */
describe('supabase auth templates', () => {
  it('confirm signup', async () => {
    await expect(renderEmail(confirmSignupEmail)).toMatchFileSnapshot(
      '../../../../supabase/templates/confirm-signup.html'
    )
  })

  it('reset password', async () => {
    await expect(renderEmail(resetPasswordEmail)).toMatchFileSnapshot(
      '../../../../supabase/templates/reset-password.html'
    )
  })

  it('invite', async () => {
    await expect(renderEmail(inviteEmail)).toMatchFileSnapshot(
      '../../../../supabase/templates/invite.html'
    )
  })

  it('keeps the Supabase placeholders intact', () => {
    expect(renderEmail(resetPasswordEmail)).toContain('href="{{ .ConfirmationURL }}"')
    expect(renderEmail(resetPasswordEmail)).toContain('{{ .Email }}')
    expect(renderEmail(inviteEmail)).toContain('{{ .Data.agency_name }}')
  })
})
