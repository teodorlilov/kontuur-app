/**
 * Prose classes shared by the three legal pages (terms, privacy, data-deletion).
 *
 * These were three verbatim copies of the same five `React.CSSProperties`
 * objects — h1Style, h2Style, pStyle, ulStyle, dividerStyle — one set per page.
 * Long-form legal copy is the same document in three files, so the styling
 * lives in one place and the pages carry only their words.
 *
 * The leading and tracking overrides below are deliberate: they hold each
 * element at the size it already rendered at before the type ramp was expressed
 * as classes rather than as inline `fontSize`.
 */

/** Page title. tracking-[normal]: legal headings were set without the Prompt
 *  role's -0.01em, and long statutory titles read better unsqueezed.
 *  leading-[1.2]: a touch looser than the role's 1.15 so a wrapped title breathes. */
export const proseH1 =
  'mb-2 font-display text-prompt font-semibold leading-[1.2] tracking-[normal] text-ink'

/** Section heading. leading-[1.6]: stated rather than inherited. These headings
 *  never carried a line-height of their own and so took the body's 1.6; they sit
 *  in a column of running prose and keep its rhythm, not the Display role's 1.35. */
export const proseH2 = 'mb-3 mt-12 text-display font-semibold leading-[1.6] text-ink'

/** Body paragraph. leading-[1.75]: long-form legal prose is read straight through,
 *  so it runs looser than the Title role's UI-tuned 1.4. tracking-[normal]: the
 *  role's -0.01em tightens continuous text that wants none. */
export const proseP = 'mb-4 text-title leading-[1.75] tracking-[normal] text-text2'

/** Standfirst paragraph — proseP plus a top margin off the page title. */
export const proseLead = 'mb-4 mt-4 text-title leading-[1.75] tracking-[normal] text-text2'

/** ul / ol — proseP plus the list indent. */
export const proseList = 'mb-4 pl-5 text-title leading-[1.75] tracking-[normal] text-text2'

/** Rule between the standfirst and the numbered sections. */
export const proseDivider = 'my-12 border-t border-line'

/** Page chrome, identical across the three documents. */
export const proseMain = 'min-h-screen bg-paper'
export const proseContainer = 'mx-auto max-w-[720px] px-6 pb-25 pt-20'
export const proseBackLink =
  'mb-12 inline-flex items-center gap-1.5 text-body text-text3 no-underline'
export const proseEyebrow = 'mb-4 text-body text-text3'
