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

  // Verified locally against the project's public signing keys (JWKS, cached across requests)
  // rather than asking the auth server — the project signs tokens with ES256. Sessions signed
  // with the legacy HS256 secret fall back to a getUser() network call inside getClaims(), and
  // an expired session is still refreshed first via getSession(), which writes the new cookies
  // through the setAll adapter above.
  const { data: verified } = await supabase.auth.getClaims()
  const claims = verified?.claims ?? null

  const { pathname } = request.nextUrl

  // No /api/* entries: src/middleware.ts excludes `api/` from the matcher, so this
  // function never sees an API path and any branch for one is unreachable.
  const isPublicPath =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/setup-password') ||
    pathname.startsWith('/approve') ||
    // The trailing slash is load-bearing: the public idea form is /ideas/<token>,
    // while /ideas itself is the agency's inbox. A prefix match made the dashboard
    // route public, so a signed-out visitor reached the page instead of the login
    // redirect and got an error thrown from its own auth check.
    pathname.startsWith('/ideas/') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/data-deletion') ||
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')

  if (claims && pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  if (!claims && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (!claims) return supabaseResponse

  // Hand the validated identity to the render pass so it does not repeat this verification.
  // The name rides along because the app shell shows it on every page, and fetching it separately
  // would cost a round trip this exists to remove.
  // Rebuilt rather than mutated: `supabaseResponse` may have been reassigned by `setAll` above to
  // carry refreshed auth cookies, and those must survive onto the response we return.
  const displayName = (claims.user_metadata?.full_name as string | undefined) ?? claims.email ?? ''
  request.headers.set(AUTH_USER_ID_HEADER, claims.sub)
  request.headers.set(AUTH_USER_NAME_HEADER, encodeURIComponent(displayName))
  const response = NextResponse.next({ request })
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
  return response
}
