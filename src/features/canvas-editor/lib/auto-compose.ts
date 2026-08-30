import { isTextNode, textNodes } from '@/lib/canvas/doc-nodes'
import { rebindDocToImage } from '@/lib/canvas/resolve-doc'
import { applyCopyToDoc, seedCanvasDoc, type SeedIdentity } from '@/lib/canvas/seed-doc'
import type { CanvasBackgroundRef, CanvasDoc, CanvasNode } from '@/types/canvas'
import type { PostImage } from '@/types/api'
import { composeDoc } from './compose'
import { saveDraftCanvas, savePostCanvas } from './save-canvas'
import { fetchCanvasDocs } from './canvas-state-client'
import { copyFields } from './resolve-slides'
import type { DraftVisualResult, SlideCopy } from '../types'
import type { VariationKey } from '@/lib/visual/variation'

// The wording of a node, or null for anything that has none — only text can change under a rewrite.
function nodeText(node: CanvasNode | undefined): string | null {
  return node && isTextNode(node) ? node.text : null
}

function seedFromCopy(
  identity: SeedIdentity,
  background: CanvasBackgroundRef,
  slideCopy: SlideCopy,
  variation?: VariationKey
): CanvasDoc | null {
  const doc = seedCanvasDoc({
    identity,
    background,
    ...copyFields(slideCopy),
    ...(variation ? { variation } : {}),
  })
  return textNodes(doc).length > 0 ? doc : null
}

/**
 * A post's stored docs and identity, read ONCE for a whole compose pass.
 *
 * Composing is per slide, so the reads were too: each position fetched `?position=N`, costing the
 * server an ownership join, an identity read and a doc read — five slides meant five requests
 * returning the same identity five times.
 *
 * Null rather than a throw because every caller answers "I could not read the canvas" the same way:
 * skip composing and leave the clean image. The editor's own loader keeps throwing — there, a
 * failure must surface.
 */
export async function loadPostCanvas(
  postId: string
): Promise<{ identity: SeedIdentity; docs: Map<number, CanvasDoc> } | null> {
  try {
    const { docs, identity } = await fetchCanvasDocs(postId)
    return { identity, docs: new Map(docs.map((entry) => [entry.position, entry.doc])) }
  } catch (err) {
    console.error(`[auto-compose] could not read the canvas for post ${postId}:`, err)
    return null
  }
}

/**
 * Auto-compose after a persisted post's image generates: reuse the position's existing doc over
 * the fresh clean image (custom layouts survive regenerates), else seed from the post copy; then
 * flatten and save through the canvas PUT. Null = nothing to bake.
 *
 * Takes `identity` and `doc` rather than fetching them — the same shape `composeDraftVisual` below
 * has always had. The two halves of this file disagreed about that, and the persisted half's version
 * cost a round trip per slide.
 */
export async function composePersistedPosition(input: {
  postId: string
  position: number
  total: number
  image: PostImage
  slideCopy: SlideCopy | null
  identity: SeedIdentity
  /** This position's stored doc, or null to seed a fresh one from the copy. */
  doc: CanvasDoc | null
}): Promise<PostImage | null> {
  const { identity, doc: stored } = input

  const background = { publicUrl: input.image.publicUrl, storagePath: input.image.storagePath }
  // The image's storage PATH is the layout nonce — the same key `resolve-slides` and the draft path
  // use, so one slide gets the same answer whichever of the three seeded it.
  //
  // The path rather than the row id, which this used to read. A row id only changed because writes
  // deleted and re-inserted; `putPostImage` upserts, so the id now survives a regenerate and a
  // layout keyed on it would survive with it — press regenerate, get a new picture in the identical
  // lockup, forever. Every upload is stamped with `Date.now()`, so a new picture is a new path.
  //
  // It does not have to match the nonce the PICTURE was generated under; the two are independent
  // axes. Re-composing the same image after a copy edit keeps the layout it already had.
  const variation: VariationKey = {
    subject: input.postId,
    position: input.position,
    total: input.total,
    nonce: input.image.storagePath,
  }
  // The image is always fresh art here (this runs right after it generated), so it unconditionally
  // becomes the new clean background. Which is also why reading the stored doc BEFORE that image
  // existed is sound: it gets rebound to the new one either way.
  const doc = stored
    ? rebindDocToImage(stored, background)
    : input.slideCopy && seedFromCopy(identity, background, input.slideCopy, variation)
  if (!doc || textNodes(doc).length === 0) return null

  const { doc: fitted, blob } = await composeDoc(doc, identity.palette)
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
  identity: SeedIdentity
  doc: CanvasDoc | null
}): Promise<PostImage | null> {
  const { doc } = input
  if (!doc) return null

  const updated = applyCopyToDoc(doc, copyFields(input.slideCopy))
  // applyCopyToDoc preserves node order and count, so index comparison is sound.
  if (updated.nodes.every((node, index) => nodeText(node) === nodeText(doc.nodes[index])))
    return null

  const { doc: fitted, blob } = await composeDoc(updated, input.identity.palette)
  return savePostCanvas(input.postId, input.position, fitted, blob, input.baseImagePath)
}

/** Auto-compose a freshly generated wizard draft visual (clean file stays as the doc background). */
export async function composeDraftVisual(input: {
  clientId: string
  draftId: string
  position: number
  total: number
  identity: SeedIdentity
  slideCopy: SlideCopy
  clean: CanvasBackgroundRef
}): Promise<{ visual: DraftVisualResult; doc: CanvasDoc } | null> {
  const doc = seedFromCopy(input.identity, input.clean, input.slideCopy, {
    subject: input.draftId,
    position: input.position,
    total: input.total,
    // The clean file's path stands in for an image id a draft does not have yet: it is unique per
    // generation, so a reroll lands on a different layout exactly as it does for a persisted post.
    nonce: input.clean.storagePath,
  })
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
