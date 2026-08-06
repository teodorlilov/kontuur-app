import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership, fetchClientWithOwnership } from '@/lib/auth/helpers'
import { generateAnalyticsSummary } from '@/ai/analytics/generate-summary'
import { fetchInstagramMetrics } from '@/lib/meta/instagram-metrics'
import { fetchFacebookMetrics } from '@/lib/meta/facebook-metrics'
import { isTokenExpired } from '@/lib/meta/token-expiry'
import type { InstagramMetrics, FacebookMetrics } from '@/types/api'

/** platform selects which Meta API is called, so it is an enum rather than a free string. */
const reportRequestSchema = z.object({
  client_id: z.string().min(1),
  platform: z.enum(['instagram', 'facebook']),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
})

/** Generate an analytics report for one client and platform over a date range. */
export async function POST(request: NextRequest) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  let body: z.infer<typeof reportRequestSchema>
  try {
    body = reportRequestSchema.parse(await request.json())
  } catch {
    return NextResponse.json(
      { error: 'client_id, platform (instagram|facebook), period_start, period_end are required' },
      { status: 400 }
    )
  }

  const { client_id, platform, period_start, period_end } = body

  const clientRow = await fetchClientWithOwnership(supabase, client_id, agencyId)
  if (!clientRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const clientName = clientRow.name

  // Get social connection for client + platform. maybeSingle: "not connected"
  // is an expected state the caller reports, not a query failure.
  const { data: connection, error: connectionError } = await supabase
    .from('social_connections')
    .select('account_id, access_token, token_expires_at')
    .eq('client_id', client_id)
    .eq('platform', platform)
    .maybeSingle()
  if (connectionError) {
    console.error('[analytics] connection lookup failed:', connectionError.message)
    return NextResponse.json({ error: 'Failed to load connection' }, { status: 500 })
  }

  if (!connection) {
    return NextResponse.json(
      { error: `No ${platform} account connected for this client` },
      { status: 422 }
    )
  }

  if (isTokenExpired(connection.token_expires_at)) {
    return NextResponse.json(
      { error: 'Access token expired. Please reconnect the account.' },
      { status: 422 }
    )
  }

  try {
    let metrics: InstagramMetrics | FacebookMetrics

    if (platform === 'instagram') {
      metrics = await fetchInstagramMetrics(
        connection.account_id!,
        connection.access_token!,
        period_start,
        period_end
      )
    } else {
      metrics = await fetchFacebookMetrics(
        connection.account_id!,
        connection.access_token!,
        period_start,
        period_end
      )
    }

    const aiSummary = await generateAnalyticsSummary({
      clientName,
      platform,
      startDate: period_start,
      endDate: period_end,
      metricsJson: metrics,
    })

    const { data: report, error: upsertError } = await supabase
      .from('analytics_reports')
      .upsert(
        {
          client_id,
          platform,
          period_start,
          period_end,
          metrics_json: JSON.parse(JSON.stringify(metrics)) as import('@/types/database').Json,
          ai_summary: aiSummary,
        },
        { onConflict: 'client_id,platform,period_start,period_end' }
      )
      .select()
      .single()

    if (upsertError) {
      console.error('Failed to save analytics report:', upsertError)
      return NextResponse.json({ error: 'Failed to save report' }, { status: 500 })
    }

    return NextResponse.json({ report })
  } catch (err) {
    console.error('Analytics report error:', err)
    const message = err instanceof Error ? err.message : 'Failed to fetch analytics data'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** List the agency's stored analytics reports, newest first. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const platform = searchParams.get('platform')

  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  }

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let query = supabase
    .from('analytics_reports')
    .select('id, platform, period_start, period_end, ai_summary, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (platform) {
    query = query.eq('platform', platform)
  }

  const { data: reports, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reports: reports ?? [] })
}
