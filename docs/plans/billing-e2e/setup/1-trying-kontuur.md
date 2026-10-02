# 1 · Trying Kontuur for free: setup and coverage

Source area: T (technical/01-setup-and-trial.feature; long cases in the detailed T cases).
Known defects in this area: none (D6 belongs to T45, which file 2 covers).

## Covers

- 1.1 ← T4, T5 (the slot control: "Clients to pay for" starts at one client, and goes no lower, at zero
  clients)
- 1.2 ← T6
- 1.3 ← T7
- 1.4 ← T8, T4 and T6 (the Settings header's plan name, Trial plan)
- 1.5 ← T10 (and "Clients to pay for" starting at the client count), T5 (the trial's Add client names no
  price, under the button or in Cmd+K)
- 1.6 ← T11, T12, T14
- 1.7 ← T15, T46
- 1.8 ← T13 (and the slot control following the client count down), T40 (step 2, the admin's Delete client
  button)
- 1.9 ← T17, T41
- 1.10 ← T18
- 1.11 ← T19, T20
- 1.12 ← T21, T22 (the timezone, and the half-hour move that sends nothing)
- 1.13 ← T24 (the late case included: only the "has ended" reminder, never a late "ends soon")
- 1.14 ← T25 (its Generate posts, /generate, Add client and /clients/new rows)
- 1.15 ← T27 (the drafts it approves wait on /generate, which the grace keeps open)
- 1.16 ← T28, T29
- 1.17 ← T30 (the wall), T29 (the wall after the 7 days)
- 1.18 ← T30 (bell and email), T32 (the member's bell, no email)
- 1.19 ← T34
- 1.20 ← T31 (the agency owner's ways in)
- 1.21 ← T33
- 1.22 ← T35
- 1.23 ← T37
- 1.24 ← T31 (a due post waits while paused), T38 (the payment and the post half)

## Setup

Every "(SQL)" line is a WRITE in the Supabase SQL editor on the test workspace only, with `:agency_id`
in single quotes. After any WRITE, wait one minute and reload twice before judging the banner, the wall,
the dashboard buttons or the /generate and /clients/new redirects (they read a copy cached for 60 s);
Plan & billing reads the row fresh at once. Accounts: A1 = "E2E Agency" (agency), M1 = its Member,
S1 = "E2E Solo" (solo, set up), S2 = "E2E Solo Two" (solo, never set up), A3 = "E2E Agency Three".

- "the daily reminders go out" → run the billing cron by hand:

  ```sh
  curl -sS -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $CRON_SECRET" \
    https://kontuur.app/api/cron/billing
  ```

- "the daily reminders go out, twice" / "the reminders go out again that day" → the same call, run twice in a
  row.
- "with a teammate" → M1, invited as in 1.4 (reachable in the app; needs its own inbox).
- "a form I opened before my third client" (1.6) → open `/clients/new` in a second tab while A1 has 2 clients
  (during 1.5, before saving Client Three), and save it once the third client exists.
- "having used <use>" (1.9) → first note the real counts (`select kind, count, pending from usage_counters
  where agency_id = :agency_id and period = 'trial' order by kind;`). Each row writes only its own counter:
  (SQL) `insert into usage_counters (agency_id, period, kind, count, pending) values (:agency_id, 'trial',
  '<draft|image|rewrite>', <n>, 0) on conflict (agency_id, period, kind) do update set count = excluded.count,
  pending = 0;`. Put the real draft count back (the same insert) before the first image row, and the real
  image count back before the first rewrite row; after the last row put the real rewrite count back, or (SQL)
  `delete from usage_counters where agency_id = :agency_id and period = 'trial' and kind = 'rewrite';` if
  there was no rewrite row. Otherwise the pool an earlier row left at its cap decides Generate: with drafts at
  13 of 12, the image rows name drafts, not images, and the rewrite rows are refused (the pool with fewer
  posts left decides, a tie names drafts). No post may still be waiting for pictures (else the image rows read
  "‹n› posts still waiting for pictures need ‹m› AI images; …" instead).
- "my trial ends in 3 days and 2 hours" (1.10) → (SQL) `update agencies set trial_ends_at = now() + interval
  '3 days 2 hours' where id = :agency_id and stripe_subscription_id is null;`
- "my trial ends in 2 days 23 hours" (1.11) → (SQL) the same with `interval '2 days 23 hours'`.
- "already reminded that my trial ends on ‹date›" (1.12) → run 1.11 first; run 1.12 on the same UTC day.
- "Kontuur moves my trial's end to tomorrow at 22:30 UTC" (1.12) → (SQL) `update agencies set trial_ends_at =
  date_trunc('day', now()) + interval '1 day 22 hours 30 minutes' where id = :agency_id and
  stripe_subscription_id is null;`
- "Kontuur moves my trial's end half an hour later" (1.12) → after the timezone step, (SQL) `update agencies
  set trial_ends_at = date_trunc('day', now()) + interval '1 day 23 hours' where id = :agency_id and
  stripe_subscription_id is null;`, then run the billing cron (still the same UTC day).
- "my trial ended yesterday" (1.13, 1.14, 1.15, 1.21) → (SQL)
  `... set trial_ends_at = now() - interval '1 day' ...` (S2's id for 1.21). For 1.13 use an end date no
  earlier case used.
- "Client One has three drafts" (1.15: "a draft of Client One", "two more of its drafts") → while still on the
  trial, Generate posts → Client One → 3 posts, and let the run finish; wait for the pictures (the wizard
  paints them; any left are painted at the visuals cron's next :10 tick). Do it before 1.9, whose image rows
  need no post still waiting for pictures. Leave the review without approving any: the three then wait on
  Generate posts as "3 drafts for Client One are waiting for review — …", and its "Review them" opens them,
  in the trial's grace too.
- "Client One's Instagram is linked" (1.15, 1.24) → connect Client One to an Instagram account you own while
  A1 is still on its trial (Clients → Client One → "Connected accounts" → Connect).
- "the first one's time comes" (1.15) → wait until the slot has passed, then run the publish cron by hand
  (`…/api/cron/publish`) or wait up to 5 minutes for its own tick.
- "my trial ends in 3 minutes" (1.16) → (SQL) `... set trial_ends_at = now() + interval '3 minutes' ...`
- "my workspace pauses in 3 minutes" (1.16) → (SQL) `... set trial_ends_at = now() - interval '7 days'
  + interval '3 minutes' ...`
- "my trial ended 8 days ago" / "my workspace paused yesterday" / "which is paused" / "paused" (1.17, 1.18,
  1.20, 1.21, 1.24) → (SQL) `... set trial_ends_at = now() - interval '8 days' ...` (S2's id for 1.21). Every
  such WRITE carries `stripe_subscription_id is null`, so it changes nothing once A1 has paid: 1.24 is A1's
  only payment and runs last.
- "paused 7 days ago, less 2 hours, and never told of this pause" (1.19) → after 1.18, (SQL) `... set
  trial_ends_at = now() - interval '14 days' + interval '2 hours' ...`
- "paused 8 days ago, and never told of this pause" (1.19) → (SQL) `... set trial_ends_at = now() - interval
  '15 days' ...`
- "on the Internal plan, 9 days past my old trial end" (1.22) → if the two posts of 1.15 exist, first push
  them out: (SQL) `update posts set scheduled_at = now() + interval '30 days' where id in (:p2_id, :p3_id) and
  client_id = :client_id;`; then (SQL) `update agencies set plan = 'house', trial_ends_at = now() - interval
  '9 days' where id = :agency_id and stripe_subscription_id is null;`; afterwards (SQL) `update agencies set
  plan = 'trial' where id = :agency_id and stripe_subscription_id is null;`
- "E2E Agency Three … my trial ends in 2 days" (1.23) → a fresh agency sign-up A3 that never pressed Choose
  plan; (SQL) `... set trial_ends_at = now() + interval '2 days' ...` with A3's id. Without
  `STRIPE_TEST_CLOCK`, "Renews on" is a month from today; with it, a month from the clock's time.
- "a good card at a Bulgarian address" (1.23) / "I pay €104.40 at Checkout with "Clients to pay for" at 3"
  (1.24) → leave "Clients to pay for" where it starts, at the client count (1 for A3, which has none; 3 for
  A1); press Choose plan; then 4242 4242 4242 4242, any future expiry, any CVC; a Bulgarian billing address,
  no VAT ID; tick the consent box. Checkout sells that number: one client for €34.80, three for €104.40.
- "a minute later" (1.23) / "the "Workspace paused" card goes away" (1.24) → wait one minute, reload the
  dashboard twice; judge Plan & billing on a reload, not on the return card.
- "their times pass while I am paused, one an hour ago and the other two days ago" (1.24) → with the two
  Instagram posts of 1.15 (P2, P3), (SQL) `update posts set scheduled_at = now() - interval '1 hour' where id
  = :p2_id and client_id = :client_id;` and `update posts set scheduled_at = now() - interval '2 days' where
  id = :p3_id and client_id = :client_id;`, then run the publish cron twice, a minute apart. Only then pay at
  Checkout: this is A1's one payment, made after 1.24's paused half; after paying, run the publish cron, and
  again 5 minutes later.

## Left to the technical suite

Technical IDs not covered here:

- T1 · the crons and the webhook are wired to the sandbox: HTTP answers, Stripe Dashboard endpoint (wiring).
- T2 · a cron call without the secret and an unsigned webhook call are refused: 401 / 400 answers (wiring,
  security).
- T3 · the database is in its post-migration shape (database-only check).
- T9 · a member cannot add a client: covered for the customer by 3.24 (file 3), its trial row.
- T11 (step 4, a member at the cap) · covered for the customer by 3.24 (file 3), its trial row (2 of 3:
  a member is refused before the cap is counted, in the same words).
- T16 · the trial's meters count what was actually made: covered for the customer by 7.2 (file 7).
- T23 · a workspace with no admin still gets its bell: the state is reachable only by a database edit, and the
  proof is the reminder run's error report (operator report).
- T25 Rewrite row: covered by 7.21 (file 7).
- T26: covered by 7.21 (file 7).
- T32 (the member's wall, and Plan & billing without Choose plan) · covered for the customer by 8.16 (file 8);
  T32's bell with no email is 1.18.
- T36 · an unpaid workspace with no trial end is paused at once: no sign-up can reach it (every sign-up gets a
  trial end); a fail-closed guard against bad data (database-only state).
- T38 wall and fresh allowance: covered by 2.16 (file 2) and 7.22 (file 7).
- T39 · a mispriced Stripe price refuses Checkout: covered for the customer by 2.21 (file 2); only the log
  line and the Stripe customer made before the check are left, and only the Stripe Dashboard and the log show
  those.
- T40 (step 1, the member's Danger zone) · covered for the customer by 3.24 (file 3), its trial row.
- T42 · the trial's 80 % bell on a real rewrite: covered by 7.5 (file 7), Rewrites row.
- T43 · a sixth rewrite on the trial is refused: covered by 7.7 (file 7), trial row.
- T44 · a second Checkout tab voids the first, and backing out leaves the trial: covered for the customer by
  2.6 and 2.5 (file 2).
- T45 · a declined card at Checkout leaves the trial untouched: file 2 (Checkout), with defect D6.

Checks dropped from covered cases (only the database, Stripe's Dashboard, a log or a cron answer shows them):

- T4, T10, T13, T15 · no Stripe customer, or exactly one, and nothing sent to Stripe (Stripe Dashboard;
  the customer sees only that no card is asked for).
- T4, T6, T7, T8 · the stored mode, plan, timezone, trial length, role and accepted invite (database).
- T12, T14 · no half-made client rows (database); two saves landing in the same instant (unit test only).
- T17, T41 · nothing left pending and nothing reserved on a refusal (database); no bell for a count written by
  hand (test artefact).
- T19–T22, T24, T30, T34 · each reminder's key and count of rows, and the cron's `notified` / `emailed` counts
  (database, cron answer).
- T28, T29 · the row unchanged while the page turns over (database).
- T31 · paused posts with 0 publish attempts and no error (database).
- T37 · `plan` still `trial` in the row, the subscription quantity, client slots and period start, customer
  metadata (database, Stripe Dashboard); the Checkout consent sentence (file 2).
- T38 · the paid period's empty usage row (database); the invoice itself (file 2).
- T40 · the tenant role holding neither INSERT nor DELETE on clients (database privilege).
