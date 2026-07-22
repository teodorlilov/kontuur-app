import type { VisualIdentity } from '@/types/visual'
import { fetchVisualIdentity, updateVisualIdentityBlob } from './queries'
import { buildDefaultIdentity } from './identity'
import { getBrandStyle } from './brand-styles'
import { describePalette } from './describe-palette'
import { buildVisualPrompt } from './prompt'
import { generateSlideImage } from './fal'

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
 * The single image-generation pipeline shared by the draft and persisted-post routes:
 * client identity → 3-variable prompt → gpt-image-2 → downloaded image bytes.
 */
export async function generateVisual(input: { clientId: string; textBlock: string }): Promise<GeneratedVisual> {
  const identity = await resolveIdentity(input.clientId)
  const prompt = buildVisualPrompt({
    textBlock: input.textBlock,
    // resolveIdentity always sets palette_description; the ?? guards the type, not a real path.
    paletteDescription: identity.palette_description ?? '',
    stylePrompt: getBrandStyle(identity.style).prompt,
  })

  const imageUrl = await generateSlideImage(prompt)
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error(`Failed to download generated image (${response.status})`)
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType: 'image/jpeg' }
}
