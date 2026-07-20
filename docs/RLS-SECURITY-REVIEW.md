# RLS Security Review (deferred task)

**Status:** OPEN — analysis only. Do not treat the current per-table state as intentional.
**Prompted by:** a `brand_visual_identity` failure (2026-07-20): onboarding's identity save failed
silently and Settings save returned `new row violates row-level security policy for table
"brand_visual_identity"`. Fixed *tactically* by routing that table's reads/writes through the admin
client (commit `00306a1`). This doc captures the *real*, project-wide issue for a dedicated task.

---

## Root cause

Row-Level Security (RLS) is applied **inconsistently and partly by accident**.

- The **only migration** that enables RLS is `supabase/migrations/20260424_create_client_ideas.sql`, on
  `client_ideas` + `idea_form_tokens` — the **public-token** tables the browser hits *unauthenticated*
  (the client idea form). RLS is genuinely required there.
- **No migration** enables RLS on any other table (`brand_visual_identity`, `brand_kit_extractions`,
  `brand_image_bank`, `post_images`, `brand_profiles`, `posts`, `clients`, …).
- Yet `brand_visual_identity` and `post_images` **have RLS ON in the live database** — enabled
  **out-of-band**, not by code. The most likely path: Supabase's **Security Advisor** flags
  "RLS disabled in public" and someone clicks **"Enable RLS"** in the dashboard, which turns RLS on
  **without adding any policy** → the table is locked to everything except the `service_role`.

### The intended model vs. reality
- **Intended (per migrations):** RLS only on public-token tables; all app-internal tables have **no RLS**
  and are protected by **server-side access + code-level agency scoping** (`resolveAuth` → filter/verify
  by `agency_id`). The browser is not supposed to query app tables directly.
- **Reality:** two app-internal tables got RLS toggled on (no policy) → they only work via the
  `service_role` (admin client). The rest have no RLS.

---

## Current per-table state (verify in the dashboard as step 1 of the fix)

| Table | RLS | Access pattern today |
|---|---|---|
| `client_ideas`, `idea_form_tokens` | **ON, with policies** (migration) | public token flow — correct |
| `post_images` | **ON, no policy** (out-of-band) | admin client only (worked around earlier) |
| `brand_visual_identity` | **ON, no policy** (out-of-band) | admin client (fixed `00306a1`) |
| `brand_kit_extractions`, `brand_image_bank` | unknown / assume ON | already accessed via admin client |
| `brand_profiles`, `posts`, `clients`, `posting_schedules`, most others | **OFF** | server client + code scoping |

> The `OFF` rows are the real latent exposure: with no RLS, the `authenticated` role can read those tables
> **directly via the PostgREST REST API** for **any agency** using the public anon key + a valid user JWT.
> The app only queries them server-side, so it's not exploited in-app, but the door is open.

---

## Options

**A. Disable RLS on the toggled tables (match the majority).**
`disable row level security` on `brand_visual_identity` + `brand_kit_extractions` + `brand_image_bank`
(+ `post_images`), revert to the user/server client. Simplest and consistent with most of the schema —
but perpetuates the app-wide "no RLS" exposure above.

**B. Keep RLS + admin client (current tactical fix), made intentional.**
Add explicit `enable row level security` (+ a "server-admin-only, no client policies by design" comment)
to the migrations for the toggled tables; keep using the admin client server-side after ownership checks.
Secure (nothing reachable from the browser), matches the `post_images` precedent, minimal — but leaves the
`OFF` tables exposed and the posture split across two styles.

**C. Proper agency-scoped RLS everywhere (recommended direction).**
Enable RLS on all app-internal tables and add policies that scope rows to the caller's agency
(`authenticated` user → `agency_id` via a `user → agency → client` join). Closes the latent REST exposure,
makes the posture uniform and intentional, and removes the need for admin-client special-casing. Largest
effort; should be its own migration + review, with policies tested per table.

---

## Recommendation

Move toward **C** as the target posture (uniform, secure-by-default), done as a dedicated migration +
security pass. If C is too large to schedule soon, at minimum adopt **B** *explicitly in migrations* so no
table's RLS state depends on out-of-band dashboard clicks, and add the same `enable row level security`
for `post_images` so it's version-controlled too.

Either way: **make every table's RLS state a deliberate, migration-defined decision**, and reconcile the
Supabase Security Advisor warnings so they stop being silently "fixed" in the dashboard.

## Current workarounds in code (keep until this task lands)
- Admin client (`createAdminSupabaseClient`) for `brand_visual_identity` reads/writes
  (`src/lib/visual/queries.ts`), `brand_kit_extractions` (extract routes), `brand_image_bank`
  (`src/lib/images/generate-backdrops.ts`), and `post_images` (`src/features/publishing/lib/storage.ts`).
- All callers verify agency ownership in code before the admin call, so bypassing RLS is safe.

## Suggested steps for the fix task
1. Dashboard → **Advisor** + **Database → Tables**: record the true RLS on/off state of every public table.
2. Decide the target posture (recommend C).
3. Write one migration that sets each table's RLS + policies explicitly (idempotent).
4. Where policies now allow the user/server client, drop the admin-client workarounds.
5. Verify: an authenticated user of agency A cannot read agency B's rows via a raw REST call; the app's
   flows (onboarding save, settings, visuals) still work.
