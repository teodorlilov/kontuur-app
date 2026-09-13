import type { AllowanceKind } from './plans'

/**
 * Every billing sentence a person reads, in one file — so the Bulgarian strings are a one-file
 * job when an i18n layer exists, and so the same fact is never worded two ways. Plain words: a
 * "brand" on user-facing surfaces (the paying customer is never a "client"), dates written out,
 * no jargon standing in for an explanation.
 */

export const ALLOWANCE_NOUNS: Record<AllowanceKind, string> = {
  draft: 'AI drafts',
  image: 'AI images',
  rewrite: 'rewrites',
}

/** "1 October" style, for a reset or trial date; the caller decides the locale later. */
function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

/** The one sentence a refused spend shows, wherever it is refused. */
export function allowanceUsedUp(
  kind: AllowanceKind,
  used: number,
  quota: number,
  resetsOn: Date | null
): string {
  const reset = resetsOn ? ` Resets on ${formatDay(resetsOn)}.` : ''
  return `You've used all ${quota} ${ALLOWANCE_NOUNS[kind]} for this period (${used} of ${quota}).${reset}`
}

/** The 80 % warning — carries the period so one bell per period lands, never one per tick. */
export function allowanceWarning(
  kind: AllowanceKind,
  used: number,
  quota: number,
  periodKey: string
): string {
  return `${used} of ${quota} ${ALLOWANCE_NOUNS[kind]} used this period (${periodKey}).`
}

export const WORKSPACE_LOCKED =
  'Your workspace is paused. Choose a plan to generate, schedule and publish again.'
