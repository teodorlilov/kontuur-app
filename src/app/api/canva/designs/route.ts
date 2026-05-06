import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { canvaFetch, CanvaAuthError } from '../canva-auth'
import { CANVA_API_BASE } from '../canva-constants'

interface CanvaDesign {
  id: string
  title: string
  thumbnail?: { url: string; width: number; height: number }
  urls: { edit_url: string; view_url: string }
  created_at: string
  updated_at: string
}

interface CanvaDesignsResponse {
  items: CanvaDesign[]
  continuation?: string
}

/**
 * GET /api/canva/designs?query=...&continuation=...
 * Lists/searches the current user's Canva designs.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')
  const continuation = searchParams.get('continuation')

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  // Build Canva API URL
  const url = new URL(`${CANVA_API_BASE}/designs`)
  if (query) url.searchParams.set('query', query)
  if (continuation) url.searchParams.set('continuation', continuation)
  url.searchParams.set('ownership', 'any')
  url.searchParams.set('sort_by', query ? 'relevance' : 'modified_descending')

  let res: Response
  try {
    res = await canvaFetch(auth.userId, url.toString())
  } catch (err) {
    if (err instanceof CanvaAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    throw err
  }

  if (!res.ok) {
    const err = await res.text()
    console.error('Canva designs fetch failed:', err)
    return NextResponse.json({ error: 'Failed to fetch Canva designs' }, { status: 502 })
  }

  const data = (await res.json()) as CanvaDesignsResponse
  return NextResponse.json({
    designs: data.items.map((d) => ({
      id: d.id,
      title: d.title,
      thumbnailUrl: d.thumbnail?.url ?? null,
      editUrl: d.urls.edit_url,
      updatedAt: d.updated_at,
    })),
    continuation: data.continuation ?? null,
  })
}
