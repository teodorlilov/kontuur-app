import { LOCKUP_ROLES } from '@/types/canvas'
import type {
  CanvasDoc,
  CanvasImageNode,
  CanvasNode,
  CanvasShapeNode,
  CanvasTextNode,
  CanvasTextRole,
} from '@/types/canvas'

/** Where a duplicate lands relative to its original (authoring-space px, both axes). */
const DUPLICATE_OFFSET = 16

/**
 * Doc-shape operations over the one ordered node list. Array order IS render order (bottom first),
 * so every one of these is a plain array operation — v1's "which band does this id live in?"
 * question, and the reordering that could never cross bands, are both gone.
 *
 * Each returns the SAME doc reference when nothing changed, so a no-op never lands as an undo step.
 */

/** Narrow a node to text — the kind most callers care about (copy, autofit, style). */
export function isTextNode(node: CanvasNode): node is CanvasTextNode {
  return node.kind === 'text'
}

/**
 * Narrow a node to a placed raster/vector asset.
 *
 * Positive check, NOT "anything but text": this guard decides who owns a `src`, and every kind
 * added after it would otherwise be classed as an image and read a file that is not there.
 */
export function isImageNode(node: CanvasNode): node is CanvasImageNode {
  return node.kind === 'image' || node.kind === 'svg'
}

/** Narrow a node to a drawn primitive. */
export function isShapeNode(node: CanvasNode): node is CanvasShapeNode {
  return node.kind === 'rect' || node.kind === 'ellipse' || node.kind === 'line'
}

/**
 * The doc's text nodes in render order.
 *
 * Deliberately blind to `hidden`/`locked`: `auto-compose.ts` gates whether a slide bakes at all on
 * `textNodes(doc).length === 0`, so narrowing this to visible-only would make a doc whose only text
 * happens to be hidden stop composing server-side, silently. Callers that want visible-only say so.
 */
export function textNodes(doc: CanvasDoc): CanvasTextNode[] {
  return doc.nodes.filter(isTextNode)
}

/**
 * The roles that carry the AI's copy and therefore take a style, an arrangement and a rewrite.
 *
 * An explicit ALLOWLIST, deliberately not `role !== 'custom'`. That older spelling meant "everything
 * the seeder made", which was the same set right up until the vocabulary grew — at which point it
 * silently began opting lockup members in, dragging their geometry between slides. A predicate that
 * changes meaning when an enum grows is a predicate that will change meaning again.
 */
const STYLED_ROLES: readonly CanvasTextRole[] = ['headline', 'body']

/** Whether this text node holds slide copy — the only kind a style or an arrangement may move. */
export function isStyledRole(node: CanvasTextNode): boolean {
  return STYLED_ROLES.includes(node.role)
}

/**
 * Whether a lockup put this node here, and may therefore take it away again.
 *
 * Written against `'role' in node` rather than `node.role`, because image nodes have no role at all
 * and the union would not compile otherwise — which is the useful accident that keeps this the one
 * definition instead of an inline check at each sweep site.
 */
export function isLockupOwned(node: CanvasNode): boolean {
  return 'role' in node && node.role !== undefined && LOCKUP_ROLES.includes(node.role as never)
}

/** Both flags are tri-state on the wire (absent = off); read them through these, never `!node.x`. */
export function isHidden(node: CanvasNode): boolean {
  return node.hidden === true
}

export function isLocked(node: CanvasNode): boolean {
  return node.locked === true
}

/** What actually draws — the stage's render loop and the exporter share this one definition. */
export function visibleNodes(doc: CanvasDoc): CanvasNode[] {
  return doc.nodes.filter((node) => !isHidden(node))
}

/**
 * Ids the canvas may grab: everything a pointer can drag, snap against or sweep into a marquee.
 * Hidden nodes are not on screen and locked ones are pinned, so neither belongs to a canvas gesture
 * — both stay selectable from the layers list, which is the point of locking rather than hiding.
 */
export function grabbableIds(doc: CanvasDoc): Set<string> {
  return new Set(
    doc.nodes.filter((node) => !isHidden(node) && !isLocked(node)).map((node) => node.id)
  )
}

/** Narrow a selection to the nodes a destructive or moving operation may actually touch. */
export function unlockedIds(doc: CanvasDoc, ids: string[]): string[] {
  const locked = new Set(doc.nodes.filter(isLocked).map((node) => node.id))
  return ids.filter((id) => !locked.has(id))
}

/** The node with this id, or null. */
export function findNode(doc: CanvasDoc, id: string): CanvasNode | null {
  return doc.nodes.find((node) => node.id === id) ?? null
}

/** Append a node at the top of the stack. */
export function addNodeToDoc(doc: CanvasDoc, node: CanvasNode): CanvasDoc {
  return { ...doc, nodes: [...doc.nodes, node] }
}

/**
 * Patch one node. The patch is typed against the node's own kind at the call site, so a text-only
 * field can never be written onto an image node.
 */
export function updateNodeInDoc<T extends CanvasNode>(
  doc: CanvasDoc,
  id: string,
  patch: Partial<T>
): CanvasDoc {
  const index = doc.nodes.findIndex((node) => node.id === id)
  if (index < 0) return doc
  const nodes = [...doc.nodes]
  // The cast holds because the id selects exactly one node and the caller typed the patch to it.
  nodes[index] = { ...doc.nodes[index]!, ...patch } as CanvasNode
  return { ...doc, nodes }
}

/** Drop several nodes at once — one undo step for a whole multi-selection. */
export function removeNodesFromDoc(doc: CanvasDoc, ids: string[]): CanvasDoc {
  const removing = new Set(ids)
  const nodes = doc.nodes.filter((node) => !removing.has(node.id))
  return nodes.length === doc.nodes.length ? doc : { ...doc, nodes }
}

/**
 * Copy a node, offset it so the copy is visibly its own, and place it directly above the original.
 * The id is injected so callers own uniqueness. Returns null when the id matches nothing.
 *
 * Note the index convention differs from `reorderNodeInDoc`: this inserts into the UN-shortened
 * array (nothing was lifted out), so `index + 1` is literally "just above the original". Reorder's
 * index is post-removal. Do not unify them without re-deriving both.
 */
export function duplicateNodeInDoc(
  doc: CanvasDoc,
  id: string,
  newId: string
): { doc: CanvasDoc; id: string } | null {
  const index = doc.nodes.findIndex((node) => node.id === id)
  if (index < 0) return null
  const original = doc.nodes[index]!
  const copy: CanvasNode = {
    ...original,
    id: newId,
    x: original.x + DUPLICATE_OFFSET,
    y: original.y + DUPLICATE_OFFSET,
  }
  const nodes = [...doc.nodes]
  nodes.splice(index + 1, 0, copy)
  return { doc: { ...doc, nodes }, id: newId }
}

/**
 * Copy several nodes in one step. Ids are supplied per original so the caller can select the
 * copies afterwards; originals with no id supplied are skipped.
 */
export function duplicateNodesInDoc(
  doc: CanvasDoc,
  newIdFor: Map<string, string>
): { doc: CanvasDoc; ids: string[] } {
  const created: string[] = []
  const next = [...newIdFor.entries()].reduce((current, [id, newId]) => {
    const result = duplicateNodeInDoc(current, id, newId)
    if (!result) return current
    created.push(newId)
    return result.doc
  }, doc)
  return { doc: next, ids: created }
}

/** Shift several nodes by the same delta — a multi-selection drag or arrow-key nudge. */
export function nudgeNodesInDoc(doc: CanvasDoc, ids: string[], dx: number, dy: number): CanvasDoc {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return doc
  const moving = new Set(ids)
  let changed = false
  const nodes = doc.nodes.map((node) => {
    if (!moving.has(node.id)) return node
    changed = true
    return { ...node, x: node.x + dx, y: node.y + dy }
  })
  return changed ? { ...doc, nodes } : doc
}

/** Apply one position per node — how a multi-node drag lands as a single undo step. */
export function placeNodesInDoc(
  doc: CanvasDoc,
  placements: Array<{ id: string; x: number; y: number }>
): CanvasDoc {
  const placed = new Map(placements.map((placement) => [placement.id, placement]))
  let changed = false
  const nodes = doc.nodes.map((node) => {
    const placement = placed.get(node.id)
    if (!placement || (placement.x === node.x && placement.y === node.y)) return node
    changed = true
    return { ...node, x: placement.x, y: placement.y }
  })
  return changed ? { ...doc, nodes } : doc
}

/**
 * Put a node at an exact position in the stack — the layers panel's drag-reorder.
 *
 * `toIndex` is a POST-REMOVAL index: the position the node ends up at once it has been lifted out,
 * which is the same convention `moveNodeInDoc` has always meant ([a,b,c] + 'up' → 2 → [a,c,b]).
 * It must be an integer; a fractional target would clamp past the no-op check and rebuild an
 * identical doc as a new object. `docIndexForRow` is the only intended producer of this argument.
 */
export function reorderNodeInDoc(doc: CanvasDoc, id: string, toIndex: number): CanvasDoc {
  const from = doc.nodes.findIndex((node) => node.id === id)
  if (from < 0) return doc
  // Clamp BEFORE comparing, so a node already at an end and dragged further returns this very doc
  // rather than an identical copy — the reference-identity contract at the top of this file.
  const to = Math.min(Math.max(Math.trunc(toIndex), 0), doc.nodes.length - 1)
  if (to === from) return doc
  const nodes = [...doc.nodes]
  const [node] = nodes.splice(from, 1)
  nodes.splice(to, 0, node!)
  return { ...doc, nodes }
}

/**
 * Step a node through the stacking order, or send it to the very front/back. Unlike v1 this crosses
 * kinds freely — a picture can end up between two text layers.
 */
export function moveNodeInDoc(
  doc: CanvasDoc,
  id: string,
  direction: 'up' | 'down',
  toEdge = false
): CanvasDoc {
  const index = doc.nodes.findIndex((node) => node.id === id)
  if (index < 0) return doc
  const target = toEdge
    ? direction === 'up'
      ? doc.nodes.length - 1
      : 0
    : direction === 'up'
      ? index + 1
      : index - 1
  // Out-of-range steps (already at an end) clamp onto the node's own index, which reorder reads as
  // a no-op and answers with the same doc.
  return reorderNodeInDoc(doc, id, target < 0 || target >= doc.nodes.length ? index : target)
}
