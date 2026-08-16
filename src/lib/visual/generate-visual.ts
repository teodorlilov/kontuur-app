import type { VisualIdentity } from '@/types/visual'
import { fetchVisualIdentity, updateVisualIdentityBlob } from './queries'
import { buildDefaultIdentity } from './identity'
import { getBrandStyle } from './brand-styles'
import { describePalette } from './describe-palette'
import { buildVisualPrompt } from './prompt'
import { downloadFalFile, generateSlideImage } from './fal'

export type GeneratedVisual = { buffer: Buffer; contentType: 'image/jpeg' }

/** Resolve the client's identity, self-healing a missing palette description (best-effort persist). */
async function resolveIdentity(clientId: string): Promise<VisualIdentity> {
  const stored = await fetchVisualIdentity(clientId)
  if (stored?.palette_description) return stored

  const base = stored ?? buildDefaultIdentity()
  const healed: VisualIdentity = { ...base, palette_description: await describePalette(base.palette) }
  if (stored) {
    const { error } = await updateVisualIdentityBlob(clientId, healed)
    if (error) console.warn(`[generate-visual] could not persist palette description: ${error}`)
  }
  return healed
}

/**
 * The single image-generation pipeline shared by the draft, persisted-post and in-editor routes:
 * client identity → prompt → gpt-image-2 → downloaded image bytes.
 *
 * `direction` is the editor's optional art direction. It rides INSIDE this pipeline rather than
 * beside it so a hand-written prompt still inherits the client's palette and brand style — a
 * freeform prompt sent straight to the model would be a second, unbranded prompt-assembly path.
 */
export async function generateVisual(input: {
  clientId: string
  textBlock: string
  direction?: string
}): Promise<GeneratedVisual> {
  const identity = await resolveIdentity(input.clientId)
  const prompt = buildVisualPrompt({
    textBlock: input.textBlock,
    // resolveIdentity always sets palette_description; the ?? guards the type, not a real path.
    paletteDescription: identity.palette_description ?? '',
    stylePrompt: getBrandStyle(identity.style).prompt,
    ...(input.direction ? { direction: input.direction } : {}),
  })

  const imageUrl = await generateSlideImage(prompt)
  return { buffer: await downloadFalFile(imageUrl), contentType: 'image/jpeg' }
}
