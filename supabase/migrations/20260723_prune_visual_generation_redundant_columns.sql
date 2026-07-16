-- Prune columns left redundant by the visual-generation pivots (satori → compositor → archetype spec →
-- generative styles.ts). None of these are read by the current code; verified against src/ before writing.
-- Idempotent (drop column if exists). Apply with `supabase db push` (or your migration runner), then
-- regenerate types: `supabase gen types` → src/types/database.ts.

-- ── Tier 1: never read AND never written by code (migration-only safe) ──────────────────────────────

-- feed_systems: the old compositor spec. The generative pipeline reads only id/slug/name/description; all
-- layout / photographic / treatment parameters now live in code (renderer/styles.ts). These columns are
-- populated only by the seed migrations and read by nothing.
alter table feed_systems
  drop column if exists font_reqs,
  drop column if exists photographic,
  drop column if exists treatment,
  drop column if exists mark_style,
  drop column if exists rhythm,
  drop column if exists plate_budget,
  drop column if exists params,
  drop column if exists is_starter;

-- post_visuals: the Phase-0/7 rendered-slide cache that was never wired. The live export writes publishable
-- images to post_images; nothing ever set or read these.
alter table post_visuals
  drop column if exists rendered_url,
  drop column if exists render_hash;

-- ── Tier 2: written by generate-post-visuals but never read back, and duplicated inside composition_json ──
-- (The matching code change — removing them from the insert — ships in generate-post-visuals.ts.)
alter table post_visuals drop constraint if exists post_visuals_feed_system_id_fkey;
alter table post_visuals
  drop column if exists brand_kit_version,
  drop column if exists feed_system_id;
