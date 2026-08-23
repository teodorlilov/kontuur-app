import { describe, expect, it } from 'vitest'
import { escapeHtml, renderEmail, strong } from '../layout'
import { approvalEmail, confirmSignupEmail, inviteEmail, resetPasswordEmail } from '../templates'

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
