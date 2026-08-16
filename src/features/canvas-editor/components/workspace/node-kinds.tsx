import { Circle, Image as ImageIcon, Minus, Shapes, Square, Type } from 'lucide-react'
import type { CanvasNode } from '@/types/canvas'
import { isTextNode } from '@/lib/canvas/doc-nodes'

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

/** What a layers row calls this node: its own words for text, its kind's name otherwise. */
export function nodeLabel(node: CanvasNode): string {
  if (isTextNode(node)) return node.text.trim().split('\n')[0] || 'Empty text'
  return NODE_KIND_META[node.kind].label
}
