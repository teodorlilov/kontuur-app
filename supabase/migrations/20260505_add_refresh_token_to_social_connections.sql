-- Add refresh_token column for OAuth providers that use refresh tokens (e.g. Canva)
alter table social_connections
  add column if not exists refresh_token text;
