-- Move Canva connections from per-client to per-user (manager) level.
-- Each manager connects their own Canva account and uses it across all clients.

-- 1. Add user_id column for user-level connections
alter table social_connections
  add column if not exists user_id uuid references users(id);

-- 2. Add unique constraint for user-level connections (Canva)
alter table social_connections
  add constraint social_connections_user_id_platform_key unique (user_id, platform);

-- 3. Remove any existing Canva rows (users will re-connect in Settings)
delete from social_connections where platform = 'canva';
