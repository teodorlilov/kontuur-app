export type FeedSystemOption = { slug: string; name: string; description: string }

/**
 * The three in-house starter feed systems (product §3), as the picker sees them. The DB seeds the same
 * rows (see the Phase-1 migration); this constant is the client-side source for onboarding, which runs
 * in the browser and cannot query the catalog. Keep the slugs in sync with the migration.
 */
export const STARTER_FEED_SYSTEMS: FeedSystemOption[] = [
  {
    slug: 'editorial',
    name: 'Editorial',
    description: 'High-contrast serif, wide margins, one hairline rule. Photography every third post.',
  },
  {
    slug: 'bold-blocks',
    name: 'Bold blocks',
    description: 'Heavy uppercase grotesk, solid colour blocks, no chrome. Cover photo only.',
  },
  {
    slug: 'quiet-grid',
    name: 'Quiet grid',
    description: 'Light grotesk, generous whitespace, frames and dot grids. Never generates a photograph.',
  },
]
