import { NextResponse } from 'next/server'
import { CLIENT_WEBSITE_COLUMNS } from '@/lib/queries/select-columns'
import type { SupabaseServerClient } from '@/lib/auth/helpers'

type WebsiteResult = { ok: true; websiteUrl: string } | { ok: false; response: NextResponse }

/**
 * The website a re-read should read, or the response explaining why there isn't one.
 *
 * Shaped like `resolveAuth`, and used the same way: both re-analysis routes open with the identical
 * ownership query and the identical pair of refusals, so the copy a user sees for "no website on
 * file" is written once rather than in each route that can say it.
 *
 * The `agency_id` filter is the ownership check — RLS is the boundary, this is what turns another
 * agency's client id into a 404 rather than a 403 that confirms the row exists.
 */
export async function resolveClientWebsite(
  supabase: SupabaseServerClient,
  clientId: string,
  agencyId: string
): Promise<WebsiteResult> {
  const { data: client } = await supabase
    .from('clients')
    .select(CLIENT_WEBSITE_COLUMNS)
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .single()

  if (!client) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  if (!client.website_url) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No website on file for this client' }, { status: 400 }),
    }
  }
  return { ok: true, websiteUrl: client.website_url }
}
