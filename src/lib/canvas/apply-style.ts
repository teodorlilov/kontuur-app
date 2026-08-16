import type { CanvasDoc, CanvasTextNode } from '@/types/canvas'
import { isTextNode, textNodes } from './doc-nodes'

// The "look" of a text node — everything except identity (id/kind/role) and content
// (text/textOverridden). Copying an oversized fontSize is fine: compose autofits each slide's own
// text downstream. `rotation` rides along deliberately even when undefined — an unrotated source
// un-tilts targets.
function styledNode(target: CanvasTextNode, source: CanvasTextNode): CanvasTextNode {
  return {
    ...target,
    x: source.x,
    y: source.y,
    width: source.width,
    rotation: source.rotation,
    uppercase: source.uppercase,
    italic: source.italic,
    highlight: source.highlight,
    fontFamily: source.fontFamily,
    fontSize: source.fontSize,
    fontWeight: source.fontWeight,
    fill: source.fill,
    align: source.align,
    lineHeight: source.lineHeight,
    // The tier-1 effects are part of the look, and they ride along even when absent — an
    // unshadowed source clears a shadowed target, exactly as an unrotated one un-tilts it.
    letterSpacing: source.letterSpacing,
    shadowColor: source.shadowColor,
    shadowOpacity: source.shadowOpacity,
    shadowBlur: source.shadowBlur,
    shadowOffsetX: source.shadowOffsetX,
    shadowOffsetY: source.shadowOffsetY,
    stroke: source.stroke,
    strokeWidth: source.strokeWidth,
    // `arcBend` deliberately does NOT travel. An arc only renders on a single line, so carrying it
    // onto a sibling whose text wraps would set a field that draws nothing — the slide would look
    // untouched while claiming the style was applied. Arch is a per-slide decision.
  }
}

/**
 * Carry one slide's look onto another doc ("apply to all slides"): the scrim plus each
 * headline/body node's style, matched by role. Text, `textOverridden` and `custom` nodes are
 * never touched; roles missing on either side are left alone (no node is ever created), and placed
 * assets are a slide's own content, so they are left exactly as they are.
 */
export function applyStyleToDoc(target: CanvasDoc, source: CanvasDoc): CanvasDoc {
  const sourceText = textNodes(source)
  const nodes = target.nodes.map((node) => {
    if (!isTextNode(node) || node.role === 'custom') return node
    const match = sourceText.find((candidate) => candidate.role === node.role)
    return match ? styledNode(node, match) : node
  })
  return { ...target, scrim: { ...source.scrim }, nodes }
}
