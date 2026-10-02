# 7 · Keeping within my allowance of drafts, images and rewrites: setup and coverage

Technical source: `technical/09-allowance-and-bells.feature`, with the detailed cases A1–A50
(kept outside the repo). IDs below are the detailed cases'. One label differs: the technical file's A1
("A new trial's wizard prices whole posts") is detailed case A2 (the wizard's captions); detailed case A1
(the three meters at zero) is not in the technical file. So the technical file runs 35 of the detailed
cases, and the detailed cases add A1, A7, A15, A17, A19, A21, A23,
A27, A28, A34, A35, A40, A42, A49, A50. No known defect belongs to this area. At the cap during a
failed renewal the dashboard's and Generate posts' refusal asks for the card too (4.27, file 4); 7.25
checks the picture refusal, which asks for it the same way.

## Covers

- 7.1 ← A2 (the feature file's A1), with A3's panel line
- 7.2 ← A1 (detailed cases only: the three meters at zero), A3, A5
- 7.3 ← A4
- 7.4 ← A6, A7, A8 (the image half)
- 7.5 ← A8 (the drafts half), A9
- 7.6 ← A31
- 7.7 ← A10, A32
- 7.8 ← A33
- 7.9 ← A11
- 7.10 ← A12
- 7.11 ← A13
- 7.12 ← A14, with its waiting-drafts notice on Generate posts
- 7.13 ← A16
- 7.14 ← A18, A19, A48
- 7.15 ← A20
- 7.16 ← A21, A46
- 7.17 ← A22, A23
- 7.18 ← A24
- 7.19 ← A25
- 7.20 ← A26, A27, A47
- 7.21 ← A29, A49 (run on A-test: the rewrite refusal is A49's, the rest A29's)
- 7.22 ← A30, with the slots bought at Checkout; A26 and A27's "a refusal costs no try" (S's posts,
  refused three times in 7.20, are painted)
- 7.23 ← A34, now a slot raise; the client added after it raises nothing (client slots,
  docs/plans/CLIENT-SLOTS.md)
- 7.24 ← A38
- 7.25 ← A39 (the refusal that asks for the card)
- 7.26 ← A44
- 7.27 ← A41, A42
- 7.28 ← A43

## Setup

Run in the detailed cases' order, which the scenario numbers do not follow: 7.1–7.5, 7.7 trial row,
7.9–7.13, 7.14 trial row, 7.15, 7.16 trial row, 7.17–7.19, 7.20 trial row, 7.21, 7.22 (subscribes), 7.6,
7.7 paid row, 7.8, 7.23, 7.24, 7.25, 7.27, 7.28 (second workspace), 7.26, 7.16 paid row, 7.20 paid row,
7.14 paid row.
Wherever this says SQL, it is **WRITE — test workspace only**, by the workspace's id
(`select id, name from agencies where name = 'A-test';`).

- (Background) I am the agency owner of "A-test", with S on Single image and C on 6-slide carousels →
  sign up a fresh agency workspace that has never opened Checkout; S: Schedule → Format → Default post
  type Single image; C: Carousel, Default slides 6. Set `STRIPE_TEST_CLOCK` in Vercel and redeploy
  before 7.22: a Stripe customer created without the clock can never be renewed by hand.
- (Background) I also own "A-house", with one client H, which Kontuur has put on the Internal plan →
  sign up a second fresh agency workspace named "A-house" (its own owner account) with one client H on
  Single image; SQL `update agencies set plan = 'house' where id = :agency_id;` with A-house's id
  (`where name = 'A-house'`), wait one minute. Nothing before 7.27 uses it, so it may be made then.
- (every "Generate posts for X on …") → `/generate?client=<id>` opens X's waiting drafts in review, not
  the form: click "New run", confirm "Discard and start over", then reload to get X's own defaults.
  Never discard before 7.3's check.
- "<meter> at "N of cap"", "has 1 of its 12 AI drafts left", "has 3 AI drafts left", "13 AI images,
  9 drafts" and every other fast-forwarded meter → SQL, with `:period` = `'trial'`, or for the paid plan
  `(select to_char(current_period_start at time zone 'UTC', 'YYYY-MM-DD') from agencies
  where id = :agency_id)`:
  `insert into usage_counters (agency_id, period, kind, count, pending)
  values (:agency_id, :period, :kind, N, 0)
  on conflict (agency_id, period, kind) do update set count = excluded.count, pending = 0;`
  Usage reads are never cached; after any write to `agencies`, wait one minute.
- 7.1 / 7.2 "my trial has just started" → the fresh workspace, nothing generated; no SQL.
- 7.2 "rewrite one of S's drafts" / 7.5 "rewrite a draft" → the rewrite button shows only on a draft that
  reads as AI, has AI tells listed, scores under the rewrite threshold, or is unscored; pick one that has it.
- 7.3 "AI drafts reads "2 of 12"" → the state 7.2 leaves; discard no draft before the check.
- 7.4 → every earlier picture painted, then SQL trial image 38; open S's drafts from `/generate?client=<S>`.
- 7.5 → SQL trial draft 9 (drafts row); SQL trial rewrite 3 (rewrites row).
- 7.6 "my paid plan for 2 clients … my trial once warned me about drafts" → after 7.22; SQL paid draft 39.
- 7.7 → SQL trial rewrite 5; SQL paid image 210.
- 7.8 "my teammate has joined as a member" → invite through Settings → Team; SQL paid image 210.
- 7.9 → SQL trial image 46 and draft 3, with nothing owed (A11's owed check: every waiting row has
  `pictures = slots`).
- 7.10 → SQL trial draft 10 and image 20.
- 7.11 → SQL trial draft 11 and image 20, `/generate?client=<S>` in two tabs, both reading "1 post left
  this period".
- 7.12 → SQL trial draft 12. "one of S's drafts is waiting for review" → the draft 7.11 left for S; open
  `/generate?client=<C>` for the last step.
- 7.13 "3 more still held, with no run left to finish them" → SQL:
  `insert into usage_counters (agency_id, period, kind, count, pending, reserved_at) values
  (:agency_id, 'trial', 'draft', 3, 3, now() - interval '20 minutes'),
  (:agency_id, 'trial', 'image', 20, 0, null) on conflict (agency_id, period, kind) do update
  set count = excluded.count, pending = excluded.pending, reserved_at = excluded.reserved_at;`
  This builds a hold with no run row, which only the morning reset frees. (A real run cut off mid-way
  is closed, and its held drafts freed, by the next hourly generation check once it is 15 minutes old:
  `src/lib/generation/runs.ts:32,256-298`.)
- 7.13 "the next morning comes" → the billing cron by hand (it runs by itself at 08:00 UTC):
  `curl -H "Authorization: Bearer $CRON_SECRET" https://kontuur.app/api/cron/billing`
- "set to generate … automatically this hour" → client → Schedule tab, "Autonomous generation":
  "Generate automatically" on, "How many", "Generate on" today, "Time" the current hour or earlier in the
  workspace's zone; that client's last scheduled run must have started earlier than 15 minutes before
  the top of that hour. Turn every schedule off when the area is done.
- "their / C's / S's scheduled time comes", "the scheduled time comes" → curl
  `https://kontuur.app/api/cron/generate` (or wait for the :00 tick); if a client is listed in
  `"skipped_for_time"`, curl again. "and the hour after" → curl it again (a skip claims no slot).
- 7.14 → trial row: SQL trial draft 12; paid row: SQL paid draft 50 with images at 210 and 7.16's paid
  posts still owed. Run the paid row after 7.20's paid row: its "waiting for pictures" row must already
  have rung, or a :10 between "their scheduled time" and "the hour after" rings it and adds a second row.
- 7.15 → S's schedule off; SQL trial draft 3 and image 46; nothing owed.
- 7.16 → trial row: start just after a :10, SQL trial image 37 (drafts 3), C "How many" 3; finish 7.17
  and 7.18 before the next :10. Paid row: just after a :10, nothing owed, SQL paid draft 47 and image
  100, S and C "How many" 2; set 7.20's paid images to 210 before the next :10.
- 7.17 "2 of C's 6-slide carousels wait … with AI images at "37 of 50"" → the trial row of 7.16, before
  the next :10; A22's owed count must read 2 posts, 12 images. "one more AI image is used" → SQL trial
  image 38.
- 7.18 "the bell already has the row "You have 4 AI images left this period and this needs 6."" → 7.15
  run first in the same period; state of 7.17 after its SQL, before the next :10.
- "the waiting posts' pictures are made, at ten past the hour" / "their pictures are due, at ten past
  the hour" → curl `https://kontuur.app/api/cron/visuals` (up to 5 minutes; again if
  `"skipped_for_time"` is above 0), or wait for the :10 tick. "and again at ten past for the next two
  hours" → curl it twice more (three runs in all), or wait for the next two :10 ticks.
- 7.19 "its warning already rang" → 7.4 run first in the same period; image at 38 with 12 owed.
- 7.20 "<n> new scheduled posts wait for pictures" → trial row: SQL trial image 30, S on, "How many" 2,
  curl the generate cron (expect `"processed":1`), then at once SQL trial image 50, before the next :10;
  paid row: 7.16's paid posts, then SQL paid image 210. Only posts scoring 5 or more are painted and
  counted, so ‹n› is those (2 and 3 when all pass). The trial row's three refused runs are what 7.22
  then shows cost no try: a post has 3 tries (`MAX_VISUAL_ATTEMPTS`, `src/lib/visual/visual-backlog.ts:7`).
- 7.21 "my trial ended yesterday with drafts and pictures left" → SQL `update agencies set trial_ends_at
  = now() - interval '1 day' where id = :agency_id;`, wait one minute, then SQL trial image 30 (and trial
  draft 3, if drafts read 9 or more), so the scheduled run and the picture run would both go ahead if the
  ended trial did not stop them. Keep that order: images at 30 while the trial still counts as running
  would let a :10 tick paint S's posts. "C is set to generate this hour" → C's "Time" the current hour
  (last run older than 15 minutes before its top). "S's waiting posts" → the 2 posts 7.20's trial row
  left. "at the scheduled times" → curl the generate cron, then the visuals cron. ‹yesterday› and ‹a
  week later› are written out in the workspace's zone. Run it clear of 08:00 UTC. The daily billing run
  then adds the "Your trial has ended" row (file 1, 1.13) to the bell.
- 7.22 "my trial has ended, 2 of S's posts wait for pictures, and no schedule is on" → the state after
  7.20's trial row and 7.21, with "Generate automatically" off for S and C; `STRIPE_TEST_CLOCK` deployed,
  and A-test has no Stripe customer yet. "I leave "Clients to pay for" at 2" → the stepper starts at the
  client count (S and C) and goes no lower; beside it "2 clients × €29.00 = €58.00 a month excl. VAT".
  Checkout then sells 2 client slots. "pay in Checkout with my card" → 4242 4242 4242 4242.
- 7.23 "my paid plan for 2 clients has used some of each allowance" → after 7.22, generate a post and a
  rewrite, or SQL the paid rows. Run it more than about 13 hours before "Renews on", so the confirm says
  the amount "is charged today for the rest of this period"; nearer the renewal it goes on the renewal
  invoice, the toast differs, and the meters rise only at the renewal (`chargesToday`,
  src/lib/billing/plans.ts). The charge must succeed with the card on file. "I add a third client" →
  Add client → "Set them up by hand" → a name and whatever the save bar asks for → "Save client →".
  Afterwards, before 7.24, delete the third client, then lower the slots to 2 (− beside "Client slots",
  "Change", "Remove slot": nothing is charged or refunded, and this period keeps its 3 slots' allowance),
  so the renewal bills 2 slots and the later scenarios read "of 50", "of 210" and "of 30".
- 7.24 "my paid plan is about to renew … my plan renews before the run finishes" → click "Generate 3
  posts", then at once in the Stripe Dashboard → Billing → Test clocks → this clock, advance to one day
  after "Renews on"; wait a minute or two for the events. If the run finished first, repeat at the next
  renewal.
- 7.25 "my renewal payment was declined" → Manage billing → replace the card with 4000 0000 0000 0341,
  then advance the test clock to one day after "Renews on". "AI images reads "210 of 210"" → SQL paid
  image 210 in the unchanged current period. Afterwards, before 7.26, pay the renewal (A40): replace the
  card with 4242 4242 4242 4242 in Manage billing, then in the Stripe Dashboard charge the failed renewal
  invoice with it, or advance the clock to Stripe's next automatic retry; Plan & billing then reads
  "Active".
- 7.26 "my paid plan has AI images at "209 of 210"" → after 7.25's renewal is paid, SQL paid image 209.
  "C's drafts are open in two tabs" → `/generate?client=<C>` in two tabs on the waiting single-image
  drafts 7.24 left, each with its picture. "while it is still being made" → the second tab's click within
  20 seconds, on a different draft (the same slide in both tabs only shows it as generating, with no
  message).
- 7.27 "I sign in to "A-house" instead" → sign out of A-test and sign in with A-house's owner account.
  "its usage reaches 5000 drafts and 5000 images" → SQL on A-house's id and the UTC month key
  `to_char(now() at time zone 'UTC', 'YYYY-MM')`, draft and image 5000.
- 7.28 "it is about 00:30 Sofia time on the 1st, and I am signed in to "A-house"" → only possible in the
  first hours of a month (the UTC month turns at 03:00 Sofia summer time, 02:00 from 25 October 2026);
  otherwise skip. Signed in with A-house's owner account, as in 7.27.

## Left to the technical suite

- A15 — a meter past its quota ("14 of 12"): the app never produces one where the customer can see it
  (only a settle landing after its period turned, in the period that just ended); reachable only by a
  database edit; the clamp is unit-tested.
- A17 — a morning reset that comes while a run is still being written leaves that run's drafts held:
  visible only during the few minutes a run overlaps the 08:00 UTC reset; reaching that window needs a
  hand-written reservation; left to the technical suite.
- A28 — owed pictures that cannot be read: a failed database read cannot be produced on kontuur.app;
  unit tests only.
- A35 — deleting a client mid-period keeps this period's allowance: with client slots a delete never
  changes what is paid, so no meter can move; the change that could, lowering the slots, is in file 3
  (3-client-slots.feature), whose confirm says "Nothing is refunded, and this period's allowance stays as
  it is." The delete and the lower still run here, in 7.23's Setup.
- A36 — the renewal resets every meter to zero: covered, for the customer, by 4.1 (file 4).
- A37 — replaying paid invoices from Stripe → Developers → Events: operator work in the Stripe Dashboard;
  the customer sees nothing change (also in the technical feature file).
- A39's "Payment failed" status and meters kept at the ended period's figures: covered, for the
  customer, by 4.6 and 4.19 (file 4). 7.25 keeps A39's refusal.
- A40 — paying the failed renewal starts a fresh allowance: covered, for the customer, by 4.17 (file 4),
  from the paused state rather than inside the 7 days; the meters start again the same way. Its steps
  still run here, in 7.25's Setup.
- A45 — a one-off invoice made in the Stripe Dashboard: operator work; the customer sees nothing change
  (also in the technical feature file).
- A50 — a picture, run or rewrite that fails after its reservation: provider failures cannot be made on
  request; unit tests only.

Checks dropped from the covered IDs, because only the database, a cron's answer, Stripe's Dashboard or a
log can see them:

- `usage_counters` `pending`, `reserved_at` and exact counts, and run rows (`target_count`,
  `period_key`, `kind`, `status`): A3, A4, A5, A10, A13, A16, A21, A38, A44, A46.
- Bell rows' `dedup_key`, `type` and `client_id`: A7, A8, A9, A18, A19, A20, A24, A26, A27, A31, A47, A48.
- The crons' JSON answers (`processed`, `posts_created`, `skipped_over_allowance`, `skipped_unentitled`,
  `skipped_allowance`, `reservationsCleared`): A16, A18–A21, A24–A26, A29, A46–A48.
- `visuals_attempts` on painted posts, and on A47's refused posts, which nothing paints afterwards: A25,
  A47.
- The Stripe side (customer under the clock, the subscription's quantity — the client slots — invoices,
  events delivered): A30, A34, A38, A39.

Seen by the customer, but not checked here:

- About the plan rather than the allowance; covered by files 1 and 4: A1's plan, status, "Trial ends" and
  Clients rows (1.1), A29's "Trial ended" status and "Workspace pauses on" row (1.13), and A39's banner
  and "Update your card by" row (4.6).
- The "Going out next" footer's refusal, which A14 no longer lists: it shows only when no publish has
  failed, nothing is queued and every client has an account connected
  (`src/features/dashboard/components/next-up-card.tsx:66,96,124-166`). A-test's clients never connect
  one here, so the card shows "Connect accounts" instead.
