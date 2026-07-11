-- Async brand-kit extraction during onboarding (§2.3). The onboarding client mints a random
-- onboarding_session_id, the /api/extract/start route kicks the extractor via Next `after()` and writes
-- the result here, and the Review step polls /api/extract/status until it is ready. App-level access
-- (service-role client + agency_id), no RLS. Idempotent.

create table if not exists brand_kit_extractions (
  id                    uuid primary key default gen_random_uuid(),
  onboarding_session_id uuid not null,
  agency_id             uuid references agencies(id) on delete cascade,
  status                text not null default 'pending',  -- pending | ready | fallback | failed
  tokens                jsonb,
  report                jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (onboarding_session_id)
);

create index if not exists brand_kit_extractions_session_idx
  on brand_kit_extractions (onboarding_session_id);
