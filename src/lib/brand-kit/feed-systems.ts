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
    description: 'Serif display, wide margins, a single hairline rule. Calm and photographic — one image every third post.',
  },
  {
    slug: 'bold-blocks',
    name: 'Bold blocks',
    description: 'Heavy uppercase type on solid colour blocks. No chrome, maximum contrast — cover photo only.',
  },
  {
    slug: 'quiet-grid',
    name: 'Quiet grid',
    description: 'Light type on white, thin frames and dot grids, generous whitespace. Never generates a photo.',
  },
]
