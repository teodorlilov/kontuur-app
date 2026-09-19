# Workspace deletion — research report (2026-09-18)

Scope: what a real "Delete workspace" (the disabled button at `src/features/settings/components/account-tab.tsx:119-127`) must touch. A workspace is one `agencies` row; members are `users` rows with `agency_id`; clients hang off agencies; everything else hangs off clients or users. Nothing below is proposed code — it is what the code and schema were found to require, with the file and line where each fact was read.

Two things readers first believed and then disproved are listed at the end of §4 so they are not reintroduced.

---

## 1. What deletion must do, in order

Each step names the existing function to reuse, or the gap.

**Step 0 — Who may call it (server side, never trusted from the UI).**
- The action takes no workspace id. `resolveActionAuth` binds `agencyId` from the verified session header (`src/lib/auth/helpers.ts:248` — `const userId = (await headers()).get(AUTH_USER_ID_HEADER)`; return shape at `:243-245`). An `agencyId` argument would reopen the cross-tenant surface `deleteClient` closes with its `.eq('agency_id', agencyId)` predicate (`client-actions.ts:199`).
- Admin check must be the **fresh** read `verifyAdminRole(supabase, userId)` (`src/lib/auth/helpers.ts:261-267`), not the role `resolveActionAuth` returns, because that role comes from the same 300 s cache (`helpers.ts:254-258`); the helper's own doc says removeTeamMember keeps the fresh read on purpose (`helpers.ts:239-241`, used at `team-actions.ts:26`). The rail's `isAdmin` gate (`account-tab.tsx:118`) is UI only.
- Gap: `adminAuth()` in `billing-actions.ts:26` is module-private (not exported); it can be copied, not imported.
- DECISION (§3): refuse when `entitlement.plan === 'house'` — the house plan is set by hand SQL (`20260853_billing_followups.sql:13-14`) and `startCheckout` already names it (`billing-actions.ts:48`).
- No rate limiter exists for server actions (`src/lib/auth/rate-limit.ts:1` is API-route-only). Acceptable: the delete is idempotent — a second call finds no agency and fails closed.

**Step 1 — Confirm (browser + server).**
- The dialog primitive exists: `ConfirmDialog` with `disabled` held shut "until the body's own gate is satisfied — a typed-back name" (`src/components/ui/confirm-dialog.tsx:16`); it wraps Modal, a Radix dialog (`modal.test.tsx:104`).
- The typed-name shape exists in `delete-client-dialog.tsx` (stored name, not the draft: `:18`; its docblock at `:30-31` says a THIRD confirm-act-toast-navigate flow must extract a `useConfirmedAction` hook — this is the third, alongside team-tab). Copying the file verbatim contradicts that docblock and `docs/CLAUDE.md:199`.
- The wiring point is `src/app/(dashboard)/settings/page.tsx:116` (`account: <AccountRail clientCount={clientCount} isAdmin={isAdmin} />`); the page already holds `agency.name` (`:83`), `agencyMode` (`:62`), `members.length`, `clientCount`. AccountRail today receives only `clientCount` + `isAdmin` (`account-tab.tsx:108`), so the stored name (and member count / mode, if the copy needs them) must be passed in.
- If the typed name goes to the server it needs a zod schema in `src/features/settings/schemas.ts` (style at `:11`, `removeTeamMemberSchema = z.uuid()`), re-checked against `agencies.name`. See gate in §6 — the guard is per file, so only a new file forces it.

**Step 2 — Write the trace line before anything goes.**
- Convention: one `console.warn` at the boundary is "the only record this client ever existed" (`client-actions.ts:220-222`). For a workspace, log agency id, name, member count, client count and swept object counts BEFORE caches are busted; after the delete nothing (`agencies`, `users`, `notifications`) survives to say who acted. Only `billing_events` (SET NULL) and `sale_documents.customer` keep identity, and only for paying workspaces.

**Step 3 — Collect ids while the rows still exist.**
- Client ids: both client-keyed buckets are written under `{clientId}/` (`src/utils/constants.ts:38-40`); after the cascade the `clients` rows are gone and with them the ids the sweep needs. (eraseAccountData records the same lesson.)
- Member ids: `fetchTeamMembersByAgency(agencyId)` (`src/lib/queries/db.ts:164-171`, admin client, `USER_COLUMNS`, by `agency_id`). Caveat: it lists `public.users` rows only, so it misses invited-but-not-accepted auth identities (see Step 6).
- Stripe ids: `stripe_customer_id` and `stripe_subscription_id` live only on the `agencies` row (`00000000_baseline.sql:11`); after the row goes the app has no read path back to them (Stripe's Customer/subscription do carry `metadata.agency_id` — `subscription-store.ts:37`, `checkout.ts:40` — but nothing in the app reads Stripe by agency id).

**Step 4 — Cancel at Stripe BEFORE the row is deleted. (Gap: new code.)**
- The SDK wrapper has no cancel verb: the only subscription writes are `stripe.subscriptions.update(` for seat quantity (`quantity-sync.ts:65`, retrieve at `:61`) and the webhook storing `cancel_at_period_end` (`subscription-store.ts:93`). `stripe@22.6.2` declares `subscriptions.cancel(id, { invoice_now?, prorate?, cancellation_details? })` (`esm/resources/Subscriptions.d.ts:27`) and `customers.del`, which "also immediately cancels any active subscriptions on the customer".
- It must live in `src/lib/billing/` (or the webhook route): `stripe.ts:11-12` forbids the SDK anywhere else.
- Cancel whatever `agencies.stripe_subscription_id` holds, not what `billedSubscriptionId` returns: that helper returns null once state is `locked` (`quantity-sync.ts:37-44`; `entitlement.ts:209-213` locks past-due-after-grace, `unpaid`, `paused`, `incomplete`) and for a `trialing` Stripe subscription (`entitlement.ts:200-205`), all of which still bill or can be resumed in Stripe.
- Do NOT loop `deleteClient` for its per-client quantity sync (`client-actions.ts:225-234`; clamps at `Math.max(1, quantity)` in `quantity-sync.ts:68`) — N Stripe updates against a subscription about to be cancelled.
- A cancel failure should abort the delete (unlike deleteClient's logged quantity sync) — the row is the only place the id lives.

**Step 5 — Delete the rows, with the admin client, in this order.**
Tenant roles cannot delete `agencies` or `users` at all: `20260852_billing_foundation.sql:75` revokes insert/update/delete from anon/authenticated (only `update (name, timezone)` is granted back). So the action must use `createAdminSupabaseClient` and carry the ownership predicate in code, exactly as `client-actions.ts:194-199` does ("RLS: it is the last check standing" at `:193`).

Why order matters: three edges into `agencies` have no ON DELETE clause (§2), and `delete from agencies` raises 23503 while any of their rows exist.

  a. **clients** — one admin `.from('clients').delete().eq('agency_id', agencyId)`. Each client row cascades its subtree: `20260820_cascade_client_deletes.sql:43-60` (14 FK specs incl. `social_connections.client_id` at `:50`, `notifications.client_id`, `posts`, `post_approval_tokens`, `analytics_reports`, `generation_runs`, `posting_schedules`, `post_history`, `brand_profiles`, `generation_themes`) plus inline cascades created with their tables (`client_sources`, `client_style_memos` 20260819:17, `brand_visual_identity` 20260718:10, `discarded_drafts` 20260729:14, `post_images` 20260429:11, `post_canvas_docs` 20260723:13, `ig_account_metrics`/`platform_post_metrics`/`ig_audience_snapshots` 20260822:16/50/78, `platform_comments` 20260837:25, `fb_page_metrics` 20260846:20, `post_publications` from posts 20260838:21). This is what makes the Meta erasure complete — `purge-account-metrics.ts:38-40` says every table it purges cascades from `clients` and that it is "Deliberately NOT used by deleteClient"; do not call `purgeAccountAnalytics`. Precedent for the 23503 → "missing migration" message: `client-actions.ts:198-200`.
  b. **notifications where agency_id = X** — agency-wide rows (`client_id: null`) survive the client cascade because the only writer sets `client_id: input.clientId ?? null` (`src/lib/notifications/notify.ts:88-89`) — every billing reminder makes one (`reminders.ts:80`). The FK is NO ACTION (`baseline:913`) and the column is NOT NULL (`20260813_not_null_verified_columns.sql:51`).
  c. **per member — user-scoped social_connections first**: `.from('social_connections').delete().eq('user_id', userId)` (`team-actions.ts:76-79`) — or `.in('user_id', memberIds)`. Must NOT filter on `platform='canva'`: the `facebook_user` token row is also user-scoped, `client_id: null` (`src/app/api/meta/callback/route.ts:116-118`) and has no in-app disconnect path of its own. `social_connections.user_id` is NO ACTION (`baseline:979`); removeTeamMember's docblock records the 23503 this raised. RLS cannot see these rows (client_id NULL) — admin client is required.
  d. **users rows** (`team-actions.ts:88`) — before the auth identities, because `users.id REFERENCES auth.users(id)` is NO ACTION (`baseline:991`). The actor's own row goes here too; removeTeamMember's self-removal (`:32-34`) and last-admin (`:54-63`) guards do not apply and must not be copied.
  e. **agencies row** — `delete ... .eq('id', agencyId)`. The seven remaining edges then cascade or SET NULL on their own (§2).

Alternative for a–b–d: a migration (next number 20260856) that flips `users.agency_id`, `clients.agency_id`, `notifications.agency_id` (and optionally `social_connections.user_id`) to cascade using the 20260820 DO-block (`20260820:85-` looks constraints up by child/column/parent, drops, re-adds, idempotent). `deleteClient`'s docblock argues for the database over a TypeScript list (`client-actions.ts:163-164`). Even then, steps 3, 4, 6, 7, 8 stay in code. DECISION in §3.

**Step 6 — Delete every member's auth identity.**
- `admin.auth.admin.deleteUser(userId)` per member, hard delete (`team-actions.ts:96`; the sole precedent).
- Not optional: if an auth user survives with no `users` row, the dashboard layout fallback (`src/app/(dashboard)/layout.tsx:69-82` — `if (!rawUserData) { const user = await getAuthUser(); if (!user) redirect(SIGN_IN_PATH); ... await createUserRecord(admin, {...}) }`) runs `createUserRecord`: for the original signer-up (metadata `businessName` + `mode`) it inserts a brand-new agency under the old name (`create-user-record.ts:99-104`) — a silent resurrection; for an invited member (metadata `invited_agency_id`, `create-user-record.ts:73-81`) it inserts a `users` row pointing at the deleted agency, which `users_agency_id_fkey` rejects → the layout throws on every visit. Same fallback in `/api/auth/signup` (route `:35`) and `/auth/callback` (`page.tsx:41-43`).
- removeTeamMember only logs a deleteUser failure (`team-actions.ts:96-101`, "user row deleted but auth account remains for ${userId}") and returns ok. For a workspace delete that leaves the outcomes above plus a dead e-mail: forgot-password looks accounts up by `public.users.email` (`forgot-password/route.ts:57-61`) and answers success without sending; the invite route rejects an address that "has already been registered" (`invite/route.ts:75-79`). DECISION: fail loudly / retry.
- Gap — pending invites: an invitee exists only as an `auth.users` row with `{invited_agency_id, role, agency_name}` metadata (`src/app/api/settings/team/invite/route.ts:69-71`); no `public.users` row, so `fetchTeamMembersByAgency` cannot see them, and nothing in `src/` calls `auth.admin.listUsers` (grep: zero hits). Either a new paginated scan on `user_metadata.invited_agency_id`, or guard `create-user-record.ts:73` to fail gracefully. DECISION.
- Stale sessions of other members: `auth.admin.deleteUser` is a hard delete; Supabase's own auth schema is believed to cascade sessions/refresh tokens (platform behaviour, not verifiable in this repo). Their access token stays locally valid until expiry — see §4.

**Step 7 — Storage sweep, after the rows, per client id.**
- `removeStoragePrefix(bucket, prefix)` (`src/lib/storage/remove-prefix.ts:71`) for `POST_IMAGES_BUCKET` and `CLIENT_FILES_BUCKET`, per collected client id, as `deleteClient` does with `Promise.all` (`client-actions.ts:212-215`). Never pass `''` or an agency id to these two buckets.
- Do NOT sweep `BILLING_DOCUMENTS_BUCKET` (`constants.ts:51-53`): its objects ARE keyed by agency id — `src/lib/billing/documents.ts:256` `${document.agency_id ?? 'unassigned'}/${number}.pdf` — and are the retained Н-18 documents (see §2, `sale_documents`). `listDocumentDownloads` signs whatever `storage_path` says, so the old prefix surviving is harmless.
- Nothing else agency-keyed exists in storage: `agencies.agency_logo` is never written (appears only in types and `select-columns.ts:265`).
- Pre-existing gap inherited from deleteClient, not new: `client_assets` (baseline:91-99; zero readers/writers in `src/`) and `brand_image_bank` point into a bucket the code never names; `supabase/queries/fk-audit.sql:127-134` already documents that the prefix sweep cannot reach them.
- Duration: two recursive bucket walks per client inside one server action under `/settings`, which declares no `maxDuration` (unlike `comments/page.tsx:14` = 60 and analytics = 90). If Vercel kills it mid-sweep the rows are already gone and the rest are silent orphans. DECISION: `after()`, `maxDuration`, or accept.

**Step 8 — Bust the caches.**
- MUST: `revalidateTag(USER_RECORD_TAG, 'max')` (`team-actions.ts:106`). `_fetchUserRecord` is `unstable_cache(..., { revalidate: 300, tags: [USER_RECORD_TAG] })` (`helpers.ts:48-51`); every page, action and API route resolves `agencyId` through it, so without the bust every member's session keeps resolving to the dead agency for up to five minutes. A cached miss is never served (`helpers.ts:55-58`), so busting is safe.
- MUST: `revalidateTag('agencies', ...)` — `getCachedAgency`/`getCachedEntitlement` are `unstable_cache(..., { revalidate: 60, tags: ['agencies'] })` (`cache.ts:42-53`, contract at `:60-62`); existing callers use `'max'` (`subscription-store.ts:47,107`, `api/settings/account/route.ts:59`). Note `cache.ts:73-74`: `'max'` is stale-while-revalidate and can serve the stale entry once more; `{ expire: 0 }` clears it for the next read. A missing row maps to `noEntitlement()` = locked (`cache.ts:64-67`), never open.
- SHOULD: the deleteClient set `'agency-clients'`, `'client-post-stats'`, `IG_METRICS_TAG` (`client-actions.ts:237-244`), plus `'client-ideas'` (`cache.ts:174`), `PLATFORM_COMMENTS_TAG` (`comment-queue.ts:162-163`, 30 s), `FB_METRICS_TAG` (`facebook-report-data.ts:130-131` 3600 s, `facebook-narrative.ts:98` 86 400 s — busted by no delete path today, adjacent debt in deleteClient). Not agency-scoped: `DASHBOARD_BRIEFING_TAG`, `'language-rules'`.

**Step 9 — End the actor's session and land somewhere. Pick ONE of two paths.**
- Middleware verifies the JWT locally (`src/lib/supabase/middleware.ts:47` `getClaims()` against cached JWKS) — deleting the auth user does not invalidate the cookie in the browser.
- Path A (matches the app's only existing sign-out): after `result.ok`, the component calls `createBrowserSupabaseClient().auth.signOut()` and nothing else (`sidebar.tsx:253`); `AuthProvider` is "the ONE navigation that follows a sign-out" and sets `window.location.href = SIGN_IN_PATH` on SIGNED_OUT (`auth-provider.tsx:10-13, 20-24`). The library tolerates a 401/403/404 from `/logout` and still clears the local session (`GoTrueClient.js:1764-1766`), so this works even after the actor's `deleteUser`. The dialog must NOT `router.push` as well (the client dialog's `push('/clients')` does not transfer).
- Path B: server-side `supabase.auth.signOut()` inside the action — the request-scoped client can write cookies there (`server.ts:28-35` only swallows in Server Components). No SIGNED_OUT event fires in the browser (`GoTrueClient.js:1369-1370`; SIGNED_OUT only from `_removeSession` at `:2255`), so the component must navigate itself. Hard constraint on ordering is only: actor's `users` row before `deleteUser(actorId)` (`baseline:991`).
- Landing: `SIGN_IN_PATH = '/?auth=signin'` (`constants.ts:76`) is the landing page with the sign-in dialog. The only message channel there is `?error=` looked up in `REDIRECT_ERRORS` (`src/app/page.tsx:44-46`, only `confirmation_failed`), flowing into the sign-in form's error slot (`auth-dialog.tsx:59`, `sign-in-view.tsx:30`). No success/notice tone exists. A dedicated `/goodbye` would need adding to `isPublicPath` (`src/lib/supabase/middleware.ts:54-`). DECISION.

**Step 10 — Optional aftercare (best-effort, after the delete, never a step it can fail on).**
- No "workspace deleted" e-mail template exists (`src/lib/email/templates.ts` holds approval, reminder, document and three auth templates). `sendEmail` throws on a Resend error. Every template is file-snapshotted (`templates.test.ts:99`) — see §6.
- Meta/Canva revocation: no revoke helper exists; `disconnectConnection` (`connection-actions.ts:40`), `eraseAccountData` (`data-deletion/route.ts:122-126`) and `disconnectCanvaConnection` (`canva-actions.ts:44`) all just delete rows; `graphDelete` is "the only destructive Graph call this app makes" (`graph-client.ts:143`). DECISION.

**Step 11 — Make the words match.**
- Rail copy today: "Deleting the workspace removes every client, post and connection." (`account-tab.tsx:120`) and hard-coded "Agency workspace" (`:97`) even in solo mode.
- Privacy: 30-day grace after cancellation (`privacy/page.tsx:146-148`), deletion "by contacting us ... within 30 days" (`:151-152`), Meta revocation within 24 h (`:91-93`).
- Terms §6: cancellation at period end, access retained, fees non-refundable (`terms/page.tsx:136-137`); §10: "You may delete your account at any time from the Settings page ... in accordance with our Privacy Policy" (`:183-185`) — currently false while the button is disabled.
- Data-deletion page: confirmation e-mail promised, full deletion pointed at e-mail (`data-deletion/page.tsx:96-98`).
- Invoice e-mail says documents stay downloadable under Plan & billing (`templates.ts:96-97`) — becomes false.
- `docs/OVERVIEW.md:467` (feature catalogue names the danger zone) and `docs/OPERATIONS.md` (§6).

---

## 2. The FK table

Source for "current ON DELETE" is the migration files (baseline generated from prod 2026-08-23, plus later migrations). Migrations here have never been CLI-tracked; `supabase/queries/fk-audit.sql` query 1 (`:53`, add `'agencies','users'` to the parent list) is the definitive prod answer and should be run before trusting this table. Query 2's orphan scan is mandatory before any cascade migration (`add constraint` validates rows).

### Edges pointing at `agencies`

| Child table.column | ON DELETE | Where read | Plain `delete from agencies` |
|---|---|---|---|
| `clients.agency_id` | **NO ACTION** | `00000000_baseline.sql:835` — `REFERENCES agencies(id)`, no clause; never rewritten (20260817/20260820 touch client-tree edges only) | **Fails 23503** while any client exists |
| `users.agency_id` | **NO ACTION** | `baseline.sql:985`; never rewritten | **Fails 23503** while any member exists |
| `notifications.agency_id` | **NO ACTION**, column NOT NULL | `baseline.sql:913`; `20260813_not_null_verified_columns.sql:51`; only `notifications.client_id`/`post_id` cascade (20260820; `baseline:919`) | **Fails 23503** — agency-only rows exist in practice (`notify.ts:88-89`) |
| `intelligence_briefings.agency_id` | baseline shows NO ACTION (`baseline.sql:907`) — BUT `20260851_globalise_intelligence_briefings.sql:9-14` dropped and recreated the table keyed on `week_start` alone, no agency FK | Two readers cited the baseline edge; the schema and critic readers confirm 20260851 removed it. Migration 20260851 is recorded as applied to prod. | No edge if 20260851 is applied — confirm with fk-audit |
| `client_ideas.agency_id` | CASCADE | `20260817_harden_client_ideas.sql:46` | Succeeds |
| `idea_form_tokens.agency_id` | CASCADE | 20260817; `baseline:865` | Succeeds |
| `brand_kit_extractions.agency_id` | CASCADE | `20260718_create_brand_visual_identity.sql:44`; `baseline:769` | Succeeds |
| `usage_counters.agency_id` | CASCADE | `20260852_billing_foundation.sql:85` | Succeeds |
| `ai_usage_daily.agency_id` | CASCADE (nullable) | `20260852:178`; unique index coalesces null → zero uuid (`20260852:191-193`) | Succeeds — deletes the workspace's cost telemetry |
| `billing_events.agency_id` | SET NULL | `20260852:242` | Succeeds — raw Stripe payloads survive with no owner |
| `sale_documents.agency_id` | SET NULL | `20260855_billing_documents.sql:57` | Succeeds — Н-18 documents survive by design; `refunds` self-reference has no cascade (`20260855:62`); after SET NULL `sale_documents_admin_read` (`20260855:83-89`) can never match them again |

No longer edges: `image_generation_usage` dropped (`20260852:167`); `brand_visual_identity.agency_id` (20260718:27) is not in the baseline table (`baseline:81-89`).

### Edges that block the per-member half

| Child.column | ON DELETE | Where read | Consequence |
|---|---|---|---|
| `social_connections.user_id` → `users` | **NO ACTION** | `baseline.sql:979` (added 20260506) | A member's Canva or `facebook_user` row (client_id NULL) blocks their `users` delete; sweep by `user_id` first (`team-actions.ts:76-79`) |
| `public.users.id` → `auth.users` | **NO ACTION** | `baseline.sql:991` | `auth.admin.deleteUser` fails while the `users` row exists; row first, then identity (`team-actions.ts:88` then `:96`) |

### The client subtree (needs no code once the `clients` row goes)

`20260820_cascade_client_deletes.sql:43-60` — `analytics_reports`, `brand_profiles`, `generation_runs`, `notifications.client_id`, `post_history`, `posting_schedules`, `posts`, `social_connections.client_id`, `notifications.post_id`, `post_approval_tokens`, `generation_themes` (two of its 14 specs — `brand_image_bank`, `brand_vector_bank` — were dropped by 20260836; `client_assets` still exists). Inline cascades listed in §1 Step 5a. SET NULL edges inside the subtree (`posts.client_source_id`, `discarded_drafts.client_source_id`, `client_ideas.generated_post_id`, `platform_comments.post_id`, `platform_post_metrics.post_id`) are harmless — both sides hang off the same client. `post_publications` cascades from `posts` (`20260838:21`), transitive.

### Other schema facts a change must respect
- `20260852:75` revokes insert/update/delete on `agencies` and `users` from anon/authenticated — only the service role can delete.
- `agencies_member_access` RLS is FOR ALL (`20260818_capture_rls_policy_baseline.sql:31-33`) — the privilege revoke, not the policy, is what stops a tenant delete; the admin-only rule lives entirely in TypeScript.
- Indexes: `idx_clients_agency_id` exists (`baseline:1029`, `20260731:7`); `users.agency_id` and `notifications.agency_id` have none; `ai_usage_daily_key` is an expression index the cascade cannot use. Small per workspace today; 20260820 added covering indexes for the same reason if a cascade migration is written.
- The only trigger is `posts_stamp_edited_at` (`baseline:1210`); no trigger or function reads `agencies`.
- `refund_usage` is a plain update (`20260852:135-137`) — safe after deletion; `consume_usage` (`20260852:108-109`) and `add_ai_usage` insert and will 23503.

---

## 3. Decisions the owner must make

1. **Migration cascade or ordered deletes in code?** A `20260856` copying the 20260820 DO-block (`20260820:85`) for `users`/`clients`/`notifications.agency_id` (and `social_connections.user_id`) makes the DB delete one statement, which is the rule `deleteClient` states (`client-actions.ts:163-164`), but it touches three FKs on the biggest parent tables in prod and `docs/CLAUDE.md:174-177` demands an observed run. Ordered deletes need no schema change, but become a TypeScript list that can drift — and the auth identities, Stripe cancel and storage sweep stay in code either way.

2. **Immediate hard delete, or a grace period?** The Privacy page promises a 30-day grace after cancellation and 30-day processing (`privacy/page.tsx:146-152`), and Terms §10 binds deletion to the Privacy Policy (`terms/page.tsx:183-185`); the disabled button's copy reads as immediate. A scheduled purge needs a `deleted_at`/`purge_at` column on `agencies` plus a cron; immediate deletion needs the Privacy/Terms wording changed (and the Privacy page is outside the dashboard, so `feedback_mock_before_build.md:12` applies to its copy).

3. **Cancel-now or cancel-at-period-end at Stripe?** Terms §6 promises access until period end and no refund (`terms/page.tsx:136-137`); `cancel_at_period_end` keeps the subscription billable and `entitlement.ts:236` only derives `endsOn` from it, so period-end cancel on a workspace whose data is gone still renews. Cancel-now forfeits the paid remainder unless prorated — a commercial/legal call under the ЗЗП чл. 49 ал. 9 consent already in `copy.ts:153-156` — or deletion is refused while a paid period runs and the portal cancel ("then paused with data kept", `docs/plans/BILLING.md:187`) is offered instead.

4. **Prorate / refund the unused period?** `prorate: true` without `invoice_now` leaves a pending negative invoice item (Subscriptions.d.ts:23), not a refund, and `issueCreditNote` ignores it (`documents.ts:202` — only `post_payment` with refunds). A real refund from the Stripe Dashboard still yields a legal credit note after deletion (`documents.ts:225-227` copies the invoice document's now-null `agency_id`); `prorate:false, invoice_now:false` is the simplest rule and the one the code supports today.

5. **Delete or keep the Stripe Customer?** `customers.del` cancels every subscription in one call and removes card/address/tax id from Stripe; keeping it preserves Stripe-side invoice history for the accountant. The sale-document snapshot (`documents.ts:146-163`, `customer` jsonb) already holds what the law needs, so the app depends on neither; the idempotency key `customer:${agency.id}` (`subscription-store.ts:34-37`) cannot collide with a future workspace.

6. **Past-due workspace with an open invoice: refuse, void, or accept?** `past_due_since` is set by `invoice.payment_failed` and cleared only on `invoice_paid` (`subscription-store.ts:100-103`); whether cancelling settles the open invoice is Stripe behaviour, not verifiable here. If it collects later, `invoice.paid` arrives for a dead agency (§4 risk); `invoices.voidInvoice` is not in the wrapper any more than `subscriptions.cancel` is.

7. **Who fixes the webhook for a missing agency row, and is it in scope or a prerequisite?** `applySubscriptionSnapshot` returns the dead `agencyId` with `outcome: 'ignored'` (`subscription-store.ts:79`); the route then issues a sale document on `invoice.paid` (`webhook/route.ts:112-118` → RPC inserts against the FK → 500 → Stripe retries ~3 days) and `finishBillingEvent` stamps the dead id (`route.ts:72-77`, 23503 swallowed, `processed_at` never set). `customer.subscription.deleted` will hit the second path after any delete; no test covers the missing-row case (`webhook.test.ts` covers only "no agency_id in metadata" and "no subscription").

8. **Refuse a house workspace?** House is "set by hand in the database, never from the app" (`plans.ts`; `20260853:13-14`) and `startCheckout` refuses it by name (`billing-actions.ts:48`); `openBillingPortal` refuses only incidentally (`:71-77`, no `stripe_customer_id`). Created by hand → deleted by hand is the consistent rule, so an admin of the company's own workspace cannot wipe it from the rail.

9. **Any admin, or only the sole member/admin?** removeTeamMember protects the last admin and refuses self-removal (`team-actions.ts:32-34, 59-61`) precisely so someone can always act; one admin deleting a multi-admin workspace erases every other admin's account and identity without consent. Requiring teammates be removed first is stricter but matches the existing guards.

10. **Sweep pending invites, or guard `createUserRecord`?** Sweeping needs a new capability (paginated `auth.admin.listUsers` filtered on `user_metadata.invited_agency_id`, or a SQL function over `auth.users`); guarding `create-user-record.ts:73` means an accepted invite fails gracefully instead of throwing on every render. Doing neither leaves a broken dashboard for that invitee.

11. **Sign-out path: browser `signOut()` after success, or server-side in the action?** Browser path reuses `sidebar.tsx:253` + `auth-provider.tsx:20-24` and lets a toast show; server path clears cookies in the response even if the browser JS never runs the follow-up but the component must navigate itself. They must not be combined.

12. **Where does the actor land?** `'/?auth=signin'` (sign-in dialog), bare `'/'`, or a "workspace deleted" notice — which needs a non-error tone plus a `REDIRECT_ERRORS`-style entry (`page.tsx:44-46`) or a new public path in `src/lib/supabase/middleware.ts:54-`. If cookie clearing fails, `src/lib/supabase/middleware.ts:75-79` bounces `/` into `/dashboard` anyway.

13. **Delete the actor's own account too, or keep it to start a new workspace?** Keeping the auth identity triggers the layout fallback (`layout.tsx:69-82`) which re-provisions an agency from signup metadata (`create-user-record.ts:99-104`), so "keep" needs a different landing than `/dashboard`.

14. **Send the typed name to the server, or gate in the browser only?** Server re-check against `agencies.name` is defence in depth and gives the action-validation gate a real schema (`schemas.ts:11` style); a no-argument action has "no boundary to guard" and passes the gate by having no parameter.

15. **Fresh `verifyAdminRole` or the cached role?** Cached (`helpers.ts:254-258`) is free but up to 300 s stale; the fresh read (`helpers.ts:261-267`) costs one round trip and is what the most destructive action in the product should take.

16. **Revoke at Meta / Canva?** No helper exists; every disconnect only drops rows, and the Privacy page routes users to Facebook Settings (`privacy/page.tsx:91-93`). `GET /me/permissions` is documented for the Facebook host (`docs/META-FB-PROBE.md:104`), DELETE never probed, and the Instagram Login host (`IG_GRAPH_BASE`, `constants.ts:2`) is unverified; Canva stores refresh tokens (`canva-auth.ts:53-54`) and no code calls its revoke endpoint. Adding revocation here without adding it to the per-connection disconnects would be a second way to do one thing.

17. **Keep `ai_usage_daily` ("what a workspace costs us", `20260853:4`)?** It cascades today (`20260852:178`); switching to SET NULL collides on the unique index that coalesces null to the zero uuid (`20260852:191-193`) — two deleted agencies' rows for the same (day, provider, model, flow) would violate it and fail the agencies DELETE itself. Keeping the data needs a different key.

18. **`billing_events` payloads after deletion?** They survive with `agency_id` null (`20260852:242`) holding customer e-mail, card last four, amounts (`20260853:4-5`) — the accountant's audit trail with no owner and no retention sweep. Keep as-is, scrub for deleted agencies, or name it in the Privacy rewrite beside the ten-year document retention (`docs/plans/BILLING.md:424, :607`).

19. **Tell the customer to download invoices first?** After deletion the in-app list (`settings/page.tsx:70` → `fetchSaleDocumentsByAgency`, `db.ts:185-191`, filtered by the now-null `agency_id`) is unreachable, Stripe portal invoice history is off by design (`BILLING.md:409`), and signed URLs last one hour (`documents.ts:317`). The softener: every document was e-mailed with the PDF attached at payment (`documents.ts:240-241`) — say so in the confirm copy, or re-send undelivered documents first.

20. **Refuse while a generation run or publication is in flight?** Refusing costs up to one 300 s cron window (or one 5-minute publish tick) and the same trade was declined for `deleteClient` (`client-actions.ts:166-169`); accepting it means a post can go live on Instagram seconds after deletion with no record here. Decide once and state it in both docblocks, not differently in two places.

21. **`client_assets`: ignore or drop the table first?** Zero code readers/writers, objects in an unnamed bucket (`fk-audit.sql:127-134`) — a pre-existing deleteClient gap the workspace delete merely inherits.

22. **Storage sweep placement.** Inline (as deleteClient), `after()`, or a `maxDuration` on the settings segment (`comments/page.tsx:14` precedent) — see §4.

23. **Solo-mode wording.** A solo user is deleting their one business and their own account; AccountRail hard-codes "Agency workspace" (`account-tab.tsx:97`) and "every client" (`:120`) and receives no `agencyMode` (the page has it at `settings/page.tsx:62`).

24. **Confirmation e-mail?** The data-deletion page promises one for the manual path (`data-deletion/page.tsx:96-98`); no template exists.

---

## 4. Risks / race conditions

**Crons.** `vercel.json:3-` schedules generate (hourly), visuals (:10 hourly), publish (`*/5`), refresh-tokens (daily), metrics (nightly), comments (`*/30`), billing (daily). No job table, no queue library, no lock a delete could wait on (the only advisory lock is per-post inside one RPC, `baseline:1182`). `maxDuration = 300` on most (billing is 60, `cron/billing/route.ts:7`); `TIME_BUDGET_MS = 240_000` in generate/visuals/metrics/comments only. A deletion can land anywhere inside those windows; the FK graph is the only guard.

- **Every cron reads the roster fresh** (`fetchEntitledClients`, `entitled-clients.ts:20-21`; generate builds its own map from a direct agencies read, `cron/generate/helpers.ts:81-93`; billing reads agencies directly, `reminders.ts:118-121`; refresh-tokens has no entitlement gate, `refresh-tokens/route.ts:14-27`). A tick starting after the delete sees nothing — no soft-delete flag is needed for the crons.
- **Generate cron:** the `posts` insert after minutes of Anthropic/Tavily spend is FK-rejected (`cron/generate/route.ts:292-295` → "Failed to save generated posts"); `finishGenerationRun` then refunds (zero-row update) and closes the run (zero-row update, `runs.ts:131-134`) silently. Money spent, nothing orphaned, outcome invisible beyond `results.errors`.
- **Publish cron:** a `media_publish` reached inside the same invocation goes live on Instagram; `patch()` then updates zero rows and reports success (`publication-store.ts:261-262`); `failPublication`'s `notify()` resolves the client to null → `'suppressed'`. Window is narrower than a full tick: the in-tick poll is capped at 18 s (`instagram.ts:37`) and a still-in-progress container rolls to the next tick, which never sees the cascaded row. The 26–43 s figure is from `watch-publish.ts:24` / `posts/[id]/publish/route.ts:91`.
- **Visuals cron / fal.ai:** ~52 s `fal.subscribe`, then `uploadPostImage` writes `${clientId}/${postId}/…` to `post-images`, THEN `putPostImage` upserts (`generate-post-visual.ts:83-91`); a post cascaded in between leaves one storage object nothing removes. Sweep AFTER rows; accept a straggler in the seconds after the sweep.
- **Usage / telemetry:** `refund_usage` on zero rows is silent (`20260852:135-137`); a new `consume_usage` reservation 23503s → "consume_usage failed", caught. `recordAiUsage` is fire-and-forget and only `console.warn`s (`telemetry.ts:71-73`) — the last minutes of spend are lost from the ledger, and the cascade deletes the whole spend history anyway.
- **Metrics + comments crons:** every write is client-scoped and cascades (`sync-shared.ts:88-91`; 20260822/20260837/20260846), so a late upsert 23503s as a per-client failure; `retireConnection` updates zero rows (`connection-store.ts:85-92`) and its `notify({ clientId })` returns `'suppressed'` before any insert (`notify.ts:68, 113-122`) — silent, not noisy.
- **Refresh-tokens cron:** late `.update().eq('id', conn.id)` matches nothing, counted as refreshed (`refresh-tokens.ts:88-91`).
- **Billing cron:** if the delete lands between the agencies read and the `notify` insert, the insert 23503s → `'failed'` → "bell row not written", no e-mail (`reminders.ts:80-87`). Correct. Note the same FK is what makes agency-only notification rows block the delete (§2).
- **Onboarding extraction** in `after()` (`extract/start/route.ts:64-69`): the pending `brand_kit_extractions` row cascades; the late upsert is rejected and swallowed; `runAsSpender`'s telemetry write is rejected too. Nothing orphans.
- **Wizard stream** (`generate-stream`, maxDuration 300): up to ~5 min of spend under a deleted agency; posts only reach `posts` on approval via `/api/posts`, which fails on the client-ownership check (the users row lookup stays cached up to 300 s unless USER_RECORD_TAG is busted). `trackThemeSafe` inserts are swallowed (`generation-orchestrator.ts:274-280`). `finishGenerationRun` at `generate-stream/route.ts:220-225` is a zero-row update.
- **Konva / compose:** browser- or request-scoped; the only `after()` sites are publish, extract/start, billing webhook (`cron/visuals/route.ts:44-45` doc). Nothing to drain.
- **Manual publish `after()`** is safe by construction: `publish` only creates a container (`instagram.ts:94-99, 106-108`), `resume` reads the row first and returns if it is gone (`publish-post.ts:367-374`); Facebook likewise creates unpublished (`facebook.ts:105, 179`). Only the same mid-poll race as the cron remains.

**General shape of in-flight writes:** every late write is either an INSERT/UPSERT the FK rejects or an UPDATE-by-id matching zero rows with `error: null` (`runs.ts:131-134`). No DB orphans; the only orphans are outside Postgres — a live Instagram/Facebook post with no `post_publications` row, a storage object written after the sweep, money with no `ai_usage_daily` row. None of these will say it happened. Exception: `recordBillingEvent` upserts with NO `agency_id` (`webhook/route.ts:44-53`), so late Stripe events are accepted — and then mis-stamped (next item).

**Stripe webhook after the row is gone.** `applySubscriptionSnapshot` returns the non-null metadata `agencyId` with `outcome: 'ignored'` (`subscription-store.ts:78-79`). Then (a) `invoice.paid` with `amount_paid > 0` calls `issueSaleDocument` because `snapshot.agencyId` is truthy (`webhook/route.ts:112-118`) → RPC inserts `(p->>'agency_id')::uuid` (`20260855:137`) against the FK → `issue` throws (`documents.ts:111`) → 500 → Stripe retries for days, and a real payment has no sale document — the exact regulatory failure the arc exists to prevent; (b) `finishBillingEvent` writes `agency_id = dead uuid` (`route.ts:72-77`) → 23503 → `console.error`, still 200 (`:167`), `processed_at` null, `error` null — looks like an event that never ran. Cancelling at Stripe first prevents new `invoice.paid`; `customer.subscription.deleted` can still land after the delete and hit (b). ON DELETE SET NULL only nulls rows that exist at delete time.

**Cancel-then-delete ordering.** If Stripe is cancelled and the DB delete then fails (a 23503 on any NO ACTION edge — which is certain, not transient, if `clients`/`users`/`notifications` were not emptied first), the workspace survives with `subscription_status = 'canceled'` written by the snapshot, which `entitlement.ts:208-213` reads as locked; the customer must re-subscribe. Reversing the order risks the un-issuable invoice. "Not charged again" is the safer failure; agree the trade explicitly as `deleteClient` does.

**Cache windows.** User-record 300 s (`helpers.ts:48-51`) — every authenticated route keeps admitting a deleted member; agencies 60 s (`cache.ts:53`) — spend gates (`requireEntitledRoute`, `subscribeFal`, rewrite) keep admitting work; `'max'` serves the stale entry once more (`cache.ts:73-74`). Half-deleted state (cached users row, agency gone) renders the locked BillingWall (`layout.tsx:128`; `noEntitlement()`), but the settings page redirects to `SIGN_IN_PATH` (`settings/page.tsx:58`); the `(onboarding)` layout redirects to `PLAN_AND_BILLING_PATH` (`(onboarding)/layout.tsx:15-17`) — all into the loop below.

**Redirect loop for members on other devices.** JWT verified locally (`src/lib/supabase/middleware.ts:47`); `/` with claims → `/dashboard` (`src/lib/supabase/middleware.ts:75-79`); layout finds no users row → `getAuthUser()` null (real round trip, `session.ts:52-58`) → `redirect(SIGN_IN_PATH)` (`layout.tsx:73`) → `/` → `/dashboard` … until the access token expires (project default 1 h, not set in-repo). API routes degrade to 404 "User not found" (`helpers.ts:77-79`; `resolve-auth.ts:24-40`) and actions to `{ok:false, error:'User not found'}` (`helpers.ts:253-255`). Same exposure removeTeamMember has today. Not fixable by cookie writes in the layout (`server.ts:33-35`), but the layout could render a client component that calls browser `signOut()` in place of the redirect — `GoTrueClient.js:1764-1766` tolerates the 404 and SIGNED_OUT drives `auth-provider.tsx:20-24`.

**Resurrection / crash if any auth identity survives.** Detailed in §1 Step 6 (`layout.tsx:69-82`, `create-user-record.ts:73-81, 99-104`, signup route `:35`, callback `page.tsx:41-43`). Plus the dead-e-mail outcome (`forgot-password/route.ts:57-61`, `invite/route.ts:75-79`).

**Pending OAuth consents land safely.** Meta callback: `resolveAuth` may still succeed for up to 300 s (cached record), but `verifyClientOwnership` fails on the vanished client (`meta/callback/route.ts:165-168`). Canva callback upserts with `user_id` → FK fails → caught → `canva_error=1`. No stray rows.

**Public links degrade cleanly.** Approval: `approval/[token]/route.ts:19-20` → 404 "Invalid approval link"; page maps to "This link is invalid or has expired." Idea form: `ideas/submit/route.ts:26-28` → 404; page via `fetchFormContext` (`ideas.ts:115-117`). Profile-picture route → 404 (`meta/profile-picture/route.ts:36-37`), authenticated, no callers. Meta data-deletion callback: no rows → empty client list → 200 with a confirmation code.

**Storage sweep duration** — §1 Step 7.

**Sale documents in flight.** An invoice or credit note issued seconds before deletion is still delivered by the daily retry (`retryUndeliveredDocuments`, undelivered after 10 min) under `unassigned/` and e-mailed from the `customer` snapshot, not from `users`. The audit file reads `sale_documents` alone (`audit-file/route.ts:29-30`), never `agencies` — a deleted workspace's documents keep reporting in their month.

**Refuted — do not reintroduce.**
- "`brand_kit_extractions.agency_id` is nullable, so onboarding rows exist that no workspace delete reaches" — the only writer (`writeExtraction`, `queries.ts:128-146`) is called only from `extract/start/route.ts` behind `resolveAuth()` (`:31-33`) and passes `agencyId` on all four writes; no null-agency row is written by current code.
- "Manual publish's `after()` worker publishes a post after the row is gone" — `after()` is safe by construction (`publish-post.ts:367-374`; `instagram.ts:94-108, 127, 214`; `facebook.ts:105, 119, 179`); only the same mid-poll race as the cron remains.

---

## 5. Reuse map

| What | Where | Note |
|---|---|---|
| Action gate + agency binding | `src/lib/auth/helpers.ts:243-258` `resolveActionAuth` | returns cached role; do not take a workspace id argument |
| Fresh admin check | `src/lib/auth/helpers.ts:261-267` `verifyAdminRole` | used at `team-actions.ts:26` |
| Admin-only sentence | `src/features/settings/actions/billing-actions.ts:26-29` `adminAuth`, `BILLING_ADMINS_ONLY` | module-private; copy or export |
| Stripe-failure boundary shape | `billing-actions.ts` `STRIPE_UNAVAILABLE` / logged-once | |
| House-plan refusal | `billing-actions.ts:48-53` | |
| Admin delete with ownership predicate + 23503 message | `src/features/clients/actions/client-actions.ts:194-200` | copy the shape, not the function (it is session-bound at `:178`, `:184`, syncs Stripe at `:225-234`, `revalidatePath`s) |
| Storage sweep | `src/lib/storage/remove-prefix.ts:71` `removeStoragePrefix`; call pattern `client-actions.ts:212-215` | buckets `src/utils/constants.ts:38-53` |
| Per-member sequence | `src/features/settings/actions/team-actions.ts:76-79` (connections by `user_id`) → `:88` (users row) → `:96-101` (deleteUser, logged) → `:106` (`revalidateTag(USER_RECORD_TAG,'max')`) | extract into one shared per-user function (feedback_no_duplicate_logic); skip guards `:32-34`, `:54-63` |
| Member enumeration | `src/lib/queries/db.ts:164-171` `fetchTeamMembersByAgency` | public.users only |
| Agency-only notification writer | `src/lib/notifications/notify.ts:88-89` | proves the rows exist |
| Cache tags | `helpers.ts:25,48-51` USER_RECORD_TAG; `cache.ts:42-53` 'agencies' (`subscription-store.ts:47`, `account/route.ts:59`); `client-actions.ts:237-244`; `cache.ts:174`; `comment-queue.ts:162-163`; `facebook-report-data.ts:130-131`; `facebook-narrative.ts:98` | `cache.ts:73-74` on 'max' vs `{ expire: 0 }` |
| Sign-out + navigation | `src/components/layout/sidebar.tsx:253`; `src/components/providers/auth-provider.tsx:10-24`; `SIGN_IN_PATH` `constants.ts:76` | library tolerance `GoTrueClient.js:1764-1766`; server-action cookie writes `server.ts:28-35` |
| Landing-page message channel | `src/app/page.tsx:44-46` `REDIRECT_ERRORS` → `auth-dialog.tsx:59` → `sign-in-view.tsx:30` | error tone only |
| Confirm dialog | `src/components/ui/confirm-dialog.tsx:16`; `team-tab.tsx:71-75` usage; `delete-client-dialog.tsx:18, 30-31` | extract `useConfirmedAction` |
| Deletion summary prose | `src/features/clients/lib/deletion-summary.ts:25-27` | decide reuse vs second builder |
| Schema style | `src/features/settings/schemas.ts:11` | |
| Trace line | `client-actions.ts:220-222` | |
| Cascade migration template | `20260820_cascade_client_deletes.sql:85-` DO-block | |
| Prod FK truth + orphan scan | `supabase/queries/fk-audit.sql:53` (add `'agencies','users'`), query 2 | |
| Stripe SDK entry | `src/lib/billing/stripe.ts:11-12`; cancel verb in `stripe@22.6.2` `Subscriptions.d.ts:27` | new function needed |
| Stripe id metadata (recovery only) | `subscription-store.ts:37`, `checkout.ts:40` | |
| Credit note after deletion | `documents.ts:225-227` | works with null agency |
| Test scaffolds | `billing-actions.test.ts:12-13` (mocks); `client-actions.test.ts:76-78` (`unstable_cache: (fn) => fn` is load-bearing; recordingAdmin supports only `from().delete().eq()`); `user-record.test.ts:13-25`, `create-user-record.test.ts:18-40` (chain fakes); `delete-client-dialog.test.tsx:27-29` (dialog template, lazy mocks) | no test of removeTeamMember or `auth.admin.deleteUser` exists |
| Things explicitly NOT to reuse | `purgeAccountAnalytics` (`purge-account-metrics.ts:38-40`); deleteClient's quantity sync; `billedSubscriptionId` for the cancel target; `removeTeamMember` as-is | |

---

## 6. Gates a change must satisfy

1. **`npm run writers` — `scripts/table-writers.json`.** Keys on `.from('table')` + insert/update/upsert/`delete()` in the same chain (`table-writers.mjs:49`), per (table, file) not per literal (`:90-92`). The new file needs a reasoned entry under `agencies` (today: create-user-record.ts, settings/account/route.ts, subscription-store.ts — `json:2`), `users` (`json:119`), and `notifications`, `social_connections`, `clients` if it deletes them explicitly. `auth.admin.deleteUser` and `.rpc()` are invisible to the scan (no entry needed); `[hand-listed]` entries skip the stale check (`mjs:118-119`) but must still name a real file (`:134-139`).
2. **`docs/OPERATIONS.md`.** The same gate requires the writer FILE path to appear in the doc (`mjs:190-195`, plain `doc.includes(file)`). Row under `### Account` beside "Remove a teammate" (`OPERATIONS.md:50`; billing rows `:51-54`; "Delete a client and everything it owns" at `:41`). If the function lands in an already-listed file the gate passes with no new row — the row is then owed by convention. A new Stripe cancel verb in `src/lib/billing/` gets its own row like `syncSubscriptionQuantity`.
3. **Action-validation test** (`src/features/__tests__/action-validation.test.ts:27-28, 74-79`): per FILE — a `'use server'` file whose exported action declares a typed parameter must contain `.safeParse(`/`.parse(`/`parseX(`. A typed-name action in a new `workspace-actions.ts` needs its own schema (or an EXEMPT entry with a >40-char reason); in `team-actions.ts` it would pass on `removeTeamMemberSchema.safeParse` alone. knip fails CI on an export with no outside consumer (`ignoreExportsUsedInFile: false`), so the schema must be imported by the action.
4. **Component-test gate** (`src/app/__tests__/component-tests.test.ts:101`): a new `'use client'` file with useState needs a `*.test.tsx` importing it. `account-tab.tsx` is in `UNTESTED_COMPONENTS` (`untested-components.ts:77`) — adding useState there passes, but if a test imports it, that line MUST be removed or the no-stale-entry assertion fails.
5. **RLS test** (`src/app/__tests__/rls-policies.test.ts:133`; `IDENTIFIES_CALLER` at `:28` accepts `auth.uid()`, `auth.jwt()`, `current_setting(`): a FK-only migration creates no policy and no table and passes untouched.
6. **Migration safety** — if the cascade route is chosen: `docs/CLAUDE.md:174-177` names "whether a migration is safe against production data" as invisible to `check`; an observed run (fk-audit query 1 + orphan scan, 20260820 pattern) is the criterion; `plan:check` must pass first.
7. **Coverage ratchet** (`vitest.config.ts:51-52`): `src/lib/**` 55 % lines/statements. An action under `src/features/settings/actions` carries no floor; a helper in `src/lib/billing/` (the cancel verb) does and must ship with tests.
8. **E-mail snapshot** — only if a template is added: `templates.test.ts:99` `toMatchFileSnapshot`; vitest writes a missing snapshot locally and refuses it in CI (`.github/workflows/check.yml:43`), so the snapshot must be committed, never hand-edited.
9. **Stale mock to know about** — `client-actions.test.ts:48` mocks `@/features/assets/lib/storage` but the action imports from `@/lib/storage/remove-prefix`, so the real sweep runs in that test. A workspace test must mock `@/lib/storage/remove-prefix`. Adjacent debt; do not fix in the same change.
10. **Docs owed:** `docs/OVERVIEW.md:467` (danger zone sentence; settings route list if a route is added) and OPERATIONS.md. Privacy/Terms/data-deletion copy per §1 Step 11 — the Privacy page is outside the dashboard, so `feedback_mock_before_build.md:12` applies to its changes.
11. **Comments convention** (`npm run comments`) and `npm run lint` exits 1 unpiped — per memory.

---

## 7. Open questions from the readers

Deduplicated; the reader tags show where each came from.

1. [schema/integrations/crons/app-surface] Migration cascade (`users`/`clients`/`notifications.agency_id`, and `social_connections.user_id`, in a 20260856) or ordered deletes in code? The auth-identity, Stripe and storage steps stay in code either way; deleting clients one by one through `deleteClient` would reuse its tested sweep + 23503 message but fire N Stripe quantity updates.
2. [schema/critic] Immediate irreversible delete, or honour the Privacy page's 30-day grace with a scheduled purge (column + cron)? Whichever is chosen, the dialog, Terms and Privacy must say the same thing.
3. [schema/billing/crons] Keep `ai_usage_daily` (and `usage_counters`) history as SET NULL, or accept losing it? SET NULL needs a new key because of the coalesce-to-zero-uuid unique index.
4. [schema/crons/critic] Stripe: cancel immediately or at period end; prorate or not; and must a cancel failure abort the delete?
5. [schema/billing/integrations] Who owns fixing the webhook so a missing agencies row yields `agencyId: null` (no `invoice.paid` 500 loop, no 23503 stamp on `billing_events`) — in scope or a prerequisite?
6. [schema/crons] Refuse while a `generation_run` is running or a `post_publication` is `'publishing'`, or accept the in-flight limitation `deleteClient` documents?
7. [schema/auth] Pending invites: sweep auth users by `user_metadata.invited_agency_id` (new capability — no `listUsers` caller exists), or guard `createUserRecord`'s invited branch?
8. [schema] `client_assets` — ignore, or drop the table so the sweep story is complete?
9. [schema] Run `fk-audit.sql` query 1 with `'agencies','users'` in the parent list against prod: is the ON DELETE state of the agency edges, `social_connections.user_id` and (post-20260851) `intelligence_briefings` what the files say?
10. [auth/app-surface] Where does the actor land — `'/'`, `'/?auth=signin'`, or a "workspace deleted" notice (new non-error face + map entry, or a new public path)?
11. [auth/app-surface] Is the bounded redirect-loop window for members on other devices (until their access token expires; JWT lifetime not set in-repo) acceptable, must the lifetime be shortened in the Supabase dashboard, or should the layout's `redirect(SIGN_IN_PATH)` become a client-side `signOut()`? Is an observed run of that loop owed before shipping?
12. [auth/app-surface] Server-side signOut in the action (component navigates itself) or browser signOut after success (AuthProvider navigates)? Never both.
13. [auth/critic] Must the actor be the sole admin / sole member, or may any admin delete a multi-admin workspace? Should the confirm require typing the workspace name (which needs the name passed into AccountRail and brings a schema)?
14. [auth] Cached role from `resolveActionAuth` or the fresh `verifyAdminRole` read?
15. [auth] Verify before relying: Supabase's auth schema cascades sessions/refresh_tokens/identities on `deleteUser` (not provable from this repo). (The other library question — `signOut` tolerating 401/403/404 — is resolved: `GoTrueClient.js:1764-1766`.)
16. [app-surface] Delete the actor's own account too, or keep it to start a new workspace (which needs a landing other than `/dashboard`)?
17. [billing] Delete the Stripe Customer (`customers.del`) or keep it for Stripe-side invoice history?
18. [billing] Is the commercial rule "no refund of the unused period" (`prorate:false, invoice_now:false`)?
19. [billing] Refuse while past_due with an open invoice, or void/forgive it so no `invoice.paid` can arrive for a dead agency?
20. [billing] `billing_events` payloads after deletion — keep, scrub, or name in the Privacy rewrite?
21. [billing] Confirm: a house workspace is refused from the app and deleted by hand, matching how it is created.
22. [billing/app-surface] Should the confirm step warn the customer to download invoices first, and state that issued invoices are retained (ten years) after deletion?
23. [integrations] Does the Instagram Login host support `DELETE /me/permissions` for `instagram_business_*` tokens? Documented as GET for graph.facebook.com only (`META-FB-PROBE.md:104`).
24. [integrations] Revoke at Meta/Canva at all, given every disconnect only drops rows today and the Privacy page routes users to Facebook Settings?
25. [crons] Is a human-facing "deleting" soft state wanted, or is the ≤300 s cron window plus FK rejection acceptable as-is? The crons themselves need no flag.
26. [critic] Should the self-serve path send the confirmation e-mail the data-deletion page promises for the manual path (no template exists)?
27. [critic] Storage sweep placement: inline, `after()`, or `maxDuration` on the settings segment?