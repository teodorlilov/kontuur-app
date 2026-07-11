import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@sparticuz/chromium', 'playwright-core'],
  // Vercel's file tracer copies the JS of playwright-core / @sparticuz/chromium but misses their data
  // and binary assets (playwright's browsers.json, chromium's bin/*.br), which the runtime loads by a
  // computed path. Force-include both packages whole for the Chromium routes.
  outputFileTracingIncludes: {
    '/api/render': ['./node_modules/playwright-core/**/*', './node_modules/@sparticuz/chromium/**/*'],
    '/api/extract': ['./node_modules/playwright-core/**/*', './node_modules/@sparticuz/chromium/**/*'],
    '/api/extract/start': ['./node_modules/playwright-core/**/*', './node_modules/@sparticuz/chromium/**/*'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
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
        ],
      },
    ]
  },
}

export default nextConfig
