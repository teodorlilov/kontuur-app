-- One web-research ('tavily') source per client.
--
-- The sources page creates this row lazily on first open, so two concurrent
-- opens could both insert one and the client ended up with duplicate web-research
-- toggles. A partial unique index makes the loser's insert fail with 23505,
-- which the app reads back instead of duplicating.
--
-- Partial by design: clients legitimately hold many rss/website/manual sources,
-- so the constraint must apply to the 'tavily' row only.

-- Collapse any duplicates that already exist, keeping the oldest row so the
-- client's existing toggle state survives.
delete from client_sources
where type = 'tavily'
  and id not in (
    select distinct on (client_id) id
    from client_sources
    where type = 'tavily'
    order by client_id, created_at asc, id asc
  );

create unique index if not exists client_sources_one_tavily_per_client
  on client_sources (client_id)
  where type = 'tavily';
