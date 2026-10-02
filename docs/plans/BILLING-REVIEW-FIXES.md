# Billing review fixes — plan

**Where this stands (2026-09-27).** Every step is built and reviewed; nothing is committed yet.
What is left is the founder's: the deploy and its migrations (Deploy order, items 3, 5 and 6) and
the hand work (Hand work, near the end). The rest of this file is the record of what was built
and why.

## Context

On 2026-09-24 the whole billing implementation (HEAD e737ab4a, clean tree) was reviewed by eleven
read-only reviewers, each over one slice, plus two completeness rounds. Every finding was then
checked by two independent verifiers (one reproducing it from the code, one trying to refute it)
with a tiebreaker on a split. **117 were confirmed, 5 disproved.** This plan fixes all 117.

It is written from code read in this session, not from the review's text. Every critical and high
finding, and every finding whose fix depends on how the code behaves, was re-read before its step
was designed; the verified table at the end lists what was opened.

**The plan itself was then reviewed the same way.** Fourteen reviewers, one per step plus one across
the whole plan, checked it against the code, and each objection was checked by an independent
verifier. 99 of 103 objections held and are folded in below. A recheck of the revised plan, run the
same way, confirmed 29 of 30 further corrections, also folded in. Among them:

- **A drop that would have locked every workspace:** `billing_updated_at` is still selected by the
  cached agency read.
- **A migration number already taken:** `20260860` exists.
- **An invite backfill that would have trusted the very metadata the security hole is about.**
- **A double settle** in the abandoned-run closer.
- **The paid client count taken from the wrong object:** the subscription instead of the paid
  invoice.
- **A comment gate that cannot see comments above `if`, `for` or a call.**

Sources consulted beside the code:
- the NRA's `docs/n18/dec_audit.xsd`: `art_vat_rate` is an integer from 0 to 100, and `order` is
  required;
- Stripe's SDK docs in `node_modules/stripe`:
  - an immediate cancel stops collecting open invoices (the `cancel` doc in the SDK's Subscriptions resource, line 25);
  - an invoice below the minimum charge carries its amount to the next one (the `amount_due` doc in the SDK's Invoices resource, line 148).

The billing plan itself stays in `docs/plans/BILLING.md`; this is its follow-up.

## Decisions (founder, 2026-09-24)

- **Deleting a client refunds nothing.** The month is paid, so the allowance stays at the clients paid
  for this period until renewal, the price drops at renewal, and re-adding a client within the paid
  count costs nothing.
- **Retention:** a paused workspace keeps its data until an admin deletes it. The legal text changes;
  nothing deletes automatically.
- **Legal pages:** the facts are corrected now (step 13). The lawyer's rewrite stays in Phase 3.
  Contact addresses move to `@kontuur.app`.
- **Setup spend** (analysis, source suggestions, colour capture) stays unmetered. The rate-limit and
  validation gaps are closed.
- **Cancelling a plan whose renewal failed ends it now,** and Stripe then stops collecting the unpaid
  invoice.
- **Prices read "excl. VAT".** Checkout shows the customer's total.
- **PGlite** is added as a dev dependency so the ledger, numbering and backfill SQL is tested for real.

## Deploy order

1. **Migration A**, `supabase/migrations/20260861_billing_review_additive.sql` (new): additive only,
   safe under the running code. Then `npm run db:types`.
2. **The code** (steps 3–14), in one deploy.
3. **Migration B**, `supabase/migrations/20260862_billing_review_cleanup.sql` (new), **promptly after the
   deploy** and before the next 08:00 UTC billing tick. It re-runs the dedup-key backfill for rows the
   old code wrote in the window, then narrows and revokes. Then `npm run db:types`.

   **What happened (2026-09-25):** A and B were both applied before the code, and B locked every
   workspace under the deployed `e737ab4a`. `supabase/migrations/20260863_billing_review_restore.sql`
   restores what that code reads:
   - `billing_updated_at`;
   - `'pro'` for subscribed rows;
   - the name and timezone grant;
   - the trial default, and the signups made without it;
   - an optional `tax_event_at`.

   B's dedup keys and its closed runs stay. Item 3 therefore becomes: after the deploy, apply
   **20260861 again, then 20260862 again, both unchanged**. A's re-run re-creates and runs the
   backfill that B dropped, keying the bells the old code wrote since; B then narrows, revokes and
   drops as written. Both files are re-runnable, and `billing-sql.test.ts` replays exactly this
   history.

   **Step 15 adds one more:** `20260864_clients_delete_admin_only.sql` revokes DELETE on `clients`
   from the tenant roles, so only `deleteClient`'s admin check can remove a client. It is safe on
   either side of the deploy — `deleteClient` has deleted through the service role since a8f2c4cf
   (2026-08-18), the deployed code included — and is applied with the others after it, to keep
   one list. Nothing needs to be applied before the deploy; after it, in order: **20260861,
   20260862, 20260864**. 20260864 changes no generated type.
4. **Migration numbers.** Before writing migration A, check that `20260861` and `20260862` are still
   free (`ls supabase/migrations`). Before writing B, check again that `20260862` is free and that
   `20260861` is A. If either number is taken, move to the next free numbers everywhere this plan uses
   them.
5. **Pending invites.** Pending invites from before the deploy carry their workspace only in user-written
   metadata, which step 12 stops trusting. They are re-sent through the new invite route (hand work,
   `supabase/queries/invites-before-cleanup.sql`). There is no backfill.
6. **Rollback.** Once 20260862 is applied again, the code at e737ab4a no longer runs: it selects
   `billing_updated_at` and writes `plan = 'pro'`, both gone. Rolling the code back means applying
   20260863 first, as on 2026-09-25.

This is the lesson of `20260852`, where a drop shipped beside additions and broke the running code: add
first, deploy, remove last.

## Requests, writes and fields — before → after

Every flow this plan touches, with the requests it makes today (read in the code) and after. A request
is added only where it answers a question no existing request answers. Otherwise an existing result is
reused, or reads are merged.

| Flow | Today | After | Why the difference |
|---|---|---|---|
| Checkout click (`startCheckout`) | 1 cached agency read, client count, customer create (first time), `checkout.sessions.create` | the same, plus `subscriptions.list`, `checkout.sessions.list` (+ `expire` per open session, usually 0), and the price check at most once an hour (`unstable_cache`) | only Stripe knows about a subscription the webhook has not written yet, or an open session in another tab |
| Webhook event (subscription or invoice) | event insert/read-back/finish, `subscriptions.retrieve`, agency read, agency update; a paid invoice adds invoice + tax-rate retrieves, the RPC and delivery | the same. The row read carries 2 more columns in the same request, and the paid quantity comes from the event's own invoice lines (a paid invoice is immutable), so there is no request for it. Only on `started` and `period_paid`: the claim + release (2 writes), a client count, 1 retrieve after the claim, and an update only when the counts differ | the reconcile's retrieve is the read after the lock; the earlier one may be stale by then |
| Add a client, paid | cached reads, count, `retrieve` + `update`, provisioning inserts | cached reads, provisioning, claim + release (2 writes), count, `retrieve`, `update` (0–2) | the claim is what stops two adds mis-billing |
| Add a client, trial | cached reads, count, provisioning | + 1 count after the insert | the race check on the cap |
| Delete a client, paid | count, `retrieve`, `update` | + claim + release | the same claim |
| Dashboard render | cached reads + `readUsage` | + `getCachedOwedImages` (3 queries, cached 30 s) | nothing on the dashboard reads slides or images today (`getCachedReviewQueue` takes 12 rows, no slides) |
| Generate page render | cached reads, `readUsage`, drafts through `fetchEditorialPosts` (4), waiting runs | + owed images for `pending_review` (3); the drafts already loaded are reused | the backlog's pictures compete for the same pool |
| Wizard run start (`generate-stream`) | auth, ownership, idea, engine context, cached entitlement, `consume_usage`, run insert | + `readUsage` + owed images (3); clients come from the request cache | the server enforces the posts rule, not only the browser |
| Wizard run end | none | 1 `router.refresh()` at the end of a run, and after New run's deletes settle | the stepper must show the new counts |
| Generate cron tick | brief, schedules, context (3), `readUsage` × N agencies, recent runs | `readUsage` × N becomes **1**; one runs read serves both the dedup and the closer; owed images (clients + 3) only when a client is due; the closer writes only when a stale run exists | N reads merged; no second runs read |
| Visuals cron tick | claims sweep, entitled (2), backlog + images, `readUsage` × N | usage in **1** query; backlog pages as needed; the bell count comes from rows already read | N reads merged |
| Billing cron tick | reminders, document retry, reset | the same queries, reordered; the retry delivers every stale document, oldest first, until the cron's deadline | — |
| Document delivery | render, upload, send, 1 stamp | render once and upload, stamp `storage_path`, send, stamp `delivered_at`; a retry downloads the stored PDF instead of rendering | the second stamp is what makes the retry resend identical bytes |
| A keyed bell (`notify`) | cooldown select + insert (2) | 1 upsert | fewer |
| Invite (route) | admin check, members, agency name, `inviteUserByEmail` | + `pending_invite_for_email`, a probe (`generateLink`, no email), the invite row write, and one read of that row after the send (`inviteMember`) | the invite becomes a server row, bound only to a login this workspace's invite created |
| Join from an invite (`createUserRecord`) | existing-row check, insert | + invite lookup + accept stamp | — |
| Remove a member / delete a workspace | as today | + the invite-row delete / + the pending-invites read inside the existing `Promise.all` | — |
| Capture (`captureSite`) | navigation | + `validateSourceUrl` on the typed address; every connection then goes through a local egress proxy that resolves and checks each host once, at connect time | SSRF guard |
| Analytics narrative | the page and the report action each read the entitlement for `canNarrate` | the gate moves into `guardNarrative`, whose read is the callers' own through the request cache; the two call-site checks go | — |

**Fields.** No new column copies a fact another column already holds:

- **`notifications.dedup_key`:** the event's identity. The message text cannot serve, because it
  varies with the timezone.
- **`generation_runs.period_key`:** the period the reservation was taken in. The entitlement at settle
  time can name another.
- **`agencies.quantity_sync_at`:** a lock, not a fact.
- **`sale_documents.tax_event_at`:** the tax point. `issued_at` becomes the document date, and a
  Bulgarian invoice carries both.
- **`team_invites`:** replaces invite data that lived in user-writable metadata. It has no email
  column, because the address is `auth.users`'.
- **Dropped:** `agencies.billing_updated_at`, which was write-only.
- **Narrowed:** `agencies.plan` now holds only what nothing else says (house).
- **Type changes, with no new fact:** `vat_rate` and `cost_eur_cents`.

**Operations.** Each new write is one function with one `docs/OPERATIONS.md` row:
- `cancelPlanNow`;
- `closeAbandonedRuns`;
- `unprovisionClient`;
- the quantity claim;
- invite create, resend and accept;
- invite rows removed with a member;
- a keyed notify.

The moved writers (the event log and the paint loop) keep one function each.

## Steps

Each step names the findings it closes. Before any change:
- every file the step touches is read in full;
- every changed signature has its callers listed, file:line, each with a decision;
- every new helper gets the three-part survey (docs/CLAUDE.md §1, §3).

`npm run check` runs after every step, and the step order is set so it can pass. It is not the success
criterion: the named tests and the observed runs are.

### 0. The plan in the repo
Copy this file to `docs/plans/BILLING-REVIEW-FIXES.md` (new).
→ verify: `npm run plan:check -- docs/plans/BILLING-REVIEW-FIXES.md` green.

### 1. Migration A — additive

- **`notifications.dedup_key text`.**
  - First, backfill keys on the legacy billing rows, so the first keyed insert after the deploy
    conflicts with them. The keys use the formats in step 11:
    - `trial_ending`, `trial_ended`, `workspace_paused` → `<type>:<UTC date of agencies.trial_ends_at>`;
    - `payment_failed` → `payment_failed:<UTC date of past_due_since>`.
  - The statement is one function, `billing_backfill_dedup_keys()`, called here and once more by B,
    which then drops it, so the two runs cannot drift apart. (Since the restore, the second call
    comes from re-applying this file after the deploy; Deploy order, item 3.) Three guards make B's call idempotent
    and safe against rows keyed by A or by the new code:
    - it updates only rows with `dedup_key is null` and a billing type;
    - it keys only a row sent inside the current event's own window, so a reminder about an earlier
      trial end or past-due episode never silences the one still to come:
      - `trial_ending` from `trial_ends_at − 3 days`, where `shellNotice` starts (`TRIAL_NOTICE_DAYS`);
      - `trial_ended` from `trial_ends_at`;
      - `workspace_paused` from `trial_ends_at + GRACE_DAYS`;
      - `payment_failed` from `past_due_since`;
    - it excludes any row whose computed key already exists for that agency (`not exists (select 1
      from notifications o where o.agency_id = n.agency_id and o.dedup_key = <computed key>)`).
  - Of the rows that pass, only the newest per (agency, type) takes the key
    (`row_number() over (partition by agency_id, type order by created_at desc) = 1`), so rows the old
    race already duplicated cannot break the index.
  - Then a plain unique index on `(agency_id, dedup_key)`. It must stay non-partial: PostgREST's
    `on_conflict` inference needs a plain unique index, and NULLs never conflict, so every unkeyed
    insert is untouched.
- **`generation_runs.period_key text`:** the allowance period a run's drafts were reserved in (step 6).
- **`agencies.quantity_sync_at timestamptz`:** the short per-workspace claim around a Stripe quantity
  write (step 4). It is a lock, not a fact.
- **`sale_documents`:**
  - `vat_rate` becomes `numeric(5,2)`.
  - `tax_event_at timestamptz` is added and backfilled from `issued_at`.
- **`issue_sale_document` re-created:**
  - It takes `pg_advisory_xact_lock(hashtext(kind || ':' || stripe id))`, then does one lookup, then
    takes the number.
  - `issued_at` is `clock_timestamp()`, read straight after the counter's `update … returning`. The
    counter row lock is held until commit, so a later number never gets an earlier date. `now()`
    would be the transaction start, before the lock wait.
  - `tax_event_at` is `coalesce(p->>'tax_event_at', p->>'issued_at')`. The old code sends the paid
    date as `issued_at` in the window; there is no third fallback, because a guessed tax point is
    worse than a refused insert once B sets the column NOT NULL.
  - `vat_rate` is cast to numeric.
  - The unique-violation handler and its duplicated lookup go.
  - The function's doc says why it uses `clock_timestamp`. Grants are unchanged.
- **`ai_usage_daily.cost_eur_cents`** becomes `numeric(14,4)`; `add_ai_usage` is dropped and
  re-created with a numeric cost, grants as before (step 6).
- **`usage_counters`:** `reserved_at = now() - interval '1 day'` where `pending > 0 and reserved_at is
  null`, so the next daily reset releases what was stranded before `20260858`.
- **`team_invites` (new table):**

  | Column | Definition |
  |---|---|
  | `id` | |
  | `agency_id` | references agencies, on delete cascade |
  | `role` | CHECK `'admin','member'` |
  | `auth_user_id` | `uuid not null`, references `auth.users(id)` on delete cascade, so removing a login never blocks `deleteUser` |
  | `invited_by` | `uuid`, references `public.users(id)` on delete set null |
  | `created_at` | |
  | `accepted_at` | |

  - There is no `email` column: the address lives in `auth.users`, so storing it would be a second
    copy. The one question that needs an address is "does this address already hold a pending
    invite?", before an invite is sent.
  - That question is answered by `pending_invite_for_email(p_email text)` (new), a SECURITY DEFINER
    function that joins `team_invites` to `auth.users` on the lower-cased email. It is executable by
    the service role only, and it is one request. PostgREST cannot read the `auth` schema, and the
    admin API has no lookup by email (`listUsers` takes only paging, per
    `@supabase/auth-js`'s `GoTrueAdminApi`).
  - A unique pending index on `auth_user_id where accepted_at is null`.
  - RLS on and no policy (a `POLICYLESS` entry in `src/app/__tests__/rls-policies.test.ts:55` with its
    reason); revoked from anon and authenticated.
- **No invite backfill.** `team_invites` starts empty, and only the new invite route writes it. No
  metadata test can separate a server-sent invite from a forged one: sign-up writes metadata before
  any session exists, and nothing proves Supabase replaces metadata on a later re-invite. Pending
  invites are re-sent instead (Deploy order, item 5).
- **`users.role`:** CHECK `('admin','member')`, behind a DO block that raises on any other value.
- **Header:** one line correcting `20260855`'s header ("every paid invoice") by reference: only paid
  invoices of subscriptions this app created become documents. Applied migrations are not edited.
- `notify pgrst, 'reload schema'`.

→ verify: step 7's PGlite test applies the file. Types regenerate and compile.

### 2. Migration B — after the code, promptly

- **The window's backfill first:** call `billing_backfill_dedup_keys()` again, then drop it. Its
  guards make the second call idempotent.
- **`plan`:** `update agencies set plan = 'trial' where plan = 'pro'`, then CHECK `('trial','house')`.
  Paid is read from the subscription after step 3.
- **Name and timezone:** `revoke update (name, timezone) on agencies from authenticated`. The settings
  PUT writes through the admin client after step 12.
- **Trial length:** drop the default on `trial_ends_at`. `createUserRecord` writes it (step 10).
- **`billing_updated_at`:** drop it. Step 3 removes it from both the snapshot write and the
  `AGENCY_KEYS` select, and they ship in the deploy before this.
- **`sale_documents.tax_event_at`:** set `not null`. `issue_sale_document` is not re-created: a
  second copy of its body here would be two definitions of the one writer. Its `issued_at` term
  stays; the deployed code never sends that key, and a payload with neither key now fails on the
  insert.
- **`generation_runs`:** once, `status = 'failed'` for runs still `running` from more than a day ago.
  The closer reads only the last 26 h, and such runs hold nothing: their reservations were released
  by earlier daily resets.
- **Preconditions before applying:**
  - `grep -rn billing_updated_at src --exclude-dir=__tests__` finds only `src/types/database.ts`;
  - production is on the deployed commit;
  - the read-only query `supabase/queries/invites-before-cleanup.sql` has been run.

  The query lists every auth user with `raw_user_meta_data ? 'invited_agency_id'` and no `users`
  row, whatever `invited_at` or `last_sign_in_at` say. That set holds:
  - pending invitees of the old route;
  - forged signups;
  - members an admin removed whose login survived a failed `deleteAuthIdentity`.

  The founder confirms each row with that workspace's admin, then:
  - an unconfirmed invitee the admin still wants is invited again from Settings → Team (the invite
    takes the old login back and makes a new one, `inviteMember`);
  - a signed-in or confirmed login the admin still wants is deleted, then re-invited;
  - a row no admin vouches for is deleted.

  Nobody is re-invited without the admin's word (hand work).

→ verify: PGlite applies A then B. Afterwards the writers, row-mirrors and RLS tests are green.

### 3. One reading of "an open subscription", and the Stripe lifecycle

Closes:
- **m1-0:** a second Checkout while a subscription is open.
- **m1-1:** a locked workspace with an open subscription can neither cancel nor delete.
- **m1-38:** no tests for either.
- **m1-2:** re-subscribing keeps the old period.
- **m1-3:** any paid invoice advances the period and clears `past_due_since`.
- **m1-98:** `past_due_since` is stamped when the subscription stays active.
- **m1-94:** a house plan is overwritten.
- **m1-23:** the `billing_updated_at` half.
- **m1-33:** a past reset date during `past_due`.
- **m1-35:** the `'max'` tag bust.
- **m1-62:** cancelling a failed-renewal plan still gets charged.
- **m1-9:** the portal docs contradict each other.
- **m1-31:** the paying rule is restated, and the quantity floor is computed twice.
- **m1-28:** the price is stated twice, with a €19 comment.

- **`src/lib/billing/entitlement.ts`.** Each new field is computed once and documented with its rule.
  - `subscriptionOpen`: a stored id, and a status neither `canceled` nor `incomplete_expired`.
  - `paymentFailed`: `subscriptionOpen` and a status of `past_due` or `unpaid`. It holds inside the
    grace and after it, when the state is `locked`. Every "the renewal failed" decision reads this,
    never `state === 'past_due'`.
  - `canDelete = !subscriptionOpen || cancel_at_period_end`, set in every literal builder, house
    included.
  - The house literal also takes `endsOn: row.cancel_at_period_end ? current_period_end : null`, so
    `PlanEndControl` turns into Keep plan after a house cancel; the page derives `ending` from `endsOn`.
  - The plan is derived: `'house'` when the row says so; otherwise `'pro'` with a subscription id,
    `'trial'` without. `isPlanId` and the paid branch's `plan === 'trial'` lock go.
  - `past_due` returns `resetsOn: null`.
  - `isPaying`'s doc names its real askers: the checkout return and `billedSubscriptionId`.
- **`src/lib/billing/copy.ts`, `cannotSpendNotice(entitlement)` (new).** The one answer to "why can
  this workspace not spend". Null when `canSpend`; otherwise `{ text, cta }`:
  - `trial_grace`: `shellNotice`'s own trial-grace sentence, from one private helper both use
    (`trialEndedSentence`), with cta "Choose a plan". There is no second wording.
  - `paymentFailed`: the payment failed; update the card in Plan & billing (cta "Update your card").
  - Otherwise: `WORKSPACE_LOCKED` (cta "Choose a plan").

  Callers:
  - `BillingWall`: the layout passes `entitlement.state === 'locked' ? cannotSpendNotice(entitlement)
    : null` in place of `locked`, so the trial grace and the payment grace keep their pages. The wall
    shows only when locked.
  - `requireEntitledRoute` and `requireEntitledAction` (`src/lib/billing/require-entitled.ts`), as the
    `error` in place of the bare `WORKSPACE_LOCKED`.
  - `generationRefusal` (step 9) and `PlanSection` (step 10).
- **The rest of copy.ts:**
  - `wayForward` reads `paymentFailed`: "Update your card in Plan & billing to continue".
  - `cancelPlanConsequence` on `paymentFailed` says the plan ends now, the failed payment is not
    collected, and the workspace pauses with everything kept.
  - For house with an open subscription it says only that billing stops.
  - `deleteWorkspaceRefusal` widens its Pick to `paymentFailed`. With it set, the sentence is: "Cancel
    your plan first, under Plan & billing. It ends at once and the failed payment is not collected;
    you can delete the workspace right after." It drops "You keep access until it ends". Its callers
    already pass a full entitlement.
- **`src/lib/billing/subscription-store.ts`, `applySubscriptionSnapshot`.**
  - **Its signature** gains `paidInvoice?: Stripe.Invoice`. The trigger becomes
    `'subscription' | 'period_paid' | 'charge_paid' | 'invoice_failed'`. The webhook maps a paid
    invoice's `billing_reason` of `subscription_create` or `subscription_cycle` to `period_paid`, any
    other paid invoice to `charge_paid`, and passes the invoice object.
  - **`AGENCY_SNAPSHOT_COLUMNS`** becomes `stripe_subscription_id, subscription_status,
    subscription_quantity, past_due_since`.
  - **Ownership:**
    - the snapshot takes the row when the stored id is null, equals the incoming id, or the stored
      subscription has ended (stored status `canceled` or `incomplete_expired`);
    - a different subscription while the stored one is open is outcome `conflict`: logged with both
      ids, nothing written;
    - the created trigger no longer grants ownership, so event order no longer matters (m1-2).
  - **A new subscription** (stored id null or different) is a first fill: the period from its item,
    `subscription_quantity = item.quantity`, `past_due_since = null`, outcome `started`.
  - **The period** otherwise moves only on `period_paid`.
  - **`subscription_quantity` means "clients paid for this period"**, read from the paid invoice's
    lines. A line's item is `line.parent.subscription_item_details`; it has `subscription_item` and
    `proration` (`node_modules/stripe/esm/resources/InvoiceLineItems.d.ts`).
    - `period_paid`: the quantity of the non-proration line for the subscription's item.
    - `charge_paid`: `max(stored, the largest quantity on a positive proration line for that item)`.
      A 3→4 `always_invoice` bills −3 and +4, so this gives 4.
    - Other triggers leave it. When no line is found, it stays as stored.
  - **`past_due_since`** on every owned snapshot: `status === 'past_due' ? (stored ?? now) : null`.
  - **No longer written:** `plan` and `billing_updated_at`. `'billing_updated_at'` also leaves
    `AGENCY_KEYS` (`src/lib/queries/select-columns.ts`), so the deployed code neither writes nor
    selects the column before migration B drops it.
  - **Tag bust:** `revalidateTag('agencies', { expire: 0 })`, here and in `ensureStripeCustomer`.
  - **`cancelPlanNow(admin, subscriptionId)` (new):** `subscriptions.cancel`, then the snapshot.
- **`src/features/settings/actions/billing-actions.ts`:**
  - **`startCheckout`:**
    - keeps its one cached read (`getCachedAgency` and `getCachedEntitlement` share it). The
      snapshot's `{ expire: 0 }` bust makes the next read the new row, so no uncached read is added;
    - refuses house, or `subscriptionOpen`;
    - the quantity is `billableQuantity(clientCount)` (new, `src/lib/billing/plans.ts`), shared with
      `checkoutSummary`;
    - its doc changes: the portal no longer cancels.
  - **`setPlanEndingAction`:** `ending` with `paymentFailed` goes to `cancelPlanNow`; otherwise
    `setPlanEnding`.
- **`src/lib/billing/checkout.ts`, before a session:**
  - List the customer's subscriptions (the default list excludes cancelled ones; `incomplete_expired`
    is filtered here). An open one refuses with `PLAN_ACTIVATING`: "Your plan is being activated — it
    appears here in a few seconds." This covers the webhook lag and a second tab.
  - Expire the customer's open sessions (`checkout.sessions.list({ customer, status: 'open' })`, then
    `expire`), so only one session per customer can be paid.
  - Refuse unless the price is `eur`, monthly and equal to `PRO_PLAN.priceCents`. The price is read
    through `verifiedPrice()` (new, `src/lib/billing/stripe.ts`), which wraps `prices.retrieve` in
    `unstable_cache` for an hour: at most one Stripe read per hour, not one per click.
  - The `stripePriceId` doc loses "€19".
- **`src/features/settings/components/plan-actions.tsx`:** props are `plan`, `subscriptionOpen`,
  `ending`, `summary`, `cancelConsequence`, and it checks `subscriptionOpen` first.
  - An open subscription, whatever the plan (house and locked included), shows `PlanEndControl` and
    Manage billing.
  - House with no subscription shows nothing.
  - Everything else shows Choose plan.
  - The doc of the `summary` prop cites `checkoutSummary` rather than quoting it.
  - The component doc is rewritten for these branches.
  - The `ending` prop doc becomes "whether the open subscription is already set to end
    (`Entitlement.endsOn`)".
- **The portal is for card, address and tax ID only.** The docs of `createPortalSession`,
  `openBillingPortal`, `subscription-store.ts` and `workspace-actions.ts` say so, and cancel-in-portal
  is switched off by hand. Terms §6 states the same cancel rule (step 13).

→ verify:
- **`entitlement.test.ts`:**
  - `subscriptionOpen` and `paymentFailed` per status (`past_due` after 9 days is `locked` with
    `paymentFailed`; `unpaid` too);
  - the derived plan;
  - house with an open subscription: `canDelete` false, `endsOn` null, plan stays house; the same row
    with `cancel_at_period_end` gives `canDelete` true and `endsOn` = the period end;
  - `past_due` `resetsOn` null.
- **`subscription-store.test.ts`:**
  - an ended subscription followed by a new one, in either event order;
  - a conflict while the stored subscription is open;
  - the period moves only on `period_paid`;
  - an invoice line of 3 against a re-fetched 2 stores 3;
  - −3/+4 proration lines store 4;
  - `past_due_since` follows the status;
  - house untouched;
  - the stored status and quantity are read.
- **`billing-actions.test.ts`:**
  - locked-with-open refused;
  - a subscription listed by Stripe refused;
  - open sessions expired;
  - a price mismatch refused;
  - locked with `paymentFailed` goes to `cancelPlanNow`.
- **`plan-actions.test.tsx`:** locked-with-open and house-with-open show Cancel and Manage billing.
- **`require-entitled.test.ts`:** a payment-failed sentence for locked-with-open; a trial-ended
  sentence for `trial_grace`.
- **`billing-shell.test.tsx`:**
  - the wall shows "Update your card" for locked-with-open;
  - a `trial_grace` entitlement renders the page, not the wall.
- **`copy.test.ts`:**
  - `cannotSpendNotice` per state;
  - in the trial grace its text equals `shellNotice`'s;
  - `deleteWorkspaceRefusal` with `paymentFailed` has no "keep access";
  - without it the current text stands;
  - `canDelete` gives null.
- **`webhook.test.ts`:** `billing_reason` maps to the trigger; the invoice reaches the snapshot.
- **Observed run in test mode:** after a failing card and 9 days, Cancel and Manage billing show;
  Cancel ends the plan and no charge follows.

**As built (2026-09-26).** The step shipped with these differences from the text above, each
from a verified review finding or a gap found while building:

- **One function ends a plan.** `cancelPlanNow` is folded into `setPlanEnding`
  (`src/lib/billing/subscription-store.ts`). It decides on Stripe's live status: `past_due` or
  `unpaid` (`hasPaymentFailed`, `src/lib/billing/entitlement.ts`) cancels at once, and anything else
  sets `cancel_at_period_end`. A delayed webhook can therefore never turn "cancel now" into "cancel
  at the period end". It returns `{ endedNow }`, which `setPlanEndingAction` passes through for the
  toast. The cancel click costs one extra `subscriptions.retrieve`, and there is one operations row.
- **`planEnding` joins the entitlement:** an open subscription set to end whose renewal has not
  failed.
  - `canDelete = !subscriptionOpen || planEnding`.
  - `endsOn` is set on the paid branch only, and only while `planEnding`, so a house workspace never
    names an end. The house `endsOn` of the text above is dropped; the panel reads `planEnding`
    instead.
  - A failed renewal already set to end can still be cancelled (at once).
- **The snapshot takes `(admin, subscription, paidInvoice?)` with no trigger.** A failed invoice
  writes what a subscription event writes, now that `past_due_since` follows the status.
  - The period moves when the paid invoice bills the item for the current period on a
    non-proration line (`paysCurrentPeriod`), so a late or repeated earlier-period invoice moves
    nothing.
  - The paid count is recomputed on every paid invoice from `invoices.list({ subscription, status:
    'paid', created ≥ period start })` (`paidQuantity`). It is the highest count on a current-period
    line: the period's own line, or a positive proration. The result is the same whatever order
    invoices are paid and delivered in, at one request per paid invoice.
  - A different open subscription re-fetches the stored one before calling it a `conflict`, and the
    conflict's two ids go to the webhook's single log line.
- **Checkout** runs in this order:
  1. the price check and the open-session list;
  2. `expire` each session, tolerating one that completed meanwhile;
  3. the subscription list;
  4. the session.

  A tab that paid in between is found as its subscription instead of throwing. The price guard is
  named `verifiedPriceId` and returns the id.
- **The wall's rule** ("only `locked` is walled") is `pausedNotice` in copy.ts, and is tested.
- **`PlanEndControl` no longer calls `router.refresh()`.** The `{ expire: 0 }` bust already
  re-renders the page into the action's response (Next 16.2.1,
  `node_modules/next/dist/server/web/spec-extension/revalidate.js`).
- **Test billing rows** come from one `src/lib/billing/__tests__/fixtures.ts`.

### 4. Clients paid for the period

> Superseded by docs/plans/CLIENT-SLOTS.md (2026-09-30): the admin chooses the client slots in Plan & billing; creating or deleting a client no longer changes the Stripe quantity.

Closes:
- **m1-4:** deleting shrinks the pool at once, and re-adding charges again.
- **m1-6:** the create race.
- **m1-61:** the Checkout quantity is never reconciled.
- **m1-63:** raw SDK text on the form.
- **m1-64:** `provisionClient`'s doc is false.
- **m1-32:** the Add client entry points skip the cap and the price.

- **`src/lib/billing/quantity-sync.ts`, `syncSubscriptionQuantity(subscriptionId, count, paid,
  direction)`.** It reads Stripe's current quantity `q` from the retrieve and decides the proration
  itself. `'credit'` is deleted.
  - **`'increase'`** (create, reconcile up):
    - If `count ≤ q`, write nothing.
    - If `q < paid`, first raise to `min(paid, count)` with `'none'`.
    - Then, if `count > max(q, paid)`, charge only the part above that. This is `always_invoice` +
      `error_if_incomplete`, unless the pro-rata amount (the item's `unit_amount` × units × the
      remaining share of the item's period) is under Stripe's minimum charge. In that case it is
      `create_prorations`, so the line lands on the renewal invoice rather than being carried to the
      customer's balance. The minimum is one named constant, `STRIPE_MIN_CHARGE_CENTS` (€0.50,
      Stripe's EUR minimum — the one external fact in this rule, confirmed in the Dashboard; hand
      work).
  - **`'decrease'`** (delete, reconcile down): only when `count < q`, with `'none'`. It never charges.
  - **Errors:** every Stripe failure on the increase path, `retrieve` included, becomes
    `QuantityChargeError`.
  - **Serialised per workspace.** The retrieve → update pair runs under a short claim on the agencies
    row, `agencies.quantity_sync_at` (migration A). The claim is a compare-and-set:
    `update … set quantity_sync_at = now() where id = $1 and (quantity_sync_at is null or
    quantity_sync_at < now() - interval '30 seconds') returning id`. It is the same compare-and-set
    shape `claimPublication` uses (`src/features/publishing/lib/publication-store.ts`), and it is
    released by setting null in a `finally`.
    - Without the claim, two creates that both retrieve before either writes let the stale one lower
      the quantity with `always_invoice`. That books a credit to the customer's balance, which step 5
      then refuses to document.
    - A busy claim is retried a few times, about a second apart, and then refused with
      `QUANTITY_SYNC_BUSY` from copy.ts: "Another change to your plan is in progress. Try again in a
      moment." On the create path the client is undone like a decline.
    - `quantity-sync.ts` is the one writer of that column, with a registry reason.
  - **The docs** of `syncSubscriptionQuantity` and `deleteClient` say which path heals which miss:
    - adds raise the quantity;
    - decreases lower it;
    - the webhook's `period_paid` down-reconcile lowers any over-count left behind.
- **`reconcileSubscriptionQuantity(admin, agencyId, subscriptionId, paid, direction)` (new).** It has
  no rule of its own: it counts the clients and calls `syncSubscriptionQuantity`, which takes the
  claim and then retrieves. That retrieve is the one read taken after the lock; the webhook's own
  retrieve came before the claim and could be stale by then, so it is not reused. `paid` is the
  quantity the snapshot just wrote. The webhook calls it:
  - on outcome `started`, in both directions (the call and its test move here from step 3);
  - after every owned `period_paid` snapshot, down only, so a missed decrease is lowered by the next
    paid period at the latest.

  A failure is logged. An under-count is healed by the next add; an over-count by the next
  `period_paid`. There is no new OPERATIONS row: the operation is still `syncSubscriptionQuantity`.
- **`src/features/clients/actions/client-actions.ts`.** Both actions keep their cached entitlement
  and agency reads. The snapshot busts `'agencies'` with `{ expire: 0 }` (step 3), so the paid count
  they read is the one the last webhook wrote.
  - **`createClient`:**
    - Checks the cap, then runs `provisionClient` first.
    - On a paid workspace it re-counts under the claim and runs the increase sync against
      `entitlement.brands`. The claim makes the count and the write one step, so concurrent creates
      end at the true count.
    - On a `QuantityChargeError` (decline, connection, rate limit), it removes the new client through
      `unprovisionClient`, runs a best-effort decrease sync with the fresh count (logged only), and
      returns the error's own sentence.
    - Any other sync error keeps the client, is logged under `[clients:create]`, and answers ok. It
      never returns an SDK message.
    - On a capped plan, a re-count above the cap removes this client and refuses with the cap
      sentence. Two racing creates both give way and a retry succeeds; the cap is never exceeded.
  - **`deleteClient`:** the decrease sync.
- **`src/features/clients/lib/provision-client.ts`:**
  - `unprovisionClient(admin, clientId, agencyId)` (new): the one delete of a client row, used by
    `provisionClient`'s rollback, `createClient`'s undo and `deleteClient`.
  - The doc says the caller passes the admin client and its own agency id.
  - The `created` cast goes.
- **`addBrandCost(entitlement, clientCount)`.**
  - Null on trial or house, or when the workspace cannot create.
  - When `clientCount < entitlement.brands`: "Already paid for this period; adds €29 a month excl.
    VAT from renewal."
  - Otherwise the pro-rata sentence, excl. VAT.
  - Its doc cites the sync's `count ≤ paid` rule.
- **Add client everywhere.** The pair `{ refusal: addBrandRefusal(…), note: addBrandCost(…) }` is
  computed once per page with the agency's client count.
  - **The clients page** (existing).
  - **The dashboard page:**
    - `DashboardHeader`;
    - `QuickActionsStrip`;
    - `ClientCoverage`, disabled with the reason.
  - **The (dashboard) layout** passes it to `ShellProvider` (`src/components/layout/shell-context.tsx`),
    which forwards it to `CommandPalette` (`src/components/layout/command-palette.tsx`):
    - `PaletteEntry` gains an optional `refusal`;
    - a refused Add client renders `aria-disabled` with the sentence as its hint;
    - `navigateTo` does nothing for a refused entry, on click or Enter;
    - a paid workspace's hint shows the note.
    - The layout already holds the cached entitlement and client list, so this adds no read.
    - The palette's "Generate posts" entry stays a plain link, like the sidebar's row
      (`docs/plans/BILLING.md` step 14: `/generate` is where waiting drafts live). Gating it would
      mean a usage read in the layout, which renders on every page.
- **The (onboarding) layout:**
  - keeps its `canCreate` → Plan & billing redirect first;
  - then reads `getCachedAgencyClients` (the same cached count the (dashboard) gate uses, so the two
    cannot loop);
  - redirects to `/clients` when `addBrandRefusal` refuses.

→ verify:
- **`quantity-sync.test.ts`:**
  - increase with `count ≤ q` writes nothing;
  - `q < paid` gives two updates;
  - decrease never uses `always_invoice`;
  - a tiny pro-rata amount uses `create_prorations`;
  - a `retrieve` failure gives `QuantityChargeError`.
- **`client-actions.test.ts`:**
  - insert, then charge;
  - a decline unprovisions and re-syncs;
  - a re-add within paid charges nothing;
  - a non-charge sync error keeps the client with no SDK text;
  - with two creates, the second waits for the claim and the final quantity is the true count, with
    no update carrying a quantity below Stripe's `q` at that moment;
  - a claim still busy after the retries refuses with `QUANTITY_SYNC_BUSY` and undoes the client;
  - a re-count above the cap refuses.
- **`copy.test.ts`:** `addBrandCost` both branches and the boundary.
- **`command-palette.test.tsx`:** a refused entry does not navigate and shows the reason.
- **The onboarding layout:** `!canCreate` goes to Plan & billing; an agency at its cap goes to
  `/clients`; a solo with 0 clients stays.
- **`webhook.test.ts`:**
  - on `started`, the sync is called with paid = the item quantity;
  - `period_paid` calls the reconcile down only.
- **The reconcile test:** a failed down-reconcile at `started`, then a later add with `count ≤ q`
  writes nothing, and the next `period_paid` lowers the quantity with `'none'`.
- **Observed runs in test mode:**
  - 3 paid, delete 1: allowance still 3×; add 1: no invoice; add another: one pro-rata line.
  - A renewal fails for 4 clients, 1 is deleted in the grace, and the retry is paid: the allowance is
    still 4×.

**As built (2026-09-26).** The step shipped with these differences from the text above, each
from a verified review finding or a gap found while building:

- **One sync, no separate reconcile function.** The signature is
  `syncSubscriptionQuantity(admin, agencyId, subscriptionId, change)`. The change names the
  direction and, for an increase, `paid` with `paidFor`: the period start that count was paid for.
  The webhook's private `reconcileQuantity` (`src/app/api/billing/webhook/route.ts`) builds the
  change and calls the sync, which counts the clients under its claim.
- **The paid count holds only for its own period.** `paidFor` must equal the Stripe item's
  `current_period_start`, otherwise nothing is restored uncharged. Stripe moves its period at
  renewal before the renewal is paid, so a client re-added during a failed renewal's grace, or
  before a late `invoice.paid` arrives, is charged. `addBrandCost` says "Already paid" only while
  `resetsOn` is still ahead.
- **The claim outlasts the work it guards.**
  - Every Stripe request under it is bounded: 10 s a try and one retry.
  - The claim goes stale after 70 s.
  - A waiting change waits until the claim frees or goes stale, instead of giving way after 2 s.
    The holder counts the waiting create's row and may already have charged for it.
  - `QUANTITY_SYNC_BUSY` now means a claim that never came free.
- **`QuantityChargeError` keeps Stripe's error as its `cause`,** which the `[clients:create]` log
  prints.
- **The (onboarding) layout does not check the cap.** A save re-renders the layout into the
  action's response, so the cap redirect pulled a solo trial out of setup right after its first
  save.
  - Every Add-client control is refused at the cap (`addBrandGate`), and `createClient` refuses a
    form reached by URL.
  - A refusal on the form before it is filled would need a mock, since it is outside the
    dashboard, so it is left out.
- **One exported type for the pair.** `addBrandGate` returns the `{ refusal, note }` pair as the
  exported type `AddBrandGate`, and every Add-client control takes it. `GatedAction` gains a
  `variant`, so the dashboard header's Add client sits beside Generate posts as a secondary action.
- **Where the tests live.** The busy, serialisation and heal-path tests are in
  `quantity-sync.test.ts`. The onboarding test pins that the layout never reads the client count.

### 5. Documents: invoices, credit notes, the audit file

Closes:
- **m1-21:** 25.5 % is rounded.
- **m1-66:** a partial refund is reported as a full one.
- **m2-6:** balance and out-of-band notes.
- **m2-7:** chargebacks.
- **m1-67:** balance-paid invoices.
- **m1-92:** number order and date order.
- **m1-65:** a refunds-only month.
- **m1-70:** `r_ord`.
- **m1-71:** the domestic 20 % is hard-coded.
- **m1-68:** the doc and the silent drop.
- **m1-69:** the idempotency claim.
- **m1-73:** the email to documents with no workspace.
- **m1-74:** a signing error takes down Settings.
- **m1-107:** the failure write is unchecked.
- **m1-108:** the audit route's boundary.
- **m1-22:** repeated values.
- **m1-30:** `isoFromUnix` and the RPC's duplicated lookup.
- **m1-72:** the sale-document reads in the shared `db.ts`.
- **m1-23:** the credit-note half.

- **`src/lib/billing/documents.ts`.**
  - **`chargedMoney(invoice)` (new, exported):** `invoice.amount_paid > 0`. This is the one €0 rule. The
    webhook's inline copy is deleted, and both `issueSaleDocument` and the webhook's
    `undocumented_sale` branch call it.
  - **`issueSaleDocument`**, in this order:
    1. Throw, naming the field, when `starting_balance < 0` (a customer credit paid part or all),
       `starting_balance > 0` (a carried debt) or `pre_payment_credit_notes_amount > 0`. These run
       before any null return, so an invoice paid wholly from a balance throws; it is not skipped.
    2. Return null when `!chargedMoney(invoice)`. With the balance fields at 0 this is a €0 invoice.
    3. Throw when `amount_paid !== total`, naming both.
    4. Otherwise issue for `total`: the exact `rate.percentage`, and `tax_event_at = paid_at`. The RPC
       stamps `issued_at`.
  - **`vatBasisOf`:** only `standard_rated` maps to `domestic`/`oss`; `reduced_rated` throws.
  - **`issueCreditNote`** accepts exactly two shapes and throws on anything else:
    - (a) one refund with `amount_refunded === total` and no out-of-band amount;
    - (b) no refund and `out_of_band_amount === total`: the lost-chargeback convention, written into
      `docs/n18/README.md`.

    A balance credit (`customer_balance_transaction` set) throws. `tax_event_at = note.created`.
    The doc states why a note carries the invoice's Stripe ids beside the `refunds` link: they are
    frozen onto the legal record so the audit file stays pure, and the charge id is the out-of-band
    note's transaction. All come from one lookup, through the insert-only RPC.
  - **`deliverSaleDocument`** stamps in two steps:
    1. Check the email first.
    2. With no `storage_path`: render, upload, write `storage_path` alone (throwing if that write
       fails, so the send never runs with the path unrecorded), and use the rendered bytes.
    3. With a `storage_path`: download the stored PDF and do not render.
    4. Send with the `document:${id}` key.
    5. Write `delivered_at` and clear `delivery_error`, with the error checked.
    6. Check the failure write's error too.

    The doc states the residual: a stamp lost more than 24 h before the retry can send once more.
  - **`retryUndeliveredDocuments`:** oldest first, at most 10 a tick.
  - **The five sale-document reads** move here from `src/lib/queries/db.ts` and take the admin client.
    `fetchSaleDocumentsByAgency` and `fetchSaleDocumentsBetween` stay exported for their one caller
    each.
- **`SALE_DOCUMENT_KEYS` (`src/lib/queries/select-columns.ts`)** gains `tax_event_at`.
- **`src/lib/billing/document-render.ts`:**
  - Prints the stored rate exactly for every basis.
  - Prints the tax point beside the document date.
  - A credit note's transaction is its refund id, or the original charge id when out of band.
- **`src/lib/billing/audit-file.ts`:**
  - `ord_d` and `r_date` come from `tax_event_at`; `doc_date` and the month cut stay on `issued_at`.
  - A fractional `art_vat_rate` throws, naming the document (XSD integer; an accountant question).
  - A refunds-only month throws `AuditFileError` (the XSD requires an `orderenum`).
  - `r_ord` = distinct refunded orders.
- **`src/app/api/billing/audit-file/route.ts`:** a boundary catch with the `[billing:audit-file]` tag
  and the month. `AuditFileError` answers 409 with its sentence; anything else 500 JSON.
- **The webhook's `invoice.paid`:** when `chargedMoney(invoice)` holds and the invoice gets no document
  (no subscription, or a subscription with no `agency_id` that is not `no_workspace`), it returns
  `undocumented_sale` and logs `console.error` with the invoice id. A €0 invoice stays `ignored`. The runbook says Dashboard-made invoices are not supported,
  and the monthly routine checks the log.
- **The settings page:**
  - Catches `listDocumentDownloads` at its boundary, logs it, and passes `linksFailed`.
  - `BillingDocuments` shows "Unavailable" for a stored PDF when `linksFailed` is set (Preparing… stays
    for no PDF), with one caption asking to reload.
- **`documentEmail` / `src/lib/email/layout.ts`:**
  - `EmailContent.cta` becomes optional; `renderEmail` draws the button and the URL footnote only with
    a `cta`.
  - A document with no workspace gets no Plan & billing paragraph, no button, and its own footnote.
  - The other email snapshots stay byte-identical.
- **Shared values:**
  - `DOCUMENT_TIMEZONE` (`src/utils/constants.ts`), read by the audit file, the renderer, the
    templates and the documents list.
  - `centsToDecimal` (`src/utils/format.ts`), for the audit file and the renderer.
  - `isoFromUnixSeconds` (`src/utils/date-helpers.ts`), replacing the copies in `documents.ts`,
    `subscription-store.ts` and the webhook. `refresh-tokens.ts` adds a duration to now, which is a
    different operation, so it stays.
  - The ms-per-day constant is imported from its existing definition.

→ verify:
- **`documents.test.ts`:**
  - 25.5 kept;
  - BG reduced throws;
  - total > 0, `amount_paid` 0 and no balance fields gives null;
  - `amount_paid` 0 with `starting_balance < 0` throws;
  - `pre_payment_credit_notes_amount === total` throws;
  - `amount_paid !== total` with no balance field throws;
  - each balance field throws;
  - both note shapes are issued, and refund + out-of-band throws;
  - two refunds throw;
  - a balance note throws.
- **Delivery test,** the real sequence: attempt 1 uploads, stamps, sends, and then the `delivered_at`
  update fails; attempt 2 downloads without rendering and sends identical bytes under the same key.
  A failed `storage_path` write means no send.
- **`document-render.test.ts`:** exact rate, tax point, the out-of-band transaction.
- **`audit-file.test.ts`:**
  - `ord_d`/`r_date` on the tax date and `doc_date` on the issue date, across a Sofia midnight;
  - a fractional rate throws;
  - refunds-only gives `AuditFileError`;
  - `r_ord` counts distinct orders.
- **The route:** 409 and 500.
- **`webhook.test.ts`:** `undocumented_sale`; a €0 paid invoice with no subscription stays `ignored`.
- **`billing-documents.test.tsx`:** `linksFailed`.
- **`templates.test.ts`:** the no-workspace snapshot; the others unchanged.

**As built (2026-09-26).** The step shipped with these differences from the text above, each
from a verified review finding or a gap found while building:

- **`issueSaleDocument` owns the €0 rule and the balance refusals.** The webhook calls it for every
  paid invoice of a subscription this app made, which costs one extra invoice retrieve for a €0
  invoice. An invoice that a customer balance paid in full therefore reaches its refusal instead
  of passing as no sale.
- **`undocumented_sale` is logged once, at the boundary.** It covers a paid invoice that took money
  with no such subscription. The line is at error level and names the invoice, through the
  handler's `detail`, so a search for the term finds the invoice.
- **`deliverSaleDocument` reads its row inside its `try`.** A failed or missing read is reported
  and answered `failed`, so one bad row never ends the retry's batch.
- **`documentEmail(document, planUrl | null)`** is the email's shape.

### 6. Ledger integrity

Closes:
- **m1-54:** reserve and settle read different entitlements.
- **m1-17:** NULL `reserved_at`; the backfill is in A.
- **m1-18:** the billing cron.
- **m1-19** and **m1-45:** an uncounted wizard run.
- **m1-50:** a killed cron run.
- **m1-42:** an empty rewrite is counted.
- **m1-102:** dead fields.
- **m1-14:** rounding.
- **m1-15:** the briefing bypass.
- **m1-40:** identity outside the spender.

- **`Spender.entitlement?`** (`src/lib/billing/spend-context.ts`): the one entitlement a metered
  boundary reserves and settles against.
  - `reserveUsage` fills it once from `getCachedEntitlement` when absent, and `settleReserved` uses it.
  - The visuals cron passes its fresh one.
- **`settleUsage(entitlement, agencyId, kind, { reserved, landed, release })`.** `counted = min(landed,
  reserved)`, and `release` (default `reserved`) is what leaves `pending`.
  - Callers:
    - `startGenerationRun`'s give-back and `finishGenerationRun` pass `release = reserved`;
    - `settleReserved` likewise;
    - the closer passes `release: 0`.
  - The early return is when both are 0.
- **`ConsumeResult`:** the allowed branch becomes `{ allowed: true }`.
- **`src/app/api/cron/billing/route.ts`:** three independent jobs, cheapest first, each in its own try
  with a tagged log. `clearStaleReservations` runs first, then the reminders, then the capped document
  retry, so a timeout never skips the release.
- **`src/lib/generation/runs.ts`.**
  - **`startGenerationRun`** stores `period_key`. `{ runId: null, slotTaken: false }` is a failure
    for both callers: `generate-stream` answers 500 before any stream.
    - `persistStreamedDraft`'s run id becomes non-null, its client fallback goes, and so does that
      test in `draft-posts.test.ts`.
    - The stream's `if (runId)` guard goes.
  - **`finishGenerationRun`** first flips `running → status` with `.eq('status','running').select('id')`
    and settles only when the flip returned the row.
  - **One read of runs per tick.** `fetchRecentRuns(supabase, since)` (new) replaces the route's own
    `generation_runs` read. It takes the last 26 h of runs of every kind, `running` or `complete`,
    and throws on a read error, keeping the route's 500. Two pure uses of that one result follow,
    so the tick adds no second read of the table:
    - **`lastCronRunAt(runs)`:** the latest `kind = 'cron'` run per client, the dedup the route
      does today.
    - **`closeAbandonedRuns(supabase, runs)`,** for runs `running` for longer than 15 minutes (the
      largest `maxDuration` is 300 s):
      1. count the posts carrying the run id;
      2. claim the run with the same conditional flip (`complete` if any landed, else `failed`);
      3. only on a successful claim, settle `{ reserved: target_count, landed, release: 0 }` into
         `{ ...entitlement, periodKey: run.period_key }`. A null `period_key` is claimed, not settled.

      The closer's writes happen only when a stale run exists. It never releases `pending`: the
      daily reset owns that, so a double release is impossible, and a killed run's reservation
      holds the cap until the next morning, which is safe.

    The generate cron makes the read right after the weekly brief and closes before deduping, so a
    closed run's slot is due again in the same tick. The closer runs in its own try, which logs
    `[cron:generate] abandoned run sweep failed` and continues. The cron's drafts now carry
    `generation_run_id`, and `runs.ts` is again the only reader and writer of runs.
    Migration B closes, once, any run still `running` from before the 26 h window (status only).
- **`rewriteCaption`** throws on an empty model reply, so the rewrite is given back.
- **`src/lib/billing/ai-prices.ts`:** `toEurCents` stops rounding, and fractional cents go into the
  numeric column. *The per-post cost behind €29 was measured on rounded data. Re-measure after a week
  (hand work).*
- **`src/utils/ai-client.ts`.**
  - `anthropic` becomes module-private.
  - `attributedClaudeCall(model, (client) => …)` refuses with no spender, runs the callback with the
    private client, and records usage.
  - `callAnthropic` passes its retry loop as the callback.
  - `generateBriefing` calls it with `client.messages.create({...})`, dropping its own
    `recordAiUsage` block and its bypass doc.
  - `src/utils/__mocks__/ai-client.ts` gains the matching mock.
- **`generate-stream`** starts `fetchIdentityForGeneration` inside `runAsSpender`.

→ verify:
- **`usage.test.ts`:**
  - the settle uses the reserving entitlement;
  - `release: 0` counts without releasing.
- **The billing-cron route test:**
  - the release has the lowest call order;
  - with the other two jobs rejecting, the release still runs.
- **`runs.test.ts`:**
  - two closers on one run settle once;
  - the finisher and the closer settle once between them;
  - a finisher whose flip returns nothing does not settle;
  - `fetchRecentRuns` is one query; `lastCronRunAt` excludes failed runs and other kinds.
- **The generate-cron route test:**
  - a stale run with no posts is closed and the client claimed the same tick;
  - with posts, the client is skipped;
  - a throwing closer does not stop the tick.
- **The `generate-stream` route test:** a null run gives 500 and no stream.
- **The rewrite test:** an empty reply counts nothing.
- **The `ai-prices` test:** fractional cents.
- **The `ai-client` test:** the callback is never run without a spender.

**As built (2026-09-26).** The step shipped with these differences from the text above, each
from a verified review finding or a gap found while building:

- **The closer can release a reservation.** It releases the reservation of a run that reserved
  after the last daily reset (`lastDailyResetAt`, `src/lib/billing/usage.ts`).
  - The release is exact, because the finisher never settles once the closer's flip has won.
  - A run older than the reset releases nothing.
  - Without the release, the slot the closer reopens was sized against a dead reservation, which
    could lose the day's batch and ring a false "used up" bell.
- **The closer reads the entitlement for each run it settles** through `getCachedEntitlement`,
  with the run's `period_key` as its period.
- **A run id is always present now.** `trackGenerationTheme` and `persistStreamedDraft` take a
  non-null run id.
- **One door for every Claude call.** `attributedClaudeCall(model, call)` is that door;
  `callAnthropic` passes its retry loop through it, and so does the briefing's own request.
- **The billing cron answers 500 when any of its three jobs failed,** with what the others did.
- **`generate-stream` reads the kit as the run's spender.**

### 7. The SQL under test (PGlite)

Closes **m1-95**.

- Add the dev dependency `@electric-sql/pglite`; the version is pinned at install.
- **`src/lib/billing/__tests__/billing-sql.test.ts` (new, node project).**
  - The migrations reference nothing outside `public` except `auth.uid()`, `auth.users` and
    `storage.buckets`, and use no extensions (surveyed). So the preamble is only:
    - the roles `anon`, `authenticated` and `service_role`;
    - `schema auth` with `users (id, email, raw_user_meta_data jsonb, invited_at, last_sign_in_at,
      email_confirmed_at)` and `uid()`;
    - `schema storage` with `buckets (id text primary key, name, public)`, because `20260855` inserts
      with `on conflict (id)`.
  - Then **`supabase/migrations/00000000_baseline.sql` unmodified**, followed only by these files, in
    order:
    - `20260852_billing_foundation.sql`
    - `20260853_billing_followups.sql`
    - `20260855_billing_documents.sql`
    - `20260857_count_what_landed.sql`
    - `20260858_age_the_reservation_reset.sql`
    - migration A (`20260861`)
    - migration B (`20260862`)
    - the restore (`20260863`)
    - migration A again, then migration B again (Deploy order, item 3)

    Between steps the test writes what the code running at the time wrote: unkeyed bells after A and
    after the restore, and a signup with no trial end after B. The restore's own asserts run on a
    second database stopped at `20260863`.

    The baseline is a production snapshot taken at `20260831`: it already holds the earlier files,
    which are not idempotent, and it has no policies. So neither a full replay nor a replay from
    `20260832` works. Another file (`20260854`, `20260856`) is added only when one on the list is shown
    to need it.
  - A failure caused by a missing platform object (auth, storage, a role) is fixed in the preamble. Any
    other failure is stop-and-report; never edit a migration.
- **Asserts:**
  - `consume_usage` refuses past `count + pending`;
  - `settle_usage` upserts into a period with no row, and `release: 0` counts without releasing;
  - `issue_sale_document`:
    - returns the same row twice for one Stripe id;
    - numbers ascend with non-decreasing `issued_at` (sequential only, since PGlite has one
      connection; the concurrent guarantee is the row lock plus `clock_timestamp`);
    - leaves no gap after a failed insert;
  - after A and B, an auth user with `invited_agency_id` metadata (with or without `invited_at`) has no
    `team_invites` row;
  - the dedup-key backfill keys the newest legacy row per (agency, type);
  - B's re-run is idempotent: a row keyed K plus a newer NULL row whose computed key is also K leaves
    the newer row NULL; a NULL `payment_failed` row and a keyed one with the same key apply cleanly;
    exactly one row per (agency, key) remains.

→ verify: green on the real files. A scratch mutation of `consume_usage`'s cap (not committed) turns
it red.

### 8. Keyed, atomic notifications

Closes **m1-75** (the dedup race) and **m1-83**'s `notify` half (the untyped client). This step moves
before the steps that use keys.

- **`src/lib/notifications/notify.ts` gains `dedupKey`.** With a key, the write is
  `upsert(row, { onConflict: 'agency_id,dedup_key', ignoreDuplicates: true }).select('id')`:
  - `error` → `'failed'`;
  - one row → `'written'`;
  - `[]` → `'suppressed'`.

  ON CONFLICT DO NOTHING RETURNING returns only inserted rows. There is no cooldown read with a key.
- **The cooldown stays** for callers that rate-limit a condition that persists: publish failures,
  connection retirement, approvals, metrics. The doc states which to use.
- **`admin: SupabaseClient`** becomes `SupabaseClient<Database>`, which removes the cast in
  `resolveTarget`.

→ verify: `notify.test.ts`:
- `.select` is chained after the keyed upsert;
- `[]` gives `'suppressed'`;
- `[{ id }]` gives `'written'`;
- no cooldown read with a key.

### 9. The posts rule, end to end

Closes:
- **m1-48:** images owed by earlier posts.
- **m1-85:** the server does not enforce the rule.
- **m1-86:** no refresh after a run.
- **m1-25:** a cheaper format is locked out.
- **m1-84:** `canPaint`.
- **m1-87:** the client-switch clamp.
- **m1-89:** the run-size rule is written four times.
- **m1-88:** the coverage link.
- **m1-34:** in the trial grace, "allowance used up".
- **m1-49:** the drawdown is never given back.
- **m1-55:** one usage-read failure aborts a tick.
- **m1-105:** the bell outside the try.
- **m1-51:** partial carousels.
- **m1-52:** window starvation.
- **m1-39:** attempts burned on refusals.
- **m1-101:** the visuals cron's own arithmetic.
- **m1-57:** no budget tests.
- **m1-56:** routes implement pipelines.

- **`src/lib/billing/post-allowance.ts`:**
  - `poolLeft(limits, committed, kind)`: used by `postsAffordable` and the visuals cron.
  - `generationRefusal(entitlement, committed, owed)`: the one answer to "may a new run start".
    - A workspace that cannot spend gets `cannotSpendNotice(entitlement).text`.
    - Otherwise the cheapest format (one picture) is checked, with owed images added to the committed
      images.
    - It replaces `canMakeAPost`.
  - `runCeiling(affordable, briefCount)`: the stepper's max, the panel's refusal threshold, and the
    clamp on first load, client switch and format change.
- **`src/lib/billing/usage.ts`: one query for many agencies.** `readUsageByAgency(entries)` (new)
  reads `usage_counters` once, `.in('agency_id', …)` and `.in('period', …)`, and keeps the matching
  (agency, period) pairs in memory. `readUsage(agencyId, periodKey)` becomes a one-entry call of it,
  so there is one query and one mapping.
  - Both crons use `readUsageByAgency`. Each tick's N per-agency reads become one, so there is no
    per-agency failure left to isolate (m1-55); a failed query fails the tick, as the schedules read
    does.
- **`src/lib/visual/owed-images.ts` (new).**
  - **`owedImagesOf(items)`**, which is pure, over `{ post, images, generatingPositions }[]` (the
    shape `fetchEditorialPosts` returns):
    - it keeps drafts, and `pending_review` rows passing the still-paintable predicate (extracted from
      `pickVisualBacklog`: quality floor, attempts left);
    - it counts `missingPositions` less the positions held by a live claim, which are already in
      `committed.image` as pending;
    - it returns `{ images, posts }` per client, and the caller sums per agency.
  - **`fetchOwedImages(admin, clientIds, statuses)`:**
    - it reads those posts once with `VISUAL_BACKLOG_POST_COLUMNS` (the projection the visuals cron
      already reads undecided posts with), then `fetchImagesByPost` and `fetchVisualJobs`;
    - it builds the same shape and returns `owedImagesOf`;
    - the caller passes the client ids it already holds, so this function never re-reads clients.
  - **Callers:**
    - **The dashboard:** `getCachedOwedImages` (30 s, `'client-post-stats'`) with the page's cached
      client list.
    - **`generate-stream`:** with `getCachedAgencyClients`, shared through the request cache.
    - **The generate cron:** once per tick, for the clients of agencies with a due client, after
      `dueClients`, and skipped when none are due. The only new clients read is for those agencies.
    - **The generate page:** it passes its already-loaded waiting drafts (from `fetchEditorialPosts`)
      straight into `owedImagesOf`, and calls the reader for `pending_review` only. Drafts are never
      read twice.
  - **A failed owed read is unknown, not 0.**
    - On the generate page, the draft read keeps its own degrade (nothing waiting). But the page tracks
      the failure, and the `pending_review` read gets its own catch. If either fails, the page passes a
      refusal sentence and logs it: the form is replaced, the page still renders.
    - On the dashboard, a failed `getCachedOwedImages` read disables the Generate links with a reason,
      and never throws.
- **`src/lib/billing/copy.ts`:** `allowanceUsedUp` and `postsLeft` take an optional `owed`. When owed
  images are what empties or short-changes the pool, they say so with both figures and never name more
  than is left: "3 posts still waiting for pictures need 12 AI images; you have 5 left this period."
  plus `wayForward`. Otherwise they compute on the free figure.
- **The wizard.**
  - The page passes `allowance: { limits, committed, owed }` and the `generationRefusal` sentence.
  - The form is replaced only when that sentence is non-null. A cheaper format that still fits keeps
    the form, and the stepper and panel refuse at the chosen format.
  - `canPaint = poolLeft(image) !== 0` on the raw committed figure.
  - `router.refresh()` runs in `startGeneration`'s `finally` (normal end, failed run, refused 402)
    and in `handleNewRun`.
- **`generate-stream`** applies `postsAffordable` at the body's format with owed images, before
  `startGenerationRun`. The refusal is `allowanceResponse`: its `used` stays the counted figure and the
  owed images are named in the sentence.
- **The dashboard:**
  - `generateRefusal` comes from `generationRefusal`.
  - `ClientCoverage` threads it to `CoverageRow`, whose Generate link is disabled with the reason.
- **The generate cron.**
  - The billing half moves to `src/lib/generation/scheduled-budget.ts` (new):
    - `planScheduledBatch(...)`, which is pure;
    - `AgencyBudgets`: take on claim; `giveBack(total − landed)` in both pools after the finish.
  - The exhausted bell moves inside the per-client try.
  - The per-client pipeline moves to `src/lib/generation/scheduled-run.ts` (new).
  - The route composes: brief, `fetchRecentRuns`, closer, schedules, `lastCronRunAt`, due filter, owed read, the
    loop.
  - **`cron-invariants.test.ts`:** `firstLevelImports` is hoisted to module scope. The ideas sweep
    covers each cron route's first-level imports and asserts it reaches `scheduled-run.ts`.
- **The visuals cron: `src/lib/visual/paint-backlog.ts` (new).**
  - **`selectPaintableBacklog(admin, entitled, now)`:**
    - reads committed usage for the entitled agencies in one `readUsageByAgency` query;
    - pages the eligible window by `created_at` until the run budget is filled or the rows run out.
      This is not capped at a page count, so neither fully painted posts awaiting review nor an
      exhausted agency's posts can starve the window. The doc notes that past a few thousand
      undecided posts this becomes a stored flag, as `entitled-clients.ts` notes for its list.
    - skips, per agency, the posts whose missing positions exceed `poolLeft(image)`, the existing
      `need > left` filter, now reading the shared rule;
    - calls `pickVisualBacklog` with the remaining allowance.
  - **The paint loop** moves beside it, with the attempt write.
  - **`pickVisualBacklog`** takes a post only whole. A test pins `MAX_CAROUSEL_SLIDES ≤
    MAX_IMAGES_PER_RUN`. The constant's comment says 12 is the image budget and that about 10 fit
    240 s on two lanes.
  - **Attempts:** an attempt counts only when a position fails for a reason other than the allowance,
    once per post per tick. Time-skipped and refused positions cost nothing.
  - **The bell:** an agency whose posts were skipped for allowance in the rows this tick read gets
    one bell per period, and the count of those posts goes in the message, never in the key. The
    count comes from the rows already read; no extra reader or query is added for it.
    - Key: `images_waiting:<periodKey>`, distinct from the generate cron's.
    - A failed read skips the bell, logged.
  - **The route doc:** a post is picked whole; the time budget or a live-user race can stop it
    partway; neither counts an attempt, and the next tick finishes it.
  - **Registries:** `docs/OPERATIONS.md` (paint missing visuals) and the posts entry in
    `scripts/table-writers.json` move to `paint-backlog.ts`.

→ verify:
- **`post-allowance.test.ts`:**
  - `poolLeft`;
  - `generationRefusal` per state and with owed images;
  - `runCeiling`.
- **`owed-images.test.ts`:**
  - a live claim is subtracted;
  - a `pending_review` post under the quality floor, or out of attempts, owes nothing;
  - the generate page's drafts and the reader's rows give the same figure for the same post.
- **`scheduled-budget.test.ts`:**
  - two clients;
  - `giveBack`;
  - an unscheduled sibling's owed images bind the batch.
- **`visual-backlog.test.ts`:** whole-post; the slides invariant.
- **`paint-backlog.test.ts`:**
  - an exhausted agency's posts are skipped, and paging continues to other agencies' posts;
  - paging runs past painted rows;
  - usage is read in one query;
  - no attempt on a refusal or time skip;
  - one bell with the count of skipped posts, and a second tick suppressed;
  - an agency with nothing skipped gets no bell.
- **`usage.test.ts`:** `readUsageByAgency` is one query and pairs each agency with its own period;
  `readUsage` returns the same figures for one agency.
- **`copy.test.ts`:** 38/50 used with 12 owed gives the set-aside sentence; 45/50 with 12 owed never
  says more than 5 left.
- **The generate page:** a rejected draft read or `pending_review` read gives no owed figure of 0, and
  does not throw.
- **The `setup-view` test:** 4 images left with a 5-slide default keeps the form.
- **The `generate-flow` test:**
  - with the drafts pool empty and images left, drafts paint;
  - a 402 refreshes;
  - the client switch clamps.
- **The dashboard:** the coverage row is disabled.
- **The `generate-stream` route:** a 402 on an unaffordable body.
- **`cron-invariants`:** the ideas sweep covers `scheduled-run.ts`.
- **Observed run:** a carousel client with images nearly spent; the cron trims, the visuals cron paints
  whole, and the dashboard and wizard agree.

**As built (2026-09-26).** Step 8 shipped as written; its one addition is that `notify` and
`resolveTarget` take `SupabaseClient<Database>` (a caller that still declares a bare
`SupabaseClient` passes it untyped, as before). Step 9 shipped with these
differences from the text above:

- **`generationRefusal` takes `owed: OwedImages | null`.** Null means the owed pictures could not
  be read, and it answers `OWED_IMAGES_UNKNOWN`. This is the one answer for the dashboard and the
  generate page.
- **One helper sets owed pictures aside.** `committedWithOwed(committed, owed)` sets them aside
  wherever a new run is measured.
- **The refusal wording names owed pictures.** `allowanceUsedUp`, `postsLeft` and `AllowanceError`
  take the owed pictures, and `postsLeft`'s also carry the raw `imagesLeft` it names.
- **`pickVisualBacklog` takes each workspace's image pool** (`agencyOf`, `imagesLeft`) and returns
  `{ jobs, refused }`.
  - `refused` are the posts a pool could not pay for whole; the bell counts them.
  - `isStillPaintable` and `MAX_VISUAL_ATTEMPTS` live in `visual-backlog.ts`.
  - `missingPositions` takes the live claims, as the one rule for the wizard's hook, the owed count
    and the painter.
- **The backlog pages by offset.** It is ordered by `created_at` and then `id`, because a batch
  inserted in one statement shares one `created_at`, and a `created_at` cursor would skip rows. A
  later page failing ends the read and skips the bell, since its count would be short.
- **When an attempt counts.** An attempt is counted only on the post's own failure (a throw or no
  copy), once per post per tick.
- **Where the cron's pieces live.**
  - `notifyAllowanceExhausted` moved into `scheduled-run.ts`, because `lib` may not import `app`.
  - The owed-pictures read for due workspaces is `fetchOwedByAgency` in the cron's helpers.
  - A failed owed read fails the tick.
- **The dashboard reads owed pictures uncached.** It reads them beside its fresh usage read, so
  the two are of one moment. A cached owed figure next to live usage would set aside twice any
  picture painted since, so `getCachedOwedImages` is gone.
- **One shortfall rule.** `runShortfall(affordable, posts, slidesPerPost)` in `post-allowance.ts` is
  the "does this run fit" answer. The wizard's panel refuses on it, over the whole run (briefs and
  at least one post, since the stepper's count is already clamped). `generate-stream` answers its
  402 from it, and the scheduled batch's bell names it. `planScheduledBatch` sizes with
  `runCeiling`.
- **Owed pictures are named only when they are the cause.** That means the run would fit without
  them (`ImagePool` passed to `postsLeft`). Otherwise the sentence is the run's own need against
  what is left, and "all used" only for an empty pool.
- **No read can be cut at 1000 rows.**
  - `fetchImagesByPost` reads in chunks of 50 posts, so PostgREST's 1000-row answer never cuts it.
  - The owed read and the painter page their posts.
  - The painter reads each page's live claims too.
  - A later page failing, on any of its reads, ends the painter's read with what was picked.
- **Refreshes and redirects.**
  - An aborted stream does not refresh the page.
  - New run on an idea's run moves to the client's plain `/generate` rather than refreshing into
    the page's idea redirect.
  - `GatedAction` takes `wayOut` so an unread owed figure is not offered Plan & billing.
- **The coverage row's refused Generate is a disabled pill.** Its reason is read to a screen reader
  and shown as a tooltip, because the row has no room for the sentence.
- **`generate-stream` answers 500 with `OWED_IMAGES_UNKNOWN`** when its allowance read fails.

### 10. Entitlement and copy correctness

Closes:
- **m1-5:** a failed read cached as "locked".
- **m1-36:** the cast.
- **m1-99:** meters against 0.
- **m1-79:** the grace date.
- **m1-100:** VAT.
- **m1-80:** strings outside copy.ts.
- **m1-81:** repeated copy, and the grace week.
- **m1-103:** small rules rewritten.
- **m1-8:** dead references.
- **m1-104:** the stale ratio.
- **m2-4:** the trial length.

- **`src/lib/queries/cache.ts`:**
  - `_fetchAgency` reads with `.maybeSingle()` and throws on error inside `unstable_cache`, so a
    failed read is never stored.
  - The exported `getCachedAgency` catches, logs `[cache] agency read failed`, and returns null, so
    every caller degrades exactly as today but only for that one request.
  - One decision for every caller: unchanged.
  - The typed select removes the cast.
- **`PlanSection`:**
  - When `!canSpend`:
    - the brand row shows a plain count, with `limit={null}` and the noun
      `brandWord(mode, brandCount)` ("1 business", "3 clients"), no limit and no danger colour;
    - the three meters give way to `cannotSpendNotice(entitlement).text`, which in the trial grace is
      the banner's own sentence.
  - In the trial grace, `nextDate` shows `graceEndsAt`.
  - Labels come from copy.ts.
- **`src/lib/billing/copy.ts`:**
  - Every billing date through `formatLongDate`; `formatDay` goes.
  - Plurals through `pluralise`.
  - "excl. VAT" in `checkoutSummary` and `checkoutActivated`; `addBrandCost` has it from step 4.
  - `REMINDER_COPY` details say only what the bell's sentence does not, with the grace length from
    `GRACE_DAYS`.
  - Strings move in from `plan-section.tsx`, `billing-wall.tsx` (the "Workspace paused" heading),
    `quantity-sync.ts` and `notification-item.tsx`.
  - The `BILLING_NOTIFICATION_TITLES` doc cites `notifyAllowanceExhausted`.
- **`src/lib/billing/plans.ts`:**
  - `TRIAL_DAYS = 14` (new), and `TRIAL_NOTICE_DAYS` moves here.
  - `createUserRecord` writes `trial_ends_at`; migration B drops the default.
  - The sign-up view, `capabilities.tsx` and `closing-cta.tsx` interpolate `TRIAL_DAYS` into their own
    existing sentences. The rendered words are unchanged, so no mock is needed.
  - The `plans.ts` prose says `TRIAL_DAYS`.
- **Docs:**
  - The `post-allowance` doc cites the ratio in `plans.ts`.
  - The `allowance-refusal` fixture comment says round numbers, not the plan's.

→ verify:
- **`cache.test.ts` (new):**
  - a read error returns null and the next call reads again;
  - a missing row gives locked;
  - the error is logged.
- **`plan-section.test.tsx`:**
  - locked (with `brands` taken from `entitlementFor`) and `trial_grace` render no "of 0" and no danger
    meter, and show the notice sentence;
  - a locked solo with 1 renders "1 business";
  - a locked agency with 3 renders "3 clients".
- **`copy.test.ts`:**
  - VAT wording, including `checkoutSummary`;
  - the grace length;
  - one date format.
- **Snapshots** re-approved deliberately.

**As built (2026-09-26).** The step shipped with these differences from the text above:

- **`getCachedAgency` catches outside the cache.** It wraps the cached read, so a failed read is
  logged and answered null for that request only, and never stored. The typed select drops the
  cast and the unused full-row alias.
- **The plan section's words live in `PLAN_SECTION` in copy.ts.** That covers the legend, the row
  labels, each state's pill and the next-date names. The component keeps only the tones.
  - In the trial's grace the next date is "Workspace pauses on" with `graceEndsAt`.
  - While the workspace cannot spend, the brand row is a plain count and the meters give way to
    `cannotSpendNotice`.
- **Two more strings moved into copy.ts.** `OPEN_PLAN_AND_BILLING` is the bell's billing link, and
  `WORKSPACE_PAUSED_HEADING` is the wall's heading.
- **The reminder details say only what the bell's sentence does not,** with the grace in
  `GRACE_DAYS`. The three reminder-email snapshots were re-approved, with only that paragraph
  changed.
- **`createUserRecord` stamps `trial_ends_at` from `TRIAL_DAYS`.** Its in-body comments were folded
  into its doc.

### 11. Reminders

Closes:
- **m1-82:** a timezone change re-sends.
- **m1-78:** the `allowance_reached` doc.
- **m1-77:** the unbounded roster.
- **m1-26:** the webhook's dropped outcome.
- **m1-27:** two admin readers.
- **m1-53:** the paused-posts promise.

- **Keys (UTC, SQL-reproducible, matching migration A's backfill):**
  - `trial_ending|trial_ended|workspace_paused:<UTC date of trial_ends_at>`;
  - `payment_failed:<UTC date of past_due_since>`;
  - `allowance_warning:<period>:<kind>`;
  - `allowance_reached:<period>:<kind>`: once per workspace per period per pool, as its doc now says;
  - `images_waiting:<period>` (step 9).

  The allowance keys have no backfill, because legacy rows carry no period. At worst one extra bell
  fires on the first crossing after the deploy.
- **`remindTrialWorkspaces`** filters in SQL to `trial_ends_at` between `now − (GRACE_DAYS +
  PAUSED_WINDOW_DAYS)` and `now + TRIAL_NOTICE_DAYS`.
- **`fetchAdminEmails(admin, agencyIds)`,** local to `reminders.ts`, serves both the cron and
  `remindPaymentFailed`. The db.ts doc is corrected.
- **The webhook** logs `remindPaymentFailed`'s outcome.
- **`WORKSPACE_LOCKED_DETAIL`:** "Everything you made is still here to read. Once a plan is active,
  posts due in the last day go out; older ones are marked failed in the calendar for you to
  reschedule." `publishDuePosts`' doc says the same.

→ verify:
- **`reminders.test.ts`:** the window; one admin reader; the keys.
- **The webhook:** the outcome is logged.
- **`reminder-workspace-paused.html`:** the snapshot re-approved.

**As built (2026-09-26).** The step shipped with these differences from the text above:

- **`pickReminder` returns the reminder's key with it** (`reminderKey`: the kind and the UTC date
  it is about).
  - `remindPaymentFailed` keys by the row's `past_due_since`, so one past-due episode rings once.
  - `remindWorkspace` takes the key in place of a cooldown.
- **The allowance bells are keyed.** `allowance_warning` (`settleUsage`) and `allowance_reached`
  (`notifyAllowanceExhausted`, in `scheduled-run.ts` since step 9) carry `<period>:<kind>`; the
  latter is once per workspace, not per client.
- **The webhook reports the reminder on its one boundary line.** `withReminder` adds
  `remindPaymentFailed`'s outcome to that line, at error level when the bell was not written, no
  admin could be mailed, or the send was refused. `Handled.level` also carries the error level
  for `undocumented_sale`.
- **The paused wording matches the publisher.** `WORKSPACE_LOCKED_DETAIL` and `publishDuePosts`'
  doc say the same thing; the paused-email snapshot was re-approved with only that paragraph
  changed.

### 12. Security

Closes:
- **m1-91:** signup admin.
- **m3-1:** a removed member re-admitted.
- **m1-93:** members write name and timezone.
- **m1-41:** capture.
- **m3-3:** the suggest-sources query list.
- **m1-46** (suggest part).
- **m1-37:** the rearm.
- **m3-2:** closed by the decision.

- **The invite route** (`src/app/api/settings/team/invite/route.ts`):
  1. After the members check, call `pending_invite_for_email`. If the pending invite belongs to
     another workspace, answer 409 and send nothing.
  2. `inviteUserByEmail`, with only `agency_name` in the metadata.
  3. Update the existing row for a resend, or insert one with the returned `user.id` and `invited_by`.
  4. If a first insert fails, answer 500. Delete the returned login through `deleteAuthIdentity` only
     when this send created it: take `sentAt` just before the call, and treat the login as new when
     `Date.parse(user.created_at) >= sentAt - 5_000`. An older login (an unconfirmed self-signup, an
     old-route invitee) is left alone.
- **`createUserRecord`**, for a user with no `users` row:
  - looks up the pending invite by `auth_user_id`, joins with its role, and stamps `accepted_at`;
  - with no invite, takes the signup path;
  - never reads `invited_agency_id` or `role`.
- **`removeTeamMember`:**
  - deletes the user's `team_invites` rows before the `users` delete; on an error it logs under
    `[team:remove]` and answers "Could not remove the member";
  - keeps `deleteAuthIdentity`'s result. When the login survived it answers "They were removed from
    the workspace, but their login could not be deleted. Contact support to finish removing it."
  - runs the tag and path busts before either answer;
  - its doc names the invite-row delete and the new answer.
- **`deleteAuthIdentity`'s doc** names both real outcomes of a surviving login: an invitee gets
  nothing; an original signup gets a fresh workspace on the next visit.
- **`deleteWorkspace`** reads the pending invites' `auth_user_id` in its opening `Promise.all`, before
  the agency delete, which cascades them. After the member loop it deletes those logins, and its doc
  changes.
- **`TeamTab`'s doc** no longer says there is no invitations table.
- **The settings PUT** writes through the admin client after `verifyAdminRole` and the zod allowlist.
  Migration B revokes the grant.
- **`captureSite`.**
  - It normalises once through `toWebsiteUrl` and refuses a non-public target through
    `validateSourceUrl`, before the browser. The refusal is not retried.
  - `captureOnce` navigates to what it is given.
  - `blockTrackers` becomes `guardRequests`, one request handler that also checks every http(s)
    request's host through `validateSourceUrl`, cached per page, and aborts a private one. That covers
    redirects, frames and subresources.
  - `extract/start` and `visual-identity/reanalyze` add `aiRateLimitResponse('analyze-url')`.
- **suggest-sources:** queries are zod-parsed as strings and capped at four, and both catches log.
- **`rearmFailedPublication`:**
  - `requireEntitledAction(agencyId, 'publish')`;
  - `post_id, platform` selected typed, with no cast;
  - for Instagram, `validateInstagramCaption` on the post's caption before the slot write.

  It has a `GATED` entry. The `schedulePosts` doc names the other writers and says they apply the same
  gate and caption check.
- **Registries (here, so `npm run writers -- --check` passes at this step):**
  - `team_invites` in `scripts/table-writers.json`:
    - the invite route: create and resend;
    - `createUserRecord`: accept;
    - `removeTeamMember`: removed with a member.
  - The matching `docs/OPERATIONS.md` rows.

→ verify:
- **`create-user-record.test.ts`:**
  - forged metadata gives no membership;
  - an invite joins and is consumed;
  - an accepted invite gives no membership.
- **The invite route test (new file beside the route):**
  - a resend updates the row;
  - another workspace's pending invite gives 409;
  - a failed insert removes a login this send created;
  - a failed insert leaves an older login alone.
- **`team-actions.test.ts` (new):**
  - a surviving login answers the sentence;
  - the invite rows are gone;
  - the busts still run.
- **`npm run writers -- --check`** green.
- **`workspace-actions.test.ts`:** the pending invitee's login is deleted, and the read happens before
  the delete.
- **The account PUT:** a member gets 403.
- **`captureSite`:**
  - a private host is refused;
  - `example.com` reaches `goto` as `https://example.com`;
  - a redirect hop to a private host is aborted.
- **suggest-sources:** a cap of four.
- **The rearm:** a 2,201-character caption refused with nothing written.

**As built (2026-09-26).** The step shipped with these differences from the text above. The
invite operation was reworked again after the review of steps 10–13; the review round under step
14 says how, and supersedes the first two bullets.

- **The invite route reads three things at once:** the members, `pending_invite_for_email` and
  the workspace name, each checked.
  - A resend updates the pending row's role and inviter.
  - A first row that cannot be written deletes the login only when this send created it: within
    5 s of the send, for clock skew.
- **`createUserRecord` joins only through a pending invite row.** It stamps `accepted_at` after the
  user row; a failed stamp is logged, not thrown, since the membership stands. It never reads the
  login's metadata for a workspace or a role.
- **`removeTeamMember` answers with a sentence when the login survives.** The cache busts run
  before either answer.
- **`deleteWorkspace` reads the pending invitees in its opening wave and deletes their logins after
  the members'.** A failed read of those invites refuses the delete before anything is removed.
- **`blockTrackers` is `guardRequests`** (`guard-requests.ts`). Its per-origin host check was
  later replaced by the egress proxy (the review of step 14 and the fix round, under step 14).
- **`rearmFailedPublication` reads the post's caption through its publication.** The embed is
  typed, so the cast goes. `schedulePosts`' doc names the two other slot writers and what each
  carries.
- **`gate-coverage.test.ts` drops the visuals-cron exemption.** That route no longer declares a
  spender; the cron spends through `paint-backlog.ts`. The exemption doc says where cron gates are
  checked.

### 13. Legal pages — the exact text

Closes:
- **m2-0:** retention.
- **m2-1:** missing processors and billing data.
- **m2-2:** the goodbye-page claims.
- **m2-3:** an annual plan.
- **m2-5:** the identity drift.

These are minimal factual edits with no layout change. "Last updated" on Privacy and Terms becomes the
ship date. Both pages promise email notice of material changes, so that notice is hand work.

- **Privacy §1** adds: "Billing details — the name, address, email and VAT number you give at checkout."
- **Privacy §4** adds three processors:
  - **Stripe** — payments; it collects the card and billing details at checkout.
  - **fal.ai** — image generation and editing; it receives the image prompts built from your content,
    and the images you ask it to edit or cut out.
  - **Tavily** — web search for research; it receives search queries.
- **Privacy §5, paragraph 1** becomes:

  > "When a plan ends the workspace is paused, not deleted: everything stays until an admin deletes it
  > in Settings. Invoices and credit notes, with the billing details on them, and the payment records
  > Stripe sends us about them are kept for at least ten years, as Bulgarian law requires, even after
  > the workspace is deleted."
- **Privacy §5, paragraph 2** becomes:

  > "You can delete your workspace yourself from Settings, which removes everything in it at once
  > except the invoices, credit notes and payment records described above, or request deletion by
  > contacting us at the address below; we process requests within 30 days."
- **Terms §6:**
  - "monthly or annual" becomes "monthly";
  - "Fees are charged at the start of each billing period" becomes: "Fees are charged monthly in
    advance. A client added beyond those already paid for in the current period is charged pro rata,
    normally at once, or on the next invoice when that amount is below the payment provider's minimum
    charge. Removing a client refunds nothing, and re-adding one within the number already paid for
    costs nothing until renewal." The existing non-refundable clause stays;
  - the cancellation sentence becomes: "Cancellation takes effect at the end of the paid billing
    period, and you keep access until then. If a renewal payment has failed, cancelling ends the plan
    immediately and the unpaid renewal is not collected." This matches `cancelPlanConsequence`.
- **Terms §10** becomes: "When a plan ends or an account is suspended, the workspace is paused and its
  data kept until an admin deletes it, as described in our Privacy Policy (§5)."
- **Domains and identity:**
  - every `kontuur.io` becomes `kontuur.app`; on data-deletion that is the only change;
  - the Privacy and Terms contact blocks and the platform domain read `COMPANY`;
  - `COMPANY`'s doc names its readers.
- **The goodbye page:**

  > "Invoices and credit notes are emailed to the billing address given at checkout; one not yet
  > delivered is retried daily — if one did not reach you, write to support@kontuur.app. They, with the
  > billing details on them, and the payment records Stripe sends us about them are kept for at least
  > ten years, as Bulgarian law requires. Nothing else of the workspace remains."

  Pending invitees' logins go too (step 12).

→ verify:
- the pages render;
- `src` has no `kontuur.io`;
- `src/app/(marketing)` has neither "removes everything at once" nor "will be deleted in accordance";
- the Terms cancellation sentence matches `cancelPlanConsequence` in both cases;
- the Terms charging sentence agrees with both branches of `addBrandCost` and with the sync's
  `create_prorations` path.

**As built (2026-09-26).** The step shipped as written. Beyond the contact blocks and the
domain, the Terms page reads `COMPANY.legalName` for every mention of the operator, so the name
is spelled in one place. "Last updated" on both pages is 26 September 2026. The email notice of
the changes to existing customers is the founder's.

### 14. Structure, docs, and docs/CLAUDE.md conformance

Closes:
- **m1-11:** the comment gate.
- **m1-12** and **m1-47:** JSDoc and casts.
- **m1-13:** Tavily.
- **m1-106:** fal.
- **m1-24**, **m1-59** and **m1-90:** casts.
- **m1-83:** its second half; `notify`'s was in step 8.
- **m1-20:** failure answers.
- **m1-29:** the webhook route.
- **m1-46** (extract part).
- **m1-58**, **m1-60**, **m1-97** and **m3-4:** false docs.
- **m1-96:** the registry.
- **m1-43:** the narrative gate.
- **m1-44:** tests.

- **The webhook:** `recordBillingEvent`, `finishBillingEvent` and `handleEvent` move to
  `src/lib/billing/stripe-events.ts` (new). The route verifies the signature and composes. The
  `docs/OPERATIONS.md` event row and the `billing_events` writer in `scripts/table-writers.json` move
  with them.
- **The comment gate** (`scripts/comment-placement.mjs`).
  - `MEMBER` no longer matches statements: it gets a negative look-ahead for `if|for|while|switch|
    return|await|catch|else|throw|do|try`. `violations()` is exported and gets a fixture test: a
    comment above `if (` in a body is flagged, one above an interface method is not.
    `features/analytics` stays at 0.
  - `ALLOWLIST` adds:
    - `lib/billing`, `app/api/billing` and `app/api/cron`;
    - `features/settings`, `lib/generation` and `lib/notifications`;
    - `lib/email`, `lib/render` and `app/api/ai`.
  - The **205** misplaced comments measured there today with the fixed regex are folded into their
    docs or deleted. `WHY as:` moves into the function doc, as `features/analytics` already does.
  - The build-history docs on `slidePlace` and `detectSlopSchema` are rewritten as constraints.
  - docs/CLAUDE.md's `npm run comments` line names the gate's scope.
  - Outside these directories, this plan writes no new in-body comment, and folds an existing one in
    any function whose logic it changes.
- **Casts and validation.**
  - **Tavily:**
    - `tavilyHitSchema` is defined, and `TavilyHit` becomes its `z.infer`;
    - each hit is `safeParse`d and the bad ones dropped with one warning;
    - the envelope failure and the non-OK branch are logged.
  - **fal:**
    - `firstImageUrl` and `singleImageUrl` become zod schemas;
    - `callFal` parses the `ApiError` body with a small schema.
  - **`performRewrite`:** retyped so both `as SlideText[]` casts go.
  - **Every other flagged `as`** gets its WHY in the doc or goes by typing:
    - `entitlement.ts`, `runs.ts`, `document-render.ts` and `audit-file.ts`;
    - the cron routes;
    - the three client refusal reads.
- **JSDoc** on `parseDocumentLines`, `postsAffordable`, the visuals `GET`, `performRewrite`,
  `rewriteCaption`, `rewriteCarousel` and `analyzeUrl`.
- **`spendFailureResponse`:**
  - the rewrite route uses it (502), and inpaint and generate-svg pass 502;
  - `generate-svg-route.test.ts` now expects 502;
  - the doc says the status is whose failure the route's work is.
- **`extract/start`** checks `writeExtraction`'s error on all three writes.
- **False docs.**
  - **`syncRoster` and `syncAllClientComments`:**
    - the filter becomes a type guard on `ClientSyncableConnection` (new alias beside
      `SyncableConnection`), and `syncOne` takes it;
    - the dead `!clientId` branches go;
    - the docs say no-client rows are skipped.
  - The `cron-invariants` publish-queue doc.
  - The `row-mirrors` and `POLICYLESS` docs.
  - `captureSite` and the `extract/start` `maxDuration` comment.
- **`AdminClient`** from `src/lib/supabase/admin.ts:28` in `documents.ts`, `subscription-store.ts`,
  the webhook and `create-user-record.ts`.
- **Registries.**
  - **`scripts/table-writers.json`:**
    - the clients, `brand_profiles` and `posting_schedules` entries for `client-actions.ts` lose
      "createClient seeds" (seeding is `provisionClient`);
    - `document_counters` is hand-listed;
    - the agencies entry for `subscription-store.ts` is rewritten to match step 3:
      - `ensureStripeCustomer` sets the customer id once;
      - `applySubscriptionSnapshot` (through the webhook, `setPlanEnding` and `cancelPlanNow`) writes
        the id, status, cancel flag and `past_due_since`;
      - the period and the paid quantity come from a paid invoice or a first fill;
      - `plan` and `billing_updated_at` are no longer written;
    - `quantity-sync.ts` is added as the writer of `quantity_sync_at`;
    - the moved writers follow.
  - **`scripts/table-writers.mjs`:** the stale `image_generation_usage` line.
  - **`docs/OPERATIONS.md` rows:**
    - `cancelPlanNow`;
    - `closeAbandonedRuns`;
    - `unprovisionClient`;
    - the quantity-sync claim;
    - notify with a key;
    - the moved event and paint writers.

    (The invite rows are registered in step 12.)
  - **`docs/plans/BILLING.md`** gets a one-line pointer at its add-client promise (`:211`) and its
    quantity-sync paragraph (`:438`): "superseded by docs/plans/BILLING-REVIEW-FIXES.md step 4".
- **The narrative gate (m1-43):**
  - `guardNarrative` (`narrative-shared.ts`) gains `agencyId` and returns null when
    `!(await getCachedEntitlement(agencyId)).canSpend`, before any cache or model.
  - `getNarrative` and `getFacebookNarrative` pass it.
  - The `canNarrate` checks in `analytics/page.tsx` and `report-actions.ts` go.
  - A unit test proves a locked workspace never reaches the model.
  - The two `EXEMPT` reasons in `gate-coverage.test.ts` point at it.
- **Route tests** for generate-background and inpaint: the upload sits inside `runMetered`, and a
  failed upload gives the outcome thrown and a 502 (m1-44).

→ verify:
- `npm run comments` over the widened scope shows 0, with the fixed regex;
- `npm run check` green;
- `npm run build` green.

**As built (2026-09-26).** The step shipped with these differences from the text above:

- **The webhook split.** `recordBillingEvent`, `finishBillingEvent` and `handleEvent` live in
  `src/lib/billing/stripe-events.ts` with their private helpers; the route verifies the signature,
  composes and logs its one line. `documents.ts` already took `AdminClient`, so the type moved only
  into `subscription-store.ts`, `create-user-record.ts` and `delete-auth-identity.ts`.
- **The comment gate parses.** `scripts/comment-placement.mjs` uses the TypeScript compiler's parser
  instead of the two regexes, because "is this comment inside a function body" is a syntax
  question: the regexes let a comment above `body = …` or above an object passed to a call through.
  A `/** */` above a declaration or a test case passes inside a body only when that body is a
  `describe` callback. `violations(src, fileName?)` has a fixture test
  (`src/app/__tests__/comment-placement.test.ts`). Across the ten directories it reads 0; across
  the whole of `src` it flags about 4,200 comments in about 520 files (about 2,900 outside tests),
  all outside `ALLOWLIST`, and it flags lint and type pragmas inside a body, which matters only
  when another directory joins the list.
- **One shape per repeated read**, each with every caller moved:
  - `readErrorMessage` (`src/utils/read-error-message.ts`) reads a failed response's `{ error }`
    and never throws on a body that is not JSON; `readRouteBody` (`src/utils/read-route-body.ts`)
    adds the success body's zod parse. Every `as { error?: string }` read uses one of them, the
    five the plan had noted as out of scope included.
  - `toPostType` (`src/lib/visual/visual-backlog.ts`): an unknown post type is `'single'`, as the
    image budget already costs it, in place of every `as PostType`.
  - `mapImageRow` takes only the columns it reads, so the image routes' rows parse with one schema.
  - `readPages` (`src/lib/queries/read-pages.ts`): every ordered PostgREST read that pages.
  - `fetchPostVisuals` (`src/lib/visual/post-visuals.ts`): a post's pictures and live claims, read
    together for the owed count, the painter, the editorial read and the progress poll.
  - `fetchSyncRoster` (`src/lib/queries/sync-roster.ts`): the metrics and comments crons' roster,
    narrowed to `ClientSyncableConnection` once.
  - `UNIQUE_VIOLATION` in `src/utils/constants.ts`.
  - The route tests' `runMetered` stand-in (`src/app/api/ai/__tests__/metered-stand-in.ts`).
- **Casts.** `vat_basis` is parsed with the enum built from `VAT_BASES`; the audit file's month
  split, `entitlement.ts`' keys and the generate cron helpers' projections go by typing;
  `ALLOWANCE_KINDS` (`plans.ts`) turns the ledger's `kind` checks into a guard; `formData.get(…)`
  is checked with `instanceof File`. Two casts stay with a WHY: generate-flow's `ClientData`
  (the request schema types it `unknown`) and `rewrite-draft.ts`' `Rewritten` (the app's own route,
  typed from `performRewrite`).
- **Answers.** Every production caller of `spendFailureResponse` passes 502; the rewrite route
  answers through it, so a provider's own reason reaches the person. `extract/start` answers 503 on
  a failed first write and logs every later one; its `maxDuration` is 300, and so is reanalyze's,
  because a capture's timeouts alone reach 58 s.
- **Tests beyond the text:** Tavily's and fal's answers, `performRewrite`, the rewrite route, the
  extract/start route, the request guard, the TeamTab removal and `violations()`.

**Review of steps 10–13 and the step-9 fixes (2026-09-26).** Eight read-only reviewers (four lenses,
each verified) confirmed 18 distinct findings and refuted 5. All 18 are fixed:

- **An invite could bind an attacker's login (major).** Someone could sign up with a colleague's
  address and a password of their own, leave it unconfirmed, and the next invite to that address
  bound to that login; the invitee's click then confirmed it for the attacker. The operation is now
  `inviteMember` (`src/features/settings/lib/invite-member.ts`), and its row names only a login an
  invite of this workspace created: a login it just created, or the one its own pending row names
  (a resend). It learns the login first with `generateLink` (type invite), which emails nothing;
  any other login is deleted after a second read confirms no live invite names it, and probed
  again. Then exactly one invite goes out (`inviteUserByEmail`), for the login the row names, and a
  new login carries this workspace's name. Whether a call created a login is read from a random
  tag it puts in the metadata, which the auth server writes only on creation — never from the
  clock — and a login this call created is recorded as a pending row before its email goes out, so
  a racing take-back elsewhere sees a live invite and stops. A send that fails, or that names
  another login, deletes what this call created (the row goes with it), so no working link or
  stranded login is left. (Two later reviews found the first version sent before it knew the
  login, and the second judged creation by a 5-second window.)
  - **Two sends to one address:** only the call whose probe created a login ever inserts its row,
    so no rival claim exists; a failed insert of any kind deletes the login this call created. The
    form ignores Enter while sending.
  - **A pending invite holds its address for 7 days** (`PENDING_INVITE_HOLD_DAYS`), counted from
    its latest send (a resend re-stamps `created_at`); after that another workspace may invite the
    address, and its send takes the lapsed login back. The link itself lives a day at most, so the
    hold is the inviting workspace's window to resend.
  - **After its send, the claimed row is read again** (`isClaimStanding`): a workspace delete that
    cascaded it meanwhile takes the new login, and its link, with it. `deleteWorkspace` deletes the
    pending invites in one statement right before the workspace itself and then their logins, so
    only an invite recorded between those two deletes, and re-read before the second, can leave a
    login behind.
  - **A resend whose email went out but whose role could not be saved** answers ok with a notice
    saying so, as the Team tab's removal does, instead of a failure.
  - **An invitee who opened the link is a member at once:** /setup-password provisions them through
    `provisionUserRecord` (`src/lib/auth/provision-user-record.ts`, the dashboard layout's one way
    to provision, now shared), best effort, so a resend and forgot-password both work for them.
    The validated user id has one reader, `getAuthUserId` (`src/lib/auth/helpers.ts`).
- **The capture guard missed sockets and service workers.** Each capture runs in its own browser
  context; the page bypasses service workers; an init script removes WebSocket, WebSocketStream,
  WebTransport, WebRTC's peer connections, both kinds of worker, `window.open` and
  `document.open` before the site's scripts run. Popups, which the step-14 review found escaping
  all of it, are stopped three ways: the opener has nothing to open one with, the browser blocks
  new windows (`--block-new-web-contents` on `@sparticuz/chromium`, whose headless shell has no
  popup blocker, and puppeteer's `--disable-popup-blocking` dropped), and any page target that
  still appears in the capture's context is closed at once. Consent dismissal never clicks a link
  that opens another window.
  - **The public-address rule is enforced at connect time** (a later review found interception
    blind to DNS rebinding, to Chromium 149's new-tab path and to prerendered pages). Every capture
    context goes through a local egress proxy (`src/lib/visual/capture/egress-proxy.ts`): it
    resolves each host once through c-ares with a bounded timeout (off Node's shared worker
    pool), refuses unless every address is public (`arePublicAddresses`,
    `src/lib/sources/validate-url.ts`, the one rule, which reads IPv6 as bits and judges the IPv4
    address carried by ::/96, the mapped, NAT64 and 6to4 forms), and connects to the addresses it
    checked, in order, until one answers. An upstream status outside 200–999 or an upgrade answer
    gets a 502, so nothing the site's server says can throw out of the proxy. The
    context drops Chromium's implicit loopback bypass (`<-loopback>`), a proxy that cannot start
    fails the capture closed, prerendering is off, WebRTC may not send UDP around the proxy, and
    an init script cancels modified or non-primary clicks. A local probe let nothing reach a
    private server through fetch, redirects, sockets, workers, prefetch or ctrl-click tabs; the
    unproxied control leaked every one. The per-origin check in `guardRequests` is gone.
- **New run on an idea's run kept the idea's brief,** unlocked and unlinked: the page keys the flow
  on the idea, so the move to the plain run remounts it.
- **The cron's "used up" bell named the whole schedule's need,** so owed pictures that stopped even
  one post went unnamed; `planScheduledBatch`'s `short` is now one post's shortfall, and null when a
  batch runs.
- **The usage read could be cut at 1,000 rows,** and **stuck documents held the retry's ten
  slots.** Both read through `readPages`; the retry delivers every stale document, oldest first,
  until the billing cron's deadline.
- **A member whose login survived removal kept the dialog open:** the removal answers ok with a
  notice (`LOGIN_SURVIVED`), and the Team tab closes and says it.
- **Smaller:** "1 AI image" in the singular (`ALLOWANCE_NOUN`); the empty-query fallback in source
  suggestions is logged; `BILLING_NOTIFICATION_TITLES`, `ReminderOutcome`, `TRIAL_DAYS`, `COMPANY`
  and `deleteAuthIdentity`'s log say what the code does; a plan-section test asserts what a reader
  sees, not a class.

**Review of step 14 and the fix round (2026-09-26).** Eight read-only reviewers confirmed 11
distinct findings and refuted one. The popup hole and the invite's dead first email are folded into
the bullets above; `WebSocketStream` too. The rest:

- **Folds in changed functions outside `ALLOWLIST`.** `CalendarPage`, `ReviewPage`, the publish
  route's `POST`, `fetchImagesByPost` and `generateSvgAsset` changed (a cast became `toPostType`,
  reads were chunked, a reader moved) but kept their in-body comments; each is folded into its doc.
  The publish route's and `fetchImagesByPost`'s casts go, because the typed client infers their
  selects; the calendar's row types and `latestToken` move to module scope.
- **False docs:** `BILLING_NOTIFICATION_TITLES` names both raisers of `allowance_reached`; the
  Account tab's logo note names the column that exists; `retryUndeliveredDocuments` says a slow
  failure can use most of the deadline; the comments cron names every commentable network; the
  gate count above is measured.
- **Recorded, not edited:** migration 20260861's comments naming the old writers ("Noted, not
  fixed").

Still owed after this step: observed runs of an onboarding capture on Vercel (the per-capture
context with the egress proxy under `@sparticuz/chromium` 149 on Linux and `--single-process`, its
latency and c-ares DNS in the Lambda runtime, `--block-new-web-contents`, the popup closer, and whether a modified click
opens a tab there),
an invite to a fresh address on the live project (the email names the workspace), a document retry
that renders cold within the billing cron's 20 s reserve, and New run from an idea's run in a
browser.

### 15. Who adds and deletes clients, and what Stripe bills after a delete (founder, 2026-09-27)

> Superseded by docs/plans/CLIENT-SLOTS.md (2026-09-30): the admin chooses the client slots in Plan & billing; creating or deleting a client no longer changes the Stripe quantity.

Decided after the plan was built — the four items the plan had parked:

- **A paid workspace's last client is billed as one.** `billableQuantity` keeps its floor of one:
  the plan is at least one client, and cancelling it (Plan & billing) is how billing stops. Today
  the delete dialog says nothing about billing, so it gains one sentence (below).
- **Only admins add or delete clients.** Both change what the workspace pays (an add is charged
  pro rata, a delete lowers the next renewal) and a delete cannot be undone.
- **The count is lowered before each renewal**, on `invoice.upcoming`, not only after it is paid.
- **A decrease runs for any open subscription** — a decrease never charges, so a locked workspace
  (renewal failed past its grace, subscription still open) lowers Stripe's count like any other.

**Changes:**

- **One rule for who may change the roster** (`src/lib/billing/copy.ts`): `CLIENTS_ADMINS_ONLY`
  ("Only admins can add or delete clients.") and `clientRosterRefusal(role)`, null for an admin.
  - `addBrandRefusal(entitlement, brandCount, role)` asks it first, so `createClient`,
    `settleNewClient`'s race re-check and every Add-client control (`addBrandGate`: the clients
    page, the dashboard, the (dashboard) layout's palette) refuse a member in the same words.
    `resolveActionAuth` already returns the cached role; the pages read it from
    `requireSessionUser`, the layout from its own user row — no new read.
  - `deleteClient` refuses a member with the same function before anything is deleted, and the
    edit page passes the refusal to `ClientSettingsForm` → `ClientDangerRail`, which shows the
    sentence in place of the button for a member.
- **The delete dialog names the bill** (`deleteClientNotice(entitlement, clientCount)` in
  copy.ts, null on the trial and house): on a paid workspace, one client fewer is billed from the
  renewal and this period's allowance stays; for the last client, the plan keeps billing one
  client until it is cancelled under Plan & billing. The edit page computes it from the cached
  entitlement and client list and passes it through `ClientSettingsForm` to `DeleteClientDialog`.
- **Decreases for any open subscription** (`src/lib/billing/quantity-sync.ts`):
  `openSubscriptionId(entitlement, agency)` — the stored id while `subscriptionOpen` — beside
  `billedSubscriptionId`, which stays the increase's answer (only a live plan may be charged).
  `deleteClient`'s decrease uses it; `settleNewClient`'s undo keeps the id its increase used.
- **`invoice.upcoming`** (`src/lib/billing/stripe-events.ts`): the subscription is re-fetched and
  snapshotted like any invoice event, then `reconcileQuantity` lowers the count (`decrease`) for
  that open subscription; an upcoming invoice without a subscription is `ignored`. The runbook
  (`docs/n18/README.md` step 5) lists seven event types.

**Hand work:** add `invoice.upcoming` to the Stripe webhook endpoint in test and live mode, and
check that Billing → Subscriptions sends upcoming-renewal events early enough (Stripe's setting,
in days before renewal).

→ verify:
- `copy.test.ts`: `clientRosterRefusal`; `addBrandRefusal` refuses a member before the cap;
  `deleteClientNotice` on trial, house, a paid workspace with several clients and with one.
- `client-actions.test.ts`: a member's create is refused before anything is provisioned; a
  member's delete is refused before anything is deleted; a locked workspace with an open
  subscription runs the decrease on delete; a paid one still does; the trial does not.
- `quantity-sync.test.ts`: `openSubscriptionId` per state.
- `webhook.test.ts` (through `POST`): `invoice.upcoming` re-fetches, snapshots and decreases;
  one without a subscription is ignored.
- the clients page, the dashboard and the palette refuse a member's Add client with the sentence;
  `ClientDangerRail` shows the refusal for a member; `DeleteClientDialog` shows the notice.
- `npm run check`, `npm run build`, `npm run plan:check`.

**As built (2026-09-27).** The step shipped with these differences from the text above:

- **The way out is the gate's.** `AddBrandGate` carries `wayOut`, true only when the refusal is
  the plan's, so a member's "Only admins can add or delete clients." never offers Plan & billing —
  on the clients page and the dashboard header alike.
- **`deleteClientNotice` is also null while the plan is set to end,** since it has no renewal left
  to change; the last-client case reads the floor from `billableQuantity`.
- **`invoice.upcoming` shares the invoice case,** so re-fetch, snapshot and reconcile are written
  once; `reconcileQuantity(…, renewalAhead)` lowers on it when the snapshot owns the subscription,
  and every reconcile now runs only while the subscription is open (`hasSubscriptionEnded`). The
  failed-payment reminder keys on `invoice.payment_failed` itself.
- **The database agrees with the action.** `20260864_clients_delete_admin_only.sql` revokes DELETE
  on `clients` from the tenant roles — without it a member could delete a client through
  PostgREST directly, since `clients_agency_isolation` covers every operation.
  `billing-sql.test.ts` replays it after the platform's own grants and proves the revoke.
- **Casts the typed client makes redundant go:** the layout's two, the auth callback's metadata
  cast and `getUserRecord`'s.

**Review of the whole change (2026-09-27).** Twelve read-only reviewers, each finding checked by an
independent verifier: 79 confirmed (about 60 distinct), 3 already noted, 3 disproved. All fixed:

- **Money and the filing.** The price must be VAT-exclusive (`verifiedPriceId`); an old Checkout
  session that cannot be expired refuses a new one; a second open subscription logs at error
  level; the audit month is read in pages; an invoice paid with no card charge is refused; the
  monthly routine finds undocumented sales from stored events
  (`supabase/queries/undocumented-sales.sql`).
- **Customers.** The paused wording says the workspace keeps what was made (`WORKSPACE_PAUSES`); a
  failed trial re-count keeps the client; a failed workspace delete still deletes its invitees'
  logins; a carousel rewrite keeps its slide fields and refuses an empty caption; a model reply
  with no JSON makes `analyzeUrl` throw.
- **Generate.** A batch claimed this tick counts its pictures as owed, so the bell matches the
  meter; a failed client read is an error; `generationGate` returns the way out with the refusal;
  an unmetered image pool never reads owed pictures.
- **Simpler.** The capture keeps the egress proxy, `<-loopback>` and proxy-only WebRTC; the popup,
  tab, worker, socket and prerender layers are gone. `runScheduledBatch` is split into steps; one
  paged posts-with-pictures read (`readPostVisualPages`); `missingImagePositions`, the painter's
  impossible guards and `spendFailureResponse`'s status argument are gone; the reset hour is
  pinned to vercel.json by a test.
- **Comments.** The gate flags every comment in a body, test cases included (docs/CLAUDE.md), and
  long docs were cut.
- **Text.** Terms §10, the data-deletion page, Privacy (Canva, Jina AI), BILLING.md's portal lines,
  the runbook's curl, and the deploy order's rollback step.

## Hand work (the founder's)

- **Stripe Dashboard:**
  - the portal with cancellation **off** and subscription update off;
  - the €29 price in test and live, tax behaviour **exclusive**, with its id in `STRIPE_PRICE_ID`
    (step 3 refuses a Checkout whose price disagrees, its tax behaviour included);
  - the webhook endpoint with the seven event types, `invoice.upcoming` among them, and Billing →
    Subscriptions sending upcoming-renewal events (docs/n18/README.md, step 5);
  - the EUR minimum charge (€0.50) is confirmed from Stripe's currency docs; check only that the
    payout bank account settles in euro.
- **Accountant:**
  - a fractional OSS rate in `art_vat_rate`;
  - a month with refunds and no sales;
  - whether a lost chargeback is reported as a return (the out-of-band convention).
- **Migrations:** deploy → 20260861 → 20260862 → 20260864 (Deploy order, item 3), with
  `npm run db:types` after the first two. Before 20260862, run the read-only
  `supabase/queries/invites-before-cleanup.sql`. It can list a member an admin removed, so a listed
  person is invited again only once their workspace's admin confirms it.
- **Keep "Confirm email" on** in Supabase (Authentication → Providers → Email). With it off, a
  sign-up to an invitee's address confirms their login without a password check and joins the
  pending invite.
- **Before setting a workspace to house,** end its Stripe subscription, or set it to end.
- **Email notice** of the Privacy and Terms changes to existing customers.
- **After a week of unrounded cost data,** re-measure the cost of a post against €29.
- **Monthly:** run `supabase/queries/undocumented-sales.sql` alongside the audit-file routine
  (docs/n18/README.md).

## Disproved in review — not changed

- The generate cron's roster read is not a copy of `fetchEntitledClients` (m1-7).
- `BillingWall`, `BillingBanner` and `GatedAction` in `src/components` are generic enough for their
  place (m1-10).
- The period drift at a renewal is documented and self-healing (m1-16).
- Billing bells reaching members is how the bell works (m1-76).
- The delete-and-re-sign-up trial is a stated behaviour (m3-0).

The plan review likewise refuted four objections: a shared status rule for runs, PGlite's single
connection, `unwrap` versus a throw, and where the webhook's reminder log lives.

## Noted, not fixed (outside this plan's scope)

- `type Admin` aliases in `src/features/comments/queries/comment-queue.ts` and
  `src/lib/canvas/doc-store.ts`, and the routes and libraries that spell
  `ReturnType<typeof createAdminSupabaseClient>` instead of `AdminClient` (meta callback and data
  deletion, the canvas route, comment actions, `generate-post-visual.ts`, the visuals cron).
- In-body comments in directories this plan does not gate (`lib/visual`, `features/generate`,
  `features/clients`, …). Widening `ALLOWLIST` now also flags docs on nested declarations inside
  components and lint pragmas inside a body; decide on pragmas first.
- The per-client failure loop that `syncRoster` and `syncAllClientComments` both write (time budget,
  `token_invalid` → `retireConnection`, `rate_limited` → stop). Their roster read is one since step
  14; the loop is not.
- `finishGenerationRun`, `trackGenerationTheme` and `fetchWaitingRuns` (`runs.ts`) take an untyped
  `SupabaseClient`; typing them needs `SkippedPillars` to become a type alias.
- `features/assets/lib/storage.ts` still casts `POST_IMAGE_COLUMNS` rows to the full `PostImageRow`; `canva-design-picker.tsx` reads its designs as `any`;
  `features/generate/schemas.ts` types `clientData` as `unknown`, which keeps two WHY-as casts.
- A document whose delivery fails slowly (a render or send that hangs to its timeout) can use most of
  the retry's time each day; rotating them needs a last-attempt column (a migration).
- The capture's in-page evaluations and `describePalette`'s model call have no timeout of their own
  below `maxDuration`.
- Casts without a WHY that the step-14 folds left in functions they changed: `CalendarPage`'s and
  `ReviewPage`'s row casts. The typed client inferred the publish route's embedded select, so some
  may be removable; `publish-post.ts`'s "does not infer" WHY is suspect for the same reason.
- `fetchChangeRequests` (`features/dashboard/queries/change-requests.ts`) and `submitApproval`
  (`features/approval-portal/actions/approval-actions.ts`) read `[0]` of an unordered token list.
- An invite's probe (`generateLink`) replaces the confirmation token of an unconfirmed login; if
  another workspace resends to the same address between this invite's first read and its probe,
  that resend's link stops working and this invite answers 409.
- `fetchRemoteImage` (`src/features/assets/lib/fetch-remote-image.ts`) and the sources discover
  route (`src/app/api/sources/discover/route.ts`) call `validateSourceUrl` and then `fetch` with
  redirects followed: the fetch resolves the name again (DNS rebinding) and follows a redirect to a
  private address unchecked — the hole the capture's egress proxy closes, outside the capture.
- The address rule does not yet refuse every special-purpose range: IPv6 Teredo (2001::/32, which
  carries a disguised IPv4 address), 64:ff9b:1::/48, 2001:2::/48, 3fff::/20, 5f00::/16 and
  100:0:0:1::/64, and the IPv4 documentation and relay nets (192.0.0.0/24, 192.0.2.0/24,
  198.51.100.0/24, 203.0.113.0/24, 192.88.99.0/24). Allowing only 2000::/3 plus the
  IPv4-carrying ranges would close the IPv6 half at once.
- `validateSourceUrl`'s own lookup still uses `dns.lookup` (Node's worker pool, no timeout): once
  per capture, and per call for the other fetchers noted above.
- `@types/node` is pinned at 20 while the runtime is Node 24, so the proxy's resolver casts its
  options for `maxTimeout`; no Node version is pinned for Vercel, and an older one would ignore it.
- Two narrow windows around a workspace delete: an invite accepted between its members read and
  its pending-invites delete leaves that login (its row cascades with the workspace), and one
  recorded between that delete and the workspace delete, and re-read before the workspace delete,
  leaves its login and link.
- The auth callback page (`src/app/auth/callback/page.tsx`) still provisions with its own block,
  since it also decides where an invited user goes next; it has in-body comments.
- The egress proxy allows any port on a public address, because `validateSourceUrl`'s rule judges
  addresses only; Chromium itself refuses its list of unsafe ports. A port policy belongs in
  `validate-url.ts` if one is wanted.
- Between an invite's probe creating a login and its claim row (milliseconds), another workspace's
  take-back can delete that login. If the delete lands first, the insert fails and nothing is sent;
  if the insert lands first, the row goes with the login and the send reaches whichever login then
  holds the address — one this send created, deleted at once, or the other workspace's re-probed
  one, which then receives this workspace's email under its own stored name.
- Migration 20260854's comment says the delete action writes through the user-scoped client; it has
  used the service role since a8f2c4cf. 20260864 now revokes DELETE as well.
- Migration 20260861's comments name the webhook route (line 7) and the invite route (line 240) as
  the code that decides which invoices become documents and writes `team_invites`; since step 14
  that is `handleEvent` (`src/lib/billing/stripe-events.ts`) and `inviteMember`
  (`src/features/settings/lib/invite-member.ts`). Applied migrations are not edited.
- The other findings of the 2026-09-19 cross-agency audit. Step 12 closes its central hole (invites
  from metadata); the rest stay on that list.

## Finding → step

| Step | Findings |
|---|---|
| 3 | m1-0 m1-1 m1-2 m1-3 m1-9 m1-23 (billing_updated_at half; credit-note half in step 5) m1-28 m1-31 m1-33 m1-35 m1-38 m1-62 m1-94 m1-98 |
| 4 | m1-4 m1-6 m1-32 m1-61 m1-63 m1-64 |
| 5 | m1-21 m1-22 m1-30 m1-65 m1-66 m1-67 m1-68 m1-69 m1-70 m1-71 m1-72 m1-73 m1-74 m1-92 m1-107 m1-108 m2-6 m2-7 |
| 6 | m1-14 m1-15 m1-17 m1-18 m1-19 m1-40 m1-42 m1-45 m1-50 m1-54 m1-102 |
| 7 | m1-95 |
| 8 | m1-75 m1-83 (notify half; the rest in step 14) |
| 9 | m1-25 m1-34 m1-39 m1-48 m1-49 m1-51 m1-52 m1-55 m1-56 m1-57 m1-84 m1-85 m1-86 m1-87 m1-88 m1-89 m1-101 m1-105 |
| 10 | m1-5 m1-8 m1-36 m1-79 m1-80 m1-81 m1-99 m1-100 m1-103 m1-104 m2-4 |
| 11 | m1-26 m1-27 m1-53 m1-77 m1-78 m1-82 |
| 12 | m1-37 m1-41 m1-46 (suggest part; extract part in step 14) m1-91 m1-93 m3-1 m3-2 m3-3 |
| 13 | m2-0 m2-1 m2-2 m2-3 m2-5 |
| 14 | m1-11 m1-12 m1-13 m1-20 m1-24 m1-29 m1-43 m1-44 m1-47 m1-58 m1-59 m1-60 m1-83 (second half) m1-90 m1-96 m1-97 m1-106 m3-4 m1-46 (extract part) |

## Verified before writing

| Symbol | Where | Exported | On error | Cache | Notes |
|---|---|---|---|---|---|
| `startCheckout` | `src/features/settings/actions/billing-actions.ts:42` | yes | `ActionResult`; Stripe errors logged, one sentence | cached agency + entitlement | refuses only house/active/past_due today |
| `openBillingPortal` | `src/features/settings/actions/billing-actions.ts:76` | yes | `ActionResult` | cached agency |  |
| `setPlanEndingAction` | `src/features/settings/actions/billing-actions.ts:98` | yes | `ActionResult` | uncached row (`fetchAgencyById`) | cancel = `cancel_at_period_end` in every state |
| `createCheckoutSession` | `src/lib/billing/checkout.ts:22` | yes | throws | — | no existing-subscription check |
| `createPortalSession` | `src/lib/billing/checkout.ts:48` | yes | throws | — | doc lists cancellation |
| `stripeClient` | `src/lib/billing/stripe.ts:14` | yes | throws when the key is unset | module-level client |  |
| `stripePriceId` | `src/lib/billing/stripe.ts:28` | private | throws when unset | — | private since step 3; read through `verifiedPriceId` |
| `ensureStripeCustomer` | `src/lib/billing/subscription-store.ts:92` | yes | throws on the row write | busts `'agencies'` with `'max'` |  |
| `applySubscriptionSnapshot` | `src/lib/billing/subscription-store.ts:141` | yes | throws on read/write | busts `'agencies'` with `'max'` | `subscription_created` owns unconditionally; writes `plan: 'pro'` |
| `setPlanEnding` | `src/lib/billing/subscription-store.ts:211` | yes | throws | via the snapshot | `cancel_at_period_end` only |
| `isPaying` | `src/lib/billing/entitlement.ts:88` | yes | pure | — | pro + active/past_due |
| `noEntitlement` | `src/lib/billing/entitlement.ts:174` | yes | pure | — | locked literal |
| `entitlementFor` | `src/lib/billing/entitlement.ts:199` | yes | pure | — | locked → periodKey `'trial'`, zero limits; `canCreate` equals `canSpend` in every branch |
| `requireEntitledRoute` | `src/lib/billing/require-entitled.ts:24` | yes | 402 or null | `getCachedEntitlement` | error is always `WORKSPACE_LOCKED` |
| `requireEntitledAction` | `src/lib/billing/require-entitled.ts:37` | yes | failure or null | `getCachedEntitlement` | error is always `WORKSPACE_LOCKED` |
| `billedSubscriptionId` | `src/lib/billing/quantity-sync.ts:37` | yes | pure | — | reads `isPaying` |
| `syncSubscriptionQuantity` | `src/lib/billing/quantity-sync.ts:211` | yes | only `update` is wrapped in `QuantityChargeError` | — | caller picks the proration |
| `QuantityChargeError` | `src/lib/billing/quantity-sync.ts:22` | yes | — | — |  |
| `createClient` | `src/features/clients/actions/client-actions.ts:55` | yes | `ActionResult` | cached entitlement + agency | charges before provisioning |
| `deleteClient` | `src/features/clients/actions/client-actions.ts:176` | yes | `ActionResult`; Stripe failure logged | cached entitlement + agency | `'none'` decrease |
| `provisionClient` | `src/features/clients/lib/provision-client.ts:42` | yes | `{ ok:false }`; rolls the row back | — | doc says user-scoped, caller passes admin |
| `PlanActions` | `src/features/settings/components/plan-actions.tsx:31` | yes | toast | — | `isPaying` picks the buttons |
| `PlanEndControl` | `src/features/settings/components/plan-end-control.tsx:25` | yes | toast | `router.refresh()` |  |
| `deleteWorkspace` | `src/features/settings/actions/workspace-actions.ts:41` | yes | `ActionResult` | busts with `'max'` | doc says the portal ends the plan |
| `recordBillingEvent` | `src/lib/billing/stripe-events.ts:62` | yes | throws on the read-back | — | one writer of `billing_events`; moved from the webhook route (step 14) |
| `finishBillingEvent` | `src/lib/billing/stripe-events.ts:90` | yes | logs a failed write | — | moved from the webhook route (step 14) |
| `handleEvent` | `src/lib/billing/stripe-events.ts:182` | yes | throws → 500 | — | sale document when `amount_paid > 0`; moved from the webhook route (step 14) |
| `allowanceUsedUp` | `src/lib/billing/copy.ts:111` | yes | pure | — |  |
| `postsLeft` | `src/lib/billing/copy.ts:139` | yes | pure | — |  |
| `allowanceWarning` | `src/lib/billing/copy.ts:142` | yes | pure | — |  |
| `addBrandRefusal` | `src/lib/billing/copy.ts:232` | yes | pure | — | one rule for the button and the action |
| `cancelPlanConsequence` | `src/lib/billing/copy.ts:270` | yes | pure | — | "nothing more is charged" |
| `checkoutSummary` | `src/lib/billing/copy.ts:307` | yes | pure | — | `Math.max(1, clientCount)` |
| `addBrandCost` | `src/lib/billing/copy.ts:321` | yes | pure | — | net price, no paid-count branch |
| `PLAN_ALREADY_ACTIVE` | `src/lib/billing/copy.ts:395` | yes | — | — |  |
| `checkoutActivated` | `src/lib/billing/copy.ts:451` | yes | pure | — |  |
| `shellNotice` | `src/lib/billing/copy.ts:485` | yes | pure | — |  |
| `WORKSPACE_LOCKED` | `src/lib/billing/copy.ts:519` | yes | — | — | state-blind |
| `WORKSPACE_LOCKED_DETAIL` | `src/lib/billing/copy.ts:572` | yes | — | — | promises publishing resumes |
| `REMINDER_COPY` | `src/lib/billing/copy.ts:591` | yes | — | — | hard-codes "a week" |
| `BILLING_NOTIFICATION_TITLES` | `src/lib/billing/copy.ts:641` | yes | — | — | doc cites a missing function |
| `formatLongDate` | `src/utils/format.ts:16` | yes | pure | — | every billing date since step 10; `copy.ts`'s private `formatDay` (no year) is gone |
| `wayForward` | `src/lib/billing/copy.ts:99` | private | pure | — | not state-aware |
| `TRIAL_NOTICE_DAYS` | `src/lib/billing/plans.ts:77` | yes | — | — | 3; moved from copy.ts (step 10) |
| `vatBasisOf` | `src/lib/billing/documents.ts:171` | yes | throws on an unnamed case | — | `reduced_rated` BG → domestic |
| `issue` | `src/lib/billing/documents.ts:202` | private | throws | — | the RPC call |
| `RETRY_AFTER_MS` | `src/lib/billing/documents.ts:63` | private | — | — | 10 min |
| `issueSaleDocument` | `src/lib/billing/documents.ts:245` | yes | throws | — | `vat_rate: Math.round`, `issued_at = paid_at` |
| `issueCreditNote` | `src/lib/billing/documents.ts:351` | yes | throws | — | gross = `note.total`, first refund only |
| `deliverSaleDocument` | `src/lib/billing/documents.ts:431` | yes | never throws after the read; failure write unchecked | — | `storage_path` and `delivered_at` in one update; re-renders every attempt |
| `retryUndeliveredDocuments` | `src/lib/billing/documents.ts:487` | yes | throws on the read | — | no cap; since the review round, every stale document until the cron's deadline |
| `listDocumentDownloads` | `src/lib/billing/documents.ts:498` | yes | throws on a storage error | — |  |
| `monthReadRange` | `src/lib/billing/audit-file.ts:31` | yes | pure | — | own `86_400_000` |
| `documentsOfMonth` | `src/lib/billing/audit-file.ts:41` | yes | pure | — | cut by `issued_at` |
| `centsToDecimal` | `src/utils/format.ts:144` | yes | pure | — | cents → 2 decimals; replaced the audit file's private `money` (step 5) |
| `orderOf` | `src/lib/billing/audit-file.ts:84` | private | throws on a totals mismatch | — | `ord_d` from `issued_at` |
| `refundOf` | `src/lib/billing/audit-file.ts:132` | private | pure | — | r_amount = gross |
| `buildAuditFile` | `src/lib/billing/audit-file.ts:149` | yes | throws on totals/ASCII | — | `r_ord` = credit-note count; empty `<order>` possible |
| `TAX_GROUPS` | `src/lib/billing/document-render.ts:23` | yes | — | — | 'Б' domestic |
| `documentIds` | `src/lib/billing/document-render.ts:39` | yes | throws when env unset | — |  |
| `qrPayload` | `src/lib/billing/document-render.ts:66` | yes | pure | — | credit note → refund id |
| `renderSaleDocumentHtml` | `src/lib/billing/document-render.ts:130` | yes | async, pure | — | domestic printed as `VAT 20 %` |
| `DOCUMENT_TIMEZONE` | `src/utils/constants.ts:73` | yes | — | — | was private in `document-render.ts`, beside `AUDIT_TIMEZONE` in `audit-file.ts` (step 5) |
| `parseDocumentLines` | `src/lib/billing/document-schemas.ts:42` | yes | zod throws | — | no JSDoc |
| `documentEmail` | `src/lib/email/templates.ts:80` | yes | pure | — | always links Plan & billing |
| `EmailContent` | `src/lib/email/layout.ts:58` | yes | — | — | `cta` required today |
| `renderEmail` | `src/lib/email/layout.ts:85` | yes | pure | — |  |
| `sendEmail` | `src/lib/email/resend.ts:39` | yes | throws | — | idempotency key option |
| `fetchSaleDocumentsByAgency` | `src/lib/billing/documents.ts:72` | yes | throws via `unwrap` | — | moved from `db.ts` (step 5); takes the admin client |
| `fetchSaleDocumentById` | `src/lib/billing/documents.ts:107` | private | throws via `unwrap` | — | moved from `db.ts` (step 5); takes the admin client |
| `fetchSaleDocumentByStripeInvoice` | `src/lib/billing/documents.ts:118` | private | throws via `unwrap` | — | moved from `db.ts` (step 5); takes the admin client |
| `fetchSaleDocumentsBetween` | `src/lib/billing/documents.ts:89` | yes | throws via `unwrap` | — | moved from `db.ts` (step 5); takes the admin client |
| `fetchUndeliveredSaleDocumentIds` | `src/lib/billing/documents.ts:136` | private | throws | — | was `fetchUndeliveredSaleDocuments` in `db.ts`; moved (step 5), ids only and paged (review round) |
| `countClientsByAgency` | `src/lib/queries/db.ts:72` | yes | throws (inline) | none |  |
| `fetchAgencyById` | `src/lib/queries/db.ts:134` | yes | throws; null on no row | none | `AGENCY_SETTINGS_COLUMNS`, no `billing_updated_at` |
| `fetchTeamMembersByAgency` | `src/lib/queries/db.ts:164` | yes | throws via `unwrap` | none |  |
| `AGENCY_KEYS` | `src/lib/queries/select-columns.ts:267` | private | — | — | carries `billing_updated_at` |
| `AGENCY_BILLING_KEYS` | `src/lib/queries/select-columns.ts:252` | private | — | — |  |
| `AGENCY_SNAPSHOT_COLUMNS` | `src/lib/queries/select-columns.ts:307` | yes | — | — | the snapshot's row read |
| `SALE_DOCUMENT_KEYS` | `src/lib/queries/select-columns.ts:721` | private | — | — | gains `tax_event_at` |
| `consumeUsage` | `src/lib/billing/usage.ts:44` | yes | throws on the RPC | — |  |
| `settleUsage` | `src/lib/billing/usage.ts:82` | yes | logs, never throws | — | returns early on `reserved <= 0`; clamps to reserved |
| `readUsage` | `src/lib/billing/usage.ts:181` | yes | throws | — | `{ landed, committed }` |
| `STALE_RESERVATION_MS` | `src/lib/billing/usage.ts:151` | private | — | — | 10 min |
| `clearStaleReservations` | `src/lib/billing/usage.ts:163` | yes | throws | — | `reserved_at < cutoff` never matches NULL |
| `AllowanceError` | `src/lib/billing/usage.ts:217` | yes | — | — |  |
| `reserveUsage` | `src/lib/billing/usage.ts:241` | yes | throws the refusal | reads `getCachedEntitlement` |  |
| `runMetered` | `src/lib/billing/usage.ts:262` | yes | rethrows after settling | — |  |
| `settleReserved` | `src/lib/billing/usage.ts:279` | private | — | re-reads `getCachedEntitlement` |  |
| `allowanceResponse` | `src/lib/billing/usage.ts:293` | yes | — | — | the 402 body |
| `spendFailureResponse` | `src/lib/billing/usage.ts:331` | yes | — | — | status passed by the route |
| `ConsumeResult` | `src/lib/billing/usage.ts:30` | private | — | — | allowed branch carries unread fields |
| `Spender` | `src/lib/billing/spend-context.ts:36` | yes | — | — | `reserved` set by `runMetered` |
| `runAsSpender` | `src/lib/billing/spend-context.ts:53` | yes | — | AsyncLocalStorage |  |
| `currentSpender` | `src/lib/billing/spend-context.ts:58` | yes | — | — |  |
| `PostsAffordable` | `src/lib/billing/post-allowance.ts:18` | yes | — | — | carries the function's doc |
| `postsAffordable` | `src/lib/billing/post-allowance.ts:25` | yes | pure | — |  |
| `generationGate` | `src/lib/billing/post-allowance.ts:101` | yes | pure | — | replaced `canMakeAPost` (step 9, as `generationRefusal`); the one answer for every Generate control, with its way out since the 2026-09-27 review |
| `fetchEntitledClients` | `src/lib/billing/entitled-clients.ts:24` | yes | throws | fresh admin reads |  |
| `PAUSED_WINDOW_DAYS` | `src/lib/billing/reminders.ts:19` | private | — | — | 7 |
| `pickReminder` | `src/lib/billing/reminders.ts:38` | yes | pure | — |  |
| `remindWorkspace` | `src/lib/billing/reminders.ts:122` | yes | throws on the cooldown read | — | bell, then email |
| `remindTrialWorkspaces` | `src/lib/billing/reminders.ts:163` | yes | roster reads throw | — | no window on the roster |
| `remindPaymentFailed` | `src/lib/billing/reminders.ts:230` | yes | throws on reads | — | second admin reader |
| `NOTIFY_EVERY_TIME` | `src/lib/notifications/notify.ts:32` | yes | — | — |  |
| `notify` | `src/lib/notifications/notify.ts:79` | yes | cooldown read throws; insert → `'failed'` | — | select-then-insert, no unique key |
| `resolveTarget` | `src/lib/notifications/notify.ts:109` | private | throws | — | cast of an untyped client |
| `toEurCents` | `src/lib/billing/ai-prices.ts:53` | private | pure | — | rounds each call |
| `anthropicCostCents` | `src/lib/billing/ai-prices.ts:66` | yes | pure | — |  |
| `recordAiUsage` | `src/lib/billing/telemetry.ts:35` | yes | never throws | — |  |
| `callAnthropic` | `src/utils/ai-client.ts:146` | yes | throws after retries | — | refuses with no spender |
| `generateBriefing` | `src/ai/intelligence/generate-briefing.ts:116` | yes | throws | — | raw client; records usage itself |
| `ACTIVE_RUN_WINDOW_MS` | `src/lib/generation/runs.ts:15` | private | — | — | 6 min |
| `startGenerationRun` | `src/lib/generation/runs.ts:63` | yes | insert failure → `{ runId:null, slotTaken:false }` | — |  |
| `finishGenerationRun` | `src/lib/generation/runs.ts:150` | yes | logs a failed close | — | settles before the status write |
| `fetchActiveRuns` | `src/lib/generation/runs.ts:295` | yes | degrades to `[]` | — |  |
| `insertDraftPosts` | `src/lib/generation/draft-posts.ts:41` | yes | throws | — | takes `generation_run_id` |
| `persistStreamedDraft` | `src/lib/generation/draft-posts.ts:73` | yes | throws via the insert | — | `run.id` nullable with a client fallback |
| `TIME_BUDGET_MS` | `src/app/api/cron/generate/route.ts:39` | private | — | — | 240 s |
| `GET` | `src/app/api/cron/generate/route.ts:59` | yes | 500 on the roster reads | — | reads `generation_runs` itself; bell outside the try |
| `fetchScheduleContext` | `src/app/api/cron/generate/helpers.ts:49` | yes | throws | — | `Promise.all` over `readUsage` |
| `notifyAllowanceExhausted` | `src/lib/generation/scheduled-run.ts:61` | private | throws via notify | — | moved from the cron's helpers with the per-client pipeline (step 9) |
| `MAX_IMAGES_PER_RUN` | `src/lib/visual/paint-backlog.ts:22` | yes | — | — | 12; moved with the paint loop (step 9) |
| `POST_PAGE` | `src/lib/visual/post-visuals.ts:18` | private | — | — | 100 a page; replaced the fixed `BACKLOG_FETCH_LIMIT` window (step 9), shared by the owed read and the painter since the 2026-09-27 review |
| `releaseAbandonedClaims` | `src/app/api/cron/visuals/route.ts:21` | private | logs | — | visual job claims |
| `visualSlots` | `src/lib/visual/visual-backlog.ts:13` | yes | pure | — |  |
| `totalVisualSlots` | `src/lib/visual/visual-backlog.ts:26` | yes | pure | — |  |
| `missingPositions` | `src/lib/visual/visual-backlog.ts:68` | yes | pure | — | ignores claims |
| `BacklogPost` | `src/lib/visual/visual-backlog.ts:63` | yes | — | — |  |
| `pickVisualBacklog` | `src/lib/visual/visual-backlog.ts:135` | yes | pure | — | slices positions to the budget |
| `fetchVisualJobs` | `src/lib/visual/visual-jobs.ts:101` | yes | throws | — | live claims by post |
| `subscribeFal` | `src/lib/visual/fal.ts:46` | private | throws | — | reserves one image |
| `callFal` | `src/lib/visual/fal.ts:65` | private | throws | — | casts the `ApiError` body |
| `downloadFalFile` | `src/lib/visual/fal.ts:95` | yes | throws | — |  |
| `captureSite` | `src/lib/visual/capture/capture-site.ts:89` | yes | never throws | concurrency limiter | retries only 'navigation failed' |
| `captureOnce` | `src/lib/visual/capture/capture-site.ts:35` | private | never throws | — | normalises the scheme itself |
| `guardRequests` | `src/lib/visual/capture/guard-requests.ts:35` | yes | — | — | was `blockTrackers` in block-trackers.ts; the tracker filter alone again since the 2026-09-27 review — the egress proxy judges addresses |
| `toWebsiteUrl` | `src/utils/url.ts:32` | yes | pure | — | adds `https://` |
| `GeneratePage` | `src/app/(generate)/generate/page.tsx:44` | yes | waiting drafts degrade | cached entitlement |  |
| `fetchEditorialPosts` | `src/lib/posts/fetch-editorial-posts.ts:45` | yes | throws | — | the one read of undecided posts |
| `GenerateFlow` | `src/features/generate/components/generate-flow.tsx:129` | yes | — | — | `canPaint: affordable.posts !== 0` |
| `SetupView` | `src/features/generate/components/setup/setup-view.tsx:64` | yes | — | — | `spent = affordable.posts === 0` |
| `CountSteppers` | `src/features/generate/components/setup/count-steppers.tsx:77` | yes | — | — | `maxPosts` inline |
| `RunPanel` | `src/features/generate/components/setup/run-panel.tsx:35` | yes | — | — | refusal inline |
| `useDraftVisuals` | `src/features/generate/hooks/use-draft-visuals.ts:34` | yes | — | — | subtracts claimed positions |
| `DashboardPage` | `src/app/(dashboard)/dashboard/page.tsx:52` | yes | — | cached reads | `canMakeAPost` on zeroed limits in grace |
| `CoverageRow` | `src/features/dashboard/components/coverage-row.tsx:34` | yes | — | — | ungated Generate link |
| `GatedAction` | `src/components/ui/gated-action.tsx:26` | yes | — | — |  |
| `ShellProvider` | `src/components/layout/shell-context.tsx:234` | yes | — | — | mounts `CommandPalette` |
| `CommandPalette` | `src/components/layout/command-palette.tsx:33` | yes | — | — | Add client entry always live |
| `PaletteEntry` | `src/components/layout/command-palette.tsx:17` | private | — | — | no refusal field |
| `POST` | `src/app/api/ai/generate-stream/route.ts:108` | yes | 402 / JSON | cached entitlement | proceeds on a null run |
| `rewriteCaption` | `src/ai/rewrite/prompts/rewrite-prompts.ts:9` | yes | falls back to the input caption | — |  |
| `getCachedAgency` | `src/lib/queries/cache.ts:57` | yes | error ignored → cached null | `unstable_cache` 60 s `'agencies'` |  |
| `getCachedEntitlement` | `src/lib/queries/cache.ts:65` | yes | `noEntitlement()` on null | inherits `'agencies'` |  |
| `getCachedAgencyClients` | `src/lib/queries/cache.ts:101` | yes | — | `'agency-clients'` | the first-run gate's count |
| `STATUS_TONE` | `src/features/settings/components/plan-section.tsx:34` | private | — | — | the pill tones; the labels moved to `PLAN_SECTION` in copy.ts (step 10) |
| `nextDate` | `src/features/settings/components/plan-section.tsx:45` | private | pure | — | grace shows `trialEndsAt` |
| `PlanSection` | `src/features/settings/components/plan-section.tsx:56` | yes | — | — |  |
| `BillingWall` | `src/components/layout/billing-wall.tsx:18` | yes | — | — | "Choose a plan" for every lock |
| `SettingsPage` | `src/app/(dashboard)/settings/page.tsx:50` | yes | `listDocumentDownloads` uncaught | uncached row |  |
| `TeamTab` | `src/features/settings/components/team-tab.tsx:26` | yes | — | — | doc says no invitations table |
| `createUserRecord` | `src/lib/auth/create-user-record.ts:50` | yes | throws | — | trusts `invited_agency_id`/`role` metadata |
| `deleteAuthIdentity` | `src/lib/auth/delete-auth-identity.ts:18` | yes | never throws; boolean | — |  |
| `removeTeamMember` | `src/features/settings/actions/team-actions.ts:24` | yes | `ActionResult` | — | ignores the identity result |
| `PUT` | `src/app/api/settings/account/route.ts:26` | yes | JSON errors | busts `'agencies'` | user-scoped write |
| `validateSourceUrl` | `src/lib/sources/validate-url.ts:10` | yes | resolves false | — | `new URL` first |
| `suggestSources` | `src/ai/suggest-sources/suggest-sources.ts:162` | yes | falls back silently | — |  |
| `queryTavily` | `src/lib/sources/tavily-client.ts:64` | yes | non-OK → `[]` | — | cast, no zod |
| `validateInstagramCaption` | `src/lib/meta/networks/instagram-caption.ts:13` | yes | pure | — |  |
| `rearmFailedPublication` | `src/features/calendar/actions/post-recovery.ts:33` | yes | `ActionResult` | — | no publish gate, no caption check |
| `schedulePosts` | `src/lib/actions/post-actions.ts:491` | yes | `ActionResult` | — | carries the publish gate |
| `publishDuePosts` | `src/features/publishing/lib/scheduler.ts:99` | yes | throws on the sweep read | — | overdue > 24 h → final fail |
| `syncRoster` | `src/features/analytics/lib/shared/sync-shared.ts:65` | yes | throws on the roster read | — | filter is not a type guard |
| `SyncableConnection` | `src/lib/queries/select-columns.ts:443` | yes | — | — | `client_id` nullable |
| `guardNarrative` | `src/features/analytics/lib/shared/narrative-shared.ts:194` | yes | never throws | — | no agency, no gate |
| `getNarrative` | `src/features/analytics/lib/instagram/narrative.ts:137` | yes | null on failure | `unstable_cache` inside | takes `agencyId` |
| `getFacebookNarrative` | `src/features/analytics/lib/facebook/facebook-narrative.ts:105` | yes | null on failure | `unstable_cache` inside | takes `agencyId` |
| `aiRateLimitResponse` | `src/lib/auth/rate-limit.ts:76` | yes | `NextResponse` or null | in-memory |  |
| `ALLOWLIST` | `scripts/comment-placement.mjs:28` | private | — | — | `features/analytics` only; ten directories since step 14 |
| `violations` | `scripts/comment-placement.mjs:182` | yes | pure | — | was the regex `MEMBER`, which matched `if (` and calls; parses with the TypeScript compiler since step 14 |
| `POLICYLESS` | `src/app/__tests__/rls-policies.test.ts:55` | private | — | — | two entries |
| `GATED` | `src/lib/billing/__tests__/gate-coverage.test.ts:18` | private | — | — |  |
| `meteredLimit` | `src/lib/billing/plans.ts:22` | yes | pure | — |  |
| `PRO_PLAN` | `src/lib/billing/plans.ts:41` | yes | — | — | 2900 cents |
| `TRIAL_BRANDS` | `src/lib/billing/plans.ts:47` | yes | — | — |  |
| `TRIAL_ALLOWANCE` | `src/lib/billing/plans.ts:58` | yes | — | — |  |
| `GRACE_DAYS` | `src/lib/billing/plans.ts:61` | yes | — | — | 7 |
| `formatLongDate` | `src/utils/format.ts:16` | yes | pure | — | with year |
| `pluralise` | `src/utils/format.ts:129` | yes | pure | — |  |
| `formatMoney` | `src/utils/format.ts:139` | yes | pure | — |  |
| `unwrap` | `src/lib/queries/unwrap.ts:14` | yes | throws | — |  |
| `AdminClient` | `src/lib/supabase/admin.ts:28` | yes | — | — |  |
| `COMPANY` | `src/utils/constants.ts:60` | yes | — | — | doc says the legal pages spell it by hand |
| `claimPublication` | `src/features/publishing/lib/publication-store.ts:101` | yes | throws on the write | — | the compare-and-set claim the quantity claim copies |
| `fetchImagesByPost` | `src/lib/posts/fetch-post-images.ts:49` | yes | throws | — | admin client |
| `getCachedReviewQueue` | `src/features/dashboard/queries/review-queue.ts:61` | yes | degrades to `[]` | `unstable_cache` 30 s | 12 newest, no slides |
| `performRewrite` | `src/ai/rewrite/rewrite-post.ts:17` | yes | throws | — | two `as SlideText[]` casts, no JSDoc |
| `rewriteCarousel` | `src/ai/rewrite/prompts/rewrite-prompts.ts:73` | yes | throws on an incomplete reply | — | no JSDoc |
| `analyzeUrl` | `src/utils/ai.ts:87` | yes | throws | — | no JSDoc |
| `slidePlace` | `src/app/api/ai/generate-background/route.ts:26` | private | pure | — | doc carries build history |
| `detectSlopSchema` | `src/app/api/ai/detect-slop/route.ts:18` | private | — | — | doc carries build history |
| `InviteHandler` | `src/app/auth/callback/invite-handler.tsx:8` | yes | — | — | sets the session, then /setup-password |
| `QuickActionsStrip` | `src/features/dashboard/components/quick-actions-strip.tsx:41` | yes | — | — | Add client entry ungated |
| `DashboardHeader` | `src/features/dashboard/components/dashboard-header.tsx:39` | yes | — | — | Add client `ActionLink` ungated |
| `resolveActionAuth` | `src/lib/auth/helpers.ts:243` | yes | `{ ok:false }` | cached user record | returns the cached `role` (step 15) |
| `requireSessionUser` | `src/lib/auth/session.ts:67` | yes | redirects | cached user record | returns `role` (step 15) |
| `BILLING_ADMINS_ONLY` | `src/lib/billing/copy.ts:410` | yes | — | — | the billing actions' admin refusal; the roster's is its sibling (step 15) |
| `addBrandGate` | `src/lib/billing/copy.ts:347` | yes | pure | — | the pair every Add-client control takes (step 15 adds the role) |
| `billableQuantity` | `src/lib/billing/plans.ts:57` | yes | pure | — | floor of one, kept by the founder (step 15) |
| `subscriptionIdOf` | `src/lib/billing/stripe-events.ts:46` | private | pure | — | an invoice's subscription |
| `reconcileQuantity` | `src/lib/billing/stripe-events.ts:114` | private | logs | — | acts on `started` and `period_paid`; `invoice.upcoming` joins (step 15) |
| `ClientSettingsForm` | `src/features/clients/components/settings/client-settings-form.tsx:158` | yes | — | — | mounts `ClientDangerRail` and `DeleteClientDialog` |
| `ClientDangerRail` | `src/features/clients/components/settings/rails/client-rails.tsx:267` | yes | — | — | the Delete client button, ungated |
| `DeleteClientDialog` | `src/features/clients/components/settings/delete-client-dialog.tsx:38` | yes | toast | — | says nothing about billing |
| `EditClientPage` | `src/app/(dashboard)/clients/[id]/edit/page.tsx:32` | yes | — | cached reads | reads `requireSessionUser` for the agency only |

## New things — grep by shape (2026-09-24)

- **`invite`:** the invite route and form, `InviteHandler` in the callback, the deletion action, and
  `TeamTab`'s doc. There is no invite table or lookup, so `team_invites` is new.
- **`unprovision` / `deprovision`:** none. The client-row delete is spelled in `provisionClient`'s
  rollback and in `deleteClient`, so `unprovisionClient` is the extraction a third caller requires.
- **`reconcile`:** only the calendar and publishing reconcilers. `reconcileSubscriptionQuantity` is a
  caller of the sync, not a rule.
- **`toFixed(2)`:** in `audit-file.ts` and `document-render.ts`, plus two unrelated spots that stay.
  `centsToDecimal` serves the billing two.
- **`* 1000).toISOString`:** three epoch conversions in billing move to `isoFromUnixSeconds`.
  `refresh-tokens.ts` adds a duration to now and stays.
- **`TRIAL_DAYS`:** none.
- **`canNarrate`:** the page's and the report action's checks; they collapse into `guardNarrative`.
- **`poolLeft` / `imagesLeft`:** private to `postsAffordable`, and restated in the visuals cron.
- **`abandon`:** `releaseAbandonedClaims` (visual job claims). There is no run closer.
- **`subscriptions.cancel`:** none.
- **`DOCUMENT_TIMEZONE`:** two private constants plus two literals.
- **`runCeiling` / `maxPosts`:** inline in `CountSteppers` only.
- **Owed images:** nothing computes them. `useDraftVisuals` subtracts claims client-side, and
  `owedImagesOf` does the same server-side.
- **`cannotSpend` / `lockedNotice`:** none. `WORKSPACE_LOCKED` is the one state-blind sentence today.
- **`readCommitted`:** none; both crons read usage in their own loops.
- **`dedup_key` / `dedupKey`:** none.
- **A lookup by email in `auth`:** none in `src`. Only the baseline's `users_id_fkey` names
  `auth.users`, so `pending_invite_for_email` is the first reader, and the admin API offers no
  email lookup.
- **Usage for many agencies in one query:** none. Every caller of `readUsage` passes one agency, and
  both crons loop over it.
- **A per-workspace claim** (`quantity_sync`, `sync_lock`, `claimed_at` on agencies): none. The only
  claims are on `post_publications` and `post_visual_jobs`, so `quantity_sync_at` is new.

## Verification (end to end)

1. **Migrations:** migration A, then `npm run db:types`. PGlite (step 7) runs the baseline plus the
   billing files, A and B included.
2. **After each step:** its tests, then `npm run check`, then `npm run build`.
3. **Test mode, with `stripe listen`:**
   - **Checkout:**
     - a second Checkout is refused;
     - an early return followed by Choose plan is refused.
   - **Clients:**
     - add a client: pro rata;
     - delete one: the allowance is kept;
     - re-add: no invoice.
   - **A failing card:**
     - grace, then locked;
     - Cancel and Manage billing show;
     - Cancel ends the plan and no later charge follows.
   - **Re-subscribe:** a new period, no stale past-due date.
   - **Credit notes:** a refund gives one credit note; a balance credit fails loudly.
   - **The audit file** for the month is checked against the XSD.
4. **Observed runs:** steps 4 and 9, and the invite run of step 12.
5. **Migration B promptly after the deploy,** after the read-only check. Then `npm run db:types` and
   `npm run check`.
