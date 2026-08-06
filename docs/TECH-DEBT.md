# Tech Debt & Deferred Issues

Catalogued 2026-07-22 during the Phase-3 AI-visuals review (branch `feat/ai-visual-flow`).
None of these block shipping; each entry says what it is, why it was deferred, and the intended fix.

---

## 1. Code structure

### 1.1 `parse-slides.ts` lives in the components tree but is imported by API routes

- **Where:** `src/components/posts/parse-slides.ts`, imported by `src/lib/visual/generate-post-visual.ts`
  (server) and a dozen client surfaces (`slides-section`, the review leaves, `use-draft-visuals`, …).
  (2026-08-04: `post-content-display`/`review-post-list` were deleted in the review-tab rebuild;
  the server-side import moved from the visuals route into the extracted lib.)
- **Problem:** a server route depending on `components/` is the wrong dependency direction. Works today
  (pure TS, no `'use client'`), but it's a layering smell.
- **Fix:** move to `src/lib/posts/parse-slides.ts` (or fold into `src/lib/validation.ts`), update imports.
  ~5 min, zero behaviour change.

### 1.2 "Post images" is a shared domain living under `features/publishing/`

- **Where:** `features/publishing/lib/{storage,fetch-post-images,image-list,map-image-row,types}.ts`,
  `features/publishing/components/image-slot.tsx`, `features/publishing/hooks/use-generate-visuals.ts`.
- **Problem:** consumed by generation, review, calendar, AND the public approval route — the "publishing"
  feature boundary is historical, not real. Cross-feature imports everywhere.
- **Fix:** promote to a shared home (`src/lib/post-images/` for the lib parts; decide where the ImageSlot
  UI belongs). Pure rename/move refactor — do it in a quiet moment, not mid-feature.

### 1.3 `components/` ↔ `features/` imports are bidirectional (pre-existing)

- **Where:** `components/posts/carousel-slides.tsx` and `post-content-display.tsx` import `ImageSlot`
  from `features/publishing/` (pattern predates the visuals branch; the visuals threading followed it).
- **Problem:** the "shared" component layer depends on a feature layer — direction should be one-way.
- **Fix:** falls out of 1.2 — once ImageSlot has a shared home, the direction is clean again.

### 1.4 `BrandStyleId` is defined in `lib/`, imported by `types/` (deliberate — likely KEEP)

- **Where:** `src/lib/visual/brand-styles.ts` defines the union; `src/types/visual.ts` imports it.
- **Why it's this way:** the id union and the registry must never drift, and this makes _adding a brand
  style a one-file edit_. The orthodox layout (union in `types/`) trades that for convention.
- **Action:** none unless the layering rule becomes strict; then derive the union from the registry keys.

---

## 2. Product/robustness gaps (accepted for now)

### 2.1 Palette-description race on a client's first generation

- **What:** for clients without a stored `palette_description`, the first batch (concurrency 6) makes up
  to 6 duplicate Haiku calls and the slides of that first post can carry slightly different palette
  wording (last write wins; later posts consistent).
- **Workaround:** "Re-analyze from website" once per client seeds the description eagerly.
- **Real fix:** cross-invocation lock or precompute step — not worth it at current scale.

### 2.2 Orphaned draft visuals in storage

- **What:** abandoned wizard tabs / mid-run errors leave files under `post-images/{clientId}/drafts/`
  (aborted fetches can't cancel the serverless run; discard-cleanup only fires on explicit discard).
- **Impact:** storage pennies; no data-integrity issue (`post_images` rows are the source of truth).
- **Fix if it ever matters:** periodic cleanup of `drafts/` objects older than N days (piggyback on an
  existing cron — Vercel cron slots are limited).
- **Phase-4 caveat:** approve MOVES each canvas doc's clean background out of `drafts/` into the
  post's folder, but a failed move keeps the drafts path (log-only). Any future drafts-cleanup job
  must skip paths referenced by `post_canvas_docs.doc->background->>storagePath`.

### 2.3 No cross-surface live sync for generated images

- **What:** generation triggered in one tab/surface doesn't live-update another already-open surface;
  rows exist server-side and appear on next load.
- **Action:** accepted — no realtime plumbing planned.

### 2.4 Approve attaches images best-effort

- **What:** in `POST /api/posts`, a failed `post_images` batch insert only logs — the post is created,
  the user sees "approved", images silently missing (regenerate later in calendar). Same posture for
  `post_canvas_docs` (`attachDraftCanvasDocs`): a failed doc insert leaves a composed image without
  re-edit state — the editor gracefully reseeds on next open.
- **Fix option:** surface a partial-success warning in the response + toast.

### 2.5 Persisted-post copy edits don't auto-recompose baked text — RESOLVED 2026-07-24

- Rewrites AND manual caption/slide edits in /review + calendar now re-bake doc'd positions
  automatically (`recomposePersistedPosition` + `useGenerateVisuals.recompose`; the stale-text
  nudge was deleted — its message survives only as the recompose-failure toast). Positions
  without a doc are never touched; unchanged copy is a no-op (text comparison before flatten).

### 2.6 No "apply text style to all slides" — RESOLVED 2026-07-24

- The editor's "Save & apply to all" button saves the slide, then carries its full look
  (role-matched layer position/width/font/size/weight/color/align/line-height + scrim) onto
  every sibling on all three surfaces (`applyStyleToDoc` + per-surface orchestrators). Each
  slide keeps its own text; doc-less siblings are seeded, styled and composed in one pass.

### 2.7 Clean-background orphans (accepted)

- **What:** regenerating over an edited slide, then saving, best-effort deletes the doc's previous
  clean file — but a regenerate never followed by a save strands the old clean background in
  storage (the doc rebinds on next editor open/save).
- **Impact:** storage pennies; bounded (one stale file per abandoned rebind).

### 2.8 Element & intermediate asset orphans (Phase 5, accepted)

- **What:** the advanced-canvas tools upload files that can outlive their usefulness: deleting an
  element strands its file; erase / "Remove background" upload a NEW bitmap and strand the old
  one; the lasso AI-detect uploads a transient crop region per attempt; every inpaint stores the
  RAW model output which the client immediately supersedes with its composite; closing the
  editor without saving strands everything created that session.
- **Impact:** storage pennies (same posture as 2.2/2.7); `post_canvas_docs` + `post_images` stay
  the source of truth. Discard cleanup DOES cover element srcs referenced by draft docs
  (`draftStoragePaths`); approve moves referenced element files out of `drafts/`.
- **Fix if it ever matters:** the same periodic cleanup job as 2.2, extended to skip every path
  referenced by any doc's `elements[].src.storagePath`.

### 2.9 Supabase bucket MIME allowlist must include `image/svg+xml` (manual step)

- **What:** generated vectors upload with `contentType: 'image/svg+xml'`; a bucket MIME
  allowlist that omits it makes `/api/ai/generate-svg` fail at the upload step (500 with a
  storage error) — config lives in the Supabase dashboard, invisible to code and migrations.
- **Action:** verify once per environment (dashboard → storage → `post-images` → allowed MIME
  types). No code fix possible.
- **Also `image/webp`:** paste-from-web (`/api/ai/paste-from-url`) re-hosts pasted/dropped images
  and Pinterest commonly serves WebP, so the same `post-images` allowlist must include `image/webp`
  or those uploads 500 at the storage step. Same manual dashboard step, same per-environment check.

### 2.10 Inpaint dimensions round to multiples of 16 (accepted)

- **What:** gpt-image-2/edit only accepts dims in multiples of 16. Our pipeline sizes comply
  (1088×1360, legacy 1024²), but inpainting a manually-uploaded image with non-conforming dims
  resamples it to the nearest valid size (`roundTo16`) — a marginal, invisible quality cost.
- **Action:** none; noted so a future "why is this 1 px off" bug hunt starts here.

---

## 3. Cost/perf watch-list (no action needed yet)

- **Vercel image optimization:** every generated visual is a unique URL through `next/image`; each
  regenerate mints a new one. If quota becomes a problem: `unoptimized` for small thumbnails or
  tighter `sizes`. (2026-08-04: compose/recompose and the queue's compose-on-open have the same
  shape — every bake writes a new storage path, so the optimizer cache never re-hits.)
- **fal queue time vs `maxDuration 120`:** ~52s render + queueing headroom. If 502s cluster on the
  visuals routes, this is the first suspect.
- **1024² vs Instagram's 1080² recommendation:** IG upscales slightly; bump to 1088×1088 (multiple of 16) in `lib/visual/fal.ts` if pixel-exactness is wanted.
- **Visuals route does two sequential DB reads** (ownership check + post fields) — could be one query;
  micro-optimization, not worth the coupling today.
- **Recraft palette adherence unverified in prod** — the first generated vector came out
  black-and-white despite the `colors` input. If it repeats, reinforce the palette in the
  prompt text as well (route-side, one line).
- **Editor opens with many elements:** each element fetches its bitmap in parallel and pops in
  progressively (readiness gates on background+fonts only); the 20-element cap bounds memory
  (~5.7MB decoded per full-frame cutout). Fine today — profile before adding per-element
  caching.

---

## 4. Pre-existing lint errors (not from the visuals branch)

Verified identical on `HEAD` before the branch's changes:

- `react-hooks/set-state-in-effect` in `schedule-card.tsx` (pre-fill effect), `calendar-view.tsx`
  (editPost deep-link effect), `use-extraction-status.ts` (ref write during render),
  `post-content-display.tsx` / `carousel-slides.tsx` (editable-field effects).
- `react-hooks/preserve-manual-memoization` in `calendar-view.tsx` (month nav callbacks).
- `@next/next/no-img-element` in `canva-design-picker.tsx`.

Additional finds from the 2026-07-25 performance sweep (same posture): a malformed
`eslint-disable` comment in `notifications-bell.tsx` (parsed as an unknown rule name),
`react/no-unescaped-entities` in `language-panel.tsx`, `react-hooks/set-state-in-effect` in
`post-content-display.tsx`. (The raw `<img>`s in `post-grid`/`top-posts-table` are deliberate —
Instagram CDN thumbnails aren't in `next/image` remotePatterns.)

Fix as a dedicated lint-cleanup pass, not opportunistically.

(2026-08-04: `post-content-display`, `carousel-slides`' sibling `post-detail-layout`, and
`slop-detector` were deleted in the review-tab rebuild — their entries above are historical.
Still live: `schedule-card`, `calendar-view`, `use-extraction-status`, `canva-design-picker`,
`notifications-bell`, `language-panel`, plus `review-view.tsx`'s focus-clamp effect and
`forgot-password-form`/`idea-form-client`.)

### 4.1 RESOLVED 2026-08-06 — `npm run lint` exits 0

The dedicated pass happened. All 9 errors are gone; 11 warnings remain and are not gating.

- **6 × `react/no-unescaped-entities`** (`forgot-password-form`, `idea-form-client`) — escaped as
  `&apos;`, which is the house convention (21 existing uses vs 6 `&rsquo;`) and renders identically.
- **3 × `react-hooks/set-state-in-effect`** (`calendar-view` editPost deep-link, `schedule-card`
  pre-fill, `review-view` focus-clamp) — **not fixed, deliberately suppressed.** Each got a
  block-level `eslint-disable` with the reason inline. All three are genuine effects: the
  deep-link one navigates (`router.replace`) so it cannot move into render, the pre-fill seeds
  seven independent fields from one prop, and the focus-clamp persists a fallback that render
  already applies. Converting them is a behavioural refactor of working UI and was deliberately
  not bundled into a tooling change.

Per-line disables do **not** work on these: the rule flags every `setState` in the effect, and
`schedule-card`'s has seven. Use `/* eslint-disable */` … `/* eslint-enable */` around the hook.

---

## 5. Review-tab performance audit — evaluated and deferred (2026-08-04)

Findings from the post-redesign audit that were deliberately NOT fixed, each with the reasoning
and the trigger that should reopen it. (The fixed items landed in `98e0ef0` + `0b8c72c`.)

### 5.1 Layout badge counts pending posts by fetching rows

- **Where:** `getCachedPendingRows` (`src/lib/queries/cache.ts`) — the dashboard layout reads
  `.length` for the sidebar badge.
- **Why kept:** the same React-cached call feeds the dashboard's data loader, which needs the
  rows. A dedicated `count head:true` query for the layout would run as an EXTRA query on the
  heaviest page to save ~60 bytes/post of transfer elsewhere, on a 30s server-side cache.
- **Reopen when:** agencies routinely hold hundreds of pending posts (transfer per cache miss
  grows linearly).

### 5.2 Calendar bundles zod client-side

- **Where:** `schedule-card.tsx` calls `parseStoredValidation` in the browser — the ~280 KB raw
  zod chunk that was removed from `/review` still ships on `/calendar` (measured 807 KB
  route-specific client JS).
- **Fix:** the same pattern as `0b8c72c` — adapt validation server-side in the calendar page and
  ship `ValidationData`. Deferred as out of the review-tab's scope, not because it's hard.

### 5.3 Supabase browser client on every dashboard route

- **Where:** `shell-context.tsx` (notifications realtime + fetch) and `sidebar.tsx` (sign-out)
  pull `@supabase/supabase-js` (~184 KB raw) into the shared dashboard bundle.
- **Why kept:** the realtime bell is a core shell feature; splitting the client out buys nothing
  while any layout surface needs it.
- **Reopen when:** a bundle pass targets the shared shell — a lazy realtime module is the shape.

### 5.4 No Suspense/loading boundary on `/review`

- **What:** navigation blocks until all six page queries resolve.
- **Why kept:** deliberate app-wide posture from the 2026-08 nav-performance work (loading.tsx
  removal). Revisit only if the queue's queries measurably slow navigation.

### 5.5 Review RSC payload is unbounded

- **What:** the page ships every pending post (copy, parsed validation, image lists) up front —
  no pagination. Server-side adaptation (`0b8c72c`) shrank per-post weight; the count is still
  unbounded.
- **Reopen when:** queues regularly exceed ~100 posts; the shape then is bucket-windowed loading.

### 5.6 Week-schedule query index unverified

- **Where:** `fetchWeekSchedule` filters `client_id + status + scheduled_at`
  (`src/features/review/lib/week-schedule.ts`).
- **Action:** one-time `explain analyze` against prod; add a composite index only if it scans.

### 5.7 Pending type-regen cleanup (migrations 20260805 + 20260806)

- **What:** three `as`-casts marked with WHY comments (`deletePost` discard insert, cron generate
  insert, `POST /api/posts` insert) and `topic_summary` selected via a per-page string append in
  `review/page.tsx` instead of `POST_COLUMNS`.
- **Fix:** after both migrations reach prod, regenerate `database.ts`, drop the casts, fold
  `topic_summary` into `POST_COLUMNS`.

### 5.8 generation_runs has no unique-per-slot constraint

- **Where:** `startGenerationRun` (`src/lib/generation/runs.ts`) is a plain insert; the generate
  cron's dedup guard (`src/app/api/cron/generate/route.ts`) reads a snapshot of recent runs at
  invocation start.
- **What:** two invocations racing the same tick (Vercel cron is at-least-once) can both pass the
  guard and double-generate a batch. Pre-existing before the 2026-08 day+hour slot work; hourly
  ticks widen exposure slightly but sequential re-fires are covered.
- **Fix shape:** a partial unique index (client_id + slot bucket) or advisory lock; insert-first
  then check would also close it.

### 5.9 Visuals attempt cap has no retry spacing

- **Where:** `/api/cron/visuals` — `MAX_VISUAL_ATTEMPTS = 3`, counted per started post.
- **What:** under hourly cadence a ≥3h image-provider outage can exhaust all attempts for the
  backlog before the provider recovers, permanently excluding those posts from auto-visuals
  (manual generation in the queue still works).
- **Fix shape:** a `visuals_attempted_at` column + minimum spacing between attempts.

### 5.10 Stored platform values are mixed-case

- **Where:** `posts.platform` holds both `'Instagram'` (UI pickers pass `PLATFORMS` display
  values verbatim; write paths validate case-insensitively but store as-received) and
  `'instagram'` (older writes). `roster.ts` and the publish scheduler now both compensate
  with case-insensitive compares.
- **Fix shape:** normalize to lowercase at every write boundary + one backfill migration,
  then drop the compare-side lowering.

---

## 6. CLAUDE.md compliance audit — 2026-08-06 (waves 1–2 applied)

Full findings in `docs/claude-md-audit-2026-08-05.md`. Waves 1 (correctness) and 2 (error
handling + zod boundaries) are applied; what follows is what was deliberately NOT done.

### 6.1 New migration must reach prod before deploy

- **`20260808_unique_tavily_source_per_client.sql`** — collapses duplicate web-research rows and
  adds a partial unique index. The app degrades gracefully without it (the 23505 read-back path in
  `ensureWebResearchSource` simply never triggers), so deploy order is not fatal — but the race it
  closes stays open until it lands. Joins 20260805/20260806/20260807 in the pending set (§5.7).

### 6.2 `api/meta/callback` still implements token exchange in the route file

- **What:** ~200 lines of OAuth exchange + connection persistence live in the route, against the
  "route files stay thin" rule. Its Meta responses are now zod-parsed via `src/lib/meta/schemas.ts`,
  so the validation gap is closed; only the placement is outstanding.
- **Why deferred:** this is the one code path that cannot be exercised locally, and the token-shape
  handling is hard-won (Business Login's `data[]` wrapper vs the legacy flat shape — see the
  in-file comment and `project_meta_app_review` history). A move should be its own change, verified
  against a real Live-mode consent, not folded into an audit sweep.

### 6.3 Wave 3 (duplication) — logic half done, primitive half open

**Done** (pure logic, no rendered output changed): `hostOf` ×2 → `toSourceHost` in `utils/url.ts`;
`MS_PER_DAY` ×3 and the loose `3_600_000`s → `MS_PER_HOUR`/`MS_PER_DAY` in constants; the zod-issue
flatten ×3 → `lib/validation/format-issues.ts`; `GeneratedPost` ×2 → the shared `ReviewDraft`;
`BatchPost` ×2 → one export; `postTypeLabel` ×2 → `review/lib/queue-post.ts`; the canvas doc
fetch-and-parse ×4 → `canvas-state-client.ts`; `parseAssetResponse` re-implementation → the shared
one; `day-cell`'s hand-built date key → `toDateKey` (now agreeing with its parent grid).
Also fixed real drift: `audience-section` and `post-day-breakdown` bypassed `chart-config` and had
drifted to off-palette greys (`#f0f0f0`, and `#e5e7eb` — a Tailwind default left over from before
the palette purge). Their deliberately smaller tick sizes are preserved.

**Deliberately NOT done — `timeAgo` is not a duplicate.** The audit paired
`unscheduled-post-item`'s `timeAgo` with `formatRelativeTime` on matching thresholds, but the
outputs differ: "Just now" vs "just now", a "Yesterday" case the shared one lacks, and a different
date fallback. Converging them is a copy change, not a refactor.

**Still open — the primitive half.** Input's class string copied 8×, StatusPill restated 5×,
spinner SVG 5×, hand-rolled Modal and Button, `ScoreBar` ×2, the picker header ×2. Each is a
rendered-output change, so they belong with the styling wave, not ahead of it. Audit §3 lists
every pair with both sites.

### 6.3b Wave 4 (styling) — applied 2026-08-06, NOT visually verified

Inline `style={{` across `src/` went **553 → 151**; the 151 that remain are runtime-computed
(a bar width encoding a count, a colour from `getClientStyle`, ternaries over data) and belong
inline. `#f2f5f1` went 15 → 0 behind the new `--ink-inv` token. Every `leading-`/`tracking-`
override that survived now carries its WHY comment.

Converted surface by surface: auth, calendar, review + publishing, analytics + ideas, marketing +
legal + public pages, and the canvas editor's panel layer (`PANEL_LABEL`/`PANEL_CONTROL` are class
strings now, and `PanelButton` takes `className` instead of `style`).

**Deliberately left inline, because converting would NOT have been identical:**

- **`transition` shorthands** (~18 sites). Tailwind's `transition-*` utilities force
  `cubic-bezier(0.4,0,0.2,1)`; these ride the CSS default `ease`. `duration-150` alone retimes the
  curve. Where a transition did convert, it carries an explicit `ease-[ease]`.
- **`outline: 'none'`** (6 form controls). `globals.css` declares `:focus-visible { outline: 2px
  solid var(--spring) }` **unlayered**, which outranks the utilities layer — an `outline-none`
  class would have *added* a focus ring these controls deliberately do not have.
- **`transform: translateX()`** on the unscheduled panel. Tailwind v4's `translate-x-*` writes the
  `translate` property, and the element's `transition: transform` would stop animating it.
- **The sonner toast config**, SVG presentation attributes, `animation` shorthands, and every
  recharts prop (`tick`, `contentStyle`, `stroke`, …) — recharts spreads `tick` onto an SVG
  `<text>`, where `var()` does not resolve.

**Known non-identical detail:** `rgba()` → `/[alpha]` modifiers compile to
`color-mix(in oklab, …)` with an opaque fallback outside `@supports`. Same pixel in any browser
with `color-mix` (2023+); pre-2023 those borders/backgrounds render opaque. This is already how
Tailwind v4 behaves everywhere else in the app, so it is consistent rather than newly introduced.

**Still owed: the browser matrix.** All of the above is verified by `tsc` and 687 tests, and each
agent recompiled its candidate classes through the project's real Tailwind 4.2.2 pipeline to
confirm every one emits a rule. None of it has been looked at in a browser. `hover:` variants now
compile inside `@media (hover: hover)`, so a tap no longer triggers a momentary hover on touch —
arguably a fix, but it is a behaviour change.

### 6.3c Wave 5 (rulebook) — the ramp ruling, applied

The `fontSize: 'var(--text-*)'` permission is gone. The guard now fails on **any** inline
`fontSize`, the ~40 sites that relied on it are classes, and DESIGN.md records why the permission
was wrong rather than just deleting it. Four exemptions are listed by path in the test, each
because a class cannot reach: Konva document fields, the inline-edit overlay that mirrors them,
recharts `tick` props, and sonner's options object. `clamp()` still passes — the Fluid Hero
Exception is unchanged.

The remaining §6 rulebook contradictions (polling vs "never fetch in useEffect", the select-columns
scope, the server-action boundary policy) are still open.

### 6.4 `npm run lint` exits 1 (pre-existing, see §4) — RESOLVED 2026-08-06

The 9 errors in §4 mean the command cannot gate anything today. Wave 2 left warnings *below* the
starting count (11 vs 12), but until §4 is cleared, `npm run check` stays red and new breakage is
invisible behind it.

**Cleared** — see §4.1 and §7. `npm run check` now exits 0 and gained a `typecheck` step, which it
had never had.

### 6.5 `/api/auth/forgot-password` is a user-enumeration oracle

- **Where:** `src/app/api/auth/forgot-password/route.ts` — returns 404 `"No account found with
  this email"` for an unknown address and 200 for a known one.
- **What:** anyone can test whether a given email has an account here, unauthenticated and
  unthrottled (the route has no rate-limit check, unlike the AI routes).
- **Found:** 2026-08-06, while writing the handler's JSDoc — the first draft of that comment
  claimed the endpoint always answers 200, and checking the claim showed it does not.
- **Fix shape:** answer 200 unconditionally with "if that address has an account, a link is on
  its way", and add `checkRateLimit`. Deferred because it removes an error message the
  forgot-password form currently shows, so the copy needs deciding alongside it.

---

## 7. Enforcement guards — added 2026-08-06, with the backlogs they exposed

Three rules CLAUDE.md had always stated but nothing enforced. Each is now a test in the
`type-ramp.test.ts` style: a rule, an exemption list where every entry carries its reason, and —
new here — a **separate backlog list for pre-existing violations that may only shrink**.

The backlogs are deliberately not exemptions. A staleness assertion on each list fails if you fix
an entry and forget to delete its line, so the debt can never look smaller or larger than it is.

### 7.1 `npm run check` never type-checked

- **What:** `check` was `lint && format:check && test`. `tsc --noEmit` appeared only in CLAUDE.md,
  in no npm script — and vitest is transpile-only, so **nothing in the repo checked types**.
- **How it surfaced:** a `sourceStrategy` field left in a test fixture after the field was deleted
  from `ClientData` kept 687 tests green while `tsc` failed.
- **Fixed:** added `"typecheck": "tsc --noEmit"`, now the first step of `check`.
- **Takeaway:** `npm test` passing is not evidence of type correctness. `npm run check` is.

### 7.2 `format:check` dropped from `check` (open decision)

- **What:** prettier fails on **169 files, 145 of them untouched by any recent work** — the repo has
  simply never been formatted. Left in `check`, it kept the gate permanently red, which is the
  §6.4 failure mode again.
- **Now:** `check` is `typecheck && lint && test`. `npm run format:check` still exists standalone.
- **Fix when someone wants it:** one `npm run format` commit on its own, then add the step back.
  Deferred because a 169-file reformat buries whatever else is in the diff.

### 7.3 Hand-written mirrors of database rows — `src/types/__tests__/row-mirrors.test.ts`

- **Rule:** a type whose fields are all columns of one table must derive from the generated row type
  (`Pick<PostRow, …>`, `Tables<'posts'>`), so a schema change lands as a build error.
- **Why:** migration `20260506` made `posts.platform`, `posts.post_type` and `clients.language`
  NOT NULL. The generated types updated; nine hand-written copies did not, and kept declaring
  `| null` for three months while read sites carried `??` fallbacks for an impossible state.
- **Backlog — 12 pre-existing mirrors** (`KNOWN_MIRRORS` in the test): the three row types in
  `cron/generate/helpers.ts`, `ReportHistoryEntry`, `DashboardBriefing`, `ClientSourceRow`,
  `ClientSourceSummary`, `AgencyInfo`, `AnalyticsReport`, `EnrichedNotification`, `MetaConnection`,
  `ClientSource`.
- **Why not fixed now:** deriving them surfaces real nullability the app has never handled —
  `AgencyInfo` alone asserts non-null on five columns the schema permits to be null, and
  `fetchAgencyById` casts to it. That is a behavioural change per type, not a typing one.
- **Note:** 5 further declarations are permanently exempt (`DraftPost`, `UpdatePostInput`,
  `PublishStatusPatch`, `UpdateSourceInput`, `DraftPostInput`) — write contracts and structural
  contracts that deliberately say what a column type cannot.

### 7.4 Route bodies read without a schema — `src/app/api/__tests__/boundary-validation.test.ts`

- **Rule:** a route calling `request.json()` must hand the result to `.parse`/`.safeParse`.
- **Why:** `PUT /api/settings/account` wrote `timezone` straight from the body. The generate cron
  feeds that to `Intl.DateTimeFormat`, which throws on an unknown zone — from inside a `.flatMap()`
  that sits *outside* the per-client `try`, so one bad row would have aborted generation for every
  client on the tick. A hand-rolled `typeof` check is not validation either: that same route had
  one for `name` and still shipped the hole for `timezone`.
- **Backlog — 15 routes** (`KNOWN_UNVALIDATED` in the test): the nine `ai/*` routes,
  `auth/forgot-password`, `canva/designs/[id]/export`, `extract/start`, `posts/[id]/images`,
  `posts/[id]`, `sources/discover`.
- **Worst of them:** `posts/[id]/route.ts` hand-rolls checks for `status` and `platform`, so it
  *reads* validated while every other field passes through untouched.
- **Why not fixed now:** adding a schema changes what each route accepts — a behavioural change
  per route, wanting its own review.
- **Note:** `meta/data-deletion` is permanently exempt — its single-string payload is verified by
  HMAC-SHA256 with `timingSafeEqual`, a stronger check than a shape schema.

### 7.5 Post-status typos — `POST_STATUSES` in `src/lib/validation.ts`

Five query subsets each filter `posts.status` on a different set of literals, and nothing enumerated
the vocabulary, so a typo produced a silently-empty result rather than an error. Each subset now
carries `satisfies readonly PostStatus[]`. Verified by introducing `'publishng'`, which fails the
build with *"Did you mean 'publishing'?"*.

The subsets are legitimately different from each other and were **not** merged — consolidating them
would have invented an abstraction, not removed one.
