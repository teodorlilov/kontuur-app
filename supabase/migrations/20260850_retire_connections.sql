-- A token Meta has declared dead (Graph code 190) needs a place to say so. access_token = NULL
-- was already the reader signal, but only the refresher ever set it, and only near expiry.
-- retired_at is the non-secret copy for display reads; the token must never reach one.
-- Both columns are cleared by the next successful connect.
alter table social_connections
  add column if not exists retired_at timestamptz,
  add column if not exists retired_reason text;

comment on column social_connections.retired_at is
  'When Meta declared this token dead and the app stopped using it. NULL while live. Cleared by the next successful connect.';
comment on column social_connections.retired_reason is
  'Meta''s error message at retirement, verbatim. For support; the UI does not read it.';

notify pgrst, 'reload schema';
