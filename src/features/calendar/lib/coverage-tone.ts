import type { CoverageState } from './week-model'

/**
 * What a day state looks like, once.
 *
 * Two surfaces render it now — the 24px chips of a `CoverageStrip` and the month's
 * day cells — and they must not each pick their own. The calendar already spent this
 * mistake: seven surfaces had derived their own status colours before
 * `POST_STATUS_CHIP` collected them, and a coverage tone drifting from a post-status
 * tone would put the app back to eight.
 *
 * The states in ascending order of how much they have to say, so the ramp reads as one
 * ladder rather than six unrelated fills: a recess, a hatched outline, amber, a green
 * tint, solid green — and clay when something broke.
 *
 * Every occupied state carries an **inset ring** as well as a fill. The neutrals in
 * this system sit within 1.05:1 of each other by design (DESIGN.md leans on the contour
 * field for page-level depth, not on tone), so a fill alone is not a boundary at chip
 * size. The first version used Sunken for `none` and Surface for `scheduled`; on the
 * Amber row ground those measured 1.02:1 and 1.06:1 against what sat behind them —
 * a signature component rendering its data invisibly.
 *
 * Sized by the caller. A ring is a ring at 24px and at 64px, which is the whole reason
 * this is a class list and not a component.
 */
export const COVERAGE_TONE: Record<CoverageState, string> = {
  /** Nothing here, and nothing was expected. A recess, not a chip. */
  none: 'bg-ink/[0.05]',
  /**
   * `--hatch`, the token DESIGN.md reserves for absence, on Surface so the cell reads
   * as a place something could still go.
   */
  open: 'slot-open bg-surface ring-1 ring-inset ring-line2',
  missed: 'bg-pending/[0.22] ring-1 ring-inset ring-pending/[0.55]',
  /**
   * Marker on a Deep Pine edge — DESIGN.md § Chips pairs Marker with "scheduled", and
   * the edge is what separates a tint this light from the ground under it.
   */
  scheduled: 'bg-marker ring-1 ring-inset ring-forest/[0.38]',
  /** Solid: it happened, and it is the strongest thing coverage can say. */
  published: 'bg-forest',
  failed: 'bg-danger/[0.18] ring-1 ring-inset ring-danger/[0.55]',
}

/**
 * Ink that reads on the fill above.
 *
 * Only the two states that carry a numeral need it — a strip chip is empty. `published`
 * is the one solid fill, so it is the one that has to invert; everything else is a tint
 * on light and takes the ordinary ink.
 */
export const COVERAGE_INK: Record<CoverageState, string> = {
  none: 'text-text3',
  open: 'text-text2',
  missed: 'text-pending',
  scheduled: 'text-forest-deep',
  published: 'text-ink-inv',
  failed: 'text-danger',
}
