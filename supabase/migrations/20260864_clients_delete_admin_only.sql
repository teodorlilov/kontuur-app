-- Only an admin deletes a client (`clientRosterRefusal`, src/lib/billing/copy.ts;
-- docs/plans/BILLING-REVIEW-FIXES.md step 15): a delete lowers what the workspace pays and cannot
-- be undone. `deleteClient` (src/features/clients/actions/client-actions.ts) refuses a member and
-- deletes through the service role, in `unprovisionClient`
-- (src/features/clients/lib/provision-client.ts), the one delete of a client row. With DELETE
-- still granted to the tenant role, a member could delete any client of their workspace by
-- calling PostgREST directly: `clients_agency_isolation` (migration 20260818) is FOR ALL, scoped
-- only to the caller's agency. UPDATE stays: the settings form writes through the user-scoped
-- client, scoped by that policy.
--
-- Applied after the deploy, after 20260862 (docs/plans/BILLING-REVIEW-FIXES.md, Deploy order item
-- 3), though nothing depends on that order: the deployed code (e737ab4a) already deletes a client
-- through the service role, in `deleteClient` and in `provisionClient`'s rollback, so no code on
-- either side of the deploy deletes a client as the tenant. Re-runnable.

revoke delete on public.clients from anon, authenticated;

notify pgrst, 'reload schema';
