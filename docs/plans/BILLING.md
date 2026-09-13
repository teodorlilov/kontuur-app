# Billing — implementation plan (Phase 1: enforcement, Phase 2: Stripe)

## Context

Kontuur cannot go live without a way to charge and — more urgently — without a way to *stop* spending
for workspaces that never pay. Today nothing enforces anything: every agency carries `plan='free'`,
`subscription_status='trialing'` and a past `trial_ends_at`; no code path reads those columns for a
decision; all six crons select every agency; the only metered counter (`image_generation_usage`) is
called with a 2-billion ceiling. Four of those gaps are live security holes (tenant-writable plan
columns, self-promotable role, anon-callable usage RPCs, ungated crons).

The pricing model was designed on 2026-09-11 (per-brand plans, pooled allowances that pause rather
than bill overage, app-owned card-free trial) and the founder has said: build with the proposed
numbers as placeholders, change later. The legal research on 2026-09-12 found that direct card
acceptance in Bulgaria triggers Наредба Н-18 (fiscal sale document + monthly audit file) while a
merchant of record does not — a question for the accountant that is still open. So this plan builds
everything that does not depend on that answer (Phase 1), then Stripe in the one shape that survives
either answer — hosted Checkout + Billing + webhooks, which Stripe Managed Payments (merchant of
record) reuses with a flag (Phase 2). Phase 3 (Н-18 documents or the MoR flip, Stripe Tax registration,
legal copy, public pricing page) waits for the accountant and is only outlined here.

Written against files opened in this session; see the verified table at the end.
`npm run plan:check` is run against this file before it is presented.

## Progress (2026-09-13)

- **Step 1 applied to production** (`supabase/migrations/20260852_billing_foundation.sql`) and types
  regenerated. Lesson recorded by the review that ran on it: the migration dropped `plan_client_limit`
  and nulled `subscription_status` in the same batch as the additive changes, so the deployed code
  selected a dropped column until the code below shipped — a purely additive first migration, with
  the drops in a later one, would have had no window. The review's other substantive findings are in
  `supabase/migrations/20260853_billing_followups.sql` (admin-only reads of the two new tables, the
  cost column withheld from the tenant role, two integrity checks) — **to apply next**.
- **Steps 2 and 3 built, plus the PlanSection half of step 7** — uncommitted, every gate green
  (typecheck, lint, format, knip, arch, writers, comments, build, 2,084 tests). Two shape changes
  from the plan as written: `generatePostVisual` lets `AllowanceError` propagate instead of adding a
  typed `images_allowance` reason (one refusal type everywhere), and `subscribeFal`'s exported
  wrappers keep their signatures because identity comes from the spender context, not a parameter.
- **Steps 4, 5 and 6 complete** (second batch, uncommitted): the wire caps (`MAX_POSTS_PER_RUN`
  holds `targetPostCount`, `priorityPosts`, `frequency_value`, `posts_per_week`; the cron clamps
  slides); the publish scheduler filters both its queries by the entitled clients ahead of its
  LIMIT, the metrics and comments rosters take one entitled set per tick from their cron route;
  `cron-invariants` proves every cron except `refresh-tokens` reaches the gate; the brand cap and
  `create` gate in `createClient` (provisioning now through the admin client — apply
  `supabase/migrations/20260854_clients_insert_admin_only.sql` with this deploy), `publish` gates
  on publish-now and scheduling (unscheduling stays open); `gate-coverage` pins the allowlist and
  requires any file calling the AI/visuals limiter to be in it.

## Placeholders (one constants file, `src/lib/billing/plans.ts` (new))

| Plan | Price (net) | Brands | Per brand per period, pooled |
|---|---|---|---|
| trial (14 days, no card) | — | 3 in agency mode, 1 in solo | 20 AI drafts · 50 AI images · 15 rewrites, for the whole trial |
| house (the company's own and partner workspaces; set by hand, never from the app) | — | no cap | unmetered — counted, never refused; never locks |
| starter | €29 | 1 | 40 · 120 · 30 |
| agency | €19 per brand, minimum 3 (€57) | any | 40 · 120 · 30 per paid brand |

Grace after an expired trial: 7 days (nothing spends, scheduled posts still publish). Grace after a
failed card: 7 days of full access against the current period's remaining allowance. Then read-only.
Existing production workspaces get a fresh 14 days from the day the migration lands.

## What the user sees when this plan is done

- **Signing up — unchanged.** No card. The workspace starts a 14-day trial: up to 3 brands (1 in solo mode) and a trial allowance of 20 AI drafts · 50 AI images · 15 rewrites per brand, pooled.
- **Settings › Plan is real.** Plan and its date ("Trial · ends 27 September" / "Agency · renews on 14 October"), and four meters: brands, AI drafts, AI images, rewrites — used of allowed, resetting on the renewal date. A quiet banner when the trial has ≤ 3 days left or any meter passes 80 %; an email 3 days before the trial ends and one on the day.
- **Running out.** The wizard refuses with the reset date instead of starting; autopilot pauses for the workspace with a bell notification; the editor's AI-image tools say the allowance is used (upload still works). Editing, approving, scheduling, publishing and analytics keep working — an allowance only pauses *generation*, never bills extra.
- **Trial over → 7 days of grace.** "Your trial ended on … — choose a plan to keep generating." Nothing AI runs; posts already scheduled still publish; comments and analytics keep syncing.
- **After grace → paused.** A wall over the dashboard with one button, "Choose a plan"; everything readable, Settings reachable; the generate and new-brand pages redirect to Settings › Plan; scheduled posts wait.
- **Choosing a plan (Phase 2, Stripe test mode).** Starter (€29, 1 brand) or Agency (€57 for up to 3 brands, then €19 per brand); solo workspaces see Starter only. Stripe's hosted checkout (card, company name, VAT ID) → back in Settings within seconds with the plan active and the meters reset. On Agency, adding a 4th brand shows "Adds €19/month — €X today" before it is created; deleting one lowers next month's price, never below 3. "Change plan" with the amount previewed; "Manage billing" opens Stripe's portal (card, invoices, address, cancel at period end). A failed renewal: "Payment failed — update your card by …", 7 days of full access, then paused. Cancel: "Your plan ends on …", then paused with data kept.
- **Existing users on release day** get a fresh 14-day trial from that day; nobody is locked out by the deploy.
- **Not visible yet (Phase 3):** a public pricing page, rewritten Terms/Privacy, Bulgarian-format invoices or the fiscal sale document (or a merchant-of-record checkout instead), VAT settings, the first live charge. The cost telemetry is for us, not shown to users.

## Not in this plan (deliberately)

- Public pricing page and marketing/legal copy — outside the dashboard, so mock → agree → build (Phase 3).
- The Н-18 sale document, audit file and NRA e-shop filing, or the merchant-of-record flip — waits on the accountant.
- Stripe Tax registrations — Dashboard configuration, waits on the registration-basis answer.
- Wizard "paint on keep" (visuals fire for every streamed draft today) — a product change the founder has not confirmed; nothing here depends on it.
- Seat limits, source limits, briefing counters (the weekly brief is one global row since migration `20260851_globalise_intelligence_briefings.sql`, so there is no per-agency briefing cost any more).

## Shape

One derived truth: `entitlementFor(agencyRow, now)` (pure) reads the `agencies` row every dashboard
render already fetches through `getCachedAgency` and returns `{ state, canSpend, canPublish,
canCreate, plan, quantity, limits, periodKey, trialEndsAt }`. Nothing stores the state twice and no
cron flips a status column. Every gate calls that and nothing else:

- humans → one line per cost-bearing route/action (`requireEntitledRoute` / `requireEntitledAction`), guard-tested;
- crons → the roster is filtered to entitled clients **in SQL, before the LIMIT** (visuals, publish) or in memory where there is no LIMIT (metrics, comments); `refresh-tokens` stays ungated on purpose;
- money → an atomic compare-and-set `consume_usage` RPC (the generalisation of today's `consume_image_credits`) at the two chokepoints where spend is born: `startGenerationRun` (drafts) and `subscribeFal` (images). Quota 0 when the workspace cannot spend — so even a roster that slips through spends nothing.

All Stripe calls live under `src/lib/billing/` and `src/app/api/billing/`; the rest of the app never
imports `stripe`. That module boundary — not an interface — is what keeps a later Managed Payments
flag or a Paddle swap contained.

## How usage is tracked — two layers, one identity

**Layer 1 — what the customer is limited on (the allowance).** Three units, counted atomically in
`usage_counters` by the `consume_usage` compare-and-set, always *before* the money is spent:

| Unit | Counted where | What one unit bundles |
|---|---|---|
| AI draft | `startGenerationRun` reserves `targetCount` at run open; `finishGenerationRun` refunds `target − produced` | the whole text pipeline for one post: the research planner's share, the Sonnet writer, the Haiku judge, the proofreader, up to three revision rounds (≈ 5–8 Claude calls, ≈ €0.05–0.08) |
| AI image | `subscribeFal`, one per paid fal call — gpt-image-2 generation (one per carousel slide), inpaint edit, vector; cutouts free | one fal call (≈ €0.05–0.07) |
| Rewrite | the rewrite route, one per call | one Sonnet rewrite plus its re-validation (≈ €0.03–0.05) |

Claude calls are deliberately **not** the customer-facing unit: a buyer cannot predict "5–8 calls per
post", and the market research ranks opaque credit burn as the top complaint. Everything else Claude
does (source suggestions, brand analysis, slop checks, analytics narrative, style memo) is small,
stays rate-limited, and is gated — a locked workspace cannot call it — but not metered.

**Layer 2 — what it actually cost us (telemetry).** Today nothing records Anthropic token usage per
agency, and the fal editor calls record nothing at all — the invoices are the only view, and they
cannot say which customer or which feature burned what. So every provider call adds to one aggregate
table, `ai_usage_daily` (agency · day · provider · model · flow → calls, input/output/cache tokens,
cost), through an add-only upsert RPC. Written from the three wrappers every paid call already goes
through: `callAnthropic` (the final `Message` carries `usage`), `subscribeFal`, `queryTavily`. Cost is
computed from one price constant (`src/lib/billing/ai-prices.ts` (new)) and stored in **euro cents**:
the providers bill in dollars, so the constant carries their list prices plus one USD→EUR rate,
re-read against each month's invoices — list prices and the rate both drift, so the value is
relative: cost per customer, per feature, against what the plan assumed (≈ €2.2 typical, ≈ €10 heavy
per brand-month). Every amount the product shows or stores is in euro; dollars never reach a user
or a row. Never a gate, never throws; a failed write is a warning.

**One identity for both layers.** `callAnthropic` has fourteen callers deep in `src/ai` with no agency
in scope, and threading an id through all of them would be a cross-layer change touching most of the
engine. Instead the *boundary* that already knows who is spending — each gated route, the spending
action, each cron's per-client loop — declares it once: `runAsSpender({ agencyId, clientId, flow },
fn)` over Node's `AsyncLocalStorage`, and the three wrappers read `currentSpender()`. Fail closed: a
fal or Claude call with no spender in scope is refused (the global weekly brief is the one named
exception — it belongs to nobody and is logged with a null agency). This replaces `generateVisual`'s
explicit `spender` parameter, so "who is spending" is established in exactly one way.

Known check: the analytics narrative runs inside `unstable_cache` (`src/features/analytics/lib/instagram/narrative.ts:116`);
whether the async context survives that boundary is verified by an observed run, and if it does not the
narrative's `resolveNarrative` receives the spender explicitly.

## Module map — one place for each thing, nothing twice

Every new module has one responsibility and one home; every gate, read and write below exists once and
is composed, never copied. The existing helpers it builds on are named so nothing is re-implemented.

| Module | Owns — the one thing | Composes | Called from |
|---|---|---|---|
| `src/lib/billing/plans.ts` (new) | the plan table: prices, allowances, caps, minimum quantity | — | entitlement, Settings, checkout, catalogue script |
| `src/lib/billing/entitlement.ts` (new) | `entitlementFor(row, now)` — the ONLY interpretation of the agencies row | `plans.ts` | everything below; nobody else reads `plan`/`trial_ends_at`/`subscription_status` |
| `getCachedEntitlement` in `src/lib/queries/cache.ts` (existing file) | the per-request entitlement, derived from `getCachedAgency` — **no second agencies read** | `getCachedAgency`, `entitlementFor` | routes, actions, layouts, pages |
| `src/lib/billing/entitled-clients.ts` (new) | `fetchEntitledClientIds(admin, need)` — one agencies read + one clients read **per cron tick** | `entitlementFor` | visuals, publish, metrics, comments crons (generate uses its widened `fetchScheduleContext` instead — one read there too) |
| `src/lib/billing/spend-context.ts` (new) | `runAsSpender` / `currentSpender` — who is spending, declared once at the boundary | `AsyncLocalStorage` | gated routes, spending action, cron loops |
| `src/lib/billing/usage.ts` (new) | `consumeUsage` / `refundUsage` / `readUsage`, `AllowanceError`, `allowanceResponse` (the one 402 shape), the one 80 % notification | `consume_usage` RPC, `notify` | `startGenerationRun`, `subscribeFal`, rewrite route, Settings, wizard readout |
| `src/lib/billing/telemetry.ts` (new) + `ai-prices.ts` | `recordAiUsage` and the one price/rate constant | `add_ai_usage` RPC, `currentSpender` | `callAnthropic`, `subscribeFal`, `queryTavily` |
| `src/lib/billing/require-entitled.ts` (new) | `requireEntitledRoute` / `requireEntitledAction` — the one gate pair, same shapes as `aiRateLimitResponse` / `ActionResult` | `getCachedEntitlement` | one line per cost-bearing route/action |
| `src/lib/billing/copy.ts` (new) | every user-facing billing sentence | — | Settings, banner, wall, wizard, editor, e-mails |
| `src/lib/billing/stripe.ts` (new) | the one Stripe client, pinned version | — | checkout, portal, webhook, `changePlan`, quantity sync, catalogue script |
| `src/lib/billing/subscription-store.ts` (new) | `ensureStripeCustomer`, `applySubscriptionSnapshot` — the ONE writer of the billing columns | admin client, `revalidateTag` | webhook, checkout |
| `src/lib/billing/billing-events.ts` (new) | `recordBillingEvent` / `finishBillingEvent` — idempotency + audit | admin client | webhook |
| `src/lib/billing/quantity-sync.ts` (new) | `syncSubscriptionQuantity` — the one place the brand count reaches Stripe | `stripe.ts` | `createClient`, `deleteClient`, the daily reconcile |
| `sendEmail` in `src/lib/email/resend.ts` (existing file) | the one Resend send path, extracted from `sendApprovalEmail` | — | approval e-mail, trial reminders, payment-failed |

Reads and requests that must stay single:
- One entitlement per request: layouts, pages and the settings return page read it through `getCachedEntitlement`; the wizard's "this run uses N of M" and the editor's allowance state arrive as **props from the server render** — no new browser fetch for them.
- The settings page today reads the agency twice (`getCachedAgency` and `fetchAgencyById` at `src/app/(dashboard)/settings/page.tsx:20-22`); step 7 folds that to one read while it is being rewritten.
- One Stripe call per user action: a brand add is one `subscriptions.update`; a plan change is one preview + one update; the webhook re-fetches the subscription once per event and writes through one function.
- One roster read per cron tick, then one filter; never a per-client entitlement query inside a loop.
- No new UI primitive: every surface in step 7 is built from the shared components DESIGN.md lists (`FormSection`, `StatusPill`, `Button`, `Card`, `SectionHeading`, the page header) and the existing tokens.

## Steps

Each step ends with its check. `npm run check` after every step; it is not the success criterion —
the named test or observed run is.

### 0. Put the plan in the repo
Copy this file to `docs/plans/BILLING.md` (new). → verify: `npm run plan:check -- docs/plans/BILLING.md` green.

### 1. Migration `supabase/migrations/20260852_billing_foundation.sql` (new) + types + registry — ships first, because every TypeScript gate is bypassable until the database stops trusting the tenant

SQL, in order:
1. `agencies.trial_ends_at` → `timestamptz USING trial_ends_at AT TIME ZONE 'UTC'` (default stays `now() + 14 days`). Same bug class `20260843_scheduled_at_timestamptz.sql` fixed for posts.
2. `UPDATE agencies SET plan='trial' WHERE plan='free' OR plan IS NULL`; `plan` default `'trial'`, `CHECK (plan IN ('trial','starter','agency'))`.
3. `subscription_status`: default `NULL`; existing rows with no `stripe_subscription_id` set to `NULL`; `CHECK (subscription_status IS NULL OR subscription_status IN ('trialing','active','past_due','canceled','unpaid','paused','incomplete','incomplete_expired'))`.
4. Add `subscription_quantity integer`, `current_period_start timestamptz`, `current_period_end timestamptz`, `cancel_at_period_end boolean NOT NULL DEFAULT false`, `past_due_since timestamptz`, `billing_updated_at timestamptz`.
5. `DROP COLUMN plan_client_limit` — limits live in `plans.ts`; its only readers are `PlanSection`, `AgencyInfo` and the two projections, all rewritten below.
6. Grace backfill: `UPDATE agencies SET trial_ends_at = GREATEST(trial_ends_at, now() + interval '14 days') WHERE stripe_subscription_id IS NULL`.
7. Tenant lock: `REVOKE INSERT, UPDATE, DELETE ON public.agencies FROM anon, authenticated; GRANT UPDATE (name, timezone) ON public.agencies TO authenticated;` — the settings `PUT` writes exactly those two columns through the user-scoped client (`src/app/api/settings/account/route.ts:53`). `REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;` — both users writers use the admin client (`createUserRecord`, `removeTeamMember`). Policies unchanged. (The `clients` INSERT revoke belongs to step 6, in its own migration, because `createClient` inserts through the user-scoped client until that step lands — revoking it here would break brand creation between the two deploys.)
8. `CREATE TABLE usage_counters (agency_id uuid NOT NULL REFERENCES agencies ON DELETE CASCADE, period text NOT NULL, kind text NOT NULL CHECK (kind IN ('draft','image','rewrite')), count integer NOT NULL DEFAULT 0, PRIMARY KEY (agency_id, period, kind))`; RLS on; policy `usage_counters_agency_isolation` FOR SELECT (member reads own agency, same predicate shape as `agencies_member_access` in `supabase/migrations/20260818_capture_rls_policy_baseline.sql:31`); no user-scoped writes.
9. RPCs `consume_usage(p_agency_id uuid, p_period text, p_kind text, p_cost int, p_quota int) RETURNS TABLE(allowed boolean, used integer)` and `refund_usage(p_agency_id, p_period, p_kind, p_cost)` — the body of `consume_image_credits` (`supabase/migrations/00000000_baseline.sql:1090-1117`) with the `kind` column. **`REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role`** — today's RPCs are SECURITY DEFINER with the default EXECUTE TO PUBLIC and no migration in the repo has ever revoked anything.
10. `INSERT INTO usage_counters SELECT agency_id, month, 'image', count FROM image_generation_usage`; a `DO` block that RAISEs if the counts differ; `DROP FUNCTION consume_image_credits, refund_image_credits; DROP TABLE image_generation_usage`.
11. `CREATE TABLE ai_usage_daily (agency_id uuid REFERENCES agencies ON DELETE CASCADE, day date NOT NULL, provider text NOT NULL CHECK (provider IN ('anthropic','fal','tavily')), model text NOT NULL, flow text NOT NULL, calls integer NOT NULL DEFAULT 0, input_tokens bigint NOT NULL DEFAULT 0, output_tokens bigint NOT NULL DEFAULT 0, cache_read_tokens bigint NOT NULL DEFAULT 0, cache_creation_tokens bigint NOT NULL DEFAULT 0, cost_eur_cents bigint NOT NULL DEFAULT 0, PRIMARY KEY (agency_id, day, provider, model, flow))` — aggregate, so it never needs a retention sweep (≤ ~15 rows per agency per day); a null-agency row set for the global brief via a separate unique index; RLS on, `ai_usage_daily_agency_isolation` FOR SELECT by agency. RPC `add_ai_usage(…)` = insert-or-add on conflict, SECURITY DEFINER, `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated; GRANT … TO service_role` like the other two.
12. `CREATE TABLE billing_events (id text PRIMARY KEY, type text NOT NULL, created timestamptz NOT NULL, object_id text, agency_id uuid REFERENCES agencies ON DELETE SET NULL, payload jsonb NOT NULL, processed_at timestamptz, error text)`; index `(object_id, created DESC)`; RLS on; policy `billing_events_agency_isolation` FOR SELECT by agency (keeps `POLICYLESS` in `src/app/__tests__/rls-policies.test.ts:55` empty). Written only by the webhook (Phase 2).
13. `notify pgrst, 'reload schema'`.

Code in the same change:
- Apply to prod in the SQL editor after a backup (the CLI does not track this project's history — see the `db:push` note in `docs/CLAUDE.md`), then `npm run db:types` and commit `src/types/database.ts`.
- `AgencyInfo` (`src/types/api.ts:324`) becomes `Pick<AgencyRow, …>` of the regenerated row with `plan`/`subscription_status` narrowed to the CHECK unions; delete `'types/api.ts:AgencyInfo'` from `KNOWN_MIRRORS` (`src/types/__tests__/row-mirrors.test.ts:96-100`, the backlog that may only shrink); drop the cast in `fetchAgencyById` (`src/lib/queries/db.ts:116-128`).
- `AGENCY_COLUMNS` / `AGENCY_SETTINGS_COLUMNS` (`src/lib/queries/select-columns.ts:235-239`) carry the new columns and lose `plan_client_limit`.
- `NotificationType` (`src/types/api.ts:292`) gains `'allowance_warning' | 'allowance_reached' | 'trial_ending' | 'trial_ended' | 'workspace_paused' | 'payment_failed'`.
- `scripts/table-writers.json`: `usage_counters` (hand-listed — written through `.rpc()`, which the registry's docblock says it cannot see) → `src/lib/billing/usage.ts` (new); `ai_usage_daily` (hand-listed, same reason) → `src/lib/billing/telemetry.ts` (new); `billing_events` → `src/lib/billing/billing-events.ts` (new); `agencies` += `src/lib/billing/subscription-store.ts` (new, Phase 2). `docs/OPERATIONS.md`: remove the row "Record image spend | `recordImageSpend`"; add "Reserve monthly allowance | `consumeUsage`" and "Refund a reservation that produced nothing | `refundUsage`" under Generation; Phase 2 adds the Account rows.

→ verify: migration applies on a fresh shadow DB and on a prod copy; `SELECT count(*) FROM usage_counters WHERE kind='image'` equals the old table's count; a PostgREST `UPDATE agencies SET plan='agency'` with the anon key returns 42501 while `PUT /api/settings/account` still saves name and timezone (extend the existing RLS guard test with the grant assertions); `npm run typecheck`, `npm run writers -- --check`, row-mirrors and rls-policies tests green; every existing agency reads `plan='trial'` with `trial_ends_at >= now()+14d`.

### 2. Plans, the entitlement helper, the cron roster helper (pure, clock-injected tests)
- `src/lib/billing/plans.ts` (new): `PLANS` — prices, per-brand allowances, brand caps, `agency` minimum quantity 3, trial allowances keyed on `mode`.
- `src/lib/billing/entitlement.ts` (new): `entitlementFor(row, now)` → states `trial | trial_grace | active | past_due | locked`; `active` requires `subscription_status='active'` — a Stripe `'trialing'` subscription (an early converter with a deferred `trial_end`) keeps **trial** limits until the first paid invoice lands; `past_due` grace counts from `past_due_since`, not from `current_period_end` (Stripe advances that on the renewal invoice); `periodKey` = `'trial'` before any subscription, else the ISO date of `current_period_start`; limits = per-brand × `max(subscription_quantity, minimum)` on agency, ×1 on starter, trial constants by mode; all zero when the workspace cannot spend.
- `getCachedEntitlement(agencyId)` beside `getCachedAgency` in `src/lib/queries/cache.ts:41-55` — `entitlementFor(await getCachedAgency(id))`, so it inherits the 60 s `'agencies'` tag; anything that changes the row must `revalidateTag('agencies')` (the settings `PUT` already does at `src/app/api/settings/account/route.ts:59`).
- `src/lib/billing/entitled-clients.ts` (new): `fetchEntitledClientIds(admin, need)` — one read of every agency's billing columns (the table is tens of rows), `entitlementFor` each, one read of `clients.id` for the entitled agencies → `Set<string>`. Note in its doc: an `.in()` filter carries the ids in the URL; past a few hundred clients this becomes a flag column, not a bigger list.

→ verify: `src/lib/billing/__tests__/entitlement.test.ts` (new) covers every state × need, both modes, the Stripe-`trialing` case, past_due inside/after 7 days, cancel_at_period_end; `entitled-clients` test asserts one `.from('agencies')` and one `.from('clients')` call for a fixture across three agencies.

### 3. Spender context, usage ledger, telemetry — metering at the three wrappers
- `src/lib/billing/spend-context.ts` (new): `runAsSpender({ agencyId, clientId?, flow }, fn)` and `currentSpender()` over `AsyncLocalStorage` (Node runtime — no route in `src/app` declares `edge`). `flow` is the feature (`generation | rewrite | editor | onboarding | analytics | sources | style_memo | brief`), set once at the boundary; it is the telemetry's "what" while the model is the "how much".
- `src/lib/billing/usage.ts` (new): `consumeUsage(entitlement, kind, cost)` → `{ allowed, used, quota }` over `consume_usage` via the admin client (the admin-client RPC pattern the retired image counter used), `refundUsage`, `readUsage(agencyId, periodKey)`; `AllowanceError` (typed: kind, used, quota, resetsOn); `allowanceResponse(err)` → 402 JSON for routes; the 80 % notification once per period (message carries the period key, `cooldownDays: 31`, through `notify` in `src/lib/notifications/notify.ts:61`).
- `src/lib/billing/telemetry.ts` (new): `recordAiUsage({ provider, model, tokens…, cost })` → `add_ai_usage` for `currentSpender()`; never throws, warns on failure. `src/lib/billing/ai-prices.ts` (new): the providers' list prices per million tokens per Claude model (input, output, cache read, cache write, web search per 1k), per fal model, per Tavily query, and the one USD→EUR rate that turns them into euro cents — every stored and displayed amount is euro.
- `callAnthropic` (`src/utils/ai-client.ts:84`) records the final message's `usage` for the current spender; with no spender in scope it throws — fail closed — except when the boundary marked itself `flow: 'brief'` (the global weekly brief, `src/ai/intelligence/generate-briefing.ts` calls `anthropic.messages.create` directly at its own site and records with a null agency). `queryTavily` (`src/lib/sources/tavily-client.ts:29`) records one query.
- `src/lib/visual/fal.ts:31-45`: `subscribeFal` reads `currentSpender()`, consumes 1 image credit **before** `fal.subscribe` for `FAL_MODEL`, `EDIT_MODEL`, `VECTOR_MODEL` (refund on throw; `DIS_MODEL` cutouts free), and records telemetry after. No spender in scope → refused. Signatures of `generateSlideImage`, `generateVectorAsset`, `editImageWithMask` are unchanged; this is what finally counts inpaint and vector calls, which record nothing today.
- `generateVisual` (`src/lib/visual/generate-visual.ts:56`) loses its `spender` parameter (identity now comes from the context, one way); its callers migrate in the same change: `src/app/api/ai/generate-visual/route.ts:73`, `src/app/api/ai/generate-background/route.ts:99`, `src/lib/visual/generate-post-visual.ts:66`. `image-spend.ts` and its after-the-fact `recordImageSpend` are gone (done).
- Boundaries that wrap `runAsSpender`: every gated route in step 6, `refreshStyleMemo` (`src/features/clients/actions/style-memo-actions.ts:16`), the generate cron's per-client loop (`src/app/api/cron/generate/route.ts:140`), the visuals cron's per-job call (`src/app/api/cron/visuals/route.ts:154`), and the analytics narrative (`resolveNarrative`, `src/features/analytics/lib/shared/narrative-shared.ts:153`, via `generateAnalyticsSummary`) — observed run decides whether the context survives `unstable_cache` or the spender is passed explicitly there.
- `generatePostVisual` (`src/lib/visual/generate-post-visual.ts:26`) adds `{ ok: false, reason: 'images_allowance' }` to its result union so the cron and the visuals route treat a refusal as a skip, not a failure.
- Rewrite counter: `src/app/api/ai/rewrite/route.ts` consumes 1 `rewrite` after ownership and before the model call; 402 on refusal.
- Consumption needs the entitlement: routes get it from `getCachedEntitlement(auth.agencyId)`; the visuals cron resolves it per client from the roster read in step 5.

→ verify: unit tests with a mocked fal client — consume before subscribe, refund on throw, 0 for `DIS_MODEL`, refused with no spender in scope; `callAnthropic` records `usage` for the spender and throws without one (mocked SDK); `generateVisual` refuses without calling fal when the RPC says no; inpaint, SVG and rewrite routes return 402 at quota; an observed run of one generation shows one `ai_usage_daily` row per (model, flow) with token sums that match the SDK's `usage`; the analytics page's narrative attributes to the agency (or the explicit-spender fallback is applied); `npm run writers` sees the retired image counter gone and `usage.ts` / `telemetry.ts` listed.

### 4. Drafts pool at the run, and the wire caps that make it honest
- `startGenerationRun` (`src/lib/generation/runs.ts:51`) takes `entitlement` and reserves `targetCount` drafts **before** the insert; a refusal returns a new claim `{ runId: null, refused: 'allowance' | 'locked', used, quota, resetsOn }` that both callers must honour — the existing "generation proceeds without a run row" path (`runs.ts:79-82`) must not apply to a refusal, and a reservation whose insert then fails is refunded inside the function. `finishGenerationRun` (`:90`) takes `{ entitlement, produced }` and refunds `target_count − produced` so a run that found fewer topics is charged only for what it wrote (the cron passes posts saved; the wizard passes drafts streamed).
- Callers: `src/app/api/cron/generate/route.ts:172` (entitlement from the widened context, step 5; refusal → `results.skipped_over_allowance` + `notify` type `allowance_reached`) and `src/app/api/ai/generate-stream/route.ts:84` (402 before the stream opens, before any research or Tavily call).
- Server-side maxima equal to what the UI already offers: `scheduleInputSchema.frequency_value` and `posts_per_week` `.max(7)` (`src/features/clients/schemas.ts:45-56`), `generateStreamSchema.targetPostCount` `.max(7)` and `priorityPosts` `.max(7)` (`src/features/generate/schemas.ts:110-118`), and the cron clamps `default_carousel_slides` to `MIN_CAROUSEL_SLIDES..MAX_CAROUSEL_SLIDES` (`src/app/api/cron/generate/route.ts:163`, constants at `src/utils/constants.ts:17-19`) the way the wizard schema already does.

→ verify: `startGenerationRun` returns the refusal without inserting when the RPC refuses; two concurrent runs against a 3-draft remainder open exactly one run (RPC atomicity, against local Postgres); a cron tick lists a locked agency's client under `skipped_unentitled` with no `generation_runs` row; zod rejects `targetPostCount: 8` and `frequency_value: 8`; a run with `target_count 3` that produced 1 leaves `used` at 1.

### 5. Cron gates — filter before the LIMIT, never after
- generate: `fetchScheduleContext` (`src/app/api/cron/generate/helpers.ts:28-76`) widens its `agencies` select from `id, timezone, mode` to the billing columns and exposes `entitlements: Map<agencyId, Entitlement>`; the route drops clients whose agency cannot spend inside the `dueClients` flatMap (`src/app/api/cron/generate/route.ts:127-138`), before the slot claim, and records them in `results.skipped_unentitled`.
- visuals: `src/app/api/cron/visuals/route.ts:62-77` adds `.in('client_id', [...entitled])` to the backlog query so paused workspaces never occupy the 100-row window (`BACKLOG_FETCH_LIMIT`) or the 12 image slots; then drops posts whose agency has fewer images left than `totalVisualSlots(post)` before `pickVisualBacklog` (`:95`), so a carousel is painted whole or not at all. An `images_allowance` refusal from `generatePostVisual` is counted as `skipped_allowance`. The attempt counter (`countAttempt`, `:115`) runs after the pre-filter, so a refusal costs an attempt only on a same-minute race with a wizard user — the CAS is the backstop, not the gate.
- publish: `publishDuePosts` (`src/features/publishing/lib/scheduler.ts:93`) adds `.in('posts.client_id', [...entitled])` to the due query (`:168-222`, the embed is `posts!inner` and `.lte('posts.scheduled_at', …)` already filters on it) and to the stranded sweep (`:112-155`), with need `'publish'` — rows of a paused workspace stay `scheduled`, unclaimed, and are not failed.
- metrics + comments: `syncRoster` (`src/features/analytics/lib/shared/sync-shared.ts:67-100`) and `syncAllClientComments` (`src/features/comments/lib/sync-comments.ts:81-110`) filter `connections` by the set (need `'publish'`) and count the dropped ones in `outcome.skipped`.
- refresh-tokens (`src/features/publishing/lib/refresh-tokens.ts:48`): NOT gated — one free Meta call keeps a paused workspace's token alive so reactivation needs no reconnect; said in its doc.
- `src/app/api/cron/__tests__/cron-invariants.test.ts` gains a describe: every cron route except `refresh-tokens` (and `billing`, step 8) reaches `@/lib/billing/entitled-clients` either directly or through its first-level `@/features/…`/`@/lib/…` import (the existing test only reads files under `src/app/api/cron`, so the new block resolves those imports one level).

→ verify: fixture tests — a locked agency's posts never reach `pickVisualBacklog`; `publishDuePosts` leaves its publication `scheduled` with `publish_attempts` unchanged; `syncRoster` counts the filtered connections; cron-invariants fails when the import is removed from any of the five spending crons.

### 6. Human gates, the brand cap, and the guard that keeps them
- `src/lib/billing/require-entitled.ts` (new): `requireEntitledRoute(agencyId, need)` → `NextResponse | null` (the shape `aiRateLimitResponse` returns, `src/lib/auth/rate-limit.ts:76`) and `requireEntitledAction(agencyId, need)` → `ActionResult` failure or `null`; both over `getCachedEntitlement`. Not attached to the auth funnels: read paths stay open so a lapsed customer keeps their data readable.
- One line after the existing auth/limiter at each cost-bearing site — need `'spend'`: the thirteen routes that call `aiRateLimitResponse`/`visualsRateLimitResponse` — `src/app/api/ai/analyze-url/route.ts`, `src/app/api/ai/detect-slop/route.ts`, `src/app/api/ai/generate-background/route.ts`, `src/app/api/ai/generate-stream/route.ts`, `src/app/api/ai/generate-svg/route.ts`, `src/app/api/ai/generate-visual/route.ts`, `src/app/api/ai/inpaint/route.ts`, `src/app/api/ai/isolate-subject/route.ts`, `src/app/api/ai/paste-from-url/route.ts`, `src/app/api/ai/rewrite/route.ts`, `src/app/api/ai/suggest-sources/route.ts`, `src/app/api/clients/[id]/brand-profile/reanalyze/route.ts`, `src/app/api/posts/[id]/visuals/route.ts` — and `src/features/clients/actions/style-memo-actions.ts`; need `'publish'`: `src/app/api/posts/[id]/publish/route.ts:32-37` and `schedulePosts` (`src/lib/actions/post-actions.ts:432`); need `'create'`: `createClient`.
- Brand cap: `createClient` (`src/features/clients/actions/client-actions.ts:44`) counts `clients` for the agency and refuses at `entitlement.limits.brands`; `provisionClient` (`src/features/clients/lib/provision-client.ts:42`, whose only caller is `createClient`) now receives `createAdminSupabaseClient()`, and a one-line migration `supabase/migrations/20260853_clients_insert_admin_only.sql` (new) — `REVOKE INSERT ON public.clients FROM anon, authenticated` — ships with this step, so a member can no longer insert a brand past the cap through PostgREST. No seat cap: `POST /api/settings/team/invite` is untouched.
- `src/lib/billing/__tests__/gate-coverage.test.ts` (new): an explicit allowlist `file → need`; asserts each listed file contains the matching `requireEntitled*` call, and that every file importing `@/lib/auth/rate-limit` is in the allowlist — a new rate-limited AI route cannot be added without a gate.

→ verify: route tests — each gated route returns 402 `{ code: 'locked' }` for a fixture agency past its grace and passes for an active one; `createClient` refuses the 2nd brand on starter and the 4th on trial; gate-coverage fails when a listed call is removed.

### 7. Settings › Plan, the shell, and the refusal states (inside the dashboard — no mock gate)
Design direction: `docs/redesign-mocks/direction-01.html` (paper ground, one forest brand tone, hairlines instead of card borders, one button system, micro motion only inside the app — hovers, focus, entrance; route changes never animate) as codified in `DESIGN.md`. Concretely for every new piece here: status only in the fixed pairs (Amber Background on Amber for attention, Clay Background on Clay for errors — `PILL_TONES.warn` / `.bad` in `src/components/ui/status-pill.tsx:10`), never lime for a plan name or any permanent property; one primary `Button` per page; prices and counts in `tabular-nums` at closed-ramp roles; `FormSection` for the Settings panel, `Card` for the wall, `SectionHeading` where a section opens; hover shifts tone not hue; no new tokens, no arbitrary values, no inline styles beyond a computed meter width; every new stateful client component gets a `.test.tsx` in the same change.
- `PlanSection` (`src/features/settings/components/plan-section.tsx:40`) rewritten from `entitlement` + `readUsage` (done): plan name in a neutral pill (the old lime `mark` pill broke DESIGN.md's fill-only-lime rule), status in Amber/Clay only, "Trial ends" / "Renews on" / "Ends on", meters for brands · drafts · images · rewrites in `tabular-nums` (Amber at ≥ 80 %). `UpgradeRailAction` (`:113`) and "No card on file" go; the Choose plan / Manage billing buttons land in Phase 2. `src/app/(dashboard)/settings/page.tsx:20-24` passes the entitlement and usage instead of `plan_client_limit`; the header meta in `src/features/settings/components/settings-view.tsx:108` reads the plan label from `PLANS`.
- `src/app/(dashboard)/layout.tsx:93-111` computes the entitlement from the `agencyData` it already holds and hands `{ state, trialEndsAt, limits, usage }` to `ShellProvider` (`src/components/layout/shell-context.tsx:234`); `src/components/layout/billing-banner.tsx` (new) — Amber when the trial ends in ≤ 3 days, at ≥ 80 % of an allowance, on past_due, on cancel_at_period_end; Clay for trial_grace and locked; `src/components/layout/billing-wall.tsx` (new) — read-only wall for `locked` with the page's one primary button, letting `/settings` through.
- `src/app/(generate)/layout.tsx` and `src/app/(onboarding)/layout.tsx` check only `requireAuthUserId` today; both add `getCachedUserRecord` + `getCachedEntitlement` and redirect to `/settings?tab=account&reason=<state>` unless `canSpend` / `canCreate`.
- Wizard and editor: `src/features/generate/hooks/use-draft-visuals.ts` treats a 402 as an allowance state (no retry); `src/features/generate/components/generate-flow.tsx` shows the 402 body's message; `src/features/canvas-editor/components/busy-hint.tsx` shows the allowance sentence; `src/features/calendar/components/queue-rail.tsx` shows a "Not publishing — workspace paused" pill for `locked`. Copy lives in `src/lib/billing/copy.ts` (new) so the Bulgarian strings are a one-file job later. Unit word on user-facing surfaces: "brand".

→ verify: component tests (`*.test.tsx`, role + accessible name) for `PlanSection` in every state and both modes, the banner and the wall; route tests for the two layout redirects; manual browser matrix trial → ending → grace → locked, desktop and mobile, both modes (jsdom cannot see layout — CLAUDE.md).

### 8. Billing cron — trial reminders (daily, spends nothing)
- `src/app/api/cron/billing/route.ts` (new), seventh entry in `vercel.json`, same `CRON_SECRET` bearer check as the other six: "trial ends in 3 days" (computed from `trial_ends_at`, never from `auth.users.created_at`), "trial ended today", and "workspace paused" at grace end — each recorded through `notify` with a dated message so redelivery is idempotent, and e-mailed to the agency's admin users.
- E-mail: one `sendEmail` in `src/lib/email/resend.ts` extracted from `sendApprovalEmail` (`:43`, today the only sender — one send path, not two); templates in `src/lib/email/templates.ts` with file snapshots in `src/lib/email/__tests__/templates.test.ts` (never hand-edited).
- Phase 2 adds the daily Stripe quantity reconcile here.

→ verify: snapshot tests for the templates; the selector picks agencies whose `trial_ends_at` is in `(now, now+3d]` once and never twice, and never one with a `stripe_subscription_id`; cron-invariants lists the new route as the second exception with its reason.

### 9. Phase 2 — Stripe, test mode, behind `src/lib/billing/`
- `stripe` added to `package.json`; `src/lib/billing/stripe.ts` (new): the client with a pinned API version. `scripts/stripe-catalogue.ts` (new): idempotent by `lookup_key` — `starter_monthly` €29 per_unit qty 1, `agency_monthly` €19 per_unit with `unit_label 'brand'`, both `tax_code txcd_10103001`, `tax_behavior exclusive`. No metered, annual or add-on prices.
- `src/app/api/billing/checkout/route.ts` (new): `resolveAuth` + `verifyAdminRole` (`src/lib/auth/helpers.ts:257`); zod body `{ plan }`; solo workspaces may only pass `starter`; `starter` refused while the workspace has more than one brand (the same rule `changePlan` applies); `ensureStripeCustomer` (lazy, one per workspace); `checkout.sessions.create({ mode: 'subscription', client_reference_id: agencyId, line_items: [{ price, quantity: plan === 'agency' ? max(3, brands) : 1 }], subscription_data: { metadata, trial_end: trialEndsAt if ≥ 48 h away }, payment_method_collection: 'always', automatic_tax, tax_id_collection: { enabled: true, required: 'if_supported' }, billing_address_collection: 'required', consent_collection: { terms_of_service: 'required' }, locale: 'auto' })` → 303. **Business-only at launch**: business name and tax ID required at Checkout — the founder's call to confirm; it is one parameter either way. Never provision from the success URL.
- `src/app/api/billing/portal/route.ts` (new): admin only; portal configured for card, address/tax ID, invoices, cancel at period end; `subscription_update` disabled (plan changes go through `changePlan` so the brand-count rule holds).
- `src/app/api/billing/webhook/route.ts` (new): `runtime = 'nodejs'`, raw `request.text()` + `stripe-signature` → `constructEvent`; `recordBillingEvent` insert-on-conflict-do-nothing (duplicate → 200); for every `customer.subscription.*` / `invoice.*` event **re-fetch the subscription** (events are unordered) and `applySubscriptionSnapshot` — the ONE billing writer of `agencies` — setting plan (from the price lookup key), `subscription_status`, ids, `subscription_quantity`, `current_period_start/end` (item-level under the pinned version), `cancel_at_period_end`, `past_due_since` (from `invoice.payment_failed`, cleared on `invoice.paid`), `billing_updated_at`; skip an event older than the stored stamp; then `revalidateTag('agencies')` and `revalidateTag(USER_RECORD_TAG)`; 500 on a processing failure so Stripe retries. Add the route to `EXEMPT` in `src/app/api/__tests__/boundary-validation.test.ts:42` with the reason "body proven by Stripe's signature over the raw bytes, then the object is re-fetched".
- `src/features/settings/actions/billing-actions.ts` (new): `changePlan(plan)` — brand-count rule, `invoices.createPreview` for the confirm step, `subscriptions.update` with `proration_behavior: 'always_invoice'` so "€X today" is true; `src/lib/billing/quantity-sync.ts` (new): called by `createClient`/`deleteClient` on an active agency subscription (increase with `always_invoice` before provisioning — no Stripe success, no brand; decrease with `'none'`, never below 3; idempotency key includes the client id); the daily reconcile in the billing cron compares `count(clients)` with `max(3, subscription_quantity)` and re-syncs, notifying on repeated drift.
- Settings wiring: Choose plan → checkout; Change plan → `changePlan` with the preview; Manage billing → portal; the settings return page reads `fetchAgencyById` (uncached) and polls up to ~10 s for the webhook's snapshot.
- `docs/OPERATIONS.md` Account rows: `ensureStripeCustomer`, `applySubscriptionSnapshot` (`src/lib/billing/subscription-store.ts` (new)), `recordBillingEvent` / `finishBillingEvent` (`src/lib/billing/billing-events.ts` (new)); `scripts/table-writers.json` accordingly.
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in `.env.example`, separate test/live pairs in Vercel preview vs production; local `stripe listen --forward-to localhost:3000/api/billing/webhook`. The Stripe account's business profile must say ЧЕЛЛИНГ ООД / kontuur.app / descriptor `KONTUUR` (the account created on 2026-09-12 shows aboutsocialmedia.io as the business).

→ verify: `src/app/api/billing/__tests__/webhook.test.ts` (new) — duplicate event id → 200 with one `billing_events` row; an older `subscription.updated` is ignored; a fixture with item-level `current_period_end` lands on the row; a processing throw → 500 with `error` set; `checkout.session.completed` maps `client_reference_id`. End-to-end in Stripe **test mode** with `stripe listen`: signup → trial banner → Checkout (deferred `trial_end` ≥ 48 h, and the immediate-charge branch) → snapshot visible in Settings within 10 s → add a brand on agency (preview amount, quantity 4) → delete one (quantity stays ≥ 3) → starter ↔ agency with preview → failed card → past_due banner → final retry → canceled → locked. No live charge is taken in this plan.

## Verified before writing

| Symbol | Where | Exported | On error | Cache | Notes |
|---|---|---|---|---|---|
| `getCachedUserRecord`, `USER_RECORD_TAG` | `src/lib/auth/helpers.ts:25-56` | yes | returns null on a missing row, then re-reads uncached | `unstable_cache` 300 s, tag `'user-record'` | the ONE agency-resolution read; `agency_id, role` only |
| `requireAuth` | `src/lib/auth/helpers.ts:68` | yes | throws `AuthError` 401/404 | — | only caller is `resolveAuth` |
| `resolveActionAuth` | `src/lib/auth/helpers.ts:239` | yes | returns `{ ok: false, error }` | via getCachedUserRecord | drops role; 13 action files use it |
| `verifyAdminRole` | `src/lib/auth/helpers.ts:257` | yes | boolean, fresh user-scoped read | none | used by account PUT, invite POST, team-actions |
| `fetchOwnedPost` | `src/lib/auth/helpers.ts:123` | yes | null when not owned | — | publish route's ownership read |
| `resolveAuth` | `src/lib/auth/resolve-auth.ts:24` | yes | returns `{ ok: false, response }` (401/404/500) | — | `AuthContext` has no role, no plan |
| `requireAuthUserId`, `requireSessionUser` | `src/lib/auth/session.ts:29-67` | yes | `redirect(SIGN_IN_PATH)` | header read, no DB | the (generate) and (onboarding) layouts call only `requireAuthUserId` |
| `getCachedAgency` | `src/lib/queries/cache.ts:55` | yes | null on miss (`.single()` error swallowed) | `unstable_cache` 60 s, tag `'agencies'` | full `AGENCY_COLUMNS` row via admin client — the entitlement's input |
| `fetchAgencyById` | `src/lib/queries/db.ts:116` | yes | throws via `unwrap` on a query error, null when no row | none | uncached; cast to `AgencyInfo` at :127 goes |
| `unwrap` | `src/lib/queries/unwrap.ts:14` | yes | throws with the query name | — | |
| `AGENCY_COLUMNS`, `AGENCY_SETTINGS_COLUMNS`, `POSTING_SCHEDULE_DUE_COLUMNS` | `src/lib/queries/select-columns.ts:231-239` | yes | — | — | both agency projections carry `plan_client_limit` today |
| `SOCIAL_CONNECTION_SYNC_COLUMNS` | `src/lib/queries/select-columns.ts:397` | yes | — | — | roster projection for metrics and comments |
| `VISUAL_BACKLOG_POST_COLUMNS` | `src/lib/queries/select-columns.ts:638` | yes | — | — | visuals cron backlog projection |
| `AgencyInfo`, `NotificationType` | `src/types/api.ts:292-333` | yes | — | — | `AgencyInfo` is the last hand-written mirror; readers: plan-section, settings-view, account-tab, db.ts |
| `KNOWN_MIRRORS` | `src/types/__tests__/row-mirrors.test.ts:96` | private | — | — | backlog list; `'types/api.ts:AgencyInfo'` is its only entry |
| `POLICYLESS` | `src/app/__tests__/rls-policies.test.ts:55` | private | — | — | empty; every table in any migration needs a policy |
| `EXEMPT` | `src/app/api/__tests__/boundary-validation.test.ts:42` | private | — | — | webhook route joins it with a reason |
| `startGenerationRun`, `finishGenerationRun` | `src/lib/generation/runs.ts:51-105` | yes | degrade: log + `{ runId: null, slotTaken }` / log | — | slot dedup via unique index; callers: cron generate, generate-stream |
| `trackGenerationTheme` | `src/lib/generation/runs.ts:187` | yes | — | — | writes `generation_themes.post_count` |
| `subscribeFal` | `src/lib/visual/fal.ts:50` | private | throws (fal detail attached); `AllowanceError` when the pool is empty; refuses with no spender | reads `getCachedEntitlement` | "All model invocations go through here" — the metering point since step 3 |
| `FAL_MODEL`, `DIS_MODEL`, `EDIT_MODEL`, `VECTOR_MODEL` | `src/lib/visual/fal.ts:6-9` | private | — | — | cutouts (`DIS_MODEL`) stay free |
| `generateSlideImage`, `removeImageBackground`, `generateVectorAsset`, `editImageWithMask` | `src/lib/visual/fal.ts:120-170` | yes | throw | — | callers: generate-visual.ts:96, isolate-subject:35, generate-svg:52, inpaint:73 |
| `generateVisual` | `src/lib/visual/generate-visual.ts:56` | yes | throws on fal/download failure; `AllowanceError` from `subscribeFal` | — | identity from the spender context since step 3; callers: generate-visual route, generate-background route, generate-post-visual |
| `callAnthropic`, `anthropic`, `DEFAULT_MODEL`, `LIGHT_MODEL` | `src/utils/ai-client.ts:8-84` | yes | throws after 3 retries; streams via `messages.stream`, returns `finalMessage()` (carries `usage`) | — | 14 caller files, all in `src/ai` plus `fetch-trend-search.ts`, `describe-palette.ts`, `utils/ai.ts`; no agency reaches it today |
| `queryTavily` | `src/lib/sources/tavily-client.ts:29` | yes | throws | — | the one Tavily call site |
| `resolveNarrative` | `src/features/analytics/lib/shared/narrative-shared.ts:153` | yes | — | called inside `unstable_cache` from `narrative.ts:116` | calls `generateAnalyticsSummary` at :175 |
| `generateAnalyticsSummary` | `src/ai/analytics/generate-summary.ts` | yes | — | — | Haiku narrative, view-triggered |
| `refreshStyleMemo` | `src/features/clients/actions/style-memo-actions.ts:16` | yes | `ActionResult` | — | calls `distillStyleMemo` with the admin client at :31 — a spend boundary |

| `generatePostVisual` | `src/lib/visual/generate-post-visual.ts:26` | yes | typed refusal `not_found`/`no_copy`; throws otherwise | — | shared by the visuals route and the visuals cron |
| `pickVisualBacklog`, `totalVisualSlots`, `BacklogPost` | `src/lib/visual/visual-backlog.ts:14-49` | yes | pure | — | |
| `GET` (generate cron) | `src/app/api/cron/generate/route.ts:40` | yes | 401 without bearer; 500 on the two roster queries | — | `TIME_BUDGET_MS` (:28) private; `dueClients` flatMap at :127; `startGenerationRun` at :172; slide count at :163 |
| `fetchScheduleContext`, `getScheduleDue` | `src/app/api/cron/generate/helpers.ts:28-98` | yes | throws on any context query error | — | agencies select is `id, timezone, mode` (:58-59) |
| `GET` (visuals cron) | `src/app/api/cron/visuals/route.ts:43` | yes | 401; 500 on the backlog query | — | `MAX_IMAGES_PER_RUN` (:16), `MAX_VISUAL_ATTEMPTS` (:17), `BACKLOG_FETCH_LIMIT` (:35) private; `countAttempt` (:115) before `generatePostVisual` (:154) |
| `publishDuePosts` | `src/features/publishing/lib/scheduler.ts:93` | yes | throws on the due query error | — | `BATCH_LIMIT` (:67) private; `posts!inner` embed filtered by `.lte('posts.scheduled_at')` at :171; per-(client, platform) loop at :242 |
| `syncRoster`, `MetricsSyncOutcome` | `src/features/analytics/lib/shared/sync-shared.ts:22-100` | yes | throws on the roster query error | — | serves Instagram and Facebook metrics; `outcome.skipped` exists |
| `syncAllClientComments` | `src/features/comments/lib/sync-comments.ts:81` | yes | throws on the roster query error | — | its own roster read (:95-105), same projection |
| `refreshExpiringTokens` | `src/features/publishing/lib/refresh-tokens.ts:48` | yes | — | — | deliberately NOT gated |
| `checkRateLimit`, `aiRateLimitResponse`, `visualsRateLimitResponse` | `src/lib/auth/rate-limit.ts:47-89` | yes | `NextResponse | null` | in-memory per instance | "NOT a spend ceiling" — 13 route callers |
| `POST` (generate-stream) | `src/app/api/ai/generate-stream/route.ts:37` | yes | JSON errors | — | `startGenerationRun` at :84 before research at :119 |
| `createClient`, `updateClient`, `deleteClient` | `src/features/clients/actions/client-actions.ts:44-129` | yes | `ActionResult` failure | busts `'agency-clients'` | `createClient` passes the user-scoped client to `provisionClient` at :58; no cap today |
| `provisionClient` | `src/features/clients/lib/provision-client.ts:42` | yes | `{ ok: false, error }` | — | only caller is `createClient` |
| `notify`, `NOTIFY_EVERY_TIME` | `src/lib/notifications/notify.ts:32-61` | yes | throws on the cooldown read; logs an insert failure | — | dedup by exact `message` within `cooldownDays` (default 7) |
| `scheduleInputSchema` | `src/features/clients/schemas.ts:45` | yes | zod | — | `frequency_value` (:48) and `posts_per_week` (:56) are `positive()` with no max |
| `generateStreamSchema` | `src/features/generate/schemas.ts:110` | yes | zod | — | `slideCount` clamped (:116); `targetPostCount` `min(0)` only (:117); `priorityPosts` unbounded (:118) |
| `MAX_CAROUSEL_SLIDES`, `MIN_CAROUSEL_SLIDES`, `DEFAULT_CAROUSEL_SLIDES`, `QUALITY_FLOOR`, `MS_PER_DAY` | `src/utils/constants.ts:4-19` | yes | — | — | |
| `POSTS_PER_RUN_OPTIONS` | `src/utils/constants.ts:152` | yes | — | — | UI offers 1–7 |
| `PlanSection` | `src/features/settings/components/plan-section.tsx:40` | yes | — | server component | rewritten in step 7's first half: entitlement + usage meters; `Meter` private |
| `ShellProvider`, `useShell` | `src/components/layout/shell-context.tsx:82-234` | yes | `useShell` throws outside the provider | — | |
| `createUserRecord` | `src/lib/auth/create-user-record.ts:48` | yes | throws | — | inserts `{ name, mode }` only (:99-101); billing columns come from DB defaults |
| `createAdminSupabaseClient` | `src/lib/supabase/admin.ts:14` | yes | — | — | |
| `sendApprovalEmail` | `src/lib/email/resend.ts:43` | yes | — | — | the only Resend sender; `senderAddress` (:17) private, throws without `RESEND_FROM_EMAIL` |
| `approvalEmail`, `confirmSignupEmail` | `src/lib/email/templates.ts:18-49` | yes | pure | — | snapshot-tested in `src/lib/email/__tests__/templates.test.ts` |
| `schedulePosts` | `src/lib/actions/post-actions.ts:432` | yes | `ActionResult` | — | need `'publish'` |
| `PUT` (account settings) | `src/app/api/settings/account/route.ts:26` | yes | JSON errors | busts `'agencies'` at :59 | user-scoped `agencies` update of name/timezone at :53 |
| `POST` (team invite) | `src/app/api/settings/team/invite/route.ts:19` | yes | JSON errors | — | admin check only; no mode or seat rule — unchanged |
| `ActionResult` | `src/lib/actions/types.ts:2` | yes | — | — | `{ ok: false, error: string }` — no code field; the UI shows the message |
| `consume_image_credits`, `refund_image_credits` | `supabase/migrations/00000000_baseline.sql:1090-1136` | — | SECURITY DEFINER, default EXECUTE TO PUBLIC | — | compare-and-set; generalised and dropped in step 1 |
| `image_generation_usage` | `supabase/migrations/00000000_baseline.sql:263` | — | — | — | PK (agency_id, month); policy in `supabase/migrations/20260832_close_the_policyless_tables.sql:50` |
| `agencies_member_access`, `users_self_access`, `clients_agency_isolation` | `supabase/migrations/20260818_capture_rls_policy_baseline.sql:25-38` | — | FOR ALL, no WITH CHECK, no column grants | — | why the tenant can write billing columns today |

## New things — grep by shape (2026-09-13)

- `entitle`: hits only in font/lockup/brand-style code and Meta auth — no entitlement helper exists.
- `allowance` / `quota`: Meta publishing quota, ideas rate cap, prompt budgets, the retired image counter — no plan allowance exists.
- `billing`: `terms/page.tsx` copy and `plan-section.tsx` — no billing module, no `src/app/api/billing`.
- `stripe`: `database.ts` (the two columns), `select-columns.ts`, and the words "grey stripe" in `queue-rail.tsx` / `busy-hint.tsx` — no `stripe` dependency in `package.json`.
- `sendEmail`, `BillingWall`, `billing-banner`: none.
- Writers of `agencies`: `create-user-record.ts` (insert) and `settings/account/route.ts` (name, timezone) — nothing writes the billing columns.

## Verification (end to end)

1. After step 1 on a prod copy: the anon-key PostgREST update of `agencies.plan` returns 42501; `PUT /api/settings/account` still works; `usage_counters` image count equals the dropped table's; `npm run check` green.
2. After step 6: a fixture agency past its grace gets 402 from every gated route, its crons report `skipped_unentitled` with **zero** Anthropic/fal/Graph calls (log inspection), while `refresh-tokens` still refreshes its token.
3. After step 7: the manual browser matrix trial → ending → grace → locked → (Phase 2) paid → add brand → change plan → cancel, both modes, desktop and mobile.
4. Phase 2: the `stripe listen` end-to-end above in test mode; no live key is set anywhere until Phase 3 closes.
5. Deploy order: migration → `npm run db:types` → code. `npm run check` (typecheck, lint, format:check, knip, arch, writers, comments, coverage) green at every commit; `npm run lint` is run on its own, never through a pipe.

## Handed to Phase 3 (blocked on the accountant / lawyer)

Н-18 route or merchant-of-record flip · Stripe Tax registrations (97а vs full) · Bulgarian-format invoices · Terms/Privacy rewrite · public pricing page (mock first) · the Stripe account's business profile · first live charge.
