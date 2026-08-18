# Tech-Debt Remediation Plan

Written 2026-08-18 against `main` @ `e077647`, after re-verifying every entry in
`docs/TECH-DEBT.md` against the code and sweeping the tree for what the ledger does not
record.

**Baseline measured, not assumed** (all four run clean today):

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 — 0 errors, **9 warnings** (ledger §4.1 says 11) |
| `npm test` | 118 files, **1262 tests**, all pass |
| `npx prettier --check .` | **438 files** unformatted (ledger §7.2 says 169) |

Tree: 805 TS/TSX files, ~92k lines, 48 migrations, 4 Vercel crons, CI running `npm run check`
on every push.

The codebase is in good shape on the things that are usually bad: **zero** `TODO`/`FIXME`,
**zero** `console.log`, **zero** `any`, one `@ts-expect-error` (in a test, deliberate). The
debt that remains is structural, security-shaped, or in the enforcement layer — which is why
it survives a green build.

---

## Part A — Corrections to `docs/TECH-DEBT.md`

The ledger is the plan's input, so it has to be accurate first. Seven entries no longer
describe reality. Fixing the doc is Wave 0 and costs nothing but attention.

| Entry | Says | Actually |
|---|---|---|
| §4.1 | 11 lint warnings | **9** — 8 `_`-prefixed unused vars + 1 `no-img-element` |
| §5.6 | Week-schedule index unverified | **Closed.** `20260731_add_roster_indexes.sql:17` creates `posts(client_id, status, scheduled_at)` — exactly the filter `fetchWeekSchedule` uses |
| §6.3 | Primitive dedup "still open — Input ×8, StatusPill ×5, spinner ×5, Modal, Button, picker header, ScoreBar ×2" | **Nearly all done.** `components/ui/` now holds `button`, `modal`, `input`, `spinner`, `status-pill`, `form/control-classes`. **Only `ScoreBar` remains duplicated** (`insight-panel.tsx:237` vs `quality-scores.tsx:12`) |
| §6.3b | 151 inline `style={{` | **119** |
| §7.2 | Prettier fails on 169 files | **438** — and 168 of them are vendored `.claude/skills/*`, which `.prettierignore` does not cover |
| §7.4 | 15 unvalidated routes, "worst of them: `posts/[id]`" | **12.** `posts/[id]` was fixed (it calls `parsePostUpdate`) and `auth/forgot-password` was fixed. See the detector bug in B7 — the guard cannot see either fix |
| §7.6 | knip reports 1 unused file + "72 remaining types" | **1 file, 29 unused exports, 71 unused exported types** — numbers moved, the barrel question is unchanged |

Everything else in the ledger I checked line-by-line and it holds: §1.1, §1.2, §1.3, §2.1,
§2.4, §2.11, §5.2, §5.8, §5.9, §6.2, §6.5-remainder, §7.3, §7.7, §7.8, §7.9 M10/M16/M21.

---

## Part B — Findings not in the ledger

Ordered by severity. Every one was confirmed by reading the code, not inferred.

### B1. RLS is off on most tables — cross-agency reads are reachable from the browser  ★ CRITICAL

`docs/RLS-SECURITY-REVIEW.md` exists, is marked **OPEN**, dates from 2026-07-22, and is
**not referenced anywhere in TECH-DEBT.md**. It is the single largest item in this plan and
it has been invisible to every audit since.

Confirmed from the migrations: only `client_ideas`, `idea_form_tokens`, `discarded_drafts` and
`client_style_memos` ever get `enable row level security`. `posts`, `clients`, `agencies`,
`users`, `brand_profiles`, `social_connections`, `notifications`, `generation_runs`,
`post_canvas_docs`, `posting_schedules` and the rest have **no RLS statement in version
control at all**.

The app is not exploited in-app — every server query carries a hand-written
`.eq('agency_id', …)` — but `NEXT_PUBLIC_SUPABASE_ANON_KEY` is in every browser bundle by
design, and a signed-in user holds a valid `authenticated` JWT. With RLS off, PostgREST will
serve **any agency's rows** to a raw `fetch` against `/rest/v1/posts`. Nothing in the app has
to be involved.

Two tables (`post_images`, `brand_visual_identity`) have RLS **on with no policy**, toggled
out-of-band via the Supabase dashboard — which is why 53 files route through
`createAdminSupabaseClient`, and why memory `project_post_images_rls` records "must use admin
client" as a rule rather than as a symptom.

**Not fixable from the repo alone** — step 1 is a prod schema dump.

### B2. The schema baseline is not in version control  ★ CRITICAL (enabler for B1)

48 migrations; only 4 contain `create table`. There is no migration that creates `agencies`,
`clients`, `posts`, `users`, `notifications`, `post_images`, `generation_runs`,
`social_connections`, `brand_profiles`, `posting_schedules`…

Consequences: the database cannot be rebuilt from the repo; `npx supabase gen types --local`
against a fresh local DB produces nothing; the RLS posture in B1 cannot be reviewed or fixed
from code; and no reviewer can ever see a table's constraints without opening the dashboard.

The ledger has this as §7.9 **M16**, one bullet, filed under "needs a production query" — it
is the foundation the whole security wave stands on.

### B3. Third-party fetched text is interpolated raw into prompts  ★ HIGH

Ledger §7.9 **M10** is correct and understated. Verified in
`src/ai/research/prompts/prompt-builder.ts:84-160` — `buildSourceMaterialBlock` writes,
unescaped and uncapped:

- RSS `title`, `description`, `link` → `<rss_content>`
- Website `text` and `focusInstructions` → `<website_content>`
- Uploaded file `text` → `<document_content>`
- Tavily `title`, `snippet`, `url` → `<web_search_content>`
- Instagram `caption` → `<performance_content>`

`sanitizePromptField` **is imported into that exact file** and used on one thing only: the
agency's own topic briefs (line 172). The attacker-controlled half goes in raw.
`buildGroundingPrompt` (`ai/generation/prompts/source-grounding.ts:38`) does the same with up
to 4000 chars of fetched markdown, untagged.

And neither `buildResearchSystemPrompt` nor `buildGenerateSystemPrompt` includes
`DEFENSIVE_DATA_CLAUSE` — its only consumer is `generate-best-time.ts`.

Threat model, concretely: anyone who controls a page a client added as a website source, or
any item in a subscribed RSS feed, can emit `</rss_content>` followed by instructions and
steer what the agency publishes under a client's name. This is the one finding here with a
realistic path to reputational damage.

### B4. Server actions are outside the boundary-validation guard  ★ HIGH

`src/app/api/__tests__/boundary-validation.test.ts` walks `src/app/api` for `route.ts` only.
Server actions are a boundary too, and **7 of 14 action files import no schema**:
`connection-actions`, `style-memo-actions`, `canva-actions`, `approval-actions`,
`briefing-actions`, `source-actions`, `report-actions`.

Most are `(id: string)` followed by a real ownership check, so they are low-risk. One is not:

`submitApproval` (`features/review/actions/approval-actions.ts:10`) is **public** — no
`resolveAuth`, authorised by a URL token, running on the admin client. It takes
`postNotes?: Array<{postId: string; note: string}>` with **no zod, no array cap, no note
length cap**, writes each straight to `post_approval_tokens.client_note`, and hand-rolls its
`status` check — the precise anti-pattern §7.4 was written about. Anyone holding an approval
link can write unbounded rows into the database.

### B5. Two paid LLM routes have no rate limit  ★ MEDIUM

Visual generation is well covered — `visualsRateLimitResponse` gates all seven paid image
routes through one pool. Text routes are not:

- `POST /api/ai/detect-slop` — calls `validateQuality` (a live model call). **No rate limit,
  no zod, and its `catch` swallows the error without logging** (violates the "log once at the
  boundary" rule; this route has no `console.*` at all).
- `POST /api/ai/analyze-url` — model call + outbound web fetch. Zod'd, **no rate limit**. The
  outbound fetch also makes it a mild SSRF-shaped surface.
- `POST /api/auth/forgot-password` — ledger §6.5 already flags this; confirmed still
  unthrottled. The enumeration oracle is closed, but the endpoint will send mail to any
  address as fast as it is asked.

### B6. The rate limiter is per-lambda-instance on a serverless deploy  ★ MEDIUM

`src/lib/auth/rate-limit.ts` stores counts in a module-level `Map` and its own header says
*"Suitable for single-instance deployments."* This deploys to Vercel. Each concurrent lambda
gets its own `Map`, so the effective ceiling is `max × instances`, not `max`. The
`setInterval` cleanup also keeps a timer alive per instance.

It is not nothing — it still stops a runaway client loop hitting one warm instance — but the
comment on `VISUALS_RATE_LIMIT` ("stops runaway loops") is the only claim it actually
supports. Anything framed as a spend ceiling is not enforced.

### B7. The boundary-validation guard cannot detect a fix  ★ MEDIUM

`PARSES = /\.(safeParse|parse)\s*\(/` requires a literal dot. `posts/[id]/route.ts` validates
its body through `parsePostUpdate(body)` — a named wrapper, no dot — so the guard still
classifies it as unvalidated, its `KNOWN_UNVALIDATED` line stays, and **the staleness
assertion that exists specifically to catch "fixed but not delisted" passes anyway**.

This is worse than one stale line: the guard actively discourages the house pattern of
wrapping a schema in a named parser, and the backlog it publishes is wrong by one today and
by more as routes adopt that pattern.

### B8. Prettier debt grew 2.6×, and 38% of it is vendored code  ★ LOW (but blocks §7.2)

438 files: **232 in `src/`**, **168 under `.claude/skills/`** (the vendored `superpowers` and
`impeccable` ports — third-party code that should never be formatted), 31 in `docs/`, 4 in
`.impeccable/`, 3 root markdown.

`.prettierignore` is three lines (`.next`, `node_modules`, `public`). Adding `.claude`,
`.impeccable` and `docs` deletes 203 of the 438 without touching a byte of source, and turns
§7.2's "169-file reformat that buries the diff" into a 232-file one that is still large but
now honest.

### B9. `as` casts: 294 outside tests, with two systematic patterns  ★ LOW–MEDIUM

CLAUDE.md: *"No `as` assertions without a WHY comment."* Many do carry one (every
`formData.get(…) as File | null` does). Two families do not, and both are duplication wearing
a cast:

**The ownership join.** `clients!inner(agency_id)` appears at 16 sites; at least four
re-declare its result shape by hand —
`as { data: (Record<string, unknown> & { clients: { agency_id: string } }) | null }` in
`connection-actions.ts:19` and `report-actions.ts:18`, plus variants in
`analytics/report/[reportId]` and `meta/connections/[connectionId]`. `lib/auth/helpers.ts`
already owns three of the 16 and is the obvious home for one `verifyOwnershipVia` helper.

**`as unknown as Json`.** Five write sites (`ai/best-time:73`, `ai/intelligence:37,47`,
`cron/generate:267,328,372`) each double-cast an app object into a jsonb column. §5.7 solved
exactly this once, in `draftColumns`, and recorded why — the fix never generalised.

Also uncommented: `cron/generate/helpers.ts:58,72,77`, `cron/generate/route.ts:86,141,143,359`,
`cron/visuals/route.ts:52`, `posts/route.ts:40`, `posts/[id]/publish/route.ts:25,43`,
`lib/generation/runs.ts:52`.

### B10. `components/posts/review/` is a whole feature living in the shared layer  ★ MEDIUM

Ledger §1.3 describes this as two files importing `ImageSlot`. It is now **12 files** —
`work-column`, `draft-rail`, `insight-panel`, `review-grid`, `schedule-dialog`,
`commitment-bar`, `visual-frame`, `week-strip`, `use-draft-edits`, `use-review-keyboard`,
`types` — and the direction is fully inverted: `work-column.tsx` imports
`features/canvas-editor` (three symbols) and `schedule-dialog.tsx` imports
`features/dashboard/lib/metrics`.

CLAUDE.md's own rule — *"If a component knows about a specific feature's data or types, it
does NOT belong here"* — is violated by every one of them. The reason they are there is real
though: `features/review` and `features/generate` both consume the set, so neither can own it.
That makes it a genuine shared-review domain that needs a home, not a mistake to revert.

### B11. Dead code, measured  ★ LOW

`npx knip@5 --include exports,files,types,duplicates`, then every hit grep-verified:

- **1 unused file:** `src/components/ui/skeleton.tsx`.
- **9 genuinely dead exports** (definition is the only reference): `statusDotColor`,
  `parseVisualIdentity`, `stripPlanningPrefix`, `decodeUrlsInText`, `formatCompactNumber`,
  `TRIAL_DAYS`, `MS_PER_HOUR`, the `ToastProvider` re-export, `getCanvaToken`.
- **~19 exports used only inside their own file** — should lose `export`, not be deleted:
  `PLATFORM_LIMITS`, `EN_/BG_SPECIFIC_AI_TELLS`, `getAiTellsForLanguage`, `AGENCY_NAV`,
  `SOLO_NAV`, `ALLOWED_IMAGE_TYPES`, `toHsl`, `stepIndex`, `formatSchedule`,
  `DEFAULT_SCHEDULE`, `DRAFT_GROUPS`, `weekdayNameToIndex`, `uploadToBucket`,
  `USER_SETTABLE_POST_STATUSES`, `DEFAULT_MAX_TOKENS`, `RANK_PER_PILLAR_CAP`, `createSource`,
  `useFieldContext`, `MARK_READ_MAX`-adjacent items.
- **71 unused exported types**, still the `src/types/index.ts` barrel question from §7.6.

**One of these is a half-finished refactor, not dead weight.** §6.3 records extracting
`MS_PER_HOUR` to replace "the loose `3_600_000`s". `MS_PER_HOUR` now has **zero** importers
while **three** sites still write the literal: `cron/generate/route.ts:68`,
`triage-buckets.tsx:180`, `review-queue.tsx:576`. Either finish it or delete the constant —
the current state is the worst of both.

### B12. CI type-checks, lints and tests, but never builds  ★ MEDIUM

`.github/workflows/check.yml` runs `npm run check` = `typecheck && lint && test`. It never
runs `next build`. `tsc --noEmit` does not evaluate the App Router's rules: a server-only
import pulled into a client component, an invalid `export const dynamic`, a bad `metadata`
shape, a Server/Client boundary violation. Given the codebase deliberately routes 53 files
through a **service-role** Supabase client, "server-only code reached a client bundle" is
precisely the class of error worth a build to catch.

This is the §7.1 lesson again — *"`npm test` passing is not evidence of type correctness"* —
one level up: `npm run check` passing is not evidence the app builds.

### B13. Five features have no tests at all  ★ LOW

`analytics`, `auth`, `marketing`, `settings`, `visual-identity` have no `__tests__` directory.
`auth` and `settings` are the ones that matter — team invites, role checks and account
mutations. Distribution overall: lib 51 files, features 30, ai 26, app 6, utils 3, types 1,
components 1.

### B14. Boundary logging is inconsistent  ★ LOW

21 route files contain no `console.*` at all; 104 `} catch {` sites across `src/` discard the
error object. Most are correct (a failed `request.json()` → 400 needs no log). Some are not:
`detect-slop` returns 500 having lost the reason entirely, and
`canva/designs/[designId]/export:88` `continue`s past a failed export poll silently.

### B15. Missing security headers  ★ LOW

`next.config.ts` sets `X-Frame-Options`, `X-Content-Type-Options` and `Referrer-Policy`. No
`Content-Security-Policy`, no `Strict-Transport-Security`, no `Permissions-Policy`. CSP is
genuinely awkward with Next's inline bootstrap — but on an app that renders third-party
fetched text (B3) it is the defence-in-depth layer for exactly that.

### B16. Housekeeping  ★ TRIVIAL

- `src/hooks/` is **not in CLAUDE.md's "where things live" map**, and holds
  `useIsMobile.ts` — the only camelCase filename in a kebab-case tree (next to
  `use-unload-guard.ts` in the same folder).
- Three stale remote branches: `feat/ai-visual-flow`, `redesign/dashboard`,
  `feat/composition-engine-phase0`.
- `docs/` holds 288 KB of markdown across 9 files plus 4 plans. `TECH-DEBT.md` (53 KB) and
  `VISUAL-GENERATION-PRD.md` (66 KB) are each past the point where they get read end to end,
  which is part of why §7.4's numbers drifted unnoticed.
- 109 inline `.select('…')` strings against 38 constants in `select-columns.ts`. CLAUDE.md
  says "use them"; reality is that single-column reads don't. §6.3c already lists "the
  select-columns scope" as an unresolved rulebook contradiction — it needs a ruling, not a
  sweep.

---

## Part C — The plan

Eight waves. Waves 1 and 2 are sequenced deliberately; 3–7 are independent of each other and
can be taken in any order or in parallel.

Sizes: **S** ≈ under an hour · **M** ≈ half a day · **L** ≈ a day or more · **XL** ≈ multi-day.

---

### Wave 0 — Make the ledger true  (S, no code)

Apply Part A to `docs/TECH-DEBT.md`: correct the seven stale entries, close §5.6, fold
`docs/RLS-SECURITY-REVIEW.md` in as a §8 pointer so it stops being invisible, and promote
§7.9 M10 and M16 out of the audit-deferrals appendix into their own numbered sections.

Everything downstream cites this file. Doing it first means each wave can close its entries as
it lands instead of re-deriving what was already true.

---

### Wave 1 — Security  (the only wave with a hard ordering)

**1.1 — Dump the production schema into version control.** (M) → closes B2 / §7.9 M16

`supabase db dump --schema public` from prod, committed as
`supabase/migrations/00000000_baseline.sql`, guarded so it is a no-op against an existing
database. This is the prerequisite for 1.2 and for ever reviewing the schema in a diff.

Second half of the same task: answer §7.9 **M21** with one query — are `generation_runs` /
`generation_themes` RLS-enabled with no user policy? If yes, every wizard theme insert has
been failing silently into `trackThemeSafe`, zeroing `doneCount` and emptying the theme
exclusion list. That is a live generation-quality bug hiding behind a `Safe` suffix.

**1.2 — Decide and encode the RLS posture.** (XL) → closes B1

`docs/RLS-SECURITY-REVIEW.md` already lays out options A/B/C and recommends **C**
(agency-scoped policies everywhere). With 1.1 landed this becomes reviewable. Sequence:

1. Record each table's true RLS state (dashboard → Advisor).
2. Write one idempotent migration setting RLS + policies explicitly per table.
3. Drop the admin-client workarounds wherever a policy now permits the server client.
4. Verify: an authenticated user of agency A cannot read agency B via raw REST; onboarding
   save, settings save and visuals still work.

If C is too large to schedule now, adopt **B explicitly in migrations** — no table's RLS state
should depend on a dashboard click. That is a fraction of the effort and removes the "toggled
out-of-band" failure mode permanently.

**1.3 — Sanitise third-party source text.** (M) → closes B3 / §7.9 M10

In `ai/research/prompts/prompt-builder.ts:84-160`, wrap every fetched field in
`sanitizePromptField` at an appropriate `PROMPT_FIELD_LIMITS` tier — it is already imported.
Same for `buildGroundingPrompt`'s `primary`/`background`, which additionally need XML tagging
so the model can tell instruction from data. Add `DEFENSIVE_DATA_CLAUSE` to
`buildResearchSystemPrompt` and `buildGenerateSystemPrompt`.

⚠️ **Both system prompts are cache-stable prefixes** (`project_pipeline_evolution`, Phase B).
Adding the clause invalidates the prompt cache once, and the generation tests pin system-prompt
wording — expect to update snapshots in `ai/research/__tests__/__snapshots__`. Land it alone,
not inside a larger change.

**1.4 — Validate server-action inputs, then guard it.** (M) → closes B4

Start with `submitApproval`: a zod schema capping the `postNotes` array length and each
note's length, replacing the hand-rolled `status` check with an enum. Then the other six
action files.

Then widen `boundary-validation.test.ts` to walk `src/features/**/actions/*.ts` for
`'use server'`, with the same shrink-only backlog shape. A boundary the guard cannot see is a
boundary that drifts — that is the entire lesson of §7.4.

**1.5 — Rate-limit the remaining paid endpoints.** (S) → closes B5, §6.5-remainder

`checkRateLimit` on `ai/detect-slop`, `ai/analyze-url` and `auth/forgot-password`. Give
`detect-slop` a zod schema and a boundary `console.error` in the same edit.

**1.6 — Rule on the rate limiter's real guarantee.** (S decision, M if replaced) → closes B6

Either (a) accept it and rewrite the header comment to say what it enforces on Vercel — a
per-instance runaway guard, not a spend ceiling — or (b) move the counter to Postgres/Upstash
if any of these is meant to be a budget. Do not leave a comment claiming
"single-instance deployments" on a serverless app.

**1.7 — Security headers.** (S) → closes B15

`Strict-Transport-Security` and `Permissions-Policy` are one-liners in `next.config.ts`. CSP
needs a `report-only` rollout first given Next's inline bootstrap and the Konva/canvas work —
schedule it as its own change, after 1.3 (it is defence-in-depth for the same threat).

---

### Wave 2 — Make the gates tell the truth  (do before Waves 3–4)

The point of this wave: after it, a regression in Waves 3–7 fails a build instead of landing.

**2.1 — Fix the boundary-validation detector.** (S) → closes B7

Widen `PARSES` to recognise a named parser wrapper (`/(?:\.|\b)(safeParse|parse[A-Z]\w*)\s*\(/`
or an explicit allow-list of the repo's parser functions), then delete `posts/[id]/route.ts`
from `KNOWN_UNVALIDATED` and confirm the staleness assertion now bites when it should. Verify
the fix the way §7.5 was verified — by breaking it on purpose.

**2.2 — Clear the 12-route validation backlog.** (M) — one commit per route

`ai/best-time`, `ai/detect-slop` (in 1.5), `ai/generate-svg`, `ai/intelligence/tip`,
`ai/isolate-subject`, `ai/paste-from-url`, `ai/rewrite`, `ai/suggest-sources`,
`canva/designs/[designId]/export`, `extract/start`, `posts/[id]/images`, `sources/discover`.

Each adds a schema in the feature's `schemas.ts` and deletes its backlog line. The ledger's
"behavioural change per route, wants its own review" reasoning is right — keep them separate.

**2.3 — Add `knip` as a devDependency.** (M) → makes B11 permanent

`knip.json` exempting: `.claude/**` and `.impeccable/**` (vendored), Next's framework exports
(`POST`/`GET`/`maxDuration`/`metadata`/`default`/`generateMetadata`), and — until Wave 3.2
rules on it — `src/types/index.ts`. Seed a baseline of what survives, add to `npm run check`
as a shrink-only list.

Keep `deletion-ledger.test.ts`: knip works at export granularity and cannot see an unused
**field on a used type**, which §7.6 correctly identifies as the shape most of the real
findings took. The two are complementary.

**2.4 — Add `next build` to CI.** (S) → closes B12

One step in `check.yml` after `npm run check`. Needs build-time env placeholders. This is the
cheapest high-value item in the whole plan.

**2.5 — Formatting, in three commits.** (S + mechanical) → closes §7.2 / B8

1. `.prettierignore` += `.claude`, `.impeccable`, `docs` → 438 drops to ~235.
2. `npm run format` alone, nothing else in the diff (232 src files).
3. Restore `format:check` to `npm run check` and delete the CI comment that excludes it.

Note this reverses a standing CLAUDE.md instruction (*"`format:check` is deliberately outside
`check`. Do not add it."*). Update that line in the same commit — the instruction exists
because the gate was red, and step 2 is what makes it green.

---

### Wave 3 — Dead code and duplication  (M total)

**3.1** Delete the 9 dead exports and `skeleton.tsx`; drop `export` from the ~19 file-locals. (S)

**3.2** Rule on `src/types/index.ts`. (M) The 71 unused type exports cascade — deleting a
re-export orphans its declaration, and then someone must decide whether `api.ts`'s
request/response interfaces are dead weight or documentation. **Make the ruling explicit and
record it**, then either clear them or exempt the barrel in `knip.json` permanently. What
must not happen again is 72 standing hits that everyone learns to ignore.

**3.3** Finish or abandon `MS_PER_HOUR`. (S) Three literal sites; pick one direction.

**3.4** One `ScoreBar`. (S) Last of §6.3's primitive half. Both copies render the same three
rows from the same `score-colors` helpers.

**3.5** One ownership-join helper. (M) `verifyOwnershipVia(supabase, table, id, agencyId)` in
`lib/auth/helpers.ts`, which already holds three of the 16 sites, replacing four hand-written
result-shape casts.

**3.6** One `Json` narrowing helper. (S) `draftColumns` already solved this once (§5.7);
generalise it and delete the five `as unknown as Json`.

---

### Wave 4 — Layering  (M–L, pure moves — do after Wave 2 so CI catches breakage)

**4.1** `parse-slides.ts` → `src/lib/posts/parse-slides.ts`. (S) §1.1. Twelve importers, two
of them server-side. Genuinely five minutes; it has been open since July because it is nobody's
task, which is the reason to just do it.

**4.2** Promote the post-images domain. (M) §1.2. `features/publishing/lib/{storage,
fetch-post-images,image-list,map-image-row,types,asset-destination,validate-image-file}` →
`src/lib/post-images/`. **Verified scope: 44 import sites outside `features/publishing`**,
including 15 API routes and the public approval route. Pure rename; do it in one commit with
nothing else in it.

**4.3** Give the shared review surface a home. (L) §1.3 / B10. The 12 files in
`components/posts/review/` are consumed by both `features/review` and `features/generate`, so
"move it into the feature" does not work. Options: a `features/review-surface/` shared feature,
or promote to `features/review/` and have `generate` import across (which the tree already does
in the other direction). **This needs a decision before code** — it is the one item here where
the right shape is not obvious, and CLAUDE.md's own promote-on-second-consumer rule is what
produced the current state.

**4.4** Extract `api/meta/callback`. (M) §6.2. 297 lines, six token-exchange helpers in a route
file. The ledger's caution is right and stands: **this path cannot be exercised locally**, the
Business Login `data[]`-vs-flat token shape is hard-won, and a move must be verified against a
real Live-mode consent (see `project_meta_app_review`). Its own change, its own verification.

---

### Wave 5 — Robustness  (independent items, take by value)

| # | Item | Size | Ledger |
|---|---|---|---|
| 5.1 | `generation_runs` partial unique index or advisory lock — Vercel cron is at-least-once and the dedup guard reads a stale snapshot, so two invocations on one tick can double-generate a batch | M | §5.8 |
| 5.2 | `visuals_attempted_at` + minimum retry spacing — a ≥3h provider outage currently burns all 3 attempts and permanently excludes those posts from auto-visuals | M | §5.9 |
| 5.3 | Surface partial success on approve — a failed `post_images` batch insert only logs; the user is told "approved" and the images are silently absent | S | §2.4 |
| 5.4 | Resolve notification client names from `client_id`, delete both message regexes | S | §7.7 |
| 5.5 | Paginate `/ideas` server-side, then narrow `MARK_READ_MAX` (500) to the page bound in the same change. Status filtering already landed; the `limit` never did | M | §7.8 |
| 5.6 | Composite FK on `idea_form_tokens (agency_id, client_id)` — reassign a client between agencies today and its old tokens keep minting ideas into the old agency | S | M18 |
| 5.7 | Stop tracking themes for wizard drafts that are never persisted — a theme rejected *because the draft was bad* is banned for 10 runs identically to one that shipped | M | M12 |
| 5.8 | Give a client whose `fetchClientData` throws inside the cron loop a trace — today it vanishes with no run row, no `results.errors` entry, no log line | S | §7.9 |
| 5.9 | One storage-orphan cleanup job covering §2.2 / §2.7 / §2.8 | M | see below |

**On 5.9:** three ledger entries describe the same class — abandoned drafts, stranded clean
backgrounds, and Phase-5 element/inpaint/outpaint/background-candidate intermediates. One job
closes all three, and the constraints are already written down: skip every path referenced by
`post_canvas_docs.doc->background->>storagePath` **and** by any image node's
`src.storagePath`. Vercel cron slots are limited (4 in use) — piggyback on `refresh-tokens`,
which runs daily and is the least busy.

**Do not start with 5.9.** It is the lowest-value item on the list (the ledger's own repeated
assessment is "storage pennies") and the highest-risk to get wrong, because a cleanup job that
mis-computes the skip set deletes live artwork.

---

### Wave 6 — Performance  (all deferred-with-a-trigger; verify the trigger fired first)

| # | Item | Size | Ledger |
|---|---|---|---|
| 6.1 | Adapt validation server-side on `/calendar` — `schedule-card.tsx:246` still calls `parseStoredValidation` in the browser, so the ~280 KB zod chunk removed from `/review` still ships here (807 KB route JS). The fix pattern already exists in `0b8c72c` | M | §5.2 |
| 6.2 | Lazy realtime module so `@supabase/supabase-js` (~184 KB) leaves the shared dashboard bundle | M | §5.3 |
| 6.3 | Bucket-windowed loading for `/review` — reopen at ~100 pending posts | L | §5.5 |
| 6.4 | Collapse the visuals route's two sequential DB reads into one | S | §3 |
| 6.5 | Dedicated `count head:true` for the sidebar badge — reopen when agencies hold hundreds of pending posts | S | §5.1 |

6.1 is the only one with a measured number attached and no unmet precondition. The rest are
correctly deferred; leave them deferred and keep the triggers.

---

### Wave 7 — Testing  (L)

§7.12's analysis is the best thing in the ledger and its conclusion should be honoured, not
revisited: **jsdom would have caught 3 of 8 real editor defects, and the three worst were all
layout, which jsdom cannot see.** Do not add jsdom to feel covered.

**7.1** Playwright smoke tests against the real editor. (L) §7.12 sequenced this "after the arc
settles" — waves 12–14 (text effects, arch text, multi-format) were the stated blocker. Check
whether they have landed; if the editor is stable, this is now the highest-value test work in
the repo and the only automation aimed where the defects actually are.

**7.2** Cover `settings` and `auth` — team invites, role checks, account mutations. (M) Pure
logic, node-testable today, and the two untested features where a bug is a security bug.
`analytics`, `marketing` and `visual-identity` can stay uncovered.

**7.3** Keep pushing behaviour out of components into pure functions. (ongoing) The house
pattern that already covers `doc-history`, `layer-rows`, `snapping` and `resolve-slides` —
cheapest coverage per hour, no new tooling.

---

### Wave 8 — Housekeeping and rulings

- **8.1** Add `src/hooks/` to CLAUDE.md's "where things live"; rename `useIsMobile.ts` →
  `use-is-mobile.ts`. (S)
- **8.2** Delete the three merged remote branches. (S)
- **8.3** Rule on the three open rulebook contradictions §6.3c names — polling vs
  "never fetch in `useEffect`", the `select-columns` scope (109 inline selects vs 38
  constants, B16), and the server-action boundary policy. **A rule the code contradicts 109
  times is not a rule.** Either narrow it ("multi-column reads use a constant") or drop it. (S)
- **8.4** Split `docs/TECH-DEBT.md`. (S) At 53 KB it stopped being read end to end, which is
  how §7.4 and §7.2 drifted. Suggested: keep §1–§3 (open debt) in `TECH-DEBT.md`, move the
  resolved-with-reasoning entries to `docs/archive/` where the reasoning still outlives the
  session that decided it.

---

## Accepted — no action, keep the trigger

Verified still correct; each stays in the ledger as a decision, not a task.

| Entry | Why it stays |
|---|---|
| §1.4 `BrandStyleId` in `lib/` | Deliberate. Keeps adding a brand style a one-file edit |
| §2.1 Palette-description race | First batch only; "Re-analyze from website" seeds it. Not worth a cross-invocation lock at this scale |
| §2.3 No cross-surface live sync | No realtime plumbing planned |
| §2.9 Bucket MIME allowlist | Config lives in the Supabase dashboard. **No code fix possible** — see ops checklist |
| §2.10 Inpaint 16-px rounding | Measured twice against the live model. `compositeEditedRegion` is load-bearing because of it |
| §2.11 Canvas doc v1 rows | The upgrade is pure and total. Retiring `doc-v1.ts` needs a deliberate backfill plus a `doc->>'version' = '1'` check returning zero rows — **not** "everything looks upgraded" |
| §2.12 Mirrored picture → background | Baking the mirror means async work inside a synchronous reducer that must stay one undo step |
| §7.3 `AgencyInfo` | Waiting on billing, not on effort. Deriving it now forces a UI decision about a flow that does not exist |
| §7.10 "Ranked, not gated" | Doubling writer spend per post was decided against 2026-08-11. Variants remain the known lever if quality sags |
| §7.11 Coverage-aware pre-skip | Only reachable by topic-limiting every source away from every pillar, and the sources page shows it loudly |

---

## Ops checklist — cannot be done from the repo

These need a human with dashboard access. Several waves depend on them.

1. **Prod schema dump** → blocks 1.1, which blocks 1.2. Start here.
2. **RLS state per table** (Supabase → Advisor + Database → Tables) → blocks 1.2.
3. **M21 query**: are `generation_runs` / `generation_themes` RLS-enabled with no user policy?
   If yes, wizard theme tracking has been silently failing.
4. **Migration reconciliation.** The ledger tracks `20260808`, `20260814`–`20260817`,
   `20260818`, `20260819` as "pending prod" across four separate entries and three memory
   notes. **Confirm what is actually applied, once**, then regenerate `src/types/database.ts`.
   Nothing in the repo can answer this and the uncertainty is now spread across six documents.
5. **Bucket MIME allowlist** — `post-images` must permit `image/svg+xml` **and** `image/webp`,
   per environment (§2.9).
6. **`explain analyze` on `fetchWeekSchedule`** — likely unnecessary now that
   `posts(client_id, status, scheduled_at)` is confirmed to exist (§5.6), but worth one look
   while you have the console open.
7. **The browser matrix.** Owed by §6.3b, the generate redesign, the review-tab redesign, the
   sources redesign and the pipeline refactor — five separate entries, one unpaid debt.
   Everything is verified by `tsc` and 1262 tests; **none of it has been looked at in a
   browser.** Per §7.12, the manual pass has empirically caught every layout defect in the
   editor arc, including two that a full typecheck, clean lint, 1,100+ tests and twelve review
   agents all missed.

---

## Suggested order

**Now:** Wave 0 → ops items 1–4 → Wave 1.1 → Wave 1.2. Nothing else in this document matters
if an authenticated user can read another agency's posts.

**In parallel, low-coordination:** Wave 1.3 and 1.5 (independent of the RLS work), Wave 2.4
(`next build` in CI — one line, immediate value), Wave 2.5 step 1 (`.prettierignore`).

**Then:** Wave 2 in full, Wave 3, Wave 4.1 and 4.2.

**Then, needing a decision first:** Wave 4.3 (shared review home), Wave 4.4 (meta callback,
needs a Live-mode consent to verify against), Wave 8.3 (rulebook rulings).

**Deferred with triggers intact:** Wave 5.9, Wave 6, Wave 7.1 (until the editor arc settles).
