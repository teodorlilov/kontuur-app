import type { SupabaseClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Composition as CompositionType } from '@/lib/scene-graph'
import { googleFontsHref } from '@/lib/render/google-fonts'
import { getTokensForRender } from '@/lib/render/tokens-for-render'
import { verifyRenderToken } from '@/lib/render/token'
import { Composition, Stage } from '@/lib/renderer'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RenderPageProps = {
  params: Promise<{ postVisualId: string }>
  searchParams: Promise<{ token?: string; lang?: string }>
}

/**
 * The bare surface the render service screenshots (§2.3). Token-gated, not session-gated:
 * Chromium arrives with no cookies, so `/render` is exempt from the auth redirect and access is
 * proven by the HMAC token instead. Renders only `<Stage><Composition/></Stage>`; the screenshot
 * targets `#stage`, so any surrounding app chrome is never captured.
 */
export default async function RenderPage({ params, searchParams }: RenderPageProps) {
  const { postVisualId } = await params
  const { token, lang } = await searchParams

  if (!token || !verifyRenderToken(token, postVisualId)) notFound()

  // post_visuals is not yet in the generated Database types (migration is new; run
  // `supabase gen types` after applying it and drop this cast for the typed client).
  const supabase = createAdminSupabaseClient() as unknown as SupabaseClient
  const { data } = await supabase
    .from('post_visuals')
    .select('composition_json, brand_kit_version')
    .eq('id', postVisualId)
    .single()

  if (!data) notFound()

  const tokens = getTokensForRender()
  // composition_json is validated on write (§2.1); it is this slide's scene graph.
  const composition = (data as { composition_json: unknown }).composition_json as CompositionType

  return (
    <>
      <link rel="stylesheet" href={googleFontsHref(tokens)} />
      <Stage tokens={tokens} lang={lang ?? 'en'}>
        <Composition composition={composition} tokens={tokens} />
      </Stage>
    </>
  )
}
