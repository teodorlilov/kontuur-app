# 8 · Building and running my team: setup and coverage

Technical source: `technical/10-invites-and-roles.feature` (IDs S1–S43), with the long cases in
the detailed S cases.

## Covers

- 8.1 ← S1, S26 (the UI half: no Remove on my own row)
- 8.2 ← S2, S3
- 8.3 ← S5 (the three form rows)
- 8.4 ← S4, S39
- 8.5 ← S6, S7
- 8.6 ← S8
- 8.7 ← S9
- 8.8 ← S10 (both halves: S-Beta's dead link and its owner's refused re-invite)
- 8.9 ← S42
- 8.10 ← S11
- 8.11 ← S14
- 8.12 ← S29
- 8.13 ← S41
- 8.14 ← S15 (the Settings row), S26 (the UI half: no Remove for a member)
- 8.15 ← S16 (the Settings → Account row and the Checkout return addresses)
- 8.16 ← S43
- 8.17 ← S19, S20
- 8.18 ← S21 (the form row)
- 8.19 ← S22
- 8.20 ← S23 (the reload half)
- 8.21 ← S40
- 8.22 ← S24
- 8.23 ← S25
- 8.24 ← S28
- 8.25 ← S27
- 8.26 ← S30 (D19)

## Setup

- (every scenario) each person, owner or invitee, uses their own private window → the technical
  Background; 8.13 breaks this on purpose. Run 8.1–8.16 before 8.17, or rename "S-Alpha Renamed" back
  after it: the later emails then name the new name.
- (every scenario) each you+x…@… address is unused on Kontuur before the scenario that first invites it
  → the technical Background (10-invites-and-roles.feature:9); later scenarios reuse the teammates and
  pending invites earlier ones made, as their Given lines say
- "S-Beta" invited you+x3@… 6 days 23 hours ago (8.8) → as adm-b invite you+x3@…, then by SQL, S-Beta's
  invite to x3 was sent 6 days 23 hours ago: `update public.team_invites set created_at = now() - interval
  '6 days 23 hours' where agency_id = :beta_id and auth_user_id = :x3_login_id and accepted_at is null;`
  (S10 step 1)
- S-Beta's invite is over 7 days old (8.8) → by SQL that invite was sent 7 days 5 minutes ago: the same
  update with `interval '7 days 5 minutes'` (S10 step 3)
- my invite to you+x11@… was sent 8 days ago, never opened (8.9) → as adm-a invite you+x11@…, then by
  SQL, x11's invite was sent 8 days ago: `update public.team_invites set created_at = now() - interval
  '8 days' where agency_id = :agency_id and auth_user_id = :x11_login_id and accepted_at is null;`
  (S42 step 1; the technical run ages x7 from S19 instead, but here x7 must stay unused until 8.17,
  whose new-name email needs a first invite, not a resend)
- the pages Checkout sends admins back to (8.15) → as the member, type
  `https://kontuur.app/settings?tab=account&billing=success`, then the same with `billing=cancelled`
  (S16 step 2)
- whose trial ended 8 days ago, so my workspace is paused (8.16) → note S-Beta's `trial_ends_at`, then by
  SQL `update public.agencies set trial_ends_at = now() - interval '8 days' where id = :beta_id and
  stripe_subscription_id is null;`, wait a minute (the workspace is cached 60 s) and reload the Dashboard
  twice; afterwards restore the noted `trial_ends_at` the same way (S43 steps 1, 2 and 6)
- I invited you+x12@… over a day ago (8.12) → invite, then wait more than 24 hours; there is no shortcut,
  since the link's lifetime is Supabase's own, capped at one day (S29)
- my co-admin has Plan & billing open / their very next click in that window is "Choose plan" (8.22) → x2,
  made an admin in 8.5, first invites you+x10@… (for 8.24), then leaves their window untouched on
  Settings → Account; straight after adm-a's removal, Choose plan is that window's first action. If
  Checkout opens, do not pay: close it (S24)
- I removed my co-admin while their Settings stayed open (8.23) → reuse 8.22's window if it never left
  kontuur.app; otherwise invite you+x15@… as Admin, accept it in a new private window, leave that window
  on Settings → Account, then remove x15 (S25 Before). you+x5@… is the member 8.11 made
- the address an agency's Team tab has (8.26) → `https://kontuur.app/settings?tab=team` (S30 step 1)
- I try to invite you+x13@… anyway, with a request I type into my browser's developer tools (8.26) → in
  S-Solo's DevTools console: `await fetch('/api/settings/team/invite', {method:'POST',
  headers:{'Content-Type': 'application/json'}, body: JSON.stringify({email:'you+x13@…',
  role:'member'})})` (S30 step 2)

## Left to the technical suite

- S17 · a member cannot add or delete clients: covered, for the customer, by 3.16 (and 1.7); the
  technical suite runs it as file 3's Q6
- S12, S13 · a sign-up forged through Supabase's sign-up API with hand-written metadata: not something
  a customer does in the app, and S13's result is a server-error page plus a log line
- S36 · two admins removing each other at the same instant: a race the code does not lock against, so
  its outcome is not guaranteed; it stays a technical probe
- S37 · signed-out calls to the invite and settings routes, and a forged identity header: route answers
- S38 · a member writing straight to the database: database-only
- The parts of covered IDs that only a route, the database or a log can see: S5's four direct posts,
  S15's 403 to a member's post, S16's PUTs, S21's PUTs, S23's PUT answers (404 / 401), and every
  `Expect — database` check (invite rows and their logins, `invited_by`, metadata, `stripe_customer_id`
  in S24, column privileges)

Detailed cases that the technical file does not carry, also not covered here:

- S18 · a member calling the billing actions directly: not callable by hand; unit tests only
- S26 · the three server refusals (yourself, the last admin, a member): unreachable from the UI
- S31–S35 · a failed invite email, a resend whose role was not saved, a login that survives removal, a
  workspace deleted mid-invite, an accepted invite reused: cannot be forced by hand; unit tests only
- S44 · a stale tab deleting a just-subscribed workspace: the refusal is file 5's journey, and what it
  keeps for the invitee shows only in the database
