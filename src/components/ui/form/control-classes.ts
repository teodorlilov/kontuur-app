/**
 * The one definition of how a form control looks.
 *
 * Shared by Input, Textarea, Select and InputAffix so the four cannot drift apart. Palette, radius
 * and the focus halo are DESIGN.md; the 40px height is the forms grid.
 */

/** Border, background and focus behaviour. Everything that owns an interactive edge uses this. */
export const CONTROL_SURFACE =
  'rounded-md border border-line2 bg-surface transition-[border-color,box-shadow] duration-150 ease-contour hover:border-text3/45'

/** The Living Green halo from DESIGN.md, applied to whichever element owns the edge. */
export const CONTROL_FOCUS =
  'focus:border-spring focus:outline-none focus:ring-[3px] focus:ring-spring/12'

/** Same halo, for a wrapper that owns the edge on behalf of an inner input. */
export const CONTROL_FOCUS_WITHIN =
  'focus-within:border-spring focus-within:ring-[3px] focus-within:ring-spring/12'

/** Type, size and padding shared by every control. */
export const CONTROL_TEXT = 'w-full min-w-0 text-sm text-ink placeholder:text-text3'

/** A single-line control: the full 40px treatment. */
export const CONTROL_BASE = cx(CONTROL_SURFACE, CONTROL_FOCUS, CONTROL_TEXT, 'h-10 px-3')

/** Read-only fields read as a surface you cannot edit rather than one you simply have not focused. */
export const CONTROL_READONLY =
  'read-only:border-dashed read-only:bg-wash read-only:text-text2 read-only:hover:border-line2'

export const CONTROL_DISABLED = 'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-text3'

/** Error state overrides the resting and focus edge in Clay. */
export const CONTROL_INVALID =
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:border-danger aria-[invalid=true]:focus:ring-danger/10'

/** The two label treatments, shared by `Field` and the standalone controls. `caps` is DESIGN.md's
 *  `label` type role. */
export const LABEL_CLASS = {
  default: 'text-stat-label font-medium text-ink',
  caps: 'text-label-lg font-semibold uppercase tracking-[0.16em] text-text2',
} as const

export type LabelVariant = keyof typeof LABEL_CLASS

function cx(...parts: string[]): string {
  return parts.join(' ')
}
