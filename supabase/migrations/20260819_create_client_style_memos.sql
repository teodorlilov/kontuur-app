-- The engine's per-client learned voice: rules distilled from what reviewers
-- actually change, injected into the writer's prompt so the same correction is
-- never needed twice. Modeled on brand_visual_identity (versioned, machine-
-- regenerated per-client blob in its own table) rather than a brand_profiles
-- column: the memo is re-derived, carries provenance, and must not ride the
-- profile's form round-trip.
--
-- `memo` is a bounded bullet list [{ rule, evidence_count, last_seen }] — the
-- distiller model proposes, code merges deterministically. `reviewed_through`
-- is the cursor: only posts reviewed after it feed the next distillation, and
-- it advances ONLY after a successful memo write so a failed run never eats
-- unprocessed edits. `report` keeps the distiller's raw findings for the
-- settings surface.

create table if not exists client_style_memos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients(id) on delete cascade,
  memo jsonb not null default '[]'::jsonb,
  report jsonb,
  reviewed_through timestamptz not null default 'epoch',
  updated_at timestamptz not null default now()
);

-- Service-role access only (discarded_drafts posture): every read and write —
-- generation-time attach, cron distiller, settings display — goes through the
-- admin client, same as post_images reads. No user-scoped path exists.
alter table client_style_memos enable row level security;

notify pgrst, 'reload schema';
