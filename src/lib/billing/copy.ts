import { MS_PER_DAY } from '@/utils/constants'
import { formatMoney } from '@/utils/format'
import type { BillingReminderType, NotificationType } from '@/types/api'
import type { Entitlement } from './entitlement'
import { PLAN_LABELS, PRO_PLAN, type AllowanceKind } from './plans'

/**
 * Every billing sentence a person reads, in one file — so the Bulgarian strings are a one-file
 * job when an i18n layer exists, and so the same fact is never worded two ways: the wizard, the
 * 402s, the bells and the shell all compose from the helpers below rather than restating them.
 * Plain words: the thing a plan counts is called what the navigation calls it (`brandWord`),
 * dates are written out in the agency's zone, and no jargon stands in for an explanation.
 */

export const ALLOWANCE_NOUNS: Record<AllowanceKind, string> = {
  draft: 'AI drafts',
  image: 'AI images',
  rewrite: 'rewrites',
}

/** The dates the entitlement carries, and the zone they are read in. */
type Dated = Pick<Entitlement, 'resetsOn' | 'timezone'>

/** "1 October" style, in the agency's zone; the caller decides the locale later. */
function formatDay(date: Date, timeZone: string): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone })
}

/** "Your plan ends on 14 October" — the one wording of a cancelled plan's last day, in the agency's zone. */
function planEndsOn(endsOn: Date, timeZone: string): string {
  return `Your plan ends on ${formatDay(endsOn, timeZone)}`
}

function allUsed(kind: AllowanceKind, quota: number | null): string {
  return `You've used all ${quota ?? 'your'} ${ALLOWANCE_NOUNS[kind]} for this period.`
}

function tooFew(kind: AllowanceKind, left: number, needed: number): string {
  return `You have ${left} ${ALLOWANCE_NOUNS[kind]} left this period and this needs ${needed}.`
}

/**
 * How the allowance comes back, said after a refusal: a paid period resets on a date; the
 * trial's one allowance never does, so the way forward is a plan.
 */
function wayForward(dated: Dated): string {
  return dated.resetsOn
    ? ` Resets on ${formatDay(dated.resetsOn, dated.timezone)}.`
    : ' Choose a plan to keep generating.'
}

/**
 * The one sentence a refused spend shows, wherever it is refused. A pool with something left
 * says so — "2 left and this needs 3" — rather than claiming it is empty.
 */
export function allowanceUsedUp(
  kind: AllowanceKind,
  used: number,
  quota: number,
  needed: number,
  dated: Dated
): string {
  const left = Math.max(0, quota - used)
  const sentence = left > 0 && needed > left ? tooFew(kind, left, needed) : allUsed(kind, quota)
  return sentence + wayForward(dated)
}

/**
 * What the wizard says about the drafts pool before the server is asked: how many are left, or —
 * when the run wants more than that — the same refusal the server would answer with.
 */
export function draftsLeft(left: number, needed = 0): string {
  if (left === 0) return allUsed('draft', null)
  if (needed > left) return tooFew('draft', left, needed)
  return left === 1 ? '1 AI draft left this period' : `${left} AI drafts left this period`
}

/**
 * The 80 % warning. A paid period's reset date makes the sentence unique per period, which is
 * what lets `notify` land one bell per period on message equality alone; the trial has one period.
 */
export function allowanceWarning(
  kind: AllowanceKind,
  used: number,
  quota: number,
  dated: Dated
): string {
  const reset = dated.resetsOn ? ` Resets on ${formatDay(dated.resetsOn, dated.timezone)}.` : ''
  return `${used} of ${quota} ${ALLOWANCE_NOUNS[kind]} used this period.${reset}`
}

/**
 * The word for what a plan counts, as the navigation already says it: clients for an agency, a
 * business for a solo workspace. Pricing speaks of brands; the app never has.
 */
export function brandWord(mode: Entitlement['mode'], count: number): string {
  if (mode === 'solo') return count === 1 ? 'business' : 'businesses'
  return count === 1 ? 'client' : 'clients'
}

/** The settings meter's label for the brand count. */
export function brandsLabel(mode: Entitlement['mode']): string {
  return mode === 'solo' ? 'Business' : 'Clients'
}

/** Why a new brand was refused — the trial's cap, and the way past it. The paid plan has no cap. */
function brandCapReached(entitlement: Entitlement): string {
  const { plan, mode, brands } = entitlement
  return `${PLAN_LABELS[plan]} includes ${brands === 1 ? 'one' : brands} ${brandWord(mode, brands)}. Choose a plan to add more.`
}

/**
 * Why one more brand is refused right now, or null when it may be added. One rule for the action
 * that creates the brand and the button that leads to it, so the button never promises what the
 * action then refuses.
 */
export function addBrandRefusal(entitlement: Entitlement, brandCount: number): string | null {
  if (!entitlement.canCreate) {
    return entitlement.mode === 'solo'
      ? 'Choose a plan to set up your business.'
      : 'Choose a plan to add clients.'
  }
  if (entitlement.brandsUnlimited || brandCount < entitlement.brands) return null
  return brandCapReached(entitlement)
}

/**
 * Why the workspace cannot be deleted right now, or null when it can. One rule for the danger
 * zone (button or refusal) and for the action, so the rail never offers what the action refuses.
 * A live plan is ended from the same rail (`setPlanEnding`), and deletion is allowed the moment
 * it is set to end (`Entitlement.canDelete`).
 */
export function deleteWorkspaceRefusal(entitlement: Pick<Entitlement, 'canDelete'>): string | null {
  return entitlement.canDelete
    ? null
    : 'Cancel your plan first, under Plan & billing. You keep access until it ends, and can delete the workspace right after.'
}

/**
 * What cancelling the plan means, said before the person confirms it: the day it ends, that
 * nothing more is charged, and that the workspace then pauses with everything kept. Composed
 * from the same "ends on" fragment as the shell, so the confirm and the banner never disagree.
 */
export function cancelPlanConsequence(
  entitlement: Pick<Entitlement, 'resetsOn' | 'timezone'>
): string {
  const ends = entitlement.resetsOn
    ? `${planEndsOn(entitlement.resetsOn, entitlement.timezone)} and nothing more is charged.`
    : 'Your plan ends with the current period and nothing more is charged.'
  return `${ends} You keep full access until then; after that the workspace pauses with everything kept, and you can delete it any time.`
}

/** Cancelling asks for a plan that is running and not already set to end. */
export const NO_PLAN_TO_CANCEL = 'There is no running plan to cancel.'

/** Keeping asks for a plan that is set to end and has not ended yet. */
export const NO_PLAN_TO_KEEP = 'Your plan is not set to end.'

/**
 * The one extra line the delete confirmation carries while a cancelled plan is still running —
 * the customer has paid for days that deletion gives up — or null when there is no such plan.
 */
export function deleteWorkspaceNotice(
  entitlement: Pick<Entitlement, 'endsOn' | 'timezone'>
): string | null {
  return entitlement.endsOn
    ? `${planEndsOn(entitlement.endsOn, entitlement.timezone)}; nothing more will be charged.`
    : null
}

/**
 * What choosing the plan will bill, beside the Choose plan button: the price per client and how
 * many clients the workspace has today — Checkout's quantity, never below one.
 */
export function checkoutSummary(mode: Entitlement['mode'], clientCount: number): string {
  const count = Math.max(1, clientCount)
  return `${formatMoney(PRO_PLAN.priceCents)} a month per ${brandWord(mode, 1)} · ${count} ${brandWord(mode, count)} today`
}

/**
 * Under the Add-client button on a paid workspace: what one more costs. Null on the trial and
 * on house, where a new client costs nothing. The exact pro-rata figure is on the invoice.
 */
export function addBrandCost(entitlement: Pick<Entitlement, 'plan' | 'canCreate'>): string | null {
  if (entitlement.plan !== 'pro' || !entitlement.canCreate) return null
  return `Adds ${formatMoney(PRO_PLAN.priceCents)} a month, charged pro rata today.`
}

/** A workspace with a live subscription asking for Checkout again — the portal is the way. */
export const PLAN_ALREADY_ACTIVE = 'This workspace already has a plan. Manage it in Plan & billing.'

/** The portal needs a Stripe customer, which only a first Checkout creates. */
export const NO_BILLING_ACCOUNT = 'There is no billing account yet — choose a plan first.'

/** Stripe could not be reached or refused; the SDK's words stay in the log. */
export const STRIPE_UNAVAILABLE = 'Could not open Stripe just now. Please try again in a moment.'

/** The billing actions are for admins; a member sees this sentence, not a Stripe page. */
export const BILLING_ADMINS_ONLY = 'Only admins can manage the plan.'

/** Deleting the workspace is for admins too — the fresh role read, not the cached one, decides. */
export const DELETE_ADMINS_ONLY = 'Only admins can delete the workspace.'

/**
 * The consent tick at Checkout: the customer asks for the service to start now and accepts that
 * a withdrawal inside the 14 days is charged pro rata (ЗЗП чл. 49 ал. 9, чл. 55). English only,
 * as every billing surface is. The lawyer's final words replace these; the plumbing stays.
 */
export const CHECKOUT_CONSENT =
  'I ask for the service to start now and understand that if I withdraw within 14 days I pay for the days used.'

/** Days before the trial ends at which the shell starts saying so. */
const TRIAL_NOTICE_DAYS = 3

/**
 * The one sentence the shell shows above every page while a workspace is heading for a pause,
 * has just missed a payment, or has cancelled; null when there is nothing to say. The trial
 * banner appears only in the last days, so a fortnight of green does not start with a warning.
 */
export function shellNotice(
  entitlement: Pick<Entitlement, 'state' | 'trialEndsAt' | 'graceEndsAt' | 'endsOn' | 'timezone'>,
  now: Date
): { tone: 'warn' | 'bad'; text: string } | null {
  const { state, trialEndsAt, graceEndsAt, endsOn, timezone } = entitlement
  if (state === 'trial' && trialEndsAt) {
    const daysLeft = Math.ceil((trialEndsAt.getTime() - now.getTime()) / MS_PER_DAY)
    if (daysLeft > TRIAL_NOTICE_DAYS) return null
    return {
      tone: 'warn',
      text: `Your trial ends on ${formatDay(trialEndsAt, timezone)} — choose a plan to keep generating.`,
    }
  }
  if (state === 'trial_grace' && trialEndsAt && graceEndsAt) {
    return {
      tone: 'bad',
      text: `Your trial ended on ${formatDay(trialEndsAt, timezone)}. Scheduled posts still go out until ${formatDay(graceEndsAt, timezone)}; choose a plan to keep generating.`,
    }
  }
  if (state === 'past_due' && graceEndsAt) {
    return {
      tone: 'warn',
      text: `Your last payment failed. Update your card by ${formatDay(graceEndsAt, timezone)} to keep your workspace running.`,
    }
  }
  if (state === 'active' && endsOn) {
    return {
      tone: 'warn',
      text: `${planEndsOn(endsOn, timezone)} — renew in Plan & billing to keep generating.`,
    }
  }
  return null
}

/** The way back, said by the wall and by the paused reminder alike. */
const CHOOSE_PLAN_AGAIN = 'Choose a plan to generate, schedule and publish again.'

export const WORKSPACE_LOCKED = `Your workspace is paused. ${CHOOSE_PLAN_AGAIN}`

export const WORKSPACE_LOCKED_DETAIL =
  'Everything you made is still here to read. Generating, scheduling and publishing resume the moment a plan is active.'

/** The bell and the email once a trial's grace has run out — dated, so a redelivered tick lands once. */
export function workspacePaused(
  entitlement: Pick<Entitlement, 'graceEndsAt' | 'timezone'>
): string {
  const on = entitlement.graceEndsAt
    ? ` on ${formatDay(entitlement.graceEndsAt, entitlement.timezone)}`
    : ''
  return `Your workspace was paused${on}. ${CHOOSE_PLAN_AGAIN}`
}

/**
 * What each reminder email says beyond the bell's own sentence: the subject line, the plate label,
 * the headline, one paragraph of what it means, and the button's words. The paused detail is the
 * wall's second line, so the email and the screen agree.
 */
export const REMINDER_COPY: Record<
  BillingReminderType,
  {
    subject: string
    label: string
    headline: { lead: string; accent: string }
    detail: string
    cta: string
  }
> = {
  trial_ending: {
    subject: 'Your Kontuur trial ends soon',
    label: 'Trial',
    headline: { lead: 'Your trial is', accent: 'ending' },
    detail:
      'Choose a plan to keep generating, scheduling and publishing. Everything you have made stays exactly as it is.',
    cta: 'Choose a plan',
  },
  trial_ended: {
    subject: 'Your Kontuur trial has ended',
    label: 'Trial',
    headline: { lead: 'Your trial has', accent: 'ended' },
    detail:
      'Nothing new is generated until a plan is active. Posts already scheduled still go out during the grace days.',
    cta: 'Choose a plan',
  },
  workspace_paused: {
    subject: 'Your Kontuur workspace is paused',
    label: 'Account',
    headline: { lead: 'Your workspace is', accent: 'paused' },
    detail: WORKSPACE_LOCKED_DETAIL,
    cta: 'Choose a plan',
  },
  payment_failed: {
    subject: 'Your Kontuur payment failed',
    label: 'Billing',
    headline: { lead: 'A payment', accent: 'failed' },
    detail:
      'Update your card in Plan & billing and the charge is tried again. Your workspace keeps running for a week; after that it pauses until a payment goes through.',
    cta: 'Update your card',
  },
}

/**
 * Titles for the bell rows about the workspace's plan rather than one client's content.
 * `allowance_reached` names the client whose run was refused (`notifyDraftsExhausted`,
 * src/app/api/cron/generate/helpers.ts), but the pool is the workspace's, so no client leads a
 * billing title and every one of these rows opens Plan & billing.
 */
export const BILLING_NOTIFICATION_TITLES: Partial<Record<NotificationType, string>> = {
  allowance_warning: 'An allowance is nearly used up',
  allowance_reached: 'An allowance is used up',
  trial_ending: 'Your trial ends soon',
  trial_ended: 'Your trial has ended',
  workspace_paused: 'Your workspace is paused',
  payment_failed: 'A payment failed',
}
