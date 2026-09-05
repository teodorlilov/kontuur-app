-- `posts.scheduled_at` has no time zone, so every JavaScript reader shifts it by the agency's.
--
-- Reported symptom: schedule a post for 09:00 in Europe/Sofia (UTC+3), reopen the card, and the
-- time field says 06:00. Repeat and it walks backwards three hours each time.
--
-- The write is correct. `formatScheduledAt` turns the typed wall-clock into a true instant —
-- 2026-09-05T06:00:00.000Z for 09:00 in Sofia — and hands it to PostgREST. The column is
-- `timestamp WITHOUT time zone`, so Postgres DROPS the offset and stores the naive `06:00`.
--
-- The read is where it breaks. PostgREST returns `"2026-09-05T06:00:00"` with no `Z`, and
-- `new Date()` parses a date-time with no offset as LOCAL time — so the browser reads 06:00 Sofia,
-- an instant three hours earlier than the one that was stored, and renders it as 06:00.
--
-- Publishing was never wrong: the cron compares in SQL, where both sides lose their zone
-- together, so a post still went out at the intended instant. Only what a human SAW was wrong —
-- and pressing Update on that wrong value is what would move a post for real.
--
-- Verified before converting: every stored value is already UTC. `posts.created_at` read
-- 2026-09-05T05:49 against a true 06:00Z, and every writer produces `toISOString()` while Postgres
-- `now()` on this instance is UTC. `at time zone 'UTC'` therefore reinterprets without moving
-- anything — the same wall-clock digits, now carrying the offset they always meant.
--
-- Three columns, not one. Each has its own visible consequence and the same single cause:
--   posts.scheduled_at              the calendar's time field and every bucketing of a post to a day
--   posts.created_at                "Generated N ago" — a post made seconds ago read as 3 hours old
--   post_approval_tokens.expires_at the card's lapsed-link test, so a live link could read expired
--
-- Seventeen more naive columns remain across eleven other tables (clients, agencies, users,
-- notifications, social_connections.token_expires_at and the rest). They are wrong for exactly
-- this reason and the same one-line conversion fixes each; they are left out here because none of
-- them drives an hour-scale decision, and a twenty-column type change is not what this fix is.

alter table posts
  alter column scheduled_at type timestamptz using scheduled_at at time zone 'UTC';

alter table posts
  alter column created_at type timestamptz using created_at at time zone 'UTC';

alter table post_approval_tokens
  alter column expires_at type timestamptz using expires_at at time zone 'UTC';
