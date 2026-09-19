import { formatDocumentNumber, formatLongDate, formatMoney, pluralise } from '@/utils/format'
import { REMINDER_COPY } from '@/lib/billing/copy'
import type { BillingReminderType } from '@/types/api'
import type { SaleDocumentColumns } from '@/lib/queries/select-columns'
import { escapeHtml, type EmailContent, strong } from './layout'

/**
 * The messages Kontuur sends, as content for the shared shell: the approval mail, the billing
 * reminders, the invoice and credit-note mail, and the three Supabase auth templates.
 *
 * The auth templates carry Supabase's own placeholders rather than data:
 * `{{ .ConfirmationURL }}` and `{{ .Email }}` are substituted by Supabase when
 * it sends. They are rendered to `supabase/templates/*.html` by
 * `__tests__/templates.test.ts`, so the shell here and the files pasted into the
 * dashboard cannot drift apart.
 *
 * Every one of them says what happened and what to do; the ones that carry a link that
 * expires also say when, and what to do if it was not you.
 */

/** Sent from the app when a batch is ready for the client to look at. */
export function approvalEmail(params: {
  clientName: string
  approvalUrl: string
  postCount: number
}): EmailContent {
  const { clientName, approvalUrl, postCount } = params
  const posts = pluralise(postCount, 'post')

  return {
    subject: 'Your content is ready for approval',
    preview: `${posts} for ${clientName} waiting for your approval.`,
    label: 'For review',
    headline: { lead: 'Your week is', accent: 'ready' },
    paragraphs: [
      `${strong(posts)} for ${strong(clientName)} ${postCount === 1 ? 'is' : 'are'} waiting for your approval.`,
      'Read them through, approve the ones that work, and leave a note on anything you would like changed. Nothing is published until you say so.',
    ],
    cta: { label: 'Review & approve', url: approvalUrl },
    footnote:
      'This link expires in 48 hours. If the button does not work, paste this into your browser:',
    // No "reply and we'll answer" — hello@kontuur.app is a real mailbox, but
    // nobody has confirmed it is watched, and an unanswered invitation to reply
    // is worse than none.
    signoff: 'Sent by Kontuur on behalf of your agency.',
  }
}

const SIGNOFF = 'Kontuur — social intelligence for agencies.'
const PASTE = 'If the button does not work, paste this into your browser:'

/**
 * A billing reminder, sent to the workspace's admins by the daily cron or, for a failed renewal,
 * by the webhook. `sentence` is the same dated sentence the bell row carries and the rest of the words are `REMINDER_COPY`, both from
 * src/lib/billing/copy.ts — the sentence is data, so it is escaped here.
 */
export function reminderEmail(
  kind: BillingReminderType,
  sentence: string,
  planUrl: string
): EmailContent {
  const reminder = REMINDER_COPY[kind]
  return {
    subject: reminder.subject,
    preview: sentence,
    label: reminder.label,
    headline: reminder.headline,
    paragraphs: [escapeHtml(sentence), reminder.detail],
    cta: { label: reminder.cta, url: planUrl },
    footnote: PASTE,
    signoff: SIGNOFF,
  }
}

/**
 * The invoice or credit note, sent to the payer at the moment of payment with the PDF attached
 * — the document Наредба Н-18 asks to be handed over electronically (чл. 52о ал. 5). The date is
 * written in Sofia time, the document's own.
 */
export function documentEmail(
  document: Pick<SaleDocumentColumns, 'kind' | 'number' | 'gross_cents' | 'issued_at'>,
  planUrl: string
): EmailContent {
  const invoice = document.kind === 'invoice'
  const noun = invoice ? 'invoice' : 'credit note'
  const number = formatDocumentNumber(document.number)
  const amount = formatMoney(document.gross_cents)
  const date = formatLongDate(new Date(document.issued_at), 'Europe/Sofia')
  return {
    subject: invoice ? 'Your invoice from Kontuur' : 'Your credit note from Kontuur',
    preview: `${invoice ? 'Invoice' : 'Credit note'} ${number} for ${amount} is attached.`,
    label: invoice ? 'Invoice' : 'Credit note',
    headline: { lead: `Your ${noun} is`, accent: 'attached' },
    paragraphs: [
      `${strong(`${invoice ? 'Invoice' : 'Credit note'} No. ${number}`)} for ${strong(amount)}, dated ${date}, is attached as a PDF.`,
      'It is also listed under Plan & billing, where every document stays available to download.',
    ],
    cta: { label: 'Open Plan & billing', url: planUrl },
    footnote: PASTE,
    signoff: SIGNOFF,
  }
}

/** Supabase → Authentication → Email Templates → Confirm signup. */
export const confirmSignupEmail: EmailContent = {
  subject: 'Confirm your email',
  preview: 'One step from your Kontuur account.',
  label: 'Welcome',
  headline: { lead: 'Confirm your', accent: 'email' },
  paragraphs: [
    'You are one step from your Kontuur account.',
    'Confirm this address and we will take you straight to adding your first client — the site, the sources, and the first week of content.',
  ],
  cta: { label: 'Confirm email address', url: '{{ .ConfirmationURL }}' },
  footnote: `If you did not sign up for Kontuur, ignore this email — no account will be created. ${PASTE}`,
  signoff: SIGNOFF,
}

/** Supabase → Authentication → Email Templates → Reset password. */
export const resetPasswordEmail: EmailContent = {
  subject: 'Set a new password',
  preview: 'Choose a new password for your Kontuur account.',
  label: 'Account',
  headline: { lead: 'Set a', accent: 'new password' },
  paragraphs: [
    `Someone asked to reset the password for ${strong('{{ .Email }}')}.`,
    'If that was you, choose a new one below. You will be signed in straight afterwards.',
  ],
  cta: { label: 'Choose a new password', url: '{{ .ConfirmationURL }}' },
  footnote: `This link works once and expires in one hour. If you did not ask for it, ignore this email — your password stays exactly as it is. ${PASTE}`,
  signoff: SIGNOFF,
}

/**
 * Supabase → Authentication → Email Templates → Invite user.
 *
 * `{{ .Data.agency_name }}` is the metadata the invite route passes. Supabase
 * renders this template at invite time, not at accept time, so there is no
 * older invite that could reach a reader without the name set.
 */
export const inviteEmail: EmailContent = {
  subject: 'You have been invited to Kontuur',
  preview: 'Accept your invitation and pick a password.',
  label: 'Invitation',
  headline: { lead: 'You have been', accent: 'invited' },
  paragraphs: [
    '{{ .Data.agency_name }} has added you to their workspace on Kontuur.',
    'It is where their social content gets planned, written and scheduled. Accept below to pick a password and get in — it takes about a minute.',
  ],
  cta: { label: 'Accept invitation', url: '{{ .ConfirmationURL }}' },
  footnote: `If you were not expecting this, you can safely ignore it. ${PASTE}`,
  signoff: SIGNOFF,
}
