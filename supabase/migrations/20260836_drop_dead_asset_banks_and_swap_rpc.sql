-- ── Remove schema nothing has ever used ──────────────────────────────────────────────────────
--
-- Three objects, all confirmed unreachable from `src/` by direct search:
--
-- 1. `brand_image_bank` and `brand_vector_bank`. Leftovers from the retired reuse-cached-art idea.
--    20260820's own header calls them "referenced by zero lines of src/" and names
--    `20260821_drop_unused_asset_tables.sql` as the follow-up — that file was never written, and
--    20260821 became the Facebook cleanup instead. They have no application writer and no reader.
--    20260832 gave them RLS policies purely so they would not sit policyless; dropping them is the
--    outcome that migration was working around.
--
-- 2. `swap_rendered_post_images(uuid, jsonb)`. A live SECURITY DEFINER function that DELETEs every
--    `post_images` row with `source = 'render'` for a post and re-inserts from a jsonb payload,
--    under an advisory lock. It has ZERO call sites. It is also the only writer of
--    `post_images.source` anywhere — every TypeScript write leaves the column's default — so the
--    `'render'` branch it keys on can never match a row this application produced.
--
--    A dormant SECURITY DEFINER function that can wipe and replace a post's images is not neutral
--    dead weight: it runs as the definer, so anything that can reach the RPC endpoint can invoke
--    it. Deleting it is the conservative option. If whole-post image swapping is wanted later, it
--    should be written against `putPostImages`, which is the one writer of that table today.
--
-- `consume_image_credits` and `refund_image_credits` are deliberately KEPT. They were dead for the
-- same reason as the above — nothing called them — but the answer there is to start calling one,
-- not to drop it: `recordImageSpend` (src/lib/visual/image-spend.ts) now records every generation
-- so image cost is attributable per agency per month. It passes a quota nothing can reach, because
-- what the ceiling should be is a decision that has not been made yet.
--
-- `post_images.source` is deliberately LEFT IN PLACE. It has a default that every insert relies on,
-- and dropping a column is a separate decision from dropping the function that gave it a second
-- value. Its comment is updated to say what it now means.

drop function if exists public.swap_rendered_post_images(uuid, jsonb);

drop table if exists public.brand_image_bank;
drop table if exists public.brand_vector_bank;

comment on column public.post_images.source is
  'How the row was produced. Always the ''upload'' default in practice: swap_rendered_post_images was the only writer of any other value and was dropped 2026-08-31, unused since it was written.';

notify pgrst, 'reload schema';
