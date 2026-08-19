-- analytics_reports, back-filled into version control.
--
-- The table predates the migrations directory: it was created by hand in the
-- dashboard, so until this file the repo could not rebuild the schema it ships
-- against — the 20260818 policy baseline even references a table no migration
-- creates. `create table if not exists` makes this a no-op on the live database
-- and the missing DDL on a fresh one. Column shape transcribed from the
-- generated src/types/database.ts row, which is the closest thing to a record
-- of the live state; the unique constraint is the one the report route's
-- upsert (onConflict: client_id,platform,period_start,period_end) depends on.
create table if not exists analytics_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null,
  period_start date not null,
  period_end date not null,
  metrics_json jsonb,
  ai_summary text not null,
  created_at timestamptz not null default now(),
  unique (client_id, platform, period_start, period_end)
);

alter table analytics_reports enable row level security;

-- report_type was never read and never written — every row holds its default.
-- The generated types still list it until the next regen.
alter table analytics_reports drop column if exists report_type;

notify pgrst, 'reload schema';
