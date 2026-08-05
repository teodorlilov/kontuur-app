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
