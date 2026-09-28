import { MS_PER_DAY } from '@/utils/constants'
import { formatDocumentNumber, formatLongDate, formatMoney, pluralise } from '@/utils/format'
import type { BillingReminderType, NotificationType } from '@/types/api'
import type { Entitlement, EntitlementState } from './entitlement'
import {
  GRACE_DAYS,
  PLAN_LABELS,
  PRO_PLAN,
  TRIAL_NOTICE_DAYS,
  billableQuantity,
  type AllowanceKind,
} from './plans'

/**
 * Every billing sentence a person reads, in one file — so the Bulgarian strings are a one-file
 * job when an i18n layer exists, and so the same fact is never worded two ways: the wizard, the
 * 402s, the bells and the shell all compose from the helpers below rather than restating them.
 * Plain words: the thing a plan counts is called what the navigation calls it (`brandWord`),
 * dates are written out in the agency's zone, and no jargon stands in for an explanation.
 */

/** What each allowance counts, one of it — `pluralise` gives a count its own form. */
const ALLOWANCE_NOUN: Record<AllowanceKind, string> = {
  draft: 'AI draft',
  image: 'AI image',
  rewrite: 'rewrite',
}

/** What each allowance counts, as a heading or a meter names it. */
export const ALLOWANCE_NOUNS: Record<AllowanceKind, string> = {
  draft: `${ALLOWANCE_NOUN.draft}s`,
  image: `${ALLOWANCE_NOUN.image}s`,
  rewrite: `${ALLOWANCE_NOUN.rewrite}s`,
}

/** The dates the entitlement carries, and the zone they are read in. */
type Dated = Pick<Entitlement, 'resetsOn' | 'timezone'>

/** What a refusal needs to say how the allowance comes back. */
type Refusable = Dated & Pick<Entitlement, 'paymentFailed'>

/** The way back after a failed renewal, said by a refusal and by the paused wall alike. */
const UPDATE_YOUR_CARD = 'Update your card in Plan & billing to continue.'

/** "Your plan ends on 14 October" — the one wording of a cancelled plan's last day, in the agency's zone. */
function planEndsOn(endsOn: Date, timeZone: string): string {
  return `Your plan ends on ${formatLongDate(endsOn, timeZone)}`
}

function allUsed(kind: AllowanceKind, quota: number | null): string {
  return `You've used all ${quota ?? 'your'} ${ALLOWANCE_NOUNS[kind]} for this period.`
}

function tooFew(kind: AllowanceKind, left: number, needed: number): string {
  return `You have ${pluralise(left, ALLOWANCE_NOUN[kind])} left this period and this needs ${needed}.`
}

/**
 * Pictures that posts already written still owe — set aside from the image pool before a new run
 * is measured (`committedWithOwed`, post-allowance.ts).
 */
export interface OwedImages {
  /** Posts still waiting for pictures. */
  posts: number
  /** The pictures they still need. */
  images: number
}

/** Nothing owed — the figure where no post waits for a picture. */
export const NOTHING_OWED: OwedImages = { posts: 0, images: 0 }

/**
 * The image pool as a refusal needs it to say why: what is left of it, what one post of the
 * chosen format costs, and what earlier posts still owe from it.
 */
export interface ImagePool {
  left: number
  perPost: number
  owed: OwedImages
}

/**
 * Why `neededImages` cannot be painted from the pool: the waiting posts, when the run would fit
 * without them; otherwise what is left against what is needed; and only an empty pool is "all
 * used". Never names more left than there is.
 */
function imagesShort(neededImages: number, pool: ImagePool): string {
  const { left, owed } = pool
  if (neededImages <= left && owed.images > 0) return owedImagesWaiting(owed, left)
  if (left > 0) return tooFew('image', left, neededImages)
  return allUsed('image', null)
}
/**
 * The set-aside sentence: what the waiting posts need beside what the pool still holds, so a
 * refusal caused by them names them — and never claims more is left than is.
 */
function owedImagesWaiting(owed: OwedImages, imagesLeft: number): string {
  const verb = owed.posts === 1 ? 'needs' : 'need'
  return `${pluralise(owed.posts, 'post')} still waiting for pictures ${verb} ${pluralise(owed.images, ALLOWANCE_NOUN.image)}; you have ${imagesLeft} left this period.`
}

/**
 * How the allowance comes back, said after a refusal: a paid period resets on a date; after a
 * failed renewal it resets only once the card is fixed (`resetsOn` is null then); the trial's one
 * allowance never does, so the way forward is a plan.
 */
function wayForward(refused: Refusable): string {
  if (refused.paymentFailed) return ` ${UPDATE_YOUR_CARD}`
  return refused.resetsOn
    ? ` Resets on ${formatLongDate(refused.resetsOn, refused.timezone)}.`
    : ' Choose a plan to keep generating.'
}

/**
 * The one sentence a refused spend shows, wherever it is refused. A pool with something left
 * says so — "2 left and this needs 3" — rather than claiming it is empty. Pictures earlier posts
 * still owe are named only when they are the cause: when the spend alone would fit.
 */
export function allowanceUsedUp(
  kind: AllowanceKind,
  used: number,
  quota: number,
  needed: number,
  refused: Refusable,
  owed?: OwedImages
): string {
  const left = Math.max(0, quota - used)
  const sentence =
    kind === 'image' && owed && owed.images > 0 && needed <= left
      ? owedImagesWaiting(owed, left)
      : left > 0 && needed > left
        ? tooFew(kind, left, needed)
        : allUsed(kind, quota)
  return sentence + wayForward(refused)
}

/**
 * What the wizard says about what a run may still make, before the server is asked: how many
 * posts are left, or — when the run wants more than that — the refusal the server would answer
 * with. `left` is the posts affordable at the chosen format with the owed pictures set aside, and
 * `limiting` the pool that ran out first (`postsAffordable`, post-allowance.ts), so an empty image
 * pool is named as one rather than reported as missing drafts. When pictures are what binds and
 * `pool` says what is left of them, the sentence is about pictures (`imagesShort`): the waiting
 * posts only when the run would fit without them, otherwise what the run — at least one post of
 * this format — needs against what is left.
 */
export function postsLeft(
  left: number,
  limiting: AllowanceKind | null,
  needed = 0,
  pool?: ImagePool
): string {
  const short = left === 0 || needed > left
  if (short && limiting === 'image' && pool) {
    return imagesShort(Math.max(needed, 1) * pool.perPost, pool)
  }
  if (left === 0) return allUsed(limiting ?? 'draft', null)
  const posts = pluralise(left, 'post')
  if (needed > left) return `You have ${posts} left this period and this needs ${needed}.`
  return `${posts} left this period`
}

/**
 * The visuals cron's bell for posts in the review queue it could not paint because the image
 * pool cannot pay for them whole — once per period (`images_waiting:<period>`), with the count of
 * the posts this tick found, and the way the pictures come back.
 */
export function imagesWaiting(count: number, refused: Refusable): string {
  const verb = count === 1 ? 'is' : 'are'
  const them = count === 1 ? 'it' : 'them'
  return `${pluralise(count, 'post')} in your review queue ${verb} waiting for pictures, and this period's AI images cannot cover ${them}.${wayForward(refused)}`
}

/**
 * The 80 % warning's sentence. `settleUsage` keys the bell by period and pool, so it lands once a
 * period whatever the sentence says; the trial has one period.
 */
export function allowanceWarning(
  kind: AllowanceKind,
  used: number,
  quota: number,
  dated: Dated
): string {
  const reset = dated.resetsOn
    ? ` Resets on ${formatLongDate(dated.resetsOn, dated.timezone)}.`
    : ''
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
 * Adding a client is charged pro rata and deleting one lowers the next renewal and cannot be
 * undone, so both are for admins (`clientRosterRefusal`).
 */
export const CLIENTS_ADMINS_ONLY = 'Only admins can add or delete clients.'

/**
 * Why this person may not add or delete a client, or null for an admin. The one rule for
 * `createClient` and `deleteClient` (src/features/clients/actions/client-actions.ts), every
 * Add-client control (through `addBrandRefusal`) and the client danger rail. `role` is the cached
 * `users.role` the page or action already holds (`requireSessionUser`, `resolveActionAuth`).
 */
export function clientRosterRefusal(role: string): string | null {
  return role === 'admin' ? null : CLIENTS_ADMINS_ONLY
}

/**
 * Why one more brand is refused right now, or null when it may be added: a member never may
 * (`clientRosterRefusal`, asked first, whatever the plan or the count), then the plan decides. One
 * rule for the action that creates the brand and the button that leads to it, so the button never
 * promises what the action then refuses.
 */
export function addBrandRefusal(
  entitlement: Entitlement,
  brandCount: number,
  role: string
): string | null {
  const roster = clientRosterRefusal(role)
  if (roster) return roster
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
 * A live plan is ended under Plan & billing (`setPlanEndingAction`), and deletion is allowed the
 * moment it is set to end (`Entitlement.canDelete`) — or at once when its renewal failed, which
 * cancelling ends immediately (`setPlanEnding`), so there is no access left to keep.
 */
export function deleteWorkspaceRefusal(
  entitlement: Pick<Entitlement, 'canDelete' | 'paymentFailed'>
): string | null {
  if (entitlement.canDelete) return null
  return entitlement.paymentFailed
    ? 'Cancel your plan first, under Plan & billing. It ends at once and the failed payment is not collected; you can delete the workspace right after.'
    : 'Cancel your plan first, under Plan & billing. You keep access until it ends, and can delete the workspace right after.'
}

/**
 * What pausing does to what was made, in the one wording every sentence about it uses. A paused
 * workspace shows only Settings (`BillingWall`, src/components/layout/billing-wall.tsx), so it
 * never promises the work can be read meanwhile.
 */
const WORKSPACE_PAUSES = 'the workspace pauses and keeps everything you made'

/**
 * What cancelling the plan means, said before the person confirms it. A plan whose renewal failed
 * ends at once (`setPlanEnding`) and its failed payment is not collected; any other ends with its
 * period, in the same "ends on" words as the shell, so the confirm and the banner never disagree.
 * On house only the billing stops — the workspace itself never pauses.
 */
export function cancelPlanConsequence(
  entitlement: Pick<Entitlement, 'plan' | 'paymentFailed' | 'resetsOn' | 'timezone'>
): string {
  if (entitlement.plan === 'house') {
    return 'Billing for this workspace stops and nothing more is charged. The workspace keeps running as it is.'
  }
  if (entitlement.paymentFailed) {
    return `Your plan ends now and the failed payment is not collected; ${WORKSPACE_PAUSES}. You can delete it any time.`
  }
  const ends = entitlement.resetsOn
    ? `${planEndsOn(entitlement.resetsOn, entitlement.timezone)} and nothing more is charged.`
    : 'Your plan ends with the current period and nothing more is charged.'
  return `${ends} You keep full access until then; after that ${WORKSPACE_PAUSES}. You can delete it any time.`
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
 * many clients the workspace has today — Checkout's quantity (`billableQuantity`).
 */
export function checkoutSummary(mode: Entitlement['mode'], clientCount: number): string {
  const count = billableQuantity(clientCount)
  return `${formatMoney(PRO_PLAN.priceCents)} a month per ${brandWord(mode, 1)} excl. VAT · ${count} ${brandWord(mode, count)} today`
}

/**
 * Under the Add-client button on a paid workspace: what one more costs. Null on the trial and on
 * house, where a new client costs nothing, and when the workspace cannot create. A client within
 * the count already paid for this period costs nothing until renewal — the quantity sync charges
 * only above it (`syncSubscriptionQuantity`, src/lib/billing/quantity-sync.ts). That count is
 * honoured only while its period is still running (`resetsOn`, null while a renewal is unpaid),
 * the same test the sync makes against Stripe's period. The exact pro-rata figure is on the
 * invoice.
 */
export function addBrandCost(
  entitlement: Pick<Entitlement, 'plan' | 'canCreate' | 'brands' | 'resetsOn'>,
  brandCount: number,
  now: Date = new Date()
): string | null {
  if (entitlement.plan !== 'pro' || !entitlement.canCreate) return null
  const price = formatMoney(PRO_PLAN.priceCents)
  const paidPeriodRunning = entitlement.resetsOn !== null && now < entitlement.resetsOn
  return paidPeriodRunning && brandCount < entitlement.brands
    ? `Already paid for this period; adds ${price} a month excl. VAT from renewal.`
    : `Adds ${price} a month excl. VAT, charged pro rata today.`
}

/**
 * What an "Add client" control says: why it is refused, or what the new client costs, and whether
 * Plan & billing is the way past a refusal (`wayOut`).
 */
export type AddBrandGate = { refusal: string | null; note: string | null; wayOut: boolean }

/**
 * Everything an "Add client" control says, for the person looking at it (`role`). One answer for
 * every place the control appears — the roster, the dashboard, the command palette — so none of
 * them offers what `createClient` then refuses or charges without saying so. `wayOut` is whether
 * this person may change the roster (`clientRosterRefusal`): an admin's every refusal is the
 * plan's, which Plan & billing changes; a member's is not, so no control sends a member there.
 */
export function addBrandGate(
  entitlement: Entitlement,
  brandCount: number,
  role: string
): AddBrandGate {
  return {
    refusal: addBrandRefusal(entitlement, brandCount, role),
    note: addBrandCost(entitlement, brandCount),
    wayOut: clientRosterRefusal(role) === null,
  }
}

/**
 * What deleting a client does to the bill, said in the delete confirmation. Null where
 * `addBrandCost` is — on the trial, on house, and when the workspace cannot create — and while the
 * plan is set to end, since no renewal is left to change. Otherwise the renewal bills one client
 * fewer and this period's allowance stays, because the decrease is never credited
 * (`syncSubscriptionQuantity`, src/lib/billing/quantity-sync.ts) — unless this is the last
 * client: the plan bills at least one (`billableQuantity`) until it is cancelled under Plan &
 * billing.
 */
export function deleteClientNotice(
  entitlement: Pick<Entitlement, 'plan' | 'canCreate' | 'planEnding' | 'resetsOn' | 'timezone'>,
  clientCount: number
): string | null {
  if (entitlement.plan !== 'pro' || !entitlement.canCreate || entitlement.planEnding) return null
  if (billableQuantity(clientCount - 1) === billableQuantity(clientCount)) {
    return 'Your plan keeps billing for one client until you cancel it under Plan & billing.'
  }
  const renewal = entitlement.resetsOn
    ? `renewal on ${formatLongDate(entitlement.resetsOn, entitlement.timezone)}`
    : 'next renewal'
  return `Your plan bills one client fewer from its ${renewal}. This period's allowance stays as it is.`
}

/** A client whose charge a declined card refused — the card's own words, then the way on. */
export function cardDeclined(stripeMessage: string): string {
  return `The card on file was declined: ${stripeMessage} Update it in Plan & billing and try again.`
}

/** A client whose charge failed for any other reason; Stripe's error is logged as its cause. */
export const CLIENT_NOT_ADDED = 'The new client could not be added to your plan. Please try again.'

/** Two changes to the paid client count at once: the second waits, then gives way with this. */
export const QUANTITY_SYNC_BUSY =
  'Another change to your plan is in progress. Try again in a moment.'

/** A workspace with an open subscription, or on house, asking for Checkout again. */
export const PLAN_ALREADY_ACTIVE = 'This workspace already has a plan. Manage it in Plan & billing.'

/**
 * Stripe already holds an open subscription the row does not show yet — the webhook is still on
 * its way, or a second tab paid first (`createCheckoutSession`).
 */
export const PLAN_ACTIVATING = 'Your plan is being activated — it appears here in a few seconds.'

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

/** A fact on the checkout return card: what it names, and its value in tabular figures. */
export interface PlanFact {
  label: string
  value: string
}

/**
 * The card the admin lands on when Checkout sends them back, in its two pending moments: the
 * webhook is still writing the row, or it is later than a minute and the person may refresh.
 */
export const CHECKOUT_ARRIVAL = {
  activating: {
    title: 'Payment received',
    pill: 'Activating',
    text: 'Stripe confirmed your payment. Your plan appears here in a few seconds.',
  },
  waiting: {
    title: 'Payment received',
    pill: 'Pending',
    text: 'Your plan will show here within a minute. Nothing more to do — refresh if it does not.',
  },
} as const

/**
 * The same card once the row says the plan is live: the plan by name, the facts a person wants
 * to see confirmed — how many clients, what a month costs, when it renews — and where the
 * invoice went. Before the document exists the sentence promises it without a number.
 */
export function checkoutActivated(
  entitlement: Pick<Entitlement, 'plan' | 'mode' | 'brands' | 'resetsOn' | 'timezone'>,
  invoice: { number: number; email: string | null } | null
): { title: string; facts: PlanFact[]; text: string } {
  const facts: PlanFact[] = [
    { label: brandsLabel(entitlement.mode), value: String(entitlement.brands) },
    {
      label: 'A month',
      value: `${formatMoney(PRO_PLAN.priceCents * entitlement.brands)} excl. VAT`,
    },
  ]
  if (entitlement.resetsOn) {
    facts.push({
      label: 'Renews',
      value: formatLongDate(entitlement.resetsOn, entitlement.timezone),
    })
  }
  const where = invoice?.email ? ` to ${invoice.email}` : ' by email'
  const text = invoice
    ? `Invoice No. ${formatDocumentNumber(invoice.number)} is on its way${where} and is listed under Invoices below.`
    : 'Your invoice is on its way by email and will be listed under Invoices below.'
  return { title: `You’re on ${PLAN_LABELS[entitlement.plan]}`, facts, text }
}

/** The trial-grace sentence: when the trial ended, and until when scheduled posts still go out. */
function trialEndedSentence(trialEndsAt: Date, graceEndsAt: Date, timeZone: string): string {
  return `Your trial ended on ${formatLongDate(trialEndsAt, timeZone)}. Scheduled posts still go out until ${formatLongDate(graceEndsAt, timeZone)}; choose a plan to keep generating.`
}

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
      text: `Your trial ends on ${formatLongDate(trialEndsAt, timezone)} — choose a plan to keep generating.`,
    }
  }
  if (state === 'trial_grace' && trialEndsAt && graceEndsAt) {
    return { tone: 'bad', text: trialEndedSentence(trialEndsAt, graceEndsAt, timezone) }
  }
  if (state === 'past_due' && graceEndsAt) {
    return {
      tone: 'warn',
      text: `Your last payment failed. Update your card by ${formatLongDate(graceEndsAt, timezone)} to keep your workspace running.`,
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

/**
 * What a Generate control says when the pictures earlier posts still owe could not be read: an
 * unknown figure is not zero, so no run is offered on it.
 */
export const OWED_IMAGES_UNKNOWN =
  'Could not check what your waiting posts still need. Reload the page to try again.'

/**
 * Why this workspace cannot spend, and the one action that changes it — null when it can. The
 * one answer to that question for the paused wall (`pausedNotice`) and the 402 and action
 * refusals (src/lib/billing/require-entitled.ts): in the trial's grace it is the banner's own
 * sentence; after a failed renewal it asks for the card (the plan is still open, so choosing a
 * new one would be refused); otherwise the workspace is paused and a plan is the way back.
 */
export function cannotSpendNotice(
  entitlement: Pick<
    Entitlement,
    'canSpend' | 'state' | 'paymentFailed' | 'trialEndsAt' | 'graceEndsAt' | 'timezone'
  >
): { text: string; cta: string } | null {
  if (entitlement.canSpend) return null
  const { state, trialEndsAt, graceEndsAt, timezone } = entitlement
  if (state === 'trial_grace' && trialEndsAt && graceEndsAt) {
    return { text: trialEndedSentence(trialEndsAt, graceEndsAt, timezone), cta: 'Choose a plan' }
  }
  if (entitlement.paymentFailed) {
    return {
      text: `Your workspace is paused because your last payment failed. ${UPDATE_YOUR_CARD}`,
      cta: 'Update your card',
    }
  }
  return { text: WORKSPACE_LOCKED, cta: 'Choose a plan' }
}

/**
 * What the paused wall says (`BillingWall`, src/components/layout/billing-wall.tsx), or null while
 * the workspace is not paused. Only `locked` is walled: the trial's grace cannot spend either, but
 * its scheduled posts still go out and its pages stay open, with the banner saying why.
 */
export function pausedNotice(
  entitlement: Parameters<typeof cannotSpendNotice>[0]
): { text: string; cta: string } | null {
  return entitlement.state === 'locked' ? cannotSpendNotice(entitlement) : null
}

/**
 * What pausing means for what was made and scheduled — the wall's second line and the paused
 * email's detail. Posts due while paused wait; once a plan is active, the ones due in the last day
 * go out and older ones fail for rescheduling (`publishDuePosts`,
 * src/features/publishing/lib/scheduler.ts).
 */
export const WORKSPACE_LOCKED_DETAIL =
  'The workspace keeps everything you made. Once a plan is active, posts due in the last day go out; older ones are marked failed in the calendar for you to reschedule.'

/** The bell and the email once a trial's grace has run out — dated, so a redelivered tick lands once. */
export function workspacePaused(
  entitlement: Pick<Entitlement, 'graceEndsAt' | 'timezone'>
): string {
  const on = entitlement.graceEndsAt
    ? ` on ${formatLongDate(entitlement.graceEndsAt, entitlement.timezone)}`
    : ''
  return `Your workspace was paused${on}. ${CHOOSE_PLAN_AGAIN}`
}

/**
 * What each reminder email says beyond the bell's own sentence: the subject line, the plate label,
 * the headline, one paragraph of what the sentence does not already say, and the button's words.
 * The grace is `GRACE_DAYS`, never a word for it. The paused detail is the wall's second line, so
 * the email and the screen agree.
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
    detail: `After it ends, posts already scheduled still go out for ${GRACE_DAYS} days; then ${WORKSPACE_PAUSES}.`,
    cta: 'Choose a plan',
  },
  trial_ended: {
    subject: 'Your Kontuur trial has ended',
    label: 'Trial',
    headline: { lead: 'Your trial has', accent: 'ended' },
    detail: `After that date ${WORKSPACE_PAUSES}, ready for when a plan is active.`,
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
    detail: `The charge is tried again as soon as the card is updated. After ${GRACE_DAYS} days without a payment ${WORKSPACE_PAUSES}.`,
    cta: 'Update your card',
  },
}

/**
 * Titles for the bell rows about the workspace's plan rather than one client's content.
 * `allowance_reached` has two raisers: the generate cron, once per workspace, period and pool, naming
 * the first client the empty pool stopped (`notifyAllowanceExhausted`, keyed
 * `allowance_reached:<period>:<kind>`, src/lib/generation/scheduled-run.ts), and the visuals cron,
 * once per period, naming no client (`ringImagesWaiting`, keyed `images_waiting:<period>`,
 * src/lib/visual/paint-backlog.ts). The pool is the workspace's, so no client leads a billing title
 * and every one of these rows opens Plan & billing (`OPEN_PLAN_AND_BILLING`).
 */
export const BILLING_NOTIFICATION_TITLES: Partial<Record<NotificationType, string>> = {
  allowance_warning: 'An allowance is nearly used up',
  allowance_reached: 'An allowance is used up',
  trial_ending: 'Your trial ends soon',
  trial_ended: 'Your trial has ended',
  workspace_paused: 'Your workspace is paused',
  payment_failed: 'A payment failed',
}

/** The link on every billing bell row, which opens Plan & billing. */
export const OPEN_PLAN_AND_BILLING = 'Open plan & billing →'

/** The paused wall's heading (`BillingWall`, src/components/layout/billing-wall.tsx). */
export const WORKSPACE_PAUSED_HEADING = 'Workspace paused'

/**
 * The Plan & billing section's words (`PlanSection`, src/features/settings/components/plan-section.tsx):
 * its heading and rows, each state's status pill, and the name of the one date that matters next.
 */
export const PLAN_SECTION = {
  legend: 'Plan & billing',
  description: 'Your plan, its allowances, and how much of them this period has used.',
  plan: 'Current plan',
  status: 'Status',
  states: {
    trial: 'Trial',
    trial_grace: 'Trial ended',
    active: 'Active',
    past_due: 'Payment failed',
    locked: 'Paused',
  } satisfies Record<EntitlementState, string>,
  dates: {
    trialEnds: 'Trial ends',
    pausesOn: 'Workspace pauses on',
    updateCardBy: 'Update your card by',
    endsOn: 'Ends on',
    renewsOn: 'Renews on',
  },
} as const
