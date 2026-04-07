-- Add unique constraint on (client_id, platform) to support upsert in social_connections
ALTER TABLE social_connections
  ADD CONSTRAINT social_connections_client_id_platform_key UNIQUE (client_id, platform);
