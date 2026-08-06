/** Shared classes for the editor's properties panel (matches the app's settings panels). */

/**
 * tracking-[1.5px]: these headings sit directly above their control with no rule
 * between them, and the Label role's default spacing is too tight to read as a
 * heading at that distance.
 */
export const PANEL_LABEL = 'mb-2 text-label font-medium uppercase tracking-[1.5px] text-spring-text'

export const PANEL_CONTROL =
  'w-full rounded-[6px] border border-line bg-paper px-2 py-1.5 font-sans text-caption text-ink'
