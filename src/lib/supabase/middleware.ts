import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_USER_ID_HEADER, AUTH_USER_NAME_HEADER } from '@/lib/auth/headers'
import type { Database } from '@/types/database'

export async function updateSession(request: NextRequest) {
  // Deleted before anything else runs: these headers are a trust channel from this function to the
  // render pass, so a client-supplied value must never survive to be read as a validated identity.
  request.headers.delete(AUTH_USER_ID_HEADER)
  request.headers.delete(AUTH_USER_NAME_HEADER)

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isPublicPath =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/api/auth/forgot-password') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/setup-password') ||
    pathname.startsWith('/approve') ||
    pathname.startsWith('/api/approval') ||
    pathname.startsWith('/ideas') ||
    pathname.startsWith('/api/ideas/submit') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/data-deletion') ||
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')

  if (user && pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (!user) return supabaseResponse

  // Hand the validated identity to the render pass so it does not repeat this network round trip.
  // The name rides along because the app shell shows it on every page, and fetching it separately
  // would cost back the round trip this exists to remove.
  // Rebuilt rather than mutated: `supabaseResponse` may have been reassigned by `setAll` above to
  // carry refreshed auth cookies, and those must survive onto the response we return.
  const displayName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? ''
  request.headers.set(AUTH_USER_ID_HEADER, user.id)
  request.headers.set(AUTH_USER_NAME_HEADER, encodeURIComponent(displayName))
  const response = NextResponse.next({ request })
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
  return response
}
