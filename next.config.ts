import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // puppeteer-core + @sparticuz/chromium must stay external — bundling breaks @sparticuz's runtime
  // binary extraction on Vercel (the headless Chrome used for brand visual-identity extraction).
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'puppeteer-core', '@sparticuz/chromium'],
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
