-- Preserve what the AI actually wrote, and when a human changed it.
--
-- The engine's learning loop distills per-client style rules from reviewer
-- corrections — but until now the original AI caption survived nowhere: review
-- edits overwrite `caption` in place, the wizard applies edits before the row is
-- ever inserted, and discards hard-delete the text. Without the baseline there
-- is no diff, and without the diff there is nothing to learn from.
--
-- `generated_caption`/`generated_slides_json` = the last AI-authored text for
-- this post. Written at insert by the shared draftColumns builder; an AI rewrite
-- re-baselines both (the delta a rewrite introduces is the AI's, not the
-- reviewer's). Human edits never touch them, so `caption IS DISTINCT FROM
-- generated_caption` is the human-edit signal — including wizard-path edits that
-- happen pre-insert and therefore never fire the trigger below.
--
-- Nullable, no backfill: existing rows predate capture and a fabricated baseline
-- (e.g. copying today's caption) would teach the distiller that nothing is ever
-- edited.

alter table posts
  add column if not exists generated_caption text,
  add column if not exists generated_slides_json jsonb,
  add column if not exists edited_at timestamptz;

-- One mechanism for edit stamping, in the database, so every writer (review
-- autosave, approve, the REST PUT) is covered and none can forget or double-stamp.
--
-- The WHEN clause makes it a HUMAN-edit stamp: an AI rewrite updates caption and
-- generated_caption in the same statement (persistRewrite re-baselines), while a
-- human edit only ever writes caption/slides_json. IS DISTINCT FROM also makes
-- no-op autosave flushes free — same text, no stamp.
create or replace function posts_stamp_edited_at()
returns trigger
language plpgsql
as $$
begin
  new.edited_at := now();
  return new;
end;
$$;

drop trigger if exists posts_stamp_edited_at on posts;
create trigger posts_stamp_edited_at
  before update on posts
  for each row
  when (
    (old.caption is distinct from new.caption
      or old.slides_json is distinct from new.slides_json)
    and new.generated_caption is not distinct from old.generated_caption
    and new.generated_slides_json is not distinct from old.generated_slides_json
  )
  execute function posts_stamp_edited_at();

notify pgrst, 'reload schema';
