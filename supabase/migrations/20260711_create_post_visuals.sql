-- post_visuals: one rendered slide per (post, slide_index) — the row the render service reads.
-- Phase 0 of the composition engine. `brand_kits` / `feed_systems` arrive in Phase 1.
--
-- Access is app-level (service-role client + agency_id filter via post -> client), matching the
-- rest of the schema. No RLS policy here: only client_ideas / idea_form_tokens use RLS in this
-- project; everything else is scoped in server code through createAdminSupabaseClient().

create table if not exists post_visuals (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references posts(id) on delete cascade,
  slide_index       int  not null,
  composition_json  jsonb not null,
  brand_kit_version int  not null default 1,
  feed_system_id    uuid,               -- FK added in Phase 1
  rendered_url      text,
  render_hash       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (post_id, slide_index)
);

create index if not exists post_visuals_post_id_idx on post_visuals (post_id);
