import { MS_PER_DAY } from '@/utils/constants'
import { formatDocumentNumber, formatLongDate, formatMoney, pluralise } from '@/utils/format'
import type { BillingReminderType, NotificationType } from '@/types/api'
import { brandCap, type Entitlement, type EntitlementState } from './entitlement'
import {
  GRACE_DAYS,
  MAX_CLIENT_SLOTS,
  PLAN_LABELS,
  PRO_PLAN,
  TRIAL_NOTICE_DAYS,
  chargesToday,
  monthlyCents,
  proRataCents,
  slotChange,
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

/** "You have 2 posts left this period and this needs 3." — `counted` is the count in its own noun. */
function tooFew(counted: string, needed: number): string {
  return `You have ${counted} left this period and this needs ${needed}.`
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
 * Why a spend of `needed` cannot be paid from a pool with `left`: the pictures waiting posts owe,
 * when the spend alone would fit; otherwise what is left against what is needed; and only an empty
 * pool is "all used", naming its size when the caller knows it (`quota`). Never names more left
 * than there is. The one chooser for the server's refusals and the wizard's picture line; the
 * wizard's draft line counts posts and words its own (`postsLeft`).
 */
function shortfall(
  kind: AllowanceKind,
  left: number,
  needed: number,
  quota: number | null,
  owed?: OwedImages
): string {
  if (kind === 'image' && owed && owed.images > 0 && needed <= left) {
    return owedImagesWaiting(owed, left)
  }
  if (left > 0 && needed > left) return tooFew(pluralise(left, ALLOWANCE_NOUN[kind]), needed)
  return allUsed(kind, quota)
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
 * The one sentence a refused spend shows, wherever it is refused — the 402s, the scheduled run's
 * bell and every Generate control (`generationGate`, post-allowance.ts): why it is short
 * (`shortfall`), then how the allowance comes back (`wayForward`).
 */
export function allowanceUsedUp(
  kind: AllowanceKind,
  used: number,
  quota: number,
  needed: number,
  refused: Refusable,
  owed?: OwedImages
): string {
  return shortfall(kind, Math.max(0, quota - used), needed, quota, owed) + wayForward(refused)
}

/**
 * The wizard's live line about what a run at the chosen format may still make (`CountSteppers`,
 * `RunPanel`): how many posts are left, or why the run is short. `left` is the posts affordable
 * with the owed pictures set aside, and `limiting` the pool that ran out first
 * (`postsAffordable`, post-allowance.ts), so an empty image pool is named as one rather than
 * reported as missing drafts; when pictures bind and `pool` says what is left of them, the
 * sentence is `shortfall`'s for the run's pictures — at least one post of this format.
 */
export function postsLeft(
  left: number,
  limiting: AllowanceKind | null,
  needed = 0,
  pool?: ImagePool
): string {
  const short = left === 0 || needed > left
  if (short && limiting === 'image' && pool) {
    return shortfall('image', pool.left, Math.max(needed, 1) * pool.perPost, null, pool.owed)
  }
  if (left === 0) return allUsed(limiting ?? 'draft', null)
  const posts = pluralise(left, 'post')
  if (needed > left) return tooFew(posts, needed)
  return `${posts} left this period`
}

/**
 * The visuals cron's bell for posts in the review queue it could not paint because the image
 * pool cannot pay for them whole — once per period and pool size (`ringImagesWaiting`,
 * src/lib/visual/paint-backlog.ts), with the count of the posts this tick found, and the way the
 * pictures come back.
 */
export function imagesWaiting(count: number, refused: Refusable): string {
  const verb = count === 1 ? 'is' : 'are'
  const them = count === 1 ? 'it' : 'them'
  return `${pluralise(count, 'post')} in your review queue ${verb} waiting for pictures, and this period's AI images cannot cover ${them}.${wayForward(refused)}`
}

/**
 * The 80 % warning's sentence. `settleUsage` (src/lib/billing/usage.ts) keys the bell by period,
 * pool and pool size, so it lands once per pool size whatever the sentence says; the trial has one
 * period.
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

/**
 * Why a new brand was refused — the plan's cap, and the way past it: a solo workspace holds its one
 * business on every plan, the paid plan's client slots (docs/plans/CLIENT-SLOTS.md) take a slot
 * more, and the trial's clients take a plan.
 */
function brandCapReached(entitlement: Entitlement): string {
  const { plan, mode, brands } = entitlement
  if (mode === 'solo') return 'Your plan covers one business.'
  if (plan === 'pro') {
    return brands === 1
      ? 'Your one client slot is in use. Add a slot to add more.'
      : `All ${brands} client slots are in use. Add a slot to add more.`
  }
  return `${PLAN_LABELS[plan]} includes ${pluralise(brands, 'client')}. Choose a plan to add more.`
}

/**
 * A client takes one of the plan's slots and deleting one cannot be undone, so adding and deleting
 * are for admins (`clientRosterRefusal`).
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
 * (`clientRosterRefusal`, asked first, whatever the plan or the count); a workspace that cannot
 * spend is pointed at the one action `cannotSpendNotice` names for it — a card to update while its
 * plan is still open, a plan otherwise; then the cap decides. One rule for the action that creates
 * the brand and the button that leads to it, so the button never promises what the action refuses.
 */
export function addBrandRefusal(
  entitlement: Entitlement,
  brandCount: number,
  role: string
): string | null {
  const roster = clientRosterRefusal(role)
  if (roster) return roster
  const paused = cannotSpendNotice(entitlement)
  if (paused) {
    return `${paused.cta} to ${entitlement.mode === 'solo' ? 'set up your business' : 'add clients'}.`
  }
  const cap = brandCap(entitlement)
  if (cap === null || brandCount < cap) return null
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

/** A workspace delete that failed — the action's answer and the dialog's, for a fault the person cannot fix. */
export const WORKSPACE_NOT_DELETED = 'Could not delete the workspace. Please try again.'

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
    ? `${planEndsOn(entitlement.resetsOn, entitlement.timezone)}.`
    : 'Your plan ends with the current period.'
  return `${ends} You keep full access until then; after that ${WORKSPACE_PAUSES}. You can delete it any time.`
}

/** Cancelling asks for a plan that is running and not already set to end. */
export const NO_PLAN_TO_CANCEL = 'There is no running plan to cancel.'

/** Keeping asks for a plan that is set to end and has not ended yet. */
export const NO_PLAN_TO_KEEP = 'Your plan is not set to end.'

/** The plan-end control's labels (`PlanEndControl`, src/features/settings/components/plan-end-control.tsx). */
export const PLAN_END = {
  cancel: 'Cancel plan',
  keep: 'Keep plan',
  confirmTitle: 'Cancel your plan',
  stay: 'Keep it',
} as const

/** The toast after the plan's end changed (`setPlanEndingAction`): ended at once, set to end, or kept. */
export function planEndingChanged(endedNow: boolean, ending: boolean): string {
  if (endedNow) return 'Your plan has ended.'
  return ending ? 'Your plan is set to end.' : 'Your plan continues.'
}

/**
 * The one extra line the delete confirmation carries while a cancelled plan is still running —
 * the customer has paid for days that deletion gives up — or null when there is no such plan.
 */
export function deleteWorkspaceNotice(
  entitlement: Pick<Entitlement, 'endsOn' | 'timezone'>
): string | null {
  return entitlement.endsOn ? `${planEndsOn(entitlement.endsOn, entitlement.timezone)}.` : null
}

/**
 * What a gated control says: why it is refused (null when it is not), and whether Plan & billing is
 * the way past the refusal. One shape for Add client (`addBrandGate`) and Generate
 * (`generationGate`, src/lib/billing/post-allowance.ts), drawn by `GatedAction`
 * (src/components/ui/gated-action.tsx).
 */
export interface PlanGate {
  refusal: string | null
  wayOut: boolean
}

/**
 * Everything an "Add client" control says, for the person looking at it (`role`). One answer for
 * every place the control appears — the roster, the dashboard, the command palette — so none of
 * them offers what `createClient` then refuses. `wayOut` is whether this person may change the
 * roster (`clientRosterRefusal`): an admin's every refusal is the plan's, which Plan & billing
 * changes; a member's is not, so no control sends a member there.
 */
export function addBrandGate(entitlement: Entitlement, brandCount: number, role: string): PlanGate {
  return {
    refusal: addBrandRefusal(entitlement, brandCount, role),
    wayOut: clientRosterRefusal(role) === null,
  }
}

/**
 * What deleting a client does to the bill, said in the delete confirmation: the slot is freed and
 * the bill stays, since only the slot count sets what the plan bills (docs/plans/CLIENT-SLOTS.md).
 * Null off the paid plan, on a solo workspace, when the workspace cannot spend, while the plan is
 * set to end — where lowering the slots is not offered (`slotsUnavailable`) — and while the
 * workspace holds more clients than slots (`clientCount`), where a delete frees none and the
 * Clients meter already shows the overrun in red.
 */
export function deleteClientNotice(
  entitlement: Pick<Entitlement, 'plan' | 'mode' | 'canSpend' | 'planEnding' | 'brands'>,
  clientCount: number
): string | null {
  const { plan, mode, canSpend, planEnding, brands } = entitlement
  if (plan !== 'pro' || mode === 'solo' || !canSpend || planEnding || clientCount > brands) {
    return null
  }
  return brands === 1
    ? 'This frees your client slot. Your plan still bills for one client until you cancel it in Plan & billing.'
    : `This frees one of your ${brands} client slots. Your plan still bills for ${brands}; to pay for fewer, lower your slots in Plan & billing.`
}

/**
 * What a number of client slots costs a month, beside the slot control
 * (`ClientSlotsControl`, src/features/settings/components/client-slots-control.tsx): the count
 * times the price, or a solo workspace's one business.
 */
export function slotsSummary(mode: Entitlement['mode'], slots: number): string {
  const price = formatMoney(PRO_PLAN.priceCents)
  if (mode === 'solo') return `${price} a month excl. VAT for your business`
  return `${pluralise(slots, 'client')} × ${price} = ${formatMoney(monthlyCents(slots))} a month excl. VAT`
}

/** What a slot change's confirm is worked out from; `period` is the row's, and it ends at the renewal. */
interface SlotChangeInput {
  from: number
  to: number
  paid: number
  period: { start: Date; end: Date }
  timezone: string
  now: Date
}

/**
 * The confirm the slot control shows before a change (`ClientSlotsControl`): its title, the
 * sentence, and the two buttons. The kind and the charged slots come from `slotChange` and the
 * amount from `proRataCents` (src/lib/billing/plans.ts) — the rules `setClientSlots` writes with —
 * so the confirm and the charge cannot disagree. The amount is an estimate net of VAT; Stripe's
 * invoice carries the exact figure.
 */
export function slotChangeConsequence(input: SlotChangeInput): {
  title: string
  body: string
  confirm: string
  cancel: string
} {
  const { from, to, paid } = input
  const change = slotChange(from, to, paid)
  const step = Math.abs(to - from)
  const slots = pluralise(step, 'client slot')
  const buttons = step === 1 ? 'slot' : 'slots'
  const renewal = formatLongDate(input.period.end, input.timezone)
  const monthly = `From ${renewal} you pay ${formatMoney(monthlyCents(to))} a month excl. VAT for ${pluralise(to, 'client')}.`
  const cancel = `Keep ${from}`
  if (change.kind === 'lower') {
    return {
      title: `Remove ${slots}`,
      body: `${monthly} Nothing is refunded, and this period's allowance stays as it is. From now on the workspace holds at most ${pluralise(to, 'client')}.`,
      confirm: `Remove ${buttons}`,
      cancel,
    }
  }
  if (change.kind !== 'raise') {
    return {
      title: `Add ${slots}`,
      body: `You already paid for ${paid} this period, so nothing is charged today. ${monthly}`,
      confirm: `Add ${buttons}`,
      cancel,
    }
  }
  const cents = proRataCents(change.charged, input.period, input.now)
  const free = step - change.charged
  const alreadyPaid =
    free > 0 ? ` ${free} of them ${free === 1 ? 'is' : 'are'} already paid for this period.` : ''
  const today = chargesToday(change.charged, input.period, input.now)
    ? `About ${formatMoney(cents)} excl. VAT is charged today for the rest of this period, with its own invoice.`
    : `About ${formatMoney(cents)} excl. VAT for the rest of this period is added to your invoice on ${renewal}, since it is below the smallest amount a card can be charged.`
  return {
    title: `Add ${slots}`,
    body: `${today}${alreadyPaid} ${monthly}`,
    confirm: `Add ${buttons}`,
    cancel,
  }
}

/**
 * What a slot change did (`setClientSlots`, src/lib/billing/client-slots.ts): charged at once, left
 * on the renewal invoice, restored uncharged, lowered from the renewal, or nothing to change.
 */
export type SlotChangeOutcome = 'charged' | 'on_renewal' | 'restored' | 'lowered' | 'same'

/**
 * The toast after a slot change, from what the server says it did. A restore below what this
 * period paid for (`paid`) is worded from the renewal, as a lower is: the period keeps its count.
 */
export function slotsChanged(outcome: SlotChangeOutcome, to: number, paid: number): string {
  const count = pluralise(to, 'client')
  if (outcome === 'charged') {
    return `You now pay for ${count}. The invoice for the rest of this period is on its way by email.`
  }
  if (outcome === 'on_renewal') {
    return `You now pay for ${count}. The amount for the rest of this period is added to your next invoice.`
  }
  if (outcome === 'restored') {
    return to < paid
      ? `From your next renewal you pay for ${count}. Nothing was charged.`
      : `You now pay for ${count} again. Nothing was charged.`
  }
  if (outcome === 'lowered') {
    return `From your next renewal you pay for ${count}. Nothing was charged or refunded.`
  }
  return 'Your client slots are unchanged.'
}

/**
 * A lower, or a first Checkout, below the clients the workspace already has — or below one, which
 * no delete can reach (`billableQuantity`, src/lib/billing/plans.ts).
 */
export function slotsBelowClients(clientCount: number): string {
  if (clientCount <= 1) return 'A plan pays for at least one client.'
  return `You have ${pluralise(clientCount, 'client')}. Delete a client first to pay for fewer.`
}

/**
 * The line under the slot stepper: the room left above the clients held, or, at the floor, why it
 * goes no lower — before a first Checkout as the plain floor, on a running plan as the way to it.
 * Nothing while the workspace holds more clients than slots: the Clients meter shows that in red.
 */
export function slotsHint(
  phase: 'checkout' | 'change',
  slots: number,
  clientCount: number
): string | null {
  if (slots < clientCount) return null
  if (slots > clientCount) {
    return `Room for ${pluralise(slots - clientCount, 'more client')} before you need another slot.`
  }
  if (phase === 'checkout' && clientCount > 1) {
    return `You have ${pluralise(clientCount, 'client')}, so you pay for at least ${clientCount}.`
  }
  return slotsBelowClients(clientCount)
}

/** A slot change or a slot count asked of a workspace with no paid plan. */
export const SLOTS_NEED_PLAN = 'Choose a plan first.'

/** A solo workspace always pays for its one business — it has no slot count to choose. */
export const SLOTS_SOLO = 'A solo workspace pays for its one business.'

/** A slot count that is not a whole number of slots — only a hand-made request sends one. */
export const SLOTS_INVALID = 'Invalid number of client slots'

/** A raise past `MAX_CLIENT_SLOTS` (src/lib/billing/plans.ts). */
export const SLOTS_TOO_MANY = `A workspace can pay for at most ${MAX_CLIENT_SLOTS} client slots.`

/** Stripe's count is not the one the page showed: another window changed it first. */
export const SLOTS_CHANGED_ELSEWHERE =
  'Your client slots were changed in another window. Reload the page and try again.'

/** The plan renewed after the page was drawn, so its confirm priced a period that has ended. */
export const SLOTS_PAGE_STALE =
  'Your plan has renewed since this page loaded. Reload the page to see its new period.'

/**
 * Stripe has started the new period and its renewal is not paid yet (`setClientSlots`): Stripe
 * takes a renewal's payment about an hour after the period starts, and the page says so.
 */
export const SLOTS_RENEWAL_PENDING =
  'Your plan is renewing, and its payment is taken within about an hour. Reload this page after that to change your client slots.'

/**
 * Why the client slots cannot be changed at `now`, or null when they can: a change needs the paid
 * plan, active and not set to end, on an agency workspace, inside a period that has not run out
 * (docs/plans/CLIENT-SLOTS.md) — past its end the renewal is still being paid, and Stripe has moved
 * to a period the row does not know yet. One answer for the slot control and
 * `setClientSlotsAction`, so a stale tab is refused in the words the page shows; `setClientSlots`
 * asks Stripe the same about its own period.
 */
export function slotsUnavailable(
  entitlement: Pick<
    Entitlement,
    'plan' | 'mode' | 'state' | 'paymentFailed' | 'planEnding' | 'endsOn' | 'resetsOn' | 'timezone'
  >,
  now: Date
): string | null {
  const { plan, mode, state, paymentFailed, planEnding, endsOn, resetsOn, timezone } = entitlement
  if (plan === 'house') return 'The Internal plan has no client slots to change.'
  if (mode === 'solo') return SLOTS_SOLO
  if (paymentFailed) return `Your last payment failed. ${UPDATE_YOUR_CARD}`
  if (planEnding && endsOn) {
    return `${planEndsOn(endsOn, timezone)}. Keep your plan to change its client slots.`
  }
  if (state !== 'active') return WORKSPACE_LOCKED
  if (resetsOn && now >= resetsOn) return SLOTS_RENEWAL_PENDING
  return null
}

/**
 * The slot control's labels (`ClientSlotsControl`, src/features/settings/components/
 * client-slots-control.tsx): before a first Checkout the count is what Checkout sells, after it
 * the client slots the plan holds.
 */
export const SLOTS_CONTROL = {
  beforeLabel: 'Clients to pay for',
  afterLabel: 'Client slots',
  help: 'Your plan holds this many clients.',
  fewer: 'One slot fewer',
  more: 'One slot more',
  change: 'Change',
  choose: 'Choose plan',
} as const

/** A lower waiting for the renewal: the period keeps what it paid for until then. */
export function slotsPendingLower(
  paid: number,
  ordered: number,
  renewsOn: Date,
  timezone: string
): string {
  return `You pay for ${paid} until ${formatLongDate(renewsOn, timezone)}, then ${ordered}.`
}

/** The button that opens Stripe's portal for the card, the address and the tax ID (`PlanActions`). */
export const MANAGE_BILLING = 'Manage billing'

/** A card declined on a slot raise — the card's own words, then the way on. */
export function cardDeclined(stripeMessage: string): string {
  return `The card on file was declined: ${stripeMessage} Update it under ${MANAGE_BILLING} and try again.`
}

/**
 * The bank asked to confirm a slot raise's payment (3-D Secure), which the app cannot take yet:
 * Stripe refused the change whole (`setClientSlots`), so nothing was charged and nothing moved.
 */
export const SLOTS_BANK_CONFIRMATION =
  'Your bank asked to confirm this payment, which Kontuur cannot take yet. Nothing was charged and your client slots are unchanged.'

/** Two slot changes at once: the second gives way with this (`setClientSlots`). */
export const SLOTS_BUSY = 'Another change to your plan is in progress. Try again in a moment.'

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

/** Checkout was left without paying (`CheckoutReturn`). */
export const CHECKOUT_CANCELLED = 'Checkout was cancelled — nothing was charged.'

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
      value: `${formatMoney(monthlyCents(entitlement.brands))} excl. VAT`,
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

/** What a sale document is called, from its `kind` — its PDF's title, its email and the Invoices list. */
export function documentKindLabel(kind: string): string {
  return kind === 'invoice' ? 'Invoice' : 'Credit note'
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
export function workspacePaused(pausedOn: Date, timeZone: string): string {
  return `Your workspace was paused on ${formatLongDate(pausedOn, timeZone)}. ${CHOOSE_PLAN_AGAIN}`
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
 * `allowance_reached` has two raisers: the generate cron, once per workspace, period, pool and
 * pool size, naming the first client the empty pool stopped (`notifyAllowanceExhausted`,
 * src/lib/generation/scheduled-run.ts), and the visuals cron, once per period and image pool size,
 * naming no client (`ringImagesWaiting`, src/lib/visual/paint-backlog.ts). The pool is the
 * workspace's, so no client leads a billing title and every one of these rows opens Plan & billing
 * (`OPEN_PLAN_AND_BILLING`).
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

/**
 * The Invoices section's words (`BillingDocuments`, src/features/settings/components/
 * billing-documents.tsx); each row's name is `documentKindLabel`'s.
 */
export const BILLING_DOCUMENTS = {
  legend: 'Invoices',
  description:
    'Every invoice and credit note, as issued at payment. Download links work for an hour.',
  empty: 'No documents yet — the first payment creates one.',
  linksMissing: 'Download links could not be made just now. Reload the page to try again.',
  download: 'Download',
  unavailable: 'Unavailable',
  preparing: 'Preparing…',
} as const
