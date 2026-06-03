import type { MetadataRoute } from 'next'

const BASE_URL = 'https://kontuur.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Keep crawlers out of auth-gated app routes, API endpoints,
      // and private per-user share links.
      disallow: [
        '/dashboard',
        '/analytics',
        '/calendar',
        '/clients',
        '/ideas',
        '/review',
        '/settings',
        '/generate',
        '/api/',
        '/approve/',
        '/auth/',
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
