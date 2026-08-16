import type { CanvasDoc, CanvasNode } from '@/types/canvas'

/**
 * The layers panel reads top-down, the doc stores bottom-up. This module owns that one reversal and
 * the index arithmetic it implies — nothing else should reverse a node list.
 *
 * It lives feature-side rather than in `lib/canvas/doc-nodes.ts` because "topmost first" is a
 * presentation decision, and doc-nodes is shared non-UI logic reached by a server route
 * (`api/posts/route.ts`) and by `lib/visual/draft-visuals.ts` — see the components/features split in
 * docs/CLAUDE.md.
 */

/** The doc's nodes in the order the panel shows them: topmost first. */
export function layerRows(doc: CanvasDoc): CanvasNode[] {
  return [...doc.nodes].reverse()
}

/**
 * Translate "the user dropped the dragged row into display gap `slot`" into the post-removal doc
 * index `reorderNodeInDoc` expects.
 *
 * `slot` runs 0..rows.length: 0 is above the topmost row, rows.length is below the bottom one.
 * Two conversions compose here, and getting either wrong is an off-by-one that only shows up on
 * drags in one direction:
 *   1. display gap → doc insertion point, which reverses: `insertAt = nodes.length - slot`.
 *   2. insertion point → post-removal index. Lifting the node out first shifts every position after
 *      it down by one, so a downward move (in doc terms) loses one.
 */
export function docIndexForRow(doc: CanvasDoc, id: string, slot: number): number {
  const from = doc.nodes.findIndex((node) => node.id === id)
  const insertAt = doc.nodes.length - slot
  return insertAt > from ? insertAt - 1 : insertAt
}

/**
 * The display gap a keyboard one-row step targets, for `docIndexForRow`.
 *
 * Up is `index - 1`: the gap above the row above. Down is `index + 2`, not `+ 1`, because the gap
 * immediately after a row is that row's own position — stepping there is a no-op. Out-of-range
 * slots at either end fall out as no-ops once `reorderNodeInDoc` clamps them.
 */
export function slotForRowStep(rowIndex: number, direction: 'up' | 'down'): number {
  return direction === 'up' ? rowIndex - 1 : rowIndex + 2
}
