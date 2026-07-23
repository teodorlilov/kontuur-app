import { applyCopyToDoc, seedCanvasDoc, type SeedIdentity } from '@/lib/canvas/seed-doc'
import type { CanvasBackgroundRef, CanvasDoc } from '@/types/canvas'
import type { PostImage } from '@/types/api'
import { composeDoc } from './compose'
import { saveDraftCanvas, savePostCanvas } from './save-canvas'
import type { DraftVisualResult, SlideCopy } from '../types'

function seedFromCopy(
  identity: SeedIdentity,
  background: CanvasBackgroundRef,
  slideCopy: SlideCopy
): CanvasDoc | null {
  const doc = seedCanvasDoc({
    identity,
    background,
    slide: slideCopy.kind === 'slide' ? { headline: slideCopy.headline, body: slideCopy.body } : undefined,
    caption: slideCopy.kind === 'caption' ? slideCopy.caption : undefined,
  })
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
  const updated = applyCopyToDoc(input.doc, {
    identity: input.identity,
    slide: input.slideCopy.kind === 'slide' ? { headline: input.slideCopy.headline, body: input.slideCopy.body } : undefined,
    caption: input.slideCopy.kind === 'caption' ? input.slideCopy.caption : undefined,
  })
  const { doc: fitted, blob } = await composeDoc(updated)
  return saveDraftCanvas(input, fitted, blob, input.previousFlattenedPath)
}
