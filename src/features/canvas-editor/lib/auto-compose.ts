import { isTextNode, textNodes } from '@/lib/canvas/doc-nodes'
import { rebindDocToImage } from '@/lib/canvas/resolve-doc'
import { applyCopyToDoc, seedCanvasDoc, type SeedIdentity } from '@/lib/canvas/seed-doc'
import type { CanvasBackgroundRef, CanvasDoc, CanvasNode } from '@/types/canvas'
import type { PostImage } from '@/types/api'
import { composeDoc } from './compose'
import { saveDraftCanvas, savePostCanvas } from './save-canvas'
import { fetchCanvasState } from './canvas-state-client'
import { copyFields } from './resolve-slides'
import type { DraftVisualResult, SlideCopy } from '../types'

// The wording of a node, or null for anything that has none — only text can change under a rewrite.
function nodeText(node: CanvasNode | undefined): string | null {
  return node && isTextNode(node) ? node.text : null
}

function seedFromCopy(
  identity: SeedIdentity,
  background: CanvasBackgroundRef,
  slideCopy: SlideCopy
): CanvasDoc | null {
  const doc = seedCanvasDoc({ identity, background, ...copyFields(slideCopy) })
  return textNodes(doc).length > 0 ? doc : null
}

/**
 * Auto-compose after a persisted post's image generates: reuse the position's existing doc over
 * the fresh clean image (custom layouts survive regenerates), else seed from the post copy; then
 * flatten and save through the canvas PUT. Null = nothing to bake.
 */
export async function composePersistedPosition(input: {
  postId: string
  position: number
  image: PostImage
  slideCopy: SlideCopy | null
}): Promise<PostImage | null> {
  const body = await fetchCanvasState(input.postId, input.position)
  if (!body.ok) return null
  if (!body.identity) return null

  const background = { publicUrl: input.image.publicUrl, storagePath: input.image.storagePath }
  // The image is always fresh art here (this runs right after it generated), so it unconditionally
  // becomes the new clean background.
  const doc = body.doc
    ? rebindDocToImage(body.doc, background)
    : input.slideCopy && seedFromCopy(body.identity, background, input.slideCopy)
  if (!doc || textNodes(doc).length === 0) return null

  const { doc: fitted, blob } = await composeDoc(doc, body.identity.palette)
  return savePostCanvas(input.postId, input.position, fitted, blob, input.image.storagePath)
}

/**
 * Re-bake a persisted position after its copy changed: role-seeded text takes the new wording
 * (hand-edited nodes keep theirs), the doc re-flattens over its clean background. Null = nothing
 * baked at this position (no doc — never bake text onto images that never had it) or nothing changed.
 */
export async function recomposePersistedPosition(input: {
  postId: string
  position: number
  baseImagePath: string
  slideCopy: SlideCopy
}): Promise<PostImage | null> {
  const body = await fetchCanvasState(input.postId, input.position)
  if (!body.ok) return null
  if (!body.doc || !body.identity) return null

  const doc = body.doc
  const updated = applyCopyToDoc(doc, copyFields(input.slideCopy))
  // applyCopyToDoc preserves node order and count, so index comparison is sound.
  if (updated.nodes.every((node, index) => nodeText(node) === nodeText(doc.nodes[index])))
    return null

  const { doc: fitted, blob } = await composeDoc(updated, body.identity.palette)
  return savePostCanvas(input.postId, input.position, fitted, blob, input.baseImagePath)
}

/** Auto-compose a freshly generated wizard draft visual (clean file stays as the doc background). */
export async function composeDraftVisual(input: {
  clientId: string
  draftId: string
  position: number
  identity: SeedIdentity
  slideCopy: SlideCopy
  clean: CanvasBackgroundRef
}): Promise<{ visual: DraftVisualResult; doc: CanvasDoc } | null> {
  const doc = seedFromCopy(input.identity, input.clean, input.slideCopy)
  if (!doc) return null
  const { doc: fitted, blob } = await composeDoc(doc, input.identity.palette)
  return saveDraftCanvas(input, input.position, fitted, blob)
}

/**
 * Re-compose a draft after a copy rewrite (D3e): role-seeded layers take the new text (hand-edited
 * ones keep their wording), the untouched AI art is re-flattened, the old flattened file replaced.
 */
export async function recomposeDraftVisual(input: {
  clientId: string
  draftId: string
  position: number
  identity: SeedIdentity
  slideCopy: SlideCopy
  doc: CanvasDoc
  previousFlattenedPath?: string
}): Promise<{ visual: DraftVisualResult; doc: CanvasDoc }> {
  const updated = applyCopyToDoc(input.doc, copyFields(input.slideCopy))
  const { doc: fitted, blob } = await composeDoc(updated, input.identity.palette)
  return saveDraftCanvas(input, input.position, fitted, blob, input.previousFlattenedPath)
}
