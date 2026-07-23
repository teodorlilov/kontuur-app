'use client'

import { useEffect, useState } from 'react'
import type { CanvasDoc } from '@/types/canvas'
import { seedCanvasDoc, type SeedIdentity } from '@/lib/canvas/seed-doc'
import { fetchClientIdentity } from '../lib/identity-client'
import type { EditorTarget, SlideCopy } from '../types'

export type EditorData =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; identity: SeedIdentity; doc: CanvasDoc; seeded: boolean }

/**
 * Load what the editor needs in one round trip (doc + identity for posts; identity for drafts,
 * whose doc lives in wizard memory), then resolve the doc against the current image: our own
 * baked output → render over the stored clean background; a changed image → rebind to it as the
 * new clean background; no doc → seed from the slide copy.
 */
export function useEditorData(
  target: EditorTarget,
  image: { publicUrl: string; storagePath: string },
  slideCopy: SlideCopy | null
): EditorData {
  const [data, setData] = useState<EditorData>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchDocAndIdentity(target)
      .then(({ rawDoc, identity }) => {
        if (cancelled) return
        const { doc, seeded } = resolveDoc(rawDoc, image, identity, slideCopy)
        setData({ status: 'ready', identity, doc, seeded })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setData({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load the editor' })
      })
    return () => {
      cancelled = true
    }
    // Targets/images are stable for one editor mount; surfaces remount per position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return data
}

async function fetchDocAndIdentity(
  target: EditorTarget
): Promise<{ rawDoc: CanvasDoc | null; identity: SeedIdentity }> {
  if (target.kind === 'post') {
    const res = await fetch(`/api/posts/${target.postId}/canvas?position=${target.position}`)
    const body = (await res.json()) as { doc?: CanvasDoc | null; identity?: SeedIdentity; error?: string }
    if (!res.ok || !body.identity) throw new Error(body.error ?? 'Failed to load the canvas')
    return { rawDoc: body.doc ?? null, identity: body.identity }
  }
  return { rawDoc: target.doc, identity: await fetchClientIdentity(target.clientId) }
}

function resolveDoc(
  rawDoc: CanvasDoc | null,
  image: { publicUrl: string; storagePath: string },
  identity: SeedIdentity,
  slideCopy: SlideCopy | null
): { doc: CanvasDoc; seeded: boolean } {
  if (rawDoc) {
    if (rawDoc.flattenedStoragePath === image.storagePath) return { doc: rawDoc, seeded: false }
    // The image changed underneath (regenerate / re-upload) — it becomes the new clean background.
    return { doc: { ...rawDoc, background: { ...image } }, seeded: false }
  }
  const doc = seedCanvasDoc({
    identity,
    background: { ...image },
    slide: slideCopy?.kind === 'slide' ? { headline: slideCopy.headline, body: slideCopy.body } : undefined,
    caption: slideCopy?.kind === 'caption' ? slideCopy.caption : undefined,
  })
  return { doc, seeded: true }
}
