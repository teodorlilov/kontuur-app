import type { SupabaseClient } from '@supabase/supabase-js'

/** The `post_visuals` columns the render function reads: the graph to render + the cache state. */
export type PostVisual = {
  composition_json: unknown
  brand_kit_version: number
  render_hash: string | null
  rendered_url: string | null
}

/**
 * A cache hit means the stored render matches the freshly computed hash AND a PNG url exists. The hash
 * already folds in `brand_kit_version` + `RENDERER_VERSION` (see hash.ts), so a composition edit, a
 * rebrand, or a renderer bump all miss and force exactly one re-render. Pure so it is unit-testable.
 */
export function isCacheHit(row: PostVisual, hash: string): boolean {
  return row.render_hash === hash && Boolean(row.rendered_url)
}

/** Load the render columns for one slide; null if the row does not exist. */
export async function loadPostVisual(
  supabase: SupabaseClient,
  postVisualId: string
): Promise<PostVisual | null> {
  const { data, error } = await supabase
    .from('post_visuals')
    .select('composition_json, brand_kit_version, render_hash, rendered_url')
    .eq('id', postVisualId)
    .single()
  if (error || !data) return null
  // Untyped client (post_visuals not in generated types yet); the select pins the shape.
  return data as PostVisual
}

/** Persist a completed render so an unchanged slide serves from cache without relaunching Chromium. */
export async function storeRenderResult(
  supabase: SupabaseClient,
  postVisualId: string,
  hash: string,
  renderedUrl: string
): Promise<void> {
  const { error } = await supabase
    .from('post_visuals')
    .update({ render_hash: hash, rendered_url: renderedUrl, updated_at: new Date().toISOString() })
    .eq('id', postVisualId)
  if (error) throw new Error(`Failed to persist render: ${error.message}`)
}
