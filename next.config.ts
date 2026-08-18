import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // puppeteer-core + @sparticuz/chromium must stay external — bundling breaks @sparticuz's runtime
  // binary extraction on Vercel (the headless Chrome used for brand visual-identity extraction).
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'puppeteer-core', '@sparticuz/chromium'],
  // @sparticuz reads its Chromium binary from bin/ at runtime, which Vercel's file tracing misses
  // (it isn't `require`d). Force-include it in the functions that launch the browser, otherwise the
  // binary is absent on Vercel and extraction fails with "…/@sparticuz/chromium/bin does not exist".
  outputFileTracingIncludes: {
    '/api/extract/start': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/clients/[id]/visual-identity/reanalyze': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
      // Instagram media thumbnails in the analytics grid. Meta serves them from both CDNs and
      // rotates the subdomain per request, so the host has to be matched by wildcard.
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
    ],
  },
  async headers() {
    return [
      {
        // Cache favicon for 24h in dev — prevents revalidation on every navigation.
        // vercel.json handles the equivalent for Vercel CDN in production.
        source: '/favicon.ico',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Two years and preload-eligible. Vercel terminates TLS and does not serve the
          // app over plain HTTP, so this closes the first-request window rather than
          // changing steady-state behaviour.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Nothing in the app asks for any of these. Denying them by name means a future
          // dependency cannot quietly start asking on a page the user already trusts.
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
