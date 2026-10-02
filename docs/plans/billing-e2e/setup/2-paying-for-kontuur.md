# 2 · Paying for Kontuur: setup and coverage

Technical sources: `technical/02-checkout.feature` (all of it) and
`technical/01-setup-and-trial.feature` (T45 only), with the long cases in the detailed C cases and the
detailed T cases.
Workspace names match the technical file: "C-One" = W1, "C-Three" = W2, "C-Solo" = W3, "C-House" = W6,
"C-Late" = W7, "C-Lapsed" = W8, "C-Credit" = W10, "C-Deleted" = W13, "C-Race" = W14, "E2E Solo" = file 1's S1.

## Covers

- 2.1 ← C1 (the slot stepper before Checkout: its floor, its ceiling of 50 and its price line; `slotsHint`,
  `slotsSummary`, src/lib/billing/copy.ts:505, :394)
- 2.2 ← C6 (Checkout sells the number set in "Clients to pay for", not the client count)
- 2.3 ← C8 (its two VAT ID rows are detailed case C51)
- 2.4 ← C11, C12, C22, T45
- 2.5 ← C9, T45 (the back link and its toast)
- 2.6 ← C7, C10
- 2.7 ← C53
- 2.8 ← C13, C15
- 2.9 ← C14, C23 (its return card), C24 (its return card)
- 2.10 ← C16
- 2.11 ← C23 (its return card is in 2.9; it pays in the Checkout that 2.4's last step reopened for C-Three,
  with "Clients to pay for" left at its 3)
- 2.12 ← C24 (its first step is the solo price line, C24's second step and detailed case C2; `slotsSummary`,
  src/lib/billing/copy.ts:394). C24's "no stepper", before and after paying (its second and fifth steps), is
  covered by 3.3 (file 3)
- 2.13 ← C17 (its old tab is detailed case C18)
- 2.14 ← C29 (the return card)
- 2.15 ← C29 (the refused second Checkout), C30
- 2.16 ← C28
- 2.17 ← C45 (its paying rows are detailed case C46)
- 2.18 ← C34
- 2.19 ← C4
- 2.20 ← C5
- 2.21 ← C36
- 2.22 ← C47

## Setup

- "a good card" → 4242 4242 4242 4242, any future expiry, any CVC.
- "its + goes no higher than 50" (2.1) → press + 49 times from 1; it greys out at 50. The number is not saved:
  reload Plan & billing and it starts at the client count again.
- "the Checkout I opened for 1 client to pay for" (2.8) → tab B's Checkout from 2.6, opened with "Clients to
  pay for" left at 1. Every earlier Checkout, 2.2's for 3 included, has expired by then.
- "the Checkout I opened for 3 clients to pay for" (2.11) → the Checkout 2.4's last step reopened for C-Three;
  with 3 clients, "Clients to pay for" starts at 3 and goes no lower.
- "a card with insufficient funds" → 4000 0000 0000 9995 (for "E2E Solo", press Subscribe twice with it).
- "a card that is declined when charged" → 4000 0000 0000 0341 (the card attaches, the first charge fails).
- "a 3-D Secure card, failing the check" → 4000 0025 0000 3155; in Stripe's authentication window choose Fail
  authentication.
- "pass my bank's 3-D Secure check" → 4000 0025 0000 3155; choose Complete authentication. Tick the business
  option at Checkout for the name and VAT ID.
- "Stripe has just brought me back after I paid" (2.9) → the page Stripe returns to right after paying in 2.8
  (C-One), 2.11 (C-Three) and 2.12 (C-Solo); watch it before doing anything else. The card starts at "Payment
  received" only when Kontuur has not yet heard of the payment as the page draws. A run that lands straight on
  "You’re on Pro" does not test D2: record it as such.
- "my trial ended 3 days ago" → WRITE, test workspace only: `update public.agencies set trial_ends_at = now()
  - interval '3 days' where id = :agency_id;` then reload Plan & billing.
- "When 7 more days have passed" → WRITE, test workspace only: `update public.agencies set trial_ends_at =
  now() - interval '10 days' where id = :agency_id;` then wait 70 s and load /dashboard twice.
- "Kontuur is not hearing of payments for now" / "Kontuur has not heard of it yet" → Workbench → Webhooks →
  the kontuur.app destination → Disable. Nothing else may be in flight: every workspace shares the
  destination.
- "When Kontuur finally hears of my payment" → enable the destination again; Workbench → Events filtered to
  C-Late's customer → Resend to kontuur.app, in this order: `invoice.paid`, `customer.subscription.updated`
  (if any), `customer.subscription.created`. If the Dashboard offers no Resend for events it never attempted,
  record it: that half is then covered only by the unit tests C30 names.
- "a tab from before I paid still shows "Choose plan"" (2.13) → before paying in 2.8, open Plan & billing as
  C-One's admin in a spare tab and do not reload it (detailed case C13 Before; the technical C13's and C17's
  tab C).
- "When Stripe tells Kontuur about my payment a second time" → Workbench → Events → C-One's
  `customer.subscription.created` → Resend to the kontuur.app destination; the same for its `invoice.paid`;
  wait a minute.
- "a teammate in "C-One", still on its trial, who was briefly an admin, with a tab from then" + "that tab
  still shows "Choose plan"" → run 2.19 before 2.2 and 2.8, while C-One has no plan (the technical C4 runs
  before C6). Invite a member (Settings → Team) and accept; WRITE, test workspace only: `update public.users
  set role = 'admin' where id = '<member id>' and agency_id = :agency_id;` wait 6 minutes, load /dashboard
  twice as the member, then open Plan & billing in tab A and do not reload it.
- "I am a member again" (2.19) → WRITE, test workspace only: `update public.users set role = 'member' where id
  = '<member id>' and agency_id = :agency_id;` wait 6 minutes, then load /dashboard twice in tab B.
- "When Kontuur moves my workspace onto its internal plan" → WRITE, test workspace only: `update
  public.agencies set plan = 'house' where id = :agency_id;` wait 70 s and load /dashboard twice in tab B.
  Afterwards restore `plan = 'trial'`, wait 70 s, load /dashboard twice, and check "Choose plan" is back
  before 2.21.
- "Kontuur's price is set up wrongly" → in the sandbox add a second Kontuur price, €29.00 monthly, tax
  behaviour inclusive; set Vercel `STRIPE_PRICE_ID` to it; redeploy.
- "When Kontuur puts its price right" → restore `STRIPE_PRICE_ID`; redeploy. No wait: the price is cached per
  id.
- "I once opened and left Checkout" (2.7, 2.22) → on a fresh trial, click "Choose plan" and take Stripe's back
  link. This makes the Stripe customer and leaves that Checkout open, as the technical C53's step 1 does;
  without it both of 2.7's clicks first race to make the customer, which can fail one click for a reason
  unrelated to D5.
- "my customer record at Stripe has since been deleted" → after the line above, Stripe Dashboard → Customers →
  search the workspace's `cus_…` (`select stripe_customer_id from public.agencies where id = :agency_id;`) →
  Delete customer. Today's code opens Checkout only after the technical C47's SQL clear and more than 24
  hours; the scenario expects it with nothing more.
- "with a €5.00 credit on my account at Stripe" → click "Choose plan" and back out of Stripe (this makes the
  customer), then Dashboard → Customers → C-Credit → adjust balance: a credit of €5.00. If Stripe's invoice
  shows no applied balance, the scenario does not apply: note it.
- "an old link to the page Stripe sends me back to after paying / after leaving, saved or typed by hand" → as
  the admin, open https://kontuur.app/settings?tab=account&billing=success or …&billing=cancelled by hand.
- "a workspace that never paid" (2.17) → C-House after 2.21: back on the trial, with a Stripe customer and no
  subscription. "a workspace that is paying" (2.17) → C-One after 2.8.

## Left to the technical suite

Whole IDs:

- C19: a second subscription made by hand in the Stripe Dashboard. The customer sees nothing change; the proof
  is the delivery's "conflict" answer and the Vercel log (operator action and log).
- C39: the after-run checks (one Stripe customer per workspace, every paid workspace has client slots, no
  slot-change claim left over, no invoice with two documents, which events stay unprocessed). Database and
  Stripe only.
- C32: left to file 5 (a Checkout paid after its workspace was deleted, defect D1).
- C44: left to file 3 (the client count changing while a first Checkout is open).

Checks dropped from covered IDs, because only the database, Stripe's Dashboard, Stripe's Logs or Vercel can
see them:

- C1: Stripe holds no customer for the workspace yet.
- C4, C5: Logs show no `POST /v1/customers` and no `POST /v1/checkout/sessions`; C5's database restore.
- C6: the Stripe customer's name, `agency_id` metadata and idempotency key; the session's line_items quantity
  and its subscription billing mode, flexible (Logs).
- C7, C9, C10: which session was expired before which was created, and that no second customer was made
  (Logs).
- C11, C12, C22: Stripe holds no subscription, not even Incomplete; no workspace row is incomplete (SQL).
- C13: the subscription's metadata and billing mode (flexible), and each delivery's outcome (`started`,
  `period_paid`, `written`).
- C14: the address bar dropping `&billing=success` (a URL detail; the reload check covers its effect).
- C15: the row's columns (plan kept as trial, subscription id, status, quantity, client slots, period) and
  every billing event processed.
- C16: the QR text's parts (NRA e-shop number, Stripe invoice and charge ids, time). The customer sees the QR
  and its text but cannot check them.
- C17: the resent deliveries answering `{"received":true,"duplicate":true}`.
- C23: the stored document's `reverse_charge` basis; the row's `client_slots` and `subscription_quantity`,
  both 3 (SQL).
- C24: the stored document's `outside_eu` basis.
- C29: Logs show no second `POST /v1/checkout/sessions`; no event row for the customer.
- C30: each resent delivery's answer (`started`, `written`).
- C34: `invoice.paid` answering 500 on every retry, and its Vercel error.
- C36: the Vercel log naming the price mismatch; the customer being made before the price check.
- C45: the `billing=paid` row, an address Kontuur never sends anyone to; Logs showing no request; the row
  unchanged.
- C47: the deleted `cus_…` written back to the row, and Stripe's 24-hour idempotency replay (today's failure
  path).
- C53: Logs counting the expires and sessions of the two clicks.
- T45: the database row unchanged (the customer-visible half is in 2.4 and 2.5).
