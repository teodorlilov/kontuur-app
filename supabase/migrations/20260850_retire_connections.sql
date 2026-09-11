-- A token Meta has declared dead needs a place to say so.
--
-- On 2026-09-11 Instagram invalidated a client's token three days after it was
-- issued (Graph code 190: "the session has been invalidated because the user
-- changed their password or Facebook has changed the session for security
-- reasons"). The row still carried the token and a November expiry, so every
-- cron kept calling Meta with a dead credential, every surface read
-- "Connected", the analytics fill promised a retry that would fail
-- identically, and a scheduled post would have burned its attempts.
--
-- access_token = NULL was already what every reader treated as "needs
-- reconnecting", but the only writer that ever set it was the daily refresher,
-- and only for tokens within fourteen days of expiry. A token killed early
-- stayed live in the database until it expired on its own.
--
-- retired_at is the non-secret fact the roster, the client settings, the
-- analytics page and the reconnect prompt read; the token column itself must
-- never reach a display projection. retired_reason keeps Meta's own message
-- for support. Both are cleared by the next successful connect.
alter table social_connections
  add column if not exists retired_at timestamptz,
  add column if not exists retired_reason text;

comment on column social_connections.retired_at is
  'When Meta declared this token dead and the app stopped using it. NULL while live. Cleared by the next successful connect.';
comment on column social_connections.retired_reason is
  'Meta''s error message at retirement, verbatim. For support; the UI does not read it.';

notify pgrst, 'reload schema';
