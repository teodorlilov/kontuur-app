-- Align the seeded feed-system descriptions with the built composition packs
-- (src/lib/renderer/feed-system-compositions.ts) and the client-side STARTER_FEED_SYSTEMS constant.
-- The settings/edit page reads these rows; onboarding uses the constant — keep the two in sync.
update feed_systems set description =
  'Serif display, wide margins, a single hairline rule. Calm and photographic — one image every third post.'
  where slug = 'editorial';
update feed_systems set description =
  'Heavy uppercase type on solid colour blocks. No chrome, maximum contrast — cover photo only.'
  where slug = 'bold-blocks';
update feed_systems set description =
  'Light type on white, thin frames and dot grids, generous whitespace. Never generates a photo.'
  where slug = 'quiet-grid';
