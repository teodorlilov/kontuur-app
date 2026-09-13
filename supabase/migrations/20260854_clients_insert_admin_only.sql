-- A brand comes into existence through `createClient` alone, which counts the workspace's brands
-- against its plan and provisions through the service role (docs/plans/BILLING.md step 6). With
-- INSERT still granted to the tenant role, a member could add an 8th brand to a 3-brand plan by
-- POSTing to PostgREST directly — `clients_agency_isolation` is FOR ALL with no WITH CHECK, so
-- RLS would let the row through. UPDATE and DELETE stay: the settings form and the delete action
-- still write through the user-scoped client, scoped by that policy.
--
-- Apply after the code that provisions through the admin client is live; before it, this would
-- refuse every new brand.

revoke insert on public.clients from anon, authenticated;

notify pgrst, 'reload schema';
