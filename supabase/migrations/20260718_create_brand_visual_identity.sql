-- Phase 1 of the AI carousel creator: per-client brand visual identity (palette + typography + vibe
-- preset + creative brief) and the async onboarding-extraction session table that feeds it. Access is
-- app-level (service-role client + agency_id filter via client -> agency), matching the rest of the
-- schema — no RLS. Idempotent: safe to re-run.

-- One visual identity per client. `identity` is a VisualIdentity blob (validated by the zod schema on
-- write). Keeps the versioned/re-analyzable visual identity separate from brand_profiles.
create table if not exists brand_visual_identity (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  identity     jsonb not null,
  source_kind  text not null default 'default',   -- 'default' | 'website' | 'manual'
  report       jsonb,                              -- ExtractionReport (confidence badges)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id)
);

create index if not exists brand_visual_identity_client_idx on brand_visual_identity (client_id);

-- Async brand-extraction during onboarding: the onboarding client mints a random session id, the
-- /api/extract/start route runs the capturer via Next `after()` and writes the result here, and the
-- Review step polls /api/extract/status until it is ready. App-level access, no RLS. Idempotent.
create table if not exists brand_kit_extractions (
  id                    uuid primary key default gen_random_uuid(),
  onboarding_session_id uuid not null,
  agency_id             uuid references agencies(id) on delete cascade,
  status                text not null default 'pending',  -- pending | ready | fallback | failed
  identity              jsonb,
  report                jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (onboarding_session_id)
);

create index if not exists brand_kit_extractions_session_idx
  on brand_kit_extractions (onboarding_session_id);

-- Backfill: every existing client gets the neutral DEFAULT preset identity (luxury-minimalist) so no
-- surface sits blank. Per-client extraction upgrades it on demand. Idempotent via unique(client_id).
insert into brand_visual_identity (client_id, identity, source_kind)
select c.id,
  '{
    "palette": {"surface":"#F7F3EE","ink":"#2B2622","accent":"#B08D57","accent-deep":"#6E5836","line":"#E4DBD0"},
    "typography": {"display_family":"Cormorant Garamond","body_family":"Montserrat"},
    "vibe_preset": "luxury-minimalist",
    "brief": {"mood":"", "photographicSubjects":[], "motifs":[]}
  }'::jsonb,
  'default'
from clients c
on conflict (client_id) do nothing;
