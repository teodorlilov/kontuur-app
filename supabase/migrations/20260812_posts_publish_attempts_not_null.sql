-- posts.publish_attempts is never null in practice — say so in the schema.
--
-- The column was added in 20260429 as `INTEGER DEFAULT 0` but without NOT NULL.
-- No insert path sets it (neither POST /api/posts nor the generate cron mentions
-- the column), so every row's initial value comes from that default, and PG's
-- ADD COLUMN ... DEFAULT backfilled the rows that predated it. There is nothing
-- to repair; this only closes the gap the type still advertises.
--
-- Worth closing because a null would be invisible rather than loud. The scheduler
-- gates its queue on:
--
--   .lt('publish_attempts', MAX_ATTEMPTS)
--
-- and in SQL `NULL < 3` is NULL, not true — so a post with a null count would be
-- filtered out of every publish run, forever, without ever raising an error. It
-- would simply never publish.
--
-- The update is a no-op on current data and exists so the migration is safe to run
-- against any database, including one where a hand-written insert passed an
-- explicit null.

update posts set publish_attempts = 0 where publish_attempts is null;

alter table posts alter column publish_attempts set not null;
