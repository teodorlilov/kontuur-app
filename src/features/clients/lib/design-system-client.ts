import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import type { BrandTokens } from '@/lib/scene-graph'

/** One generated design-system plate (public URL + storage path), mirroring `SeedPlate` for persistence. */
export type DesignPlate = { publicUrl: string; storagePath: string }
export type DesignVector = { svg: string; label: string }
export type DesignSystemResult = { plates: Record<string, DesignPlate>; vectors: DesignVector[] }

/**
 * Request the brand design system — real background imagery (per plate-bearing showcase role) + starter
 * vector marks — for the current tokens/brief. The single client-side seam both **onboarding** (no client
 * row yet) and the settings **Visual system tab** call: the endpoint is client-agnostic (stores under a
 * temp prefix) and the caller persists the result to the brand bank on save (`saveBrandKit` →
 * `seedImageBank`/`seedVectorBank`). Fail-soft: a failed request or empty body yields empty maps, so the
 * caller just keeps the gradient preview.
 */
export async function requestDesignSystem(input: {
  tokens: BrandTokens
  feedSystemSlug: string | null
  brief: BrandBrief | null
}): Promise<DesignSystemResult> {
  try {
    const res = await fetch('/api/onboarding/design-system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens: input.tokens, feedSystemSlug: input.feedSystemSlug, brief: input.brief }),
    })
    if (!res.ok) return { plates: {}, vectors: [] }
    const data = (await res.json().catch(() => ({}))) as Partial<DesignSystemResult>
    return { plates: data.plates ?? {}, vectors: data.vectors ?? [] }
  } catch {
    return { plates: {}, vectors: [] }
  }
}
