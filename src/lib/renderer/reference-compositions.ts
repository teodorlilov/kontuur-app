/**
 * The shared **marks pack** — hand-authored, sanitised SVG the compositions reference by `packElementId`
 * (the renderer resolves `MarkLayer.packElementId` against this at raster time). The composition scene
 * graphs themselves moved to the archetype registry (`renderer/archetypes/`); this file is now just the
 * static marks they point at.
 */

/**
 * A sanitised, hand-authored double-quote mark. One path, rendered in whichever colour role reads on the
 * slide's ground: `surface` for dark grounds (editorial's accent bg, bold-blocks' ink bg), `accent` for
 * the light quiet-grid ground where a surface fill would vanish. `substituteRoleVars` bakes the hex.
 */
const QUOTE_MARK_PATH = 'M0 80V44Q0 4 40 0V18Q20 20 20 40H40V80ZM60 80V44Q60 4 100 0V18Q80 20 80 40H100V80Z'
const quoteMark = (role: 'surface' | 'accent'): string =>
  '<svg width="100%" height="100%" viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg">' +
  `<path fill="var(--role-${role})" d="${QUOTE_MARK_PATH}"/></svg>`

export const REFERENCE_MARKS: Record<string, string> = {
  'ref-quote-mark': quoteMark('surface'),
  'ref-quote-mark-accent': quoteMark('accent'),
}
