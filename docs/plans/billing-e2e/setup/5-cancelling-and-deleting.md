# 5 · Cancelling, coming back, and deleting the workspace: setup and coverage

Sources: `technical/05-cancel-resubscribe-delete.feature` (all IDs) and
`02-checkout.feature` (C32 only); long cases in the detailed X cases and the detailed C cases;
defect D1.

## Covers

- 5.1 ← X1
- 5.2 ← X5
- 5.3 ← X2, X6, X14
- 5.4 ← X8 (the member's view, step 1 of its long case)
- 5.5 ← X10
- 5.6 ← X33
- 5.7 ← X11
- 5.8 ← X12
- 5.9 ← X15
- 5.10 ← X22
- 5.11 ← X23
- 5.12 ← X24
- 5.13 ← X25
- 5.14 ← X26
- 5.15 ← X38
- 5.16 ← X3
- 5.17 ← X4
- 5.18 ← X7, X37
- 5.19 ← X8
- 5.20 ← X27
- 5.21 ← X40
- 5.22 ← X34
- 5.23 ← C32, X41 (D1)
- 5.24 ← X35
- 5.25 ← X39

## Setup

- any `@clock` scenario or Examples block → the workspace's first Checkout ran while `STRIPE_TEST_CLOCK`
  pointed at a fresh Stripe test clock (set, then redeploy); run X Test One's scenarios to the end, then
  X Test Two's, then X Test Solo's, since each clock advance moves every customer on it.
- "my plan is now ended" (5.3, @clock rows), "my plan ran out on ‹D›" (5.8), "paused with 2 clients"
  (5.9), "‹D› passes" (5.7), "the renewal date passes" (5.6) → cancel the plan, then Stripe Dashboard
  → the customer's test-clock banner → Advance time to 1 hour past `current_period_end` (X11 step 3).
  For 5.3's @clock rows, open a tab on Settings → Account BEFORE cancelling (it keeps Cancel plan),
  cancel in the main tab, then open a second tab (it shows Keep plan); only then advance the clock
  (X11 step 2).
- "it is just past midnight in Sofia" (5.9) → before Choose plan, advance the test clock to 22:30 UTC on
  the next day, at least an hour past its current time (X15 step 1); the workspace's Timezone is Sofia, as
  5.5's last row leaves it. "Today" in 5.9 is the test clock's date as Sofia counts it, not the real date.
- "my plan renews on ‹D›, an hour from now" (5.7) → advance the test clock to 1 hour before
  `current_period_end` (X11 step 1).
- "the day my renewal falls on in <city>" (5.5) → read-only:
  `select (current_period_end at time zone '<zone>')::date from agencies where id = :agency_id;` with
  Pacific/Auckland, Pacific/Honolulu, Europe/Sofia (X10).
- "on "Internal", "Active", yet my card is billed monthly" (5.6) → WRITE
  `update agencies set plan = 'trial' where id = :agency_id;`, wait 60 s, reload twice, pay Checkout with
  4242 from Sofia; then WRITE `update agencies set plan = 'house' where id = :agency_id;` and reload (X33).
- "whose plan I cancelled after a renewal payment failed" (5.10) → Manage billing → add 4000 0000 0000
  0341 as the default card, advance the clock 2 hours past `current_period_end` (the renewal is declined,
  R10), then click Cancel plan → Cancel plan (ends at once, R36/X20).
- "its renewal failed" (5.18, @clock row) → X18: make 0341 the default card; Cancel plan, open the spare
  tab (it offers Delete workspace), Keep plan in the main tab; advance the clock 2 hours past
  `current_period_end`.
- "my renewal payment was declined minutes ago" and "Plan & billing still shows "Active"" (5.13) → set 0341
  as the subscription's default payment method in the Dashboard, Workbench → Webhooks → the kontuur.app
  endpoint → Disable, advance the clock 2 hours past `current_period_end` (X25). Afterwards enable the
  endpoint and resend every missed event, newest first, before checking the bell and inbox.
- "Kontuur support ends my plan at once, with no refund" (5.11) → Stripe Dashboard → the subscription →
  Cancel subscription → Immediately, no refund, no proration credit (X23).
- "Kontuur support has just ended my plan at once" and "even after a reload … still shows "Active""
  (5.14) → Disable the webhook endpoint first, then Dashboard → Cancel subscription → Immediately, no
  refund (X26).
- "Kontuur catches up" (5.14) → enable the endpoint and resend `customer.subscription.deleted` from
  Workbench → Events (if no Resend is offered, add metadata key `e2e` to the subscription).
- "Kontuur support sets my plan to end on ‹E›" (5.15) → Dashboard → the subscription → Cancel
  subscription → At the end of the current period, no refund (X38).
- "Clients to pay for" (5.9–5.12) → the stepper above "Choose plan" in Plan & billing once the plan has
  ended; it starts at the workspace's client count, and never below 1. Nothing to set by hand.
- "I have deleted both my clients" (5.11) → in the app, after 5.10's post below: each delete frees a
  slot and changes no bill, so the plan support ends still pays for 2 client slots.
- "the plan I had earlier today already used some AI drafts" (5.12) → generate one post for a client
  under 5.10's plan before 5.11 (X23 step 1), and do not advance the clock between 5.10 and 5.12.
- "my role in the workspace is changed to member" (5.19) → WRITE
  `update users set role = 'member' where id = ':admin_user_id' and agency_id = :agency_id;` (1 row);
  afterwards WRITE it back to `'admin'`, reload and click Keep plan (X8).
- "Plan & billing shows "Paused" since my plan ended" (5.22) and 5.23's "X Test Solo" row → after 5.6,
  WRITE `update agencies set plan = 'trial' where id = :agency_id;` (the row keeps the ended
  subscription); wait 60 s and load a dashboard page twice before Choose plan (X34 steps 1–3).
- 5.23's "X Test Solo" row → run inside 5.22: open Checkout in a second tab before the delete (X34 step 3)
  and pay it after (X41); its "C-Gone" row is a fresh agency trial (C32). Clean up any subscription the
  payment creates today: Dashboard → Cancel subscription → Immediately.
- "Kontuur support starts a plan for me by hand, and my card is charged for it" (5.25) → run after 5.14
  and before 5.15: Stripe Dashboard → Customers → X Test Two's customer → Create subscription: the product
  "Kontuur", its €29 price, quantity 1, "Automatically charge a payment method on file" with the card
  ending 4242, no metadata; start it (X39 step 1). Afterwards, before 5.15: that subscription → Cancel
  subscription → Immediately, no refund (X39 step 5).
- "a window I left open shows "Keep plan"" (5.21) → before 5.20, sign in as the owner in a private window
  on Settings → Account and leave it; the session lasts up to an hour after the delete (X40).
- 5.17 → afterwards rename the workspace back to "X Test One".

## Left to the technical suite

- Parts of covered cases that only Stripe, the database or a log can see:
  - X1, X5, X38: the subscription's "Cancels ‹D›" flag and exactly one event per click (Stripe Dashboard).
  - X2, X6, X14, X40: that Stripe is not called (Workbench logs).
  - X7, X37: that the pending invite survives the refused delete (database; the Team tab does not list
    pending invites, src/features/settings/components/team-tab.tsx:20-21).
  - X10: the billing columns unchanged (database).
  - X11: no `invoice.paid` for ‹D› (Stripe events).
  - X12: running the billing cron by hand and the notifications rows (operator, database).
  - X15: the new subscription on the same Stripe customer, its quantity the 2 slots chosen, and the
    document's net/VAT figures; the return card's "You’re on Pro" moment is left to file 2 because of
    D2 (the card can vanish at its first refresh), so 5.9 checks Plan & billing after a reload.
  - X22: the row's cleared failed-payment date and Stripe's €0.00 starting balance; the return card's
    "You’re on Pro" moment, for the same D2 reason as X15, so 5.10 checks Plan & billing after a reload.
  - X23: the webhook outcomes, and Stripe's quantity and the paid count staying 2 after both clients
    were deleted (Stripe Dashboard, database).
  - X24: the usage period key (database) and Stripe's quantity 1, the slot chosen; the return card's
    moment (D2), so 5.12 checks after a reload.
  - X25, X26: the webhook disable/resend order, outcomes and the log line.
  - X27: the invitee's login deleted: what their invite link does afterwards is not observed in the long
    case (it has no Expect line for it); invoices and billing events kept with no workspace (database).
  - X33: the plan column staying "house" (database).
  - X39: the webhook answers "ignored" and "undocumented_sale", and the undocumented-sales query
    (Stripe events, operator).
  - X35: the new workspace's id and no Stripe customer until its first Checkout (database, Stripe).
  - C32, X41: today's behaviour on the defect's path (return to the sign-in dialog, an invoice email with
    no "Open Plan & billing" button, "no_workspace" answers, an orphaned subscription); 5.23 states the
    correct journey instead.
