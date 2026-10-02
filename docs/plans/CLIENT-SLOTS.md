# Client slots — the customer chooses how many clients to pay for

## Context

Today the paid plan's Stripe quantity follows the workspace's client count. Creating a client
quietly charges the card pro rata (`settleNewClient` → `syncSubscriptionQuantity`); deleting one
quietly lowers the next renewal; the webhook lowers it again before each renewal and after each paid
period (`reconcileQuantity`, `invoice.upcoming`). The founder finds this confusing: the bill changes as
a side effect of actions that do not look like billing, and nothing shows or sets what is paid for.

The new model is **client slots**. The admin chooses in Plan & billing how many clients to pay for;
the paid plan holds at most that many, as the trial holds at most three. The bill changes only when
the admin changes the number. Creating or deleting a client never touches Stripe. The whole
pro-rata-per-client implementation is removed in the same change — code, tests, registry entries,
docs and test plans (the **Cleanup ledger** below lists every piece).

There are no live customers yet (kontuur.app runs Stripe's sandbox), so this is the cheapest time.

## Decisions

Founder, 2026-09-30:
- **One control, in the app.** The slot count is set in Plan & billing — before Checkout (Checkout
  sells exactly that number) and afterwards. Stripe's billing page stays for card, address and tax
  ID (its subscription update stays off).
- **Raising** charges the pro-rata part of the current period at once, with its own invoice; the
  monthly price rises from the next renewal. Under Stripe's €0.50 minimum the amount goes on the
  renewal invoice (the existing rule).
- **Lowering** takes effect at the next renewal and refunds nothing; the lower cap applies at once and
  never goes below the clients the workspace has. This period's allowance stays as paid.
- **Raising back** up to what this period already paid for costs nothing.
- **The cap:** creating a client above the slot count is refused everywhere, in the same words.
- **Mock first:** the control is mocked and agreed before its UI is built.
- **At most 50 slots** (`MAX_CLIENT_SLOTS`), checked on a raise only.
- **Unchanged:** the trial (3 clients / 1 business, 12 posts), solo (always one business), the
  Internal plan (no cap), the allowance per slot paid for (25 drafts, 105 images, 15 rewrites), only
  admins manage the plan and add or delete clients.

Made here, from the code and Stripe's documented behaviour:
- **Flexible billing mode, pinned at Checkout.** On API `2026-08-26.dahlia` a new subscription is
  `flexible` by default (`node_modules/stripe/esm/resources/Checkout/Sessions.d.ts:4654`), and in
  flexible mode "credit prorations use the original debited amount instead of current subscription
  values" (docs.stripe.com/billing/subscriptions/billing-mode). So any slot change is **one** Stripe
  write: a raise nets to the units above what this period already billed; a restore up to it is free.
  Checkout sets `billing_mode: { type: 'flexible' }` explicitly so a future API default cannot change it.
- **Changes only while the period is settled:** `state === 'active'`, not set to end, and the row's
  period equal to Stripe's (Stripe moves its period at renewal before the invoice is paid). Otherwise
  the control says why, and the action refuses the same way.
- **An over-slot workspace is never charged automatically.** Only a race makes one (clients added while
  a first Checkout is open, or a create racing a lower). It reads "4 of 3" in red, Add client is
  refused, the stepper's minimum is the client count. *(Default — confirm or overrule.)*

## How it works

| Moment | The admin | Stripe and the app |
|---|---|---|
| Trial → paid | picks N (≥ clients, ≥ 1) beside Choose plan | Checkout sells quantity N, flexible mode; the first fill writes N as ordered and paid |
| Raise | stepper → confirm "about €X excl. VAT today, then €Y a month" | one update, `always_invoice` (`create_prorations` under €0.50); the paid invoice goes to the snapshot, so ordered and paid are written at once |
| Restore (≤ paid) | the same | one update, `none`; nothing charged |
| Lower | stepper → confirm "from ‹renewal› you pay for M" | one update, `none`; cap M at once; allowance stays until renewal |
| Create / delete a client | Add client / Delete | nothing sent to Stripe; create refused at the cap |
| Renewal | — | Stripe bills the ordered number; its paid invoice makes paid = ordered |

**Two facts, two fields.** Ordered slots (`agencies.client_slots`, new: Stripe's item quantity — the cap
and what the next renewal bills) and slots paid for this period (`agencies.subscription_quantity`,
existing — the allowance and the free-restore line). They differ only after a lower, or a raise under
Stripe's minimum, until renewal. Reading the cap from Stripe instead would add a Stripe request to every
Add-client render and every create.

**Why the claim stays.** Two windows changing slots at once: A raises 3→6 (billed 6) while B, having read
3, writes 4 with `always_invoice` — Stripe credits 6 and debits 4, a customer credit that
`refuseBalances` (`src/lib/billing/documents.ts:221`) then refuses to document. The compare-and-set claim
on `quantity_sync_at` plus the "live quantity must equal what the dialog showed" check closes it. The
claim's 70-second wait loop does not stay: it existed because a waiting create's client was counted by
the holder, and no create takes the claim now — a busy claim gives way at once.

## Cleanup ledger — the pro-rata implementation

Every piece, and what happens to it. "Rewritten" means the doc or body now describes slots; nothing of
the old rule survives outside `docs/plans/BILLING*.md` (history, with pointers) and the applied migration
20260861 (applied migrations are not edited).

**Code**

| Piece | Where | Fate |
|---|---|---|
| The module | src/lib/billing/quantity-sync.ts (removed) | `git mv` to `src/lib/billing/client-slots.ts` (new) and rewritten; the old path is gone |
| `syncSubscriptionQuantity` | src/lib/billing/quantity-sync.ts:221 (removed) | deleted → `setClientSlots` |
| `QuantityChange` (incl. `'both'`) | src/lib/billing/quantity-sync.ts:53 (removed) | deleted |
| `raiseQuantity` (restore write + charge write) | src/lib/billing/quantity-sync.ts:135 (removed) | deleted — one write now |
| `paidThisPeriod` | src/lib/billing/quantity-sync.ts:91 (removed) | deleted — the period-settled refusal replaces it |
| `billedSubscriptionId`, `openSubscriptionId` | src/lib/billing/quantity-sync.ts:62 (removed), `:75` | deleted — the new action holds the row and entitlement |
| `underQuantityClaim` wait loop, `CLAIM_RETRY_MS` | src/lib/billing/quantity-sync.ts:191 (removed), `:36` | deleted — give way at once |
| `chargeFailure`'s `CLIENT_NOT_ADDED` branch | src/lib/billing/quantity-sync.ts:83 (removed) | deleted — only a card decline becomes a sentence |
| the client count in the sync, and imports of `countClientsByAgency`, `billableQuantity`, `isPaying`, `CLIENT_NOT_ADDED`, `QUANTITY_SYNC_BUSY` | src/lib/billing/quantity-sync.ts:6-9 (removed), `:228` | deleted |
| `proRataCents`, `STRIPE_MIN_CHARGE_CENTS` | src/lib/billing/quantity-sync.ts:101 (removed), `:19` | moved to `src/lib/billing/plans.ts` (pure, plain dates) |
| `QuantityChargeError` | src/lib/billing/quantity-sync.ts:39 (removed) | renamed `SlotChangeError` |
| kept as they are | `STRIPE_REQUEST`, `claimQuantity`, `releaseQuantity`, `setQuantity` (+ `expand: ['latest_invoice']`), `CLAIM_STALE_MS` | kept |
| `reconcileQuantity` and its two calls | `src/lib/billing/stripe-events.ts:120`, `:204`, `:221` | deleted |
| the `'invoice.upcoming'` case label | `src/lib/billing/stripe-events.ts:208` | deleted (the event now falls to `ignored`) |
| imports `syncSubscriptionQuantity`, `hasSubscriptionEnded` | `src/lib/billing/stripe-events.ts:15-16` | deleted |
| `handleEvent` and `Handled.detail` docs | `src/lib/billing/stripe-events.ts:186`, `:26` | rewritten |
| `settleNewClient`'s billed branch | `src/features/clients/actions/client-actions.ts:225-247` | deleted; the capped branch becomes `recheckBrandCap` |
| `createClient`'s `getCachedAgency` read | `src/features/clients/actions/client-actions.ts:67-70` | deleted (it fed only the billed branch) |
| `deleteClient`'s re-read and decrease | `src/features/clients/actions/client-actions.ts:178-189` | deleted |
| quantity-sync imports; docs of `createClient`, `deleteClient` | `src/features/clients/actions/client-actions.ts:35-40`, `:44`, `:139` | deleted / rewritten |
| `addBrandCost` | `src/lib/billing/copy.ts:328` | deleted |
| `checkoutSummary` | `src/lib/billing/copy.ts:314` | deleted → `slotsSummary` |
| `AddBrandGate` (with `note`) | `src/lib/billing/copy.ts:345` | deleted → `PlanGate` |
| `note: addBrandCost(…)` | `src/lib/billing/copy.ts:361` | deleted |
| `deleteClientNotice`'s last-client and renewal sentences | `src/lib/billing/copy.ts:375` | rewritten (slot freed, bill unchanged) |
| `CLIENT_NOT_ADDED` | `src/lib/billing/copy.ts:395` | deleted |
| `QUANTITY_SYNC_BUSY` | `src/lib/billing/copy.ts:398` | renamed `SLOTS_BUSY` |
| `billableQuantity` import; docs of `CLIENTS_ADMINS_ONLY`, `brandCapReached` | `src/lib/billing/copy.ts:10`, `:211`, `:204` | import deleted; docs rewritten |
| `billableQuantity`'s and the header's docs | `src/lib/billing/plans.ts:49`, `:1` | rewritten ("the fewest slots": the rule `max(1, clients)` is unchanged, so no rename) |
| `brandsUnlimited` (field + 5 literals) | `src/lib/billing/entitlement.ts:41`, `:178`, `:218`, `:239`, `:260`, `:301` | deleted → `brandCap` |
| docs of `brands`, `isPaying`, `hasSubscriptionEnded` | `src/lib/billing/entitlement.ts:38`, `:89`, `:111` | rewritten |
| `paidQuantity` and snapshot docs naming the delete/sync | `src/lib/billing/subscription-store.ts:42`, `:111` | rewritten |
| `refuseBalances` doc naming the sync | `src/lib/billing/documents.ts:212` | rewritten |
| `GenerateGate` | `src/lib/billing/post-allowance.ts:87` | deleted → `PlanGate` |
| `billableQuantity(clients)` as Checkout's quantity | `src/features/settings/actions/billing-actions.ts:67` | replaced by the chosen slots (the floor check keeps `billableQuantity`) |
| `summary` prop and the Choose-plan block | `src/features/settings/components/plan-actions.tsx:15`, `:71-78` | deleted → the slot control |
| `checkoutSummary` import and prop | `src/app/(dashboard)/settings/page.tsx:10`, `:102` | deleted |
| `GatedAction`'s `note` prop, doc and render | `src/components/ui/gated-action.tsx:10-12`, `:44-53` | deleted |
| `note={addClient.note}` | `src/features/dashboard/components/dashboard-header.tsx:103`, `src/app/(dashboard)/clients/page.tsx:146` | deleted |
| `?? addClient.note` | `src/features/dashboard/components/quick-actions-strip.tsx:63`, `src/components/layout/command-palette.tsx:116` | deleted |
| docs "or what a client costs" | `src/features/dashboard/components/dashboard-header.tsx:25`, `src/features/dashboard/components/quick-actions-strip.tsx:34`, `src/components/layout/command-palette.tsx:36` | rewritten |
| `getCachedAgencyClients` read | `src/app/(dashboard)/clients/[id]/edit/page.tsx:111` | deleted, then restored by the second review: the delete notice needs the count (React-cached from the layout) |
| webhook `maxDuration = 300` and its claim reason | `src/app/api/billing/webhook/route.ts:7-11` | back to 60, with the render-in-`after` reason (the value before f0b3d2da) |
| Terms §6 charging sentences | `src/app/(marketing)/terms/page.tsx:135-140` | rewritten (step 7) |

**Registries and docs**

| Piece | Where | Fate |
|---|---|---|
| writer entry for quantity-sync.ts (removed) | `scripts/table-writers.json:6` | moved to `client-slots.ts` ("taken only inside `setClientSlots`") |
| agencies writer entry for the snapshot | `scripts/table-writers.json:5` | names `client_slots` |
| operation row "keep the paid quantity equal to the client count" | `docs/OPERATIONS.md:57` | replaced by "set the client slots → `setClientSlots`" |
| the snapshot's row | `docs/OPERATIONS.md:56` | names `client_slots` |
| seven webhook events incl. `invoice.upcoming` | `docs/n18/README.md:56-61` | six; the upcoming-renewal setting goes |
| the per-client quantity model | `docs/plans/BILLING.md` (step 9), `docs/plans/BILLING-REVIEW-FIXES.md` (steps 4, 15) | kept as history, each with a "Superseded by docs/plans/CLIENT-SLOTS.md" pointer |
| the claim's comment naming the sync | `supabase/migrations/20260861_billing_review_additive.sql:88` | not edited (applied); noted |

**Tests**

| Piece | Where | Fate |
|---|---|---|
| the sync's tests | src/lib/billing/__tests__/quantity-sync.test.ts (removed) | `git mv` to `client-slots.test.ts` (new); client-count, `'both'`, restore-then-charge, wait-loop and `billed/openSubscriptionId` cases deleted; claim, idempotency and declined-card cases rewritten for `setClientSlots` |
| the sync stand-in, local `QuantityChargeError`, the `quantity-sync` mock, the `unstable_cache` mock that only existed because the real sync imported `stripe.ts`, the `getCachedAgency` mock | `src/features/clients/actions/__tests__/client-actions.test.ts:45-85` | deleted |
| "on a paid workspace", "deleteClient on a paid workspace", the "counts no cap" row | `src/features/clients/actions/__tests__/client-actions.test.ts:318-414`, `:416`-end, `:256` | deleted; paid cap and race tests added |
| hoisted sync mock, `quantity-sync` mock, "the quantity after a snapshot" | `src/app/api/billing/__tests__/webhook.test.ts:13`, `:37-38`, `:296-391` | deleted; one test: nothing reconciles, `invoice.upcoming` is ignored |
| `addBrandCost`, `checkoutSummary`, the note in `addBrandGate` | `src/lib/billing/__tests__/copy.test.ts:491-521`, `:533`, `:222-231` | deleted; slot sentences added |
| the paid-plan-uncapped assertions | `src/lib/billing/__tests__/copy.test.ts:188`, `src/lib/billing/__tests__/entitlement.test.ts:88`, `src/features/settings/components/__tests__/plan-section.test.tsx:109` | rewritten for the cap |
| `deleteClientNotice` cases | `src/lib/billing/__tests__/copy.test.ts:255-294`, `src/features/clients/__tests__/delete-client-dialog.test.tsx:79` | rewritten |
| "client count as the quantity" | `src/features/settings/actions/__tests__/billing-actions.test.ts:79-95` | rewritten for `startCheckout(slots)` |
| the cost-note case and `ALLOWED.note` | `src/components/layout/__tests__/command-palette.test.tsx:84`, `:18` | deleted / trimmed |
| `SUMMARY` and the summary cases | `src/features/settings/components/__tests__/plan-actions.test.tsx:23`, `:36-48` | deleted; composition cases kept |

**Test plans** (`docs/plans/billing-e2e`, untracked) — rewritten in step 9, old files deleted:
`3-clients-and-what-i-pay.feature` → `3-client-slots.feature` (new);
`setup/3-clients-and-what-i-pay.md` → `setup/3-client-slots.md` (new);
`technical/03-clients-and-quantity.feature` → `technical/03-client-slots.feature` (new);
the scenario edits listed under **Scenarios to rewrite**; both READMEs' defect tables.

**Memory:** the billing memory entries that describe per-client pro rata are updated (step 10).

## Callers of every changed signature (docs/CLAUDE.md §3)

| Changed | Caller | Decision |
|---|---|---|
| `startCheckout()` → `startCheckout(slots)` | `src/features/settings/components/plan-actions.tsx:74` | moves into the slot control, which passes the stepper's number |
| | `src/features/settings/actions/__tests__/billing-actions.test.ts:71-133` | each call passes a count; new floor and ceiling cases |
| | `src/features/settings/components/__tests__/plan-actions.test.tsx:5-37` | the Checkout case moves to the control's test |
| `createCheckoutSession` gains `billing_mode` | `src/features/settings/actions/billing-actions.ts:64` | unchanged call; quantity = slots |
| | `src/lib/billing/__tests__/checkout.test.ts:52` | asserts `billing_mode: flexible` |
| `applySubscriptionSnapshot` writes `client_slots` | `src/lib/billing/stripe-events.ts:203`, `:219`, `:220`; `src/lib/billing/subscription-store.ts:204` | unchanged calls; new caller `setClientSlots` |
| `deleteClientNotice(entitlement, count)` → `(entitlement)` | `src/app/(dashboard)/clients/[id]/edit/page.tsx:146` | dropped the count; the second review put it back — null while the workspace holds more clients than slots |
| `addBrandGate` returns `PlanGate` | `src/app/(dashboard)/layout.tsx:126`, `src/app/(dashboard)/clients/page.tsx:78`, `src/app/(dashboard)/dashboard/page.tsx:88` | unchanged calls |
| `AddBrandGate` / `GenerateGate` → `PlanGate` | `src/features/dashboard/components/quick-actions-strip.tsx:12`, `src/features/dashboard/components/dashboard-header.tsx:5-6`, `src/components/layout/shell-context.tsx:18`, `src/components/layout/command-palette.tsx:16`, `src/features/generate/components/generate-flow.tsx:32`, `src/features/generate/components/setup/setup-view.tsx:18`, `src/lib/billing/post-allowance.ts:108` | import renamed; doc citations in `client-coverage.tsx:20`, `coverage-row.tsx:25`, `dashboard-header.tsx:46`, `setup-view.tsx:67` follow |
| `GatedAction` loses `note` | `src/features/dashboard/components/dashboard-header.tsx:103`, `src/app/(dashboard)/clients/page.tsx:146` | prop removed; the Generate use (`dashboard-header.tsx:109`) is unaffected |
| `brandsUnlimited` → `brandCap` | `src/features/clients/actions/client-actions.ts:71`, `:216` | count / re-check whenever `brandCap` is not null |
| | `src/features/settings/components/plan-section.tsx:69` | `brandLimit = notice ? null : brandCap(entitlement)` |
| | `src/lib/billing/copy.ts:244` | `addBrandRefusal` compares with `brandCap` |
| `Entitlement.brands` now the ordered slots on the paid plan | `src/features/clients/actions/client-actions.ts:230` | deleted with the billed branch |
| | `src/lib/billing/copy.ts:336` | deleted with `addBrandCost` |
| | `src/lib/billing/copy.ts:463`, `:466` (`checkoutActivated`) | correct as is — the ordered count is next month's price; the total uses `monthlyCents` |
| `billableQuantity` (doc only) | `src/features/settings/actions/billing-actions.ts:67` | becomes the floor check against the chosen slots |
| | `src/lib/billing/copy.ts:315`, `:380` | deleted with `checkoutSummary` and the last-client branch |
| `isPaying` | `src/app/(dashboard)/settings/page.tsx:117` | unchanged; its other caller (quantity-sync.ts:66 (removed)) goes |
| `cardDeclined` | src/lib/billing/quantity-sync.ts:85 (removed) | moves with the file |
| `takeBackClient` | `src/features/clients/lib/provision-client.ts:97`, `src/features/clients/actions/client-actions.ts:222` | unchanged; the decline undo at `:237` goes |
| `countClientsByAgency` | `src/features/settings/actions/billing-actions.ts:62`, `src/features/clients/actions/client-actions.ts:71`, `:217` | kept; the sync's call (quantity-sync.ts:228 (removed)) goes; the slot action adds one |
| `PlanActions` props | `src/app/(dashboard)/settings/page.tsx:99` | `summary` goes; slot inputs added |
| `Stepper` promoted | `src/features/generate/components/setup/count-steppers.tsx:81` (`CountSteppers`) | imports it from `components/ui` |

## Survey — before → after

**Rows and fields.** `client_slots` is new, with ONE writer (`applySubscriptionSnapshot`, every owned
snapshot) and read through `AGENCY_BILLING_KEYS` (`src/lib/queries/select-columns.ts:252`) as
`Entitlement.brands`. `subscription_quantity` is unchanged, read as `Entitlement.brandsPaid`.
`quantity_sync_at` keeps its one writer and its compare-and-set. No other field.

**Operations.** Deleted: "keep Stripe's quantity at the client count" (`syncSubscriptionQuantity`, three
callers + the webhook) and the webhook reconcile. New: "set the client slots" (`setClientSlots`).
`takeBackClient` keeps one job (the cap race).

**Requests per flow**

| Flow | Before | After |
|---|---|---|
| Create a client, paid | cached entitlement + agency, count, provisioning, claim, count, retrieve, update ×0–2, release | cached entitlement, count, provisioning, re-count |
| Delete a client, paid | delete, sweep, cached entitlement + agency, claim, count, retrieve, update, release | delete, sweep |
| Edit-client page | + cached client list | the client-list read goes |
| Webhook event | + claim, count, retrieve, update on three outcomes | none |
| Checkout click | cached reads, count, Stripe | the same; the count checks the chosen number |
| Change slots (new) | — | uncached row, count, claim, retrieve, one update (latest invoice expanded), snapshot (row read; `invoices.list` after a charge; write), release |
| Settings render | uncached row + count | the same two reads |

**Types.** One `PlanGate { refusal, wayOut }` replaces `AddBrandGate` and `GenerateGate`. `Entitlement`
gains `brandsPaid`; `brandsUnlimited` goes (it would only restate `brands === Infinity`).

**Logic** — one function per rule, pure, in `src/lib/billing/plans.ts` (client-safe, so the server write
and the confirm sentence use the same code):

| Rule | Function | Used by |
|---|---|---|
| Fewest slots a workspace may hold, `max(1, clients)` | `billableQuantity` (kept) | Checkout, the slot action, the stepper |
| The month's price for N slots | `monthlyCents` (new) | `checkoutActivated`, `slotsSummary`, `slotChangeConsequence` |
| What a change is and what it charges | `slotChange(from, to, paid)` → `{ kind, charged }` (new) | `setClientSlots`, `slotChangeConsequence` |
| Pro-rata cents over the rest of a period | `proRataCents(units, period, now)` (moved; unit price `PRO_PLAN.priceCents`, which `verifiedPriceId` enforces) | `setClientSlots` (minimum-charge choice), `slotChangeConsequence` |
| The client cap, or none | `brandCap` (new, `entitlement.ts`) | `createClient`, `recheckBrandCap`, `addBrandRefusal`, `PlanSection` |

## Deploy order

1. `supabase/migrations/20260865_client_slots.sql` (new) — additive; the running code ignores the column.
   The founder applies it and runs `npm run db:types` (never a hand edit of `src/types/database.ts`);
   step 2's code needs those types. Check the number is still free first.
2. The code, in one deploy. A row the snapshot has not written since reads its ordered count from the
   paid count (`client_slots ?? subscription_quantity`), so no re-run is needed.
3. Held, not applied now: `supabase/held/20260866_sale_documents_one_link.sql` (new, from the second
   review below) sits outside `supabase/migrations` on purpose. Once production runs this deploy and
   one `invoice.paid` has gone through end to end, move it into `supabase/migrations`, apply it alone,
   then `npm run db:types`. It drops two `sale_documents` columns the deployed code no longer reads;
   applied before the deploy it breaks every document read. After it, the code before this deploy
   no longer runs and 20260861 / 20260863 must never be re-run; its header has the restore SQL.
4. One-off on deploy, accepted: the allowance bells' keys gained the pool size, so a workspace whose
   pool was already used up this period gets that bell once more, under the new key, until the
   period ends.

## Steps

Before each step: read every file it touches in full; take each caller's decision from the table above;
keep `npm run check` green at its end. Comments sit above functions and modules only, short; every
exported function gets a JSDoc; each function whose logic changes has its doc updated and any in-body
comment folded in (`npm run comments` gates `lib/billing`, `features/settings`, `app/api/billing`).
Product-facing names say *slots*; Stripe-facing internals keep *quantity* (`claimQuantity`,
`setQuantity`, `quantity_sync_at`) — the slot count is Stripe's item quantity, and renaming a working
column is not asked for.

### 0. The plan in the repo

Copy this file to `docs/plans/CLIENT-SLOTS.md` (new); add the "Superseded by" pointers to
`docs/plans/BILLING.md` (step 9, and beside line 211) and `docs/plans/BILLING-REVIEW-FIXES.md` (steps 4
and 15).
→ verify: `npm run plan:check -- docs/plans/CLIENT-SLOTS.md` green.

### 1. Mock, then agree (the UI waits for this)

A mock (artifact): the control before Checkout (agency, solo); after purchase; the raise, restore and
lower confirms; the renewal-pending and paused states; "All 3 client slots are in use" on Add client;
the delete dialog's line; the Terms §6 text. Steps 2–5 go ahead; step 6 starts once the founder agrees.

### 2. Migration and the entitlement

- `supabase/migrations/20260865_client_slots.sql` (new): `alter table public.agencies add column if not
  exists client_slots integer check (client_slots >= 0)` (Stripe allows 0 on a hand edit; the writer must
  never throw on it); backfill `client_slots = subscription_quantity` where `stripe_subscription_id is not
  null and client_slots is null`; a column comment naming the one writer; `notify pgrst, 'reload schema'`.
  Re-runnable.
- `src/lib/queries/select-columns.ts`: `client_slots` joins `AGENCY_BILLING_KEYS`.
- `src/lib/billing/plans.ts`: `MAX_CLIENT_SLOTS`, `STRIPE_MIN_CHARGE_CENTS`, `monthlyCents`,
  `slotChange`, `proRataCents`; docs per the ledger.
- `src/lib/billing/entitlement.ts`: `brands` = the cap (paid: `client_slots ?? subscription_quantity ??
  1`); `brandsPaid` (paid: `Math.max(1, subscription_quantity ?? 1)`, else 0); `limits` scale by
  `brandsPaid`; `brandsUnlimited` → `brandCap`; docs per the ledger.
- `src/lib/billing/subscription-store.ts`: `update.client_slots = item.quantity ?? 1` on every owned
  snapshot; docs per the ledger.
- Test rows gain `client_slots`: `src/lib/billing/__tests__/fixtures.ts` (`paidRow` 1, `trialRow`
  null) and the literal rows in `reminders.test.ts`, `workspace-actions.test.ts`, `entitled-clients.test.ts`.

→ verify: `entitlement.test.ts` (paid capped at `client_slots`; the fallback; allowance from the paid
count; house uncapped; trial unchanged); `plans.test.ts` (`slotChange` every kind and boundary,
`proRataCents`, `monthlyCents`); `subscription-store.test.ts` (`client_slots` on a first fill, a plain
update, a paid invoice, a quantity of 0); `billing-sql.test.ts` replays 20260865.

### 3. The Stripe write

- `src/lib/billing/checkout.ts`: `subscription_data.billing_mode = { type: 'flexible' }`, doc says why.
- `src/lib/billing/client-slots.ts` (new, from the `git mv`): `setClientSlots(admin, agencyId,
  subscriptionId, { from, to, paid, periodStart })` → outcome `'charged' | 'on_renewal' | 'restored' |
  'lowered' | 'same'`. Under the claim: retrieve; refuse as `SlotChangeError` a live quantity ≠ `from`
  (`SLOTS_CHANGED_ELSEWHERE`) or an item period start ≠ `periodStart` (`SLOTS_RENEWAL_PENDING`);
  `slotChange` picks ONE `setQuantity` — `always_invoice`, `create_prorations` when `proRataCents` of the
  charged units is under the minimum, or `none`; then `applySubscriptionSnapshot(admin, updated,
  paidInvoice)` with the expanded invoice when it is paid (narrowed by type check, no `as`). A busy claim
  → `SlotChangeError(SLOTS_BUSY)` at once; a `StripeCardError` → `SlotChangeError(cardDeclined(…))`;
  anything else propagates to the action. Kept to one screen; if not, the two refusals become one local
  helper.
- `src/lib/billing/stripe-events.ts`, `src/app/api/billing/webhook/route.ts`, `src/lib/billing/documents.ts`:
  per the ledger.

→ verify: `client-slots.test.ts`: each outcome writes once with the right proration; under the minimum →
`create_prorations`; a decline → the card's words and nothing written; both refusals; a busy claim; the
snapshot gets the paid invoice after a charge and none after a lower; the claim is released on every
path. `webhook.test.ts`: no event reconciles; `invoice.upcoming` → `ignored`.

### 4. Actions and words

- `src/features/settings/schemas.ts`: `clientSlotsSchema = z.number().int().min(0)` and
  `slotChangeSchema = z.object({ from: clientSlotsSchema, to: clientSlotsSchema })`.
- `src/features/settings/actions/billing-actions.ts`:
  - `startCheckout(slots)`: parse; after the house / open-subscription refusal, count clients; refuse
    `slots < billableQuantity(count)` (`slotsBelowClients`) or `slots > MAX_CLIENT_SLOTS`
    (`SLOTS_TOO_MANY`); solo buys exactly 1; `quantity: slots`.
  - `setClientSlotsAction({ from, to })` (new): `adminAuth`; parse; the uncached row (`fetchAgencyById`,
    as `setPlanEndingAction`) → `entitlementFor`; refuse house, solo, not active, ending
    (`slotsUnavailable`); count clients on every change, refuse `to < billableQuantity(count)`; refuse a
    raise above `MAX_CLIENT_SLOTS`; then `setClientSlots(… { from,
    to, paid: entitlement.brandsPaid, periodStart: agency.current_period_start })`. `SlotChangeError` →
    its sentence; anything else → `STRIPE_UNAVAILABLE`, logged once here `[billing:slots]`. Returns the
    outcome.
- `src/features/clients/actions/client-actions.ts`: `createClient` counts whenever `brandCap` is not null
  and reads no agency; `settleNewClient` → `recheckBrandCap` (the capped branch); `deleteClient` sends
  nothing to Stripe.
- `src/lib/billing/copy.ts`: new `PlanGate`, `slotsSummary(mode, slots)`, `slotChangeConsequence(…)`,
  `slotsChanged(outcome, …)`, `slotsBelowClients(count, mode)`, `slotsUnavailable(entitlement)`,
  `SLOTS_TOO_MANY`, `SLOTS_CHANGED_ELSEWHERE`, `SLOTS_RENEWAL_PENDING`; `brandCapReached` gains the paid
  plan's sentences — agency "All 3 client slots are in use. Add a slot to add more.", solo "Your plan
  covers one business." (closes D9); `deleteClientNotice(entitlement, clientCount)` — null unless
  paid, agency, `canSpend`, not ending and not over its slots — says the slot is freed, the bill is unchanged, and to lower the slots in Plan
  & billing to pay for fewer; `cardDeclined` points at Manage billing; `checkoutActivated` uses
  `monthlyCents`; deletions per the ledger.
- `src/lib/billing/post-allowance.ts`: `GenerateGate` → `PlanGate`.

→ verify: `billing-actions.test.ts` (every refusal; a member refused; the floor and ceiling; a lower from a
Dashboard-set 60 allowed; the chosen number reaches Checkout); `client-actions.test.ts` (a paid create at
its slots refused before provisioning; two racing paid creates both give way; a paid delete calls no Stripe
function); `copy.test.ts` (every new sentence; `deleteClientNotice` per case; `brandCapReached` per plan
and mode). `action-validation.test.ts` stays green (the new action parses its argument).

### 5. One gate, no cost note

Per the ledger and the callers table: `GatedAction` loses `note`; every Add-client control takes
`PlanGate`; the edit page drops its client-list read.
→ verify: `dashboard-header.test.tsx`, `command-palette.test.tsx` (a paid workspace at its slots refused
with the slots sentence and the Plan & billing way out), `generate-page.test.ts`.

### 6. The slot control (after the mock is agreed)

- `src/components/ui/stepper.tsx` (new): `Stepper` promoted from
  `src/features/generate/components/setup/count-steppers.tsx:29` — this is its second consumer, the rule
  for promotion; `CountSteppers` imports it.
- `src/features/settings/components/client-slots-control.tsx` (new), a client leaf:
  - **Before a first Checkout** (not house): agency — the stepper (min `billableQuantity(clientCount)`,
    max `MAX_CLIENT_SLOTS`) and `slotsSummary`; solo — `slotsSummary` at 1, no stepper; Choose plan →
    `startCheckout(n)`.
  - **Paid, active, not ending, period settled** (agency): the stepper from the ordered count; once it
    differs, "Change" opens `ConfirmDialog` (`tone="primary"`) with `slotChangeConsequence`, worked out
    when the dialog opens (a click, never in the server render, so the two clocks cannot disagree);
    confirm → `setClientSlotsAction({ from, to })` → toast `slotsChanged(outcome)`. No refresh: the
    snapshot's `{ expire: 0 }` bust re-renders the page into the action's response, as `PlanEndControl`
    relies on.
  - **Ordered below paid:** "You pay for 3 until ‹renewal›, then 2."
  - **Otherwise** (paused, failed renewal, ending, renewal pending): no stepper; `slotsUnavailable`.
- `src/features/settings/components/plan-actions.tsx`: composes the control, `PlanEndControl` and
  Manage billing.
- `src/app/(dashboard)/settings/page.tsx`: passes the client count, ordered and paid counts, the period
  dates and the timezone from the row and count it already reads.
- `src/features/settings/components/plan-section.tsx`: "2 of 3" on the paid plan through `brandCap`; doc.

→ verify: `client-slots-control.test.tsx` (new, same change — the component owns state): bounds; summary;
the raise, restore and lower confirms; the floor disabled with its reason; the unavailable states; solo.
`plan-actions.test.tsx`, `plan-section.test.tsx` (paid "2 of 3"; over-slot red); `component-tests.test.ts`
green.

### 7. Legal text (founder's sign-off)

`src/app/(marketing)/terms/page.tsx` §6, lines 135–140: "Kontuur is priced per client slot. You choose how
many client slots to pay for in Plan & billing, and a workspace holds at most that many clients. Fees are
charged monthly in advance and are non-refundable except where required by law. Slots added during a
billing period are charged pro rata at once, or on the next invoice when that amount is below the payment
provider's minimum charge; slots already paid for in the current period cost nothing to restore. Removing
slots takes effect from the next renewal and refunds nothing. Deleting a client frees its slot and does
not change what you pay." "Last updated" becomes the ship date.

### 8. Registries and runbook

Per the ledger (`scripts/table-writers.json`, `docs/OPERATIONS.md`, `docs/n18/README.md`).
→ verify: `npm run writers -- --check`, `npm run arch -- --check`, `npm run deadcode` green.

### 9. Test plans

Rewrite the scenarios under **Scenarios to rewrite** through one workflow (write → check against the code
→ fix), delete the three replaced files, then the mechanical checks (≤ 6 steps, ≤ 110 chars, every quoted
phrase exists in `src/`). Both READMEs: drop D3, D8, D9 (removed by the model), move D11 to a declined
slot raise.

### 10. Memory

Update the billing memory entries that describe per-client pro rata; point them at
`docs/plans/CLIENT-SLOTS.md` (new).

## Scenarios to rewrite

- **Customer journeys:** `1-trying-kontuur` 1.1, 1.5, 1.8, 1.23, 1.24; `2-paying-for-kontuur` 2.1, 2.2, 2.8,
  2.9, 2.11, 2.12; `3-client-slots` (new, replacing `3-clients-and-what-i-pay`: raise, restore, lower, the
  cap, delete frees a slot, members, solo, house, races, declined raise, renewal pending);
  `4-renewals-and-card-problems` 4.3, 4.10, 4.11, 4.12, 4.17; `5-cancelling-and-deleting` 5.9–5.12;
  `6-invoices-and-refunds` 6.5, 6.9, 6.17–6.20, 6.23, 6.25 (a slot raise is the trigger); `7-allowance`
  7.22, 7.23.
- **Setup files:** `setup/3-client-slots.md` (new, replacing `setup/3-*`); the quantity lines of
  `setup/1-*`, `setup/2-*`, `setup/4-*`, `setup/6-*`, `setup/7-*`, `setup/9-*`.
- **Technical:** `01` T1 (six events), T10, T13; `02` C1, C6, C13–C15, C23, C24, C39, C44;
  `03-client-slots` (new, replacing `03-clients-and-quantity`); `04` R1, R3, R4 (deleted), R14, R15, R18;
  `05` X15, X22–X24; `06` D12–D14, D18, D44, D49, D54; `08` W13; `09` A30; the README.

## Hand work (founder)

- Apply `supabase/migrations/20260865_client_slots.sql` (new) before the deploy; then `npm run db:types`.
  (Done 2026-10-01.)
- After the deploy has run one paid invoice end to end: move `supabase/held/20260866_sale_documents_one_link.sql`
  into `supabase/migrations`, apply it alone, then `npm run db:types` (Deploy order, step 3).
- Stripe, test and live: remove `invoice.upcoming` from the webhook endpoint; switch off the
  upcoming-renewal event setting; keep the portal's subscription update **off**; set Settings → Billing →
  Subscriptions → default billing mode to Flexible, so a subscription made by hand matches.
- Sign off the Terms §6 text (step 7).

## Done means (docs/CLAUDE.md §4)

1. Every ledger row is resolved as written.
2. This grep returns nothing outside `docs/plans/BILLING*.md`, `docs/plans/WORKSPACE-DELETION-RESEARCH.md`
   (history, with pointers), migration 20260861, and the webhook test that proves `invoice.upcoming`
   is now ignored:
   `syncSubscriptionQuantity|QuantityChargeError|quantity-sync|reconcileQuantity|addBrandCost|checkoutSummary|CLIENT_NOT_ADDED|QUANTITY_SYNC_BUSY|openSubscriptionId|billedSubscriptionId|paidThisPeriod|raiseQuantity|CLAIM_RETRY_MS|settleNewClient|brandsUnlimited|AddBrandGate|GenerateGate|invoice\.upcoming|charged pro rata today|Already paid for this period`.
3. `npm run check` and `npm run build` green; `npm run deadcode` reports zero.
4. Observed in the sandbox (what `check` cannot see — Stripe's proration and the rendered control), on a
   fresh test-clock workspace:
   - a trial with 2 clients picks 3 at Checkout: charged 3 × €29 + VAT; the subscription shows Billing
     mode Flexible; Clients "2 of 3";
   - a 3rd client: nothing charged; a 4th: refused with the slots sentence;
   - raise to 4: one pro-rata invoice, emailed and listed; Clients "3 of 4"; the allowance rises at once;
   - lower to 3: nothing charged or refunded; "You pay for 4 until ‹renewal›, then 3"; Add client refused;
   - raise back to 4 the same period: nothing charged;
   - a declined card on a raise: the card's words; Stripe unchanged;
   - delete a client: no Stripe event; the bill unchanged;
   - advance the clock past renewal: the renewal bills the ordered number; before it is paid the control
     says the renewal is being processed.
5. The e2e files' mechanical checks after step 9.

## docs/CLAUDE.md conformance

- **§1 Think before coding:** written from files opened in this session; the table below and the
  grep-by-shape section are filled; `npm run plan:check` is the last step; the one open product choice
  (over-slot) is flagged, not assumed silently.
- **§2 Simplicity:** one Stripe write per change (flexible mode) instead of restore-then-charge; no
  classic-mode guard (Checkout pins flexible and the Dashboard default is set to it — a guard would guard
  nothing); no new module for five pure rules (they join `plans.ts`); `billableQuantity` keeps its name
  (its rule is unchanged); the claim stays only for the named race.
- **§3 Surgical, migrate never extend:** every caller has a decision (table above); the original is
  deleted in the same change (ledger); D7 is not touched (unrelated); dead code outside this change is
  only noted.
- **No duplication:** one gate type, one monthly price, one pro-rata rule for server and UI; the stepper
  is promoted, not copied (three-step check below).
- **Database writes:** `client_slots` has one writer, registered; the claim's writer moves with its file;
  `docs/OPERATIONS.md` updated.
- **Functions / naming:** `setClientSlots`, `setClientSlotsAction`, `recheckBrandCap` are verbs;
  value builders in `plans.ts` and `copy.ts` follow those files' existing noun style (`billableQuantity`,
  `postsLeft`) — a judgment call to match the surrounding code.
- **Errors:** caught and logged once, at the server action; below it, throw.
- **Validation:** both actions zod-parse their arguments (the `action-validation` guard).
- **Next.js:** the control is the smallest client leaf; data comes from the server page; `plans.ts` and
  `copy.ts` stay client-safe; `client-slots.ts` keeps `server-only`.
- **Component tests:** the new stateful control is tested in the same change.
- **Supabase:** types regenerated before code; the new column is selected through `select-columns.ts`.
- **Do not:** no renames of working names, no TODOs, no `console.log`.

## As built (2026-10-01)

Built as written, with these differences, each from building or from the review below:

- **Where things live.** The control's state is built by `slotsStateOf`
  (`src/features/settings/lib/slots-state.ts`), since a server page cannot call a function exported
  from a client component's file. `SlotChangeOutcome` is defined once, in copy.ts, beside the toast
  it words. `slotCountRefusal` and `slotChangeRefusal` are local to the billing actions.
  `PlanActions` keeps the one Stripe redirect (`follow`) and hands Choose plan to the control.
- **One "charged today" rule.** `chargesToday` (plans.ts) decides `always_invoice` versus
  `create_prorations` for the write and the confirm alike, with a two-cent margin over Stripe's
  €0.50 for its per-line rounding; `STRIPE_MIN_CHARGE_CENTS` stays private to plans.ts.
- **Renewal guards, both sides.** `slotsUnavailable(entitlement, now)` says the renewal is being
  processed once the row's period has run out; the confirm checks the same at the click; the
  request carries the period it was priced on and the action refuses a stale one
  (`SLOTS_PAGE_STALE`).
- **Drift heals itself.** A change refused because Stripe's count differs first writes Stripe's copy
  to the row, so a reload shows the count Stripe holds — this also heals sandbox rows the old model
  left apart from Stripe, so "no re-run is needed" (Deploy order) holds.
- **A made change is reported as made.** A row write that fails after Stripe changed the count is
  `SlotSnapshotError`; the action logs it and answers the outcome, and the webhook writes the row.
- **Words.** `slotsHint` (the room left, or why the stepper goes no lower — never "delete a client"
  at one client), `slotsPendingLower`, `SLOTS_CONTROL`, `SLOTS_NEED_PLAN`, `SLOTS_SOLO`,
  `SLOTS_PAGE_STALE`; a partial restore's toast is worded from the renewal. The plan panel's meter
  says an over-cap count in words for a screen reader.
- **Review (three lenses, each finding checked by a refuter): 19 of 25 confirmed, all fixed.** Of
  the six refuted, one (the charged-today rule computed in two places) was fixed anyway by
  `chargesToday`; five stay as built: no over-slot sentence (the red meter is the agreed signal),
  the delete notice during a failed renewal's grace, the stepper's live region (moved verbatim from
  the generate wizard), one control for both phases (as planned), and no paid case in the header
  and palette tests (copy.test.ts covers the refusal itself).
- **Leftover names allowed by Done means 2:** the webhook test proving `invoice.upcoming` is
  ignored, and `docs/plans/WORKSPACE-DELETION-RESEARCH.md` (history, now with a pointer).

## As built — second review (2026-10-02)

A read-only review of the whole billing implementation (seven areas, every finding checked by a
refuter, then a completeness pass): 84 of 97 findings kept, about 55 once the duplicates were merged.
Fixed:

- **The slot control.** Solo is a phase of its own (`SlotsState` carries no `mode`); `renewsOn` went —
  the renewal is the period's end; the stepper never stops between the slots held and the clients
  held; a tab left open past its period refreshes instead of promising "a few minutes".
- **One decision each.** "No change" is decided once, in `setClientSlots`, before the claim; the
  subscription's item is read once (`slotItemOf`, src/lib/billing/subscription-store.ts) with one
  seconds conversion (`dateFromUnixSeconds`); the SDK's own idempotency key replaces a random one;
  `canCreate` and the 'create' need went (they always equalled `canSpend`); one shortfall sentence
  (`shortfall`) for the 402s, the bells and every Generate control; the absolute Plan & billing URL
  is built once (`planAndBillingUrl`); one agency read (`AGENCY_COLUMNS`) where two lists selected
  the same columns, with `stripe_customer_id` out of the billing keys.
- **Real gaps.** A 3-D Secure request on a slot raise is no longer called a declined card
  (`SLOTS_BANK_CONFIRMATION`; confirming it in the app is the next step); Add client in a workspace
  paused by a failed renewal asks for the card; a solo trial is told its plan covers one business;
  the delete notice says nothing in the over-slot state; the allowance bells ring again for a pool a
  slot raise grew; the Checkout return card never names the previous plan's invoice; the trial's
  grace keeps /generate open for its waiting drafts; "nothing more is charged" was dropped where a
  pending proration can still be collected; a removed co-admin's next request is refused (D18); a
  failed clients read is never cached as "no clients"; a 402 the Sources and client-settings
  screens receive is shown in the server's words; every line of a long invoice reaches its document
  (`invoiceLines`); a credit note names the invoice's date as well as its number.
- **Deleted.** The 402 bodies' unread fields, `withDetail`, `taxPointOf`, `trialLimits`,
  `Spender.clientId`, the pre-20260856 hand delete and both 23503 branches, the unread GET of
  /api/settings/account, `PlanEndControl`'s `className`, TeamTab's solo branch, `createUserRecord`'s
  `agencyId`, the billing strings outside copy.ts, and `sale_documents.refunds` and
  `sale_documents.created_at` (supabase/held/20260866, applied only after the deploy).

## Verified before writing

| Symbol | Where | Exported | On error | Cache | Notes |
|---|---|---|---|---|---|
| `SlotChangeError` | `src/lib/billing/client-slots.ts:33` | yes | — | — | → `SlotChangeError` — moved (was `QuantityChargeError`); |
| `proRataCents` | `src/lib/billing/plans.ts:113` | yes | pure | — | takes a Stripe item — moved; |
| `STRIPE_MIN_CHARGE_CENTS` | `src/lib/billing/plans.ts:72` | private | — | — | 50 — moved; |
| `underQuantityClaim` | `src/lib/billing/client-slots.ts:137` | private | busy → `SlotChangeError` | — | moved; gives way at once, no wait loop |
| `billableQuantity` | `src/lib/billing/plans.ts:56` | yes | pure | — | `max(1, clients)` |
| `PRO_PLAN` | `src/lib/billing/plans.ts:45` | yes | — | — | 2900 cents |
| `TRIAL_BRANDS` | `src/lib/billing/plans.ts:140` | yes | — | — | 3 / 1 |
| `Entitlement` | `src/lib/billing/entitlement.ts:29` | yes | — | — | `brands`, `brandsUnlimited` |
| `entitlementFor` | `src/lib/billing/entitlement.ts:210` | yes | pure | — | paid: uncapped |
| `isPaying` | `src/lib/billing/entitlement.ts:104` | yes | pure | — | pro + active/past_due |
| `hasSubscriptionEnded` | `src/lib/billing/entitlement.ts:136` | yes | pure | — | doc cites the reconcile |
| `noEntitlement` | `src/lib/billing/entitlement.ts:185` | yes | pure | — | brands 0 |
| `paidQuantity` | `src/lib/billing/subscription-store.ts:51` | private | throws | — | max paid count this period |
| `applySubscriptionSnapshot` | `src/lib/billing/subscription-store.ts:126` | yes | throws | busts `'agencies'` `{ expire: 0 }` | period and paid count move only with a paid invoice |
| `setPlanEnding` | `src/lib/billing/subscription-store.ts:196` | yes | throws | via the snapshot | the pattern `setClientSlots` follows |
| `ensureStripeCustomer` | `src/lib/billing/subscription-store.ts:88` | yes | throws | busts `'agencies'` | unchanged |
| `handleEvent` | `src/lib/billing/stripe-events.ts:157` | yes | throws → 500 | — | upcoming shares the invoice case |
| `createCheckoutSession` | `src/lib/billing/checkout.ts:31` | yes | throws | — | no `billing_mode` today |
| `startCheckout` | `src/features/settings/actions/billing-actions.ts:79` | yes | `ActionResult` | cached agency + entitlement | no argument today |
| `setPlanEndingAction` | `src/features/settings/actions/billing-actions.ts:134` | yes | `ActionResult` | uncached `fetchAgencyById` | the pattern for the slot action |
| `adminAuth` | `src/features/settings/actions/billing-actions.ts:46` | private | `BILLING_ADMINS_ONLY` | cached role | reused |
| `createClient` | `src/features/clients/actions/client-actions.ts:49` | yes | `ActionResult` | cached entitlement + agency | |
| `deleteClient` | `src/features/clients/actions/client-actions.ts:141` | yes | `ActionResult`; decrease logged | cached reads after the delete | |
| `recheckBrandCap` | `src/features/clients/actions/client-actions.ts:184` | private | refusal string | — | — moved (was `settleNewClient`); |
| `takeBackClient` | `src/features/clients/lib/provision-client.ts:142` | yes | logs an orphan | — | |
| `unprovisionClient` | `src/features/clients/lib/provision-client.ts:124` | yes | returns the error | — | |
| `addBrandRefusal` | `src/lib/billing/copy.ts:246` | yes | pure | — | paid plan never refused today |
| `brandCapReached` | `src/lib/billing/copy.ts:213` | private | pure | — | trial wording only |
| `PlanGate` | `src/lib/billing/copy.ts:331` | yes | — | — | — moved (was `AddBrandGate`); |
| `addBrandGate` | `src/lib/billing/copy.ts:343` | yes | pure | — | |
| `deleteClientNotice` | `src/lib/billing/copy.ts:356` | yes | pure | — | |
| `slotsSummary` | `src/lib/billing/copy.ts:376` | yes | pure | — | only caller the settings page — moved (was `checkoutSummary`); |
| `cardDeclined` | `src/lib/billing/copy.ts:581` | yes | pure | — | only caller the sync |
| `SLOTS_BUSY` | `src/lib/billing/copy.ts:586` | yes | — | — | only caller the sync — moved (was `QUANTITY_SYNC_BUSY`); |
| `checkoutActivated` | `src/lib/billing/copy.ts:645` | yes | pure | — | `priceCents × brands` |
| `CLIENTS_ADMINS_ONLY` | `src/lib/billing/copy.ts:228` | yes | — | — | |
| `clientRosterRefusal` | `src/lib/billing/copy.ts:236` | yes | pure | — | |
| `cannotSpendNotice` | `src/lib/billing/copy.ts:729` | yes | pure | — | pattern for `slotsUnavailable` |
| `PlanGate` | `src/lib/billing/copy.ts:331` | yes | — | — | same shape as `AddBrandGate` minus `note` — moved (was `GenerateGate`); |
| `generationGate` | `src/lib/billing/post-allowance.ts:93` | yes | pure | — | |
| `AGENCY_BILLING_KEYS` | `src/lib/queries/select-columns.ts:252` | private | — | — | |
| `countClientsByAgency` | `src/lib/queries/db.ts:70` | yes | throws | none | |
| `fetchAgencyById` | `src/lib/queries/db.ts:132` | yes | throws; null on no row | none | |
| `GatedAction` | `src/components/ui/gated-action.tsx:28` | yes | — | — | `note` used only by Add client |
| `ConfirmDialog` | `src/components/ui/confirm-dialog.tsx:28` | yes | — | — | `tone` 'danger' / 'primary' |
| `Stepper` | `src/components/ui/stepper.tsx:18` | yes | — | — | "promote only on a consumer outside generate" — moved; |
| `CountSteppers` | `src/features/generate/components/setup/count-steppers.tsx:42` | yes | — | — | |
| `PlanActions` | `src/features/settings/components/plan-actions.tsx:33` | yes | toast | — | |
| `PlanSection` | `src/features/settings/components/plan-section.tsx:69` | yes | — | — | |
| `PlanEndControl` | `src/features/settings/components/plan-end-control.tsx:27` | yes | toast | relies on the `{ expire: 0 }` re-render | |
| `setPlanEndingSchema` | `src/features/settings/schemas.ts:35` | yes | — | — | |
| `maxDuration` | `src/app/api/billing/webhook/route.ts:11` | yes | — | — | 300 for the claim; 60 before f0b3d2da |
| `refuseBalances` | `src/lib/billing/documents.ts:222` | private | throws | — | refuses a customer credit |


Removed by this change (no longer in `src`): `billedSubscriptionId`, `openSubscriptionId`, `syncSubscriptionQuantity`, `raiseQuantity`, `paidThisPeriod`, `reconcileQuantity`, `addBrandCost`, `CLIENT_NOT_ADDED`.

Stripe, read in the installed SDK and Stripe's docs: `subscription_data.billing_mode.type` is
`'classic' | 'flexible'`, default flexible (`node_modules/stripe/esm/resources/Checkout/Sessions.d.ts:4654`,
`4698`); flexible credit prorations use the original debited amount; a subscription cannot move from
flexible back to classic.

## New things — grep by shape (docs/CLAUDE.md "No duplication")

- **The stepper in `src/components/ui`:** `ls` shows no stepper, counter or number input (action-link,
  avatar, button, card, confirm-dialog, day-cap, discard-toast, form, gated-action, icon-chip, icon,
  image-lightbox, input, listbox, modal, pillar-editor, pillar-mix, section-heading, select, service-row,
  spinner, status-pill, textarea, toast, typed-confirm-dialog, week-preview). Shape (`MinusIcon` + `AddIcon`
  −/+ pair): the generate `Stepper`, and canvas zoom controls (another control). Synonyms (stepper ·
  counter · number input · spinbutton): `flow-stepper.tsx` and `pillar-source-stepper.tsx` are wizard
  progress, not numeric. Result: promote the one that exists.
- **A pro-rata computation:** only `proRataCents` in quantity-sync.ts (removed) — moved.
- **A monthly total:** only `PRO_PLAN.priceCents * entitlement.brands` in `checkoutActivated` — extracted
  as `monthlyCents` for its third use.
- **A second gate type:** `AddBrandGate` / `GenerateGate` — merged.
- **`client_slots`, `setClientSlots`, `slotChange`, `slotsSummary`, `PlanGate`, `brandCap`, `billing_mode`**
  in `src`: none.

## Noted, not changed

- D7 (a member sees a live "Add your first client" on /generate) is not caused by the model; it stays in
  the defect list for its own change.
- D11 (does a declined pro-rata charge leave an open invoice Stripe later collects?) now concerns a
  declined slot raise; `error_if_incomplete` leaves the subscription as it was. The question is unchanged.
- A raise under Stripe's minimum leaves a pending proration; a lower and a raise back in the same period
  can add a second one. Cents, on the renewal invoice.
- A capped paid workspace that reaches `/clients/new` by URL still spends on the site read before
  `createClient` refuses — as the trial does today (`/api/extract/start` is gated for `spend` only).
- Migration 20260861's comment (line 88) names `syncSubscriptionQuantity`, and 20260864's header
  (line 2) says a client delete lowers what the workspace pays; both are applied, and applied
  migrations are not edited.
