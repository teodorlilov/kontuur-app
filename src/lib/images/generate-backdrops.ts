import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { VisualIdentity } from '@/types/visual'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getVibePreset, type ImageConfig } from '@/lib/visual/vibe-presets'
import { generateImage } from './fal'
import { buildBackdropPrompt } from './prompt'
import { planScenes } from './scene'
import { promptHash } from './hash'
import { uploadPlate } from './storage'
import type { BackdropResult, VisualUnit } from './types'

type Admin = SupabaseClient<Database>

export type GenerateBackdropsCtx = {
  clientId: string
  clientName: string
  clientNiche: string
  topic: string
  /** Per-carousel seed (derive with `seedFromId`) — the imagery-consistency + interior-freshness key. */
  seed: number
  /** Bumped on an explicit regenerate to bypass the cache and produce a fresh image. */
  nonce?: string | number
  onUnit?: (result: BackdropResult) => void
}

/** Cache-or-generate one backdrop → durable `plates` URL. `hashInputs` are the deterministic cache key
 *  (never the LLM scene). Fail-soft → null. */
async function resolveBackdrop(
  admin: Admin,
  args: { clientId: string; hashInputs: Record<string, unknown>; prompt: string; image: ImageConfig; seed: number }
): Promise<string | null> {
  const model = process.env.FAL_IMAGE_MODEL ?? args.image.model
  const hash = promptHash({ ...args.hashInputs, model })

  const { data: hit } = await admin
    .from('brand_image_bank')
    .select('public_url')
    .eq('client_id', args.clientId)
    .eq('prompt_hash', hash)
    .maybeSingle()
  if (hit?.public_url) return hit.public_url

  const generated = await generateImage({ config: args.image, prompt: args.prompt, seed: args.seed })
  if (!generated) return null
  const uploaded = await uploadPlate(args.clientId, generated.url)
  if (!uploaded) return null

  await admin
    .from('brand_image_bank')
    .upsert(
      { client_id: args.clientId, prompt_hash: hash, storage_path: uploaded.storagePath, public_url: uploaded.publicUrl },
      { onConflict: 'client_id,prompt_hash' }
    )
  return uploaded.publicUrl
}

/**
 * Generate on-brand backdrops for a post's units (carousel or single). Cover + CTA are unique per post
 * (copy-derived scenes); interiors share one base generated per carousel (fresh via the seed), which the
 * renderer varies procedurally. Streams via `onUnit`; fail-soft per unit. Post-agnostic — no `post_id`.
 */
export async function generateBackdrops(
  units: VisualUnit[],
  identity: VisualIdentity,
  ctx: GenerateBackdropsCtx
): Promise<BackdropResult[]> {
  const admin = createAdminSupabaseClient()
  const preset = getVibePreset(identity.vibe_preset)
  const anchors = units.filter((u) => u.role !== 'interior')
  const interiors = units.filter((u) => u.role === 'interior')
  const scenes = await planScenes(anchors, {
    clientName: ctx.clientName,
    clientNiche: ctx.clientNiche,
    topic: ctx.topic,
    brief: identity.brief,
  })
  const results: BackdropResult[] = []
  const record = (index: number, url: string | null) => {
    const result = { index, url }
    results.push(result)
    ctx.onUnit?.(result)
  }

  // Anchors: unique per post, keyed by their copy.
  for (let i = 0; i < anchors.length; i++) {
    const unit = anchors[i]!
    const prompt = buildBackdropPrompt({
      role: unit.role,
      scene: scenes[i] ?? null,
      palette: identity.palette,
      mood: identity.brief.mood,
      promptModifiers: preset.promptModifiers,
      negativePrompt: preset.negativePrompt,
    })
    const url = await resolveBackdrop(admin, {
      clientId: ctx.clientId,
      hashInputs: { preset: identity.vibe_preset, role: unit.role, palette: identity.palette, headline: unit.headline, body: unit.body, nonce: ctx.nonce },
      prompt,
      image: preset.image,
      seed: ctx.seed,
    })
    record(unit.index, url)
  }

  // Interiors: one shared base per carousel (fresh via the seed), reused across all interior slides.
  if (interiors.length > 0) {
    const prompt = buildBackdropPrompt({
      role: 'interior',
      scene: null,
      palette: identity.palette,
      mood: identity.brief.mood,
      promptModifiers: preset.promptModifiers,
      negativePrompt: preset.negativePrompt,
    })
    const url = await resolveBackdrop(admin, {
      clientId: ctx.clientId,
      hashInputs: { preset: identity.vibe_preset, role: 'interior', palette: identity.palette, seed: ctx.seed, nonce: ctx.nonce },
      prompt,
      image: preset.image,
      seed: ctx.seed,
    })
    for (const unit of interiors) record(unit.index, url)
  }

  return results
}
