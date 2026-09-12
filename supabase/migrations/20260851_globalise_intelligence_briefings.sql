-- The weekly brief becomes one row for everyone. Platform news is the same for every agency, so
-- the per-agency row, its FK and its agency-isolation policy go, along with the seven columns the
-- 2026-09 rebuild found were written and never read (or, for briefing_text, never even written).
-- The existing rows held one motivational line each and are not worth converting; dropping the
-- table is the honest migration. `items` is BriefingItem[] (src/ai/intelligence/schema.ts), and
-- `week_start` is unique so two cron ticks racing on Monday resolve at the database.
drop table if exists public.intelligence_briefings cascade;

create table public.intelligence_briefings (
  id         uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  items      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

comment on column public.intelligence_briefings.items is
  'BriefingItem[] — src/ai/intelligence/schema.ts. Verified Instagram/Facebook platform changes for the week starting week_start (UTC Monday).';

-- Global reference data, like language_rules: readable by any signed-in user, written only by the
-- service role from the cron. The app reads it through the admin client today; the policy states
-- the intent rather than relying on that.
alter table public.intelligence_briefings enable row level security;
create policy "intelligence_briefings_read_all" on public.intelligence_briefings
  for select to public using (auth.uid() is not null);

notify pgrst, 'reload schema';
