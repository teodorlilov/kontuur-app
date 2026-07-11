-- Phase 1 data model for the composition engine: brand_kits (per client), feed_systems (shared
-- catalog), and the client_feed_systems join. Access is app-level (service-role client + agency_id
-- filter via client -> agency), matching the rest of the schema — no RLS (only client_ideas /
-- idea_form_tokens use it). Idempotent: safe to re-run.

-- Shared catalog of feed systems. Global, not agency-scoped (agencies pick from these; authoring
-- their own is Phase 2/F-5). Parameter columns follow the product doc §3 starter table.
create table if not exists feed_systems (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  description   text not null,
  font_reqs     jsonb not null,          -- { category, minWeight?, maxWeight?, case?, contrast? }
  photographic  text not null,           -- cadence: 'every-third' | 'cover-only' | 'none'
  treatment     text not null,           -- 'grain' | 'duotone' | 'mono'
  mark_style    text not null,           -- 'organic-line' | 'geometric-filled' | 'geometric-line'
  rhythm        text not null,           -- 'photo-column' | 'no-adjacent-bg' | 'light-dark-alternate'
  plate_budget  int  not null,           -- max photographic plates per carousel
  params        jsonb not null default '{}',  -- scale, marginPct, textBlock, chrome, display (full spec)
  is_starter    boolean not null default true,
  created_at    timestamptz not null default now()
);

-- One brand kit per client. `tokens` is a BrandTokens blob (validated by the zod schema on write).
create table if not exists brand_kits (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  tokens        jsonb not null,
  version       int  not null default 1,
  source_kind   text not null default 'default',  -- 'default' | 'website' | 'image'
  report        jsonb,                             -- ExtractionReport (confidence badges)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id)
);

-- Which feed system a client uses. Partial unique index enforces at most one default per client.
create table if not exists client_feed_systems (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  feed_system_id uuid not null references feed_systems(id),
  is_default     boolean not null default false,
  created_at     timestamptz not null default now()
);
create unique index if not exists client_feed_systems_default_uniq
  on client_feed_systems (client_id) where is_default;
create index if not exists client_feed_systems_client_idx on client_feed_systems (client_id);

-- Wire the FK Phase 0 left nullable on post_visuals.feed_system_id.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'post_visuals_feed_system_id_fkey') then
    alter table post_visuals
      add constraint post_visuals_feed_system_id_fkey
      foreign key (feed_system_id) references feed_systems (id);
  end if;
end $$;

-- Seed the three starter feed systems (product doc §3). Colours never differ between systems — only
-- type, geometry, chrome, photographic cadence, and rhythm.
insert into feed_systems (slug, name, description, font_reqs, photographic, treatment, mark_style, rhythm, plate_budget, params)
values
  ('editorial', 'Editorial',
   'High-contrast serif, wide margins, baseline-hung text, one hairline rule. Photography every third post.',
   '{"category":"serif","contrast":"high"}', 'every-third', 'grain', 'organic-line', 'photo-column', 3,
   '{"display":"serif-high-contrast","scale":1.333,"marginPct":12,"textBlock":"bottom-left-baseline","chrome":"hairline-rule","caseUpper":false}'),
  ('bold-blocks', 'Bold blocks',
   'Heavy uppercase grotesk, tight margins, solid colour blocks and numerals, no chrome. Cover photo only.',
   '{"category":"sans","minWeight":700,"case":"upper"}', 'cover-only', 'duotone', 'geometric-filled', 'no-adjacent-bg', 1,
   '{"display":"grotesk-heavy","scale":1.5,"marginPct":6,"textBlock":"fills-frame","chrome":"none","caseUpper":true}'),
  ('quiet-grid', 'Quiet grid',
   'Light grotesk, generous whitespace, frames and dot grids, strict light/dark alternation. Never generates a photograph.',
   '{"category":"sans","maxWeight":600}', 'none', 'mono', 'geometric-line', 'light-dark-alternate', 0,
   '{"display":"grotesk-light","scale":1.2,"marginPct":9,"textBlock":"centred-generous","chrome":"frames-corners-dotgrid","caseUpper":false}')
on conflict (slug) do nothing;

-- Backfill: every existing client gets the neutral DEFAULT_TOKENS kit (there is no palette to read).
-- This JSON is a snapshot of src/lib/scene-graph/default-tokens.ts; per-client "Re-analyze from
-- website" (§3.1) upgrades it on demand. Idempotent via the unique(client_id).
insert into brand_kits (client_id, tokens, version, source_kind)
select c.id,
  '{
    "color": {"surface":"#FFFFFF","ink":"#1A1A1A","accent":"#2563EB","accent-deep":"#1E3A8A","line":"#E5E5E5"},
    "type": {
      "display": {"family":"Source Serif 4","weights":[600,700],"tracking":-0.01,"case":"none","lineHeight":1.1},
      "body": {"family":"Source Sans 3","weights":[400,600],"tracking":0,"lineHeight":1.5},
      "scale": 1.25, "baseSize": 32
    },
    "space": {"steps":[4,8,12,16,24,32,48,64,96], "radius":8, "hairline":1},
    "grid": {"marginX":96, "marginY":96, "baseline":8}
  }'::jsonb,
  1, 'default'
from clients c
on conflict (client_id) do nothing;
