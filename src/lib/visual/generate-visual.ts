import type { VisualIdentity } from '@/types/visual'
import { fetchVisualIdentity, updateVisualIdentityBlob } from './queries'
import { buildDefaultIdentity } from './identity'
import { describePalette } from './describe-palette'
import { getBrandStyle } from './brand-styles'
import { buildVisualPrompt } from './prompt'
import { artDirectionFor, type VariationKey } from './variation'
import { nameColor } from './color-name'
import type { ColorScheme } from './color-scheme'
import { downloadFalFile, generateSlideImage } from './fal'

type GeneratedVisual = { buffer: Buffer; contentType: 'image/jpeg' }

/**
 * The identity a generation runs on — read ONCE per generation, self-healing a missing description.
 *
 * Read once is the point. Choosing the colour scheme and building the prompt both need the palette
 * and the brand style, and each used to fetch this row for itself: two round trips per image, with
 * two differently-spelled answers to "what if there is no row" (`buildDefaultIdentity()` on one side,
 * this self-heal on the other). They happened to agree, which is the kind of agreement that holds
 * until someone edits one of them. Callers now resolve here and pass the result down.
 *
 * The heal exists because `palette_description` is what the prompt actually says about colour, and a
 * row written before that field existed would otherwise send an empty COLOR PALETTE block on every
 * generation, forever. Persisting is best-effort: a failed write costs one Haiku call next time, and
 * failing the generation over it would cost the user their image.
 */
export async function fetchIdentityForGeneration(clientId: string): Promise<VisualIdentity> {
  const stored = await fetchVisualIdentity(clientId)
  if (stored?.palette_description) return stored

  const base = stored ?? buildDefaultIdentity()
  const healed: VisualIdentity = {
    ...base,
    palette_description: await describePalette(base.palette),
  }
  if (stored) {
    const { error } = await updateVisualIdentityBlob(clientId, healed)
    if (error) console.warn(`[visual] could not persist palette description: ${error}`)
  }
  return healed
}

/**
 * The single image-generation pipeline shared by the draft, persisted-post and in-editor routes:
 * identity → prompt → gpt-image-2 → downloaded image bytes.
 *
 * The identity is PASSED IN, not fetched. Picking the colour scheme needs the same row, and when
 * each of them read it for itself every image cost two round trips to say one thing.
 *
 * `direction` is the editor's optional art direction. It rides INSIDE this pipeline rather than
 * beside it so a hand-written prompt still inherits the client's palette and brand style — a
 * freeform prompt sent straight to the model would be a second, unbranded prompt-assembly path.
 */
export async function generateVisual(input: {
  identity: VisualIdentity
  textBlock: string
  direction?: string
  /** Which slide of which post this is — what makes it look unlike the last one. */
  variation?: VariationKey
  /** The post's colour scheme. Choosing and persisting it belongs to the caller. */
  scheme?: ColorScheme | null
}): Promise<GeneratedVisual> {
  const { identity } = input
  const style = getBrandStyle(identity.style)
  const variation = input.variation ? artDirectionFor(input.variation, style) : null
  // Each style says how the pair is used; the hex rides beside the name because gpt-image-2 reads
  // both, and the name alone leaves the exact tone to chance.
  const color = input.scheme
    ? style.variation.colorDirective(
        `${nameColor(input.scheme.ground)} (${input.scheme.ground})`,
        `${nameColor(input.scheme.accent)} (${input.scheme.accent})`
      )
    : null

  const prompt = buildVisualPrompt({
    textBlock: input.textBlock,
    // `fetchIdentityForGeneration` always sets palette_description; the ?? guards the type, not a
    // real path — but only callers that use it get that guarantee, which is why it is the named
    // entry point rather than one of the two plain fetches beside it.
    paletteDescription: identity.palette_description ?? '',
    stylePrompt: style.prompt,
    ...(input.direction ? { direction: input.direction } : {}),
    ...(color ? { color } : {}),
    ...(variation ? { variation } : {}),
  })

  const imageUrl = await generateSlideImage(prompt)
  return { buffer: await downloadFalFile(imageUrl), contentType: 'image/jpeg' }
}
