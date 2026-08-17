import { Circle, Image as ImageIcon, Minus, Shapes, Square, Type } from 'lucide-react'
import type { CanvasNode, CanvasTextRole } from '@/types/canvas'
import { isShapeNode, isTextNode, textLabel } from '@/lib/canvas/doc-nodes'

/**
 * What each node kind is called and what icon stands for it — declared once, because the layers
 * list and the Elements panel's insert tiles would otherwise each keep their own copy and drift
 * the moment a kind is added.
 */
export const NODE_KIND_META = {
  text: { label: 'Text', Icon: Type },
  image: { label: 'Image', Icon: ImageIcon },
  svg: { label: 'Vector', Icon: Shapes },
  rect: { label: 'Rectangle', Icon: Square },
  ellipse: { label: 'Ellipse', Icon: Circle },
  line: { label: 'Line', Icon: Minus },
} as const satisfies Record<CanvasNode['kind'], { label: string; Icon: typeof Type }>

/**
 * The roles a lockup creates, in the user's words rather than the schema's.
 *
 * A split headline is one sentence in two boxes, and the list showed both as plain text — so the
 * poster word and the remainder were indistinguishable, and "delete the small line" was a coin
 * flip. Deleting the wrong one takes the big word off the slide, which reads as the lockup losing
 * it rather than as the user removing it.
 */
const ROLE_LABELS: Partial<Record<CanvasTextRole, string>> = {
  hero: 'Lead word',
  kicker: 'Kicker',
  tagline: 'Tagline',
}

/** What a layers row calls this node: its own words for text, its kind's name otherwise. */
export function nodeLabel(node: CanvasNode): string {
  if (isTextNode(node)) {
    const words = textLabel(node)
    const role = ROLE_LABELS[node.role]
    return role ? `${role} · ${words}` : words
  }
  if (isShapeNode(node) && node.role === 'mark') return 'Lockup rule'
  return NODE_KIND_META[node.kind].label
}
