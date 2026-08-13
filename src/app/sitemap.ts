import type { MetadataRoute } from 'next'

const BASE_URL = 'https://kontuur.app'

/**
 * `/login` and `/signup` are not listed: both are now redirects to `/?auth=…`,
 * because sign-in and sign-up are dialogs over the landing page. Advertising a
 * redirect as an indexable URL asks crawlers to follow a hop to a page already
 * listed above at priority 1.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    {
      url: BASE_URL,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/data-deletion`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
