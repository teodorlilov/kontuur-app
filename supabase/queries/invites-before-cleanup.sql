-- Old-style pending invites — paste into the Supabase dashboard SQL editor BEFORE applying
-- 20260862_billing_review_cleanup.sql (docs/plans/BILLING-REVIEW-FIXES.md, step 2).
--
-- Before the billing review, an invite lived only in the invitee's `user_metadata`
-- (`invited_agency_id`, `role`), which anyone can write at sign-up. The new code joins a workspace
-- only through a `team_invites` row (src/lib/auth/create-user-record.ts) and there is no backfill,
-- so every login below has no way into its workspace any more. It lists each login that claims a
-- workspace and has no `users` row: a pending invitee of the old route, a forged sign-up, or a
-- member an admin removed whose login survived.
--
-- Read-only. For each row, ask that workspace's admin (the `admins` column) whether they still want
-- the person, then:
--   - still wanted, `email_confirmed_at` empty: invite again from Settings → Team;
--   - still wanted, `email_confirmed_at` set: delete the login (Authentication → Users), then
--     invite again — an invite refuses an address that already has a confirmed account;
--   - nobody vouches for it: delete the login.
-- Nobody is invited again without their admin's word.

select
  u.email,
  a.name as workspace,
  (
    select string_agg(m.email, ', ')
    from public.users m
    where m.agency_id = a.id and m.role = 'admin'
  ) as admins,
  u.raw_user_meta_data ->> 'role' as role_claimed,
  u.invited_at,
  u.email_confirmed_at,
  u.last_sign_in_at,
  u.created_at,
  u.id as auth_user_id
from auth.users u
left join public.agencies a on a.id::text = u.raw_user_meta_data ->> 'invited_agency_id'
where u.raw_user_meta_data ? 'invited_agency_id'
  and not exists (select 1 from public.users p where p.id = u.id)
order by a.name nulls first, u.created_at;
