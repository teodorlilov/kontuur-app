import type { BrandTokens } from '@/lib/scene-graph'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'

/**
 * The token set a `post_visuals` row renders against. Phase 0 always returns the neutral
 * default kit. Phase 1 changes this to accept the row and load its `brand_kits` pinned at
 * `brand_kit_version` — this function is the only change the render route needs then.
 */
export function getTokensForRender(): BrandTokens {
  return DEFAULT_TOKENS
}
