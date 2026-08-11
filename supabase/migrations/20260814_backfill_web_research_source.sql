-- Every client owns a web-research row.
--
-- The row was created lazily during the render of the client's sources page
-- (`ensureWebResearchSource`), so whether the generation pipeline searched the web
-- depended on whether a human had ever opened that page — `shouldSearchWeb` is
-- `!!tavilyRow`, and `fetchClientSources` filters `is_active = true`, so an absent
-- row and a deliberately-disabled one were indistinguishable downstream.
--
-- Web research is a per-client capability, not a source someone adds, so unlike
-- rss/website/file it has no "add" button and never had a creation moment. It now
-- has two: `createClient` writes it with the client, and this backfills the rest.
-- After that, absence is impossible and `is_active = false` can only mean the
-- agency turned it off.
--
-- `is_active: true` because web research is the product default — the same value
-- the lazy path used. Existing rows are left alone, so a deliberate "off" survives.
--
-- BEHAVIOUR CHANGE: clients whose sources page was never opened have been
-- generating without web research. They gain it here, and their runs start
-- incurring Tavily usage.

insert into client_sources (client_id, type, label, url, is_active)
select c.id, 'tavily', 'Web research', '', true
from clients c
where not exists (
  select 1 from client_sources s
  where s.client_id = c.id and s.type = 'tavily'
);

notify pgrst, 'reload schema';
