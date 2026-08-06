-- posts: make the always-written columns NOT NULL.
--
-- Every one of these is set on every insert, and the app's own types have always
-- declared them non-null — only the column definition disagreed. That gap is what
-- forced `?? false` / `?? 0` at read sites and made `Pick<PostRow, …>` derivations
-- surface a null the code has never actually handled.
--
--   status         both insert paths set it explicitly (POST /api/posts, the
--                  generate cron); it is also the column ~25 queries filter on.
--   created_at     no insert sets it — it comes from the column default.
--   priority       written as `?? false` on create, `false` by the cron.
--   was_rewritten  written as `?? false` on create, `true` by the rewrite paths.
--   rewrite_count  written as `?? 0` on create, a number by the rewrite paths.
--
-- A nullable boolean is the clearest symptom: three states where the app only ever
-- meant two.
--
-- Defaults are set before NOT NULL so any row predating a column still passes, and
-- so future inserts that omit the field keep working rather than erroring.

update posts set status = 'pending_review' where status is null;
update posts set created_at = now() where created_at is null;
update posts set priority = false where priority is null;
update posts set was_rewritten = false where was_rewritten is null;
update posts set rewrite_count = 0 where rewrite_count is null;

alter table posts alter column created_at set default now();
alter table posts alter column priority set default false;
alter table posts alter column was_rewritten set default false;
alter table posts alter column rewrite_count set default 0;

alter table posts alter column status set not null;
alter table posts alter column created_at set not null;
alter table posts alter column priority set not null;
alter table posts alter column was_rewritten set not null;
alter table posts alter column rewrite_count set not null;
