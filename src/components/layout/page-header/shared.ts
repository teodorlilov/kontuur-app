/**
 * Class shapes shared across the header pieces.
 *
 * Its own module so the rail and the notifications bell can both use TOOL_ROW
 * without importing each other.
 */

/**
 * The content column. DESIGN.md § Layout has always specified "a fluid content
 * column, capped at 1280px" — pages ran full-width until the header landed.
 * Applied to the header inner AND every page body, so a title and its actions
 * stay in one visual field on a wide monitor.
 */
export const PAGE_SHELL = 'mx-auto w-full max-w-[1280px] px-4 md:px-8'

/** A rail utility: search, notifications, and page-specific secondary actions. */
export const TOOL_ROW =
  'relative inline-flex h-[29px] min-w-[29px] items-center justify-center gap-[7px] rounded-sm px-2 ' +
  'text-text2 transition-colors duration-150 ease-contour hover:bg-ink/[0.05] hover:text-ink'
