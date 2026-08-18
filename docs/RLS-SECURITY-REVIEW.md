# RLS Security Review (deferred task)

**Status:** OPEN — **partially measured 2026-08-18, and the original diagnosis was wrong.**
RLS is enabled on all 28 public tables; there are no unprotected tables. What is real is
that all 18 policies were created out-of-band and **none exist in version control**.
Whether those policies actually scope by agency is unanswered — see "The question that is
now open".
**Prompted by:** a `brand_visual_identity` failure (2026-07-20): onboarding's identity save failed
silently and Settings save returned `new row violates row-level security policy for table
"brand_visual_identity"`. Fixed *tactically* by routing that table's reads/writes through the admin
client (commit `00306a1`). This doc captures the *real*, project-wide issue for a dedicated task.

> **2026-08-18.** This document sat OPEN for four weeks and `docs/TECH-DEBT.md` never
> referenced it, which is why five audits passed over the largest item in the repo. It is
> now TECH-DEBT §8.1, and the tooling below exists so the first step costs minutes rather
> than a scheduling decision.

---

## Step 1 — measure (read-only, ~2 minutes, no tooling)

**Open `supabase/queries/rls-audit.sql` and run query 1 in the dashboard SQL editor.**

That is the whole step. No Docker, no CLI, no link — the state lives in the Postgres
catalog and the catalog is queryable from the browser. It classifies every table in
`public` into the three states this document describes. **Paste the result into the next
section.**

The same file carries three more queries worth running while you are there: what the
existing policies actually say, the M21 check on `generation_runs`/`generation_themes`,
and the §2.9 bucket MIME allowlist.

<details>
<summary>Optional: the CLI route (needs Docker)</summary>

`npm run db:rls` produces the same table from a schema dump. It is not the recommended
path and was the first thing tried here: `supabase db dump` runs `pg_dump` inside a pinned
Docker container, so it needs a running daemon that this question does not otherwise
require. Useful if you want the full DDL for other reasons.

```sh
export SUPABASE_ACCESS_TOKEN=…    # https://supabase.com/dashboard/account/tokens
npm run db:link                   # once per machine
npm run db:rls                    # requires Docker Desktop running
```

Without Docker but with a local `pg_dump` (`brew install libpq`), you can also dump
directly and feed the file to the reporter:

```sh
pg_dump --schema-only --schema=public "$DATABASE_URL" > /tmp/prod-schema.sql
node scripts/rls-report.mjs /tmp/prod-schema.sql
```

</details>

### Measured state — 2026-08-18

**Measured, and it reverses this document's central claim.** 28 tables in `public`,
**RLS is enabled on all 28**, `force_rls` false on all 28.

| Verdict | Count | Tables |
|---|---|---|
| **OPEN** (no RLS) | **0** | — |
| **LOCKED** (RLS on, 0 policies) | **11** | `brand_image_bank`, `brand_kit_extractions`, `brand_vector_bank`, `brand_visual_identity`, `client_ideas`, `client_style_memos`, `discarded_drafts`, `idea_form_tokens`, `image_generation_usage`, `post_canvas_docs`, `post_images` |
| **SCOPED** (RLS on, ≥1 policy) | **17** | `agencies`, `analytics_reports`, `brand_profiles`, `client_assets`, `client_sources`, `clients`, `generation_runs`, `generation_themes`, `intelligence_briefings`, `language_rules`, `notifications`, `post_approval_tokens` (2), `post_history`, `posting_schedules`, `posts`, `social_connections`, `users` |

#### What this corrects

Everything below the line in this document was written from the migrations, and the
migrations do not describe the live database.

- **"the `OFF` rows are the real latent exposure … the door is open" — WRONG.** There are
  no OFF rows. `posts`, `clients`, `brand_profiles`, `posting_schedules` and the rest all
  have RLS on. The unauthenticated-read-any-agency scenario, which TECH-DEBT §8.1 called
  the largest item in the repo, **does not exist in this shape**.
- **"`client_ideas`, `idea_form_tokens` — ON, with policies (migration) — correct" — WRONG
  on both halves.** They have **zero** policies today, and the migration that supposedly
  created them (`20260424_create_client_ideas.sql`) only ever ran
  `ALTER TABLE … ENABLE ROW LEVEL SECURITY`. They work because the public idea flow uses
  the admin client throughout (`features/ideas/lib/ideas.ts`), not because a policy
  permits it.
- **Not one `CREATE POLICY` exists in version control.** `grep -rin 'create policy'` over
  all 48 migrations returns nothing, yet the live database has 18 policies. Every one was
  created out-of-band. That is the finding that survived: not "RLS is off" but **"the
  entire RLS configuration is undocumented and unreproducible."**

#### The question that is now open

⚠️ **"SCOPED" means a policy exists, not that it is correct.** 17 tables carry exactly one
policy each, which is the signature of a bulk enable-RLS pass rather than per-table
design. A single `USING (true)` policy leaves a table exactly as exposed as no RLS at all
while reporting as protected in any audit that counts policies instead of reading them —
including the query above.

**Run query 2 in `supabase/queries/rls-audit.sql`.** Its `exposure` column flags
`USING (true)` and predicates with no agency/user reference. Until that comes back, the
severity of this document is unknown, not resolved.

The three verdicts and what each means:

| Verdict | Meaning | Action |
|---|---|---|
| **OPEN** | No RLS. Readable over PostgREST by any signed-in user, for **any agency** — the anon key is in every browser bundle by design. The app is not involved. | The finding. Option C below. |
| **LOCKED** | RLS on, **zero policies** → service-role only. Reached the live database by a dashboard click, not a migration. | Make it deliberate: either a policy, or an explicit migration saying admin-only-by-design. |
| **SCOPED** | RLS on with policies. | Confirm the policies say what you think. |

### Also worth checking while you are connected

```sh
npm run db:status     # local migration files vs what the CLI thinks is applied
```

⚠️ **Expect this to show every local migration as un-applied**, because the CLI has never
tracked this project — there was no `supabase/config.toml` until today. If so, do **not**
run `supabase db push`: it would replay all 48 files against a database that already has
them. Repair the history first (`npx supabase migration repair --status applied <version>`
per file), and only then consider `db pull` for the baseline.

Two more one-liners for open TECH-DEBT items, in the SQL editor:

```sql
-- §2.9: the bucket MIME allowlist. Wants BOTH image/svg+xml and image/webp.
select id, allowed_mime_types from storage.buckets where id = 'post-images';
```

**§7.9 M21 — half answered.** `generation_runs` and `generation_themes` both have RLS on
with **1 policy each**, so they are not the "RLS on, no policy" case that would have made
every wizard theme insert fail silently into `trackThemeSafe`. What that policy permits is
still unknown: the wizard path writes with the **user-scoped** client, so a SELECT-only
policy would produce the same silent failure by a different route. Query 2 settles it.

---

## ❌ Root cause (as originally diagnosed — SUPERSEDED)

> Everything from here to "Options" was reasoned from the migrations and is **factually
> wrong about the live database**. Kept because the correction above needs something to
> point at, and because the reasoning error is the transferable part: this section
> inferred database state from version control, on a project where the two had never been
> connected. Measured reality is in "Measured state" near the top.

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

## ❌ Current per-table state — SUPERSEDED, every `OFF` below is false

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
1. ~~Dashboard → Advisor + Database → Tables: record the true RLS state~~ — **superseded by
   `npm run db:rls`** (Step 1 at the top). Paste its table into "Measured state".
2. Decide the target posture (recommend C).
3. Write one migration that sets each table's RLS + policies explicitly (idempotent).
4. Where policies now allow the user/server client, drop the admin-client workarounds.
5. Verify: an authenticated user of agency A cannot read agency B's rows via a raw REST call; the app's
   flows (onboarding save, settings, visuals) still work.

### On step 5 — verify by attacking it, not by reading the policy

The whole finding is that the app never exercises the hole, so app flows passing proves
nothing about it. Reproduce the actual attack with a real user's JWT:

```sh
# Sign in as a user of agency A in the browser, copy the access token from the
# `sb-<ref>-auth-token` cookie, then ask PostgREST directly:
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/posts?select=id,client_id&limit=5" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer <that-users-access-token>"
```

**Before the fix** this returns rows — including other agencies'. **After**, it must return
`[]` for anything outside that user's agency. Run it before and after; a policy that reads
correctly and returns rows anyway is the only outcome that matters.
