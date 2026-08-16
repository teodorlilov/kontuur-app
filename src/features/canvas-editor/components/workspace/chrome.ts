import {
  CONTROL_FOCUS,
  CONTROL_SURFACE,
  FOCUS_RING,
  LABEL_CLASS,
} from '@/components/ui/form/control-classes'
import { cn } from '@/utils/cn'

/**
 * The editor's chrome at toolbar density.
 *
 * The edge, the focus halo and the label treatment all come from the app's control classes — only
 * the size differs, because a toolbar packs controls into 32px where a settings form gives them 40.
 * Nothing here re-defines a colour, a radius or a type role.
 */

/** A single-line control in the toolbar or a rail panel. */
export const EDITOR_CONTROL = cn(
  CONTROL_SURFACE,
  CONTROL_FOCUS,
  'h-8 rounded-sm px-2 font-sans text-caption text-ink'
)

/** A control that acts rather than accepts text. */
export const EDITOR_BUTTON = cn(
  EDITOR_CONTROL,
  FOCUS_RING,
  'inline-flex cursor-pointer items-center justify-center gap-1.5 disabled:cursor-default disabled:opacity-55'
)

/** An icon-only toolbar button; the label lives in `title` and `aria-label`. */
export const EDITOR_ICON_BUTTON = cn(
  FOCUS_RING,
  'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm',
  'text-text2 transition-colors duration-150 ease-contour hover:bg-ink/[0.05] hover:text-ink',
  'disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent'
)

/** How a toggled-on control reads: the wash ground and forest ink used by the rest of the app. */
export const EDITOR_PRESSED = 'bg-wash text-forest'

/** Section and field headings inside the rail panel. */
export const EDITOR_LABEL = LABEL_CLASS.caps

/** A hairline divider between toolbar groups. */
export const TOOLBAR_DIVIDER = 'mx-1 h-5 w-px shrink-0 bg-line'
