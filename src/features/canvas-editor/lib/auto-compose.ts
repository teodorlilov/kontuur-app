import { applyStyleToDoc } from '@/lib/canvas/apply-style'
import { applyCopyToDoc, seedCanvasDoc, type SeedIdentity } from '@/lib/canvas/seed-doc'
import type { CanvasBackgroundRef, CanvasDoc } from '@/types/canvas'
import type { PostImage } from '@/types/api'
import { composeDoc } from './compose'
import { saveDraftCanvas, savePostCanvas } from './save-canvas'
import type { DraftVisualResult, SlideCopy } from '../types'

// SlideCopy union → the slide/caption fields seedCanvasDoc and applyCopyToDoc expect.
function copyFields(slideCopy: SlideCopy): { slide?: { headline: string; body: string }; caption?: string | null } {
  return {
    slide: slideCopy.kind === 'slide' ? { headline: slideCopy.headline, body: slideCopy.body } : undefined,
    caption: slideCopy.kind === 'caption' ? slideCopy.caption : undefined,
  }
}

function seedFromCopy(
  identity: SeedIdentity,
  background: CanvasBackgroundRef,
  slideCopy: SlideCopy
): CanvasDoc | null {
  const doc = seedCanvasDoc({ identity, background, ...copyFields(slideCopy) })
  return doc.layers.length > 0 ? doc : null
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
  const res = await fetch(`/api/posts/${input.postId}/canvas?position=${input.position}`)
  if (!res.ok) return null
  const body = (await res.json()) as { doc?: CanvasDoc | null; identity?: SeedIdentity }
  if (!body.identity) return null

  const background = { publicUrl: input.image.publicUrl, storagePath: input.image.storagePath }
  const doc = body.doc
    ? { ...body.doc, background }
    : input.slideCopy && seedFromCopy(body.identity, background, input.slideCopy)
  if (!doc || doc.layers.length === 0) return null

  const { doc: fitted, blob } = await composeDoc(doc)
  return savePostCanvas(input.postId, input.position, fitted, blob, input.image.storagePath)
}

/**
 * Re-bake a persisted position after its copy changed: role layers take the new text (hand-edited
 * ones keep their wording), the doc re-flattens over its clean background. Null = nothing baked
 * at this position (no doc — never bake text onto images that never had it) or no layer changed.
 */
export async function recomposePersistedPosition(input: {
  postId: string
  position: number
  baseImagePath: string
  slideCopy: SlideCopy
}): Promise<PostImage | null> {
  const res = await fetch(`/api/posts/${input.postId}/canvas?position=${input.position}`)
  if (!res.ok) return null
  const body = (await res.json()) as { doc?: CanvasDoc | null; identity?: SeedIdentity }
  if (!body.doc || !body.identity) return null

  const doc = body.doc
  const updated = applyCopyToDoc(doc, { identity: body.identity, ...copyFields(input.slideCopy) })
  if (updated.layers.every((layer, index) => layer.text === doc.layers[index]?.text)) return null

  const { doc: fitted, blob } = await composeDoc(updated)
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
  const { doc: fitted, blob } = await composeDoc(doc)
  return saveDraftCanvas(input, fitted, blob)
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
  const updated = applyCopyToDoc(input.doc, { identity: input.identity, ...copyFields(input.slideCopy) })
  const { doc: fitted, blob } = await composeDoc(updated)
  return saveDraftCanvas(input, fitted, blob, input.previousFlattenedPath)
}

/**
 * "Apply to all slides" on a persisted sibling: reuse its doc (or seed one over its current image),
 * carry the source slide's look onto it, re-flatten and save. Null = nothing to compose.
 */
export async function applyStyleToPostSibling(input: {
  postId: string
  position: number
  image: { publicUrl: string; storagePath: string }
  slideCopy: SlideCopy | null
  source: CanvasDoc
}): Promise<PostImage | null> {
  const res = await fetch(`/api/posts/${input.postId}/canvas?position=${input.position}`)
  if (!res.ok) return null
  const body = (await res.json()) as { doc?: CanvasDoc | null; identity?: SeedIdentity }
  if (!body.identity) return null

  const background = { publicUrl: input.image.publicUrl, storagePath: input.image.storagePath }
  // Same rebind rule as the editor: our own baked output → compose over the doc's clean
  // background; image changed underneath → the current image IS the new clean background.
  const doc = body.doc
    ? body.doc.flattenedStoragePath === input.image.storagePath
      ? body.doc
      : { ...body.doc, background }
    : input.slideCopy && seedFromCopy(body.identity, background, input.slideCopy)
  if (!doc || doc.layers.length === 0) return null

  const styled = applyStyleToDoc(doc, input.source)
  const { doc: fitted, blob } = await composeDoc(styled)
  return savePostCanvas(input.postId, input.position, fitted, blob, input.image.storagePath)
}

/** "Apply to all slides" on a wizard draft sibling (doc reused or seeded, then styled + re-baked). */
export async function applyStyleToDraftSibling(input: {
  clientId: string
  draftId: string
  position: number
  identity: SeedIdentity
  slideCopy: SlideCopy
  doc: CanvasDoc | null
  clean: CanvasBackgroundRef
  source: CanvasDoc
  previousFlattenedPath?: string
}): Promise<{ visual: DraftVisualResult; doc: CanvasDoc } | null> {
  const doc = input.doc ?? seedFromCopy(input.identity, input.clean, input.slideCopy)
  if (!doc) return null
  const styled = applyStyleToDoc(doc, input.source)
  const { doc: fitted, blob } = await composeDoc(styled)
  return saveDraftCanvas(input, fitted, blob, input.previousFlattenedPath)
}
