# Tech Debt & Deferred Issues

Catalogued 2026-07-22 during the Phase-3 AI-visuals review (branch `feat/ai-visual-flow`).
None of these block shipping; each entry says what it is, why it was deferred, and the intended fix.

**Remediation pass 2026-08-18.** `docs/TECH-DEBT-PLAN.md` holds the full audit — every entry
re-verified against the code, plus sixteen findings this file did not record. What that pass
closed is marked RESOLVED below. What it deliberately did not close, and why, is in §9.

Seven entries were **wrong** when re-measured, which is its own finding: this file is 53 KB and
had stopped being read end to end, so §7.4 published a backlog one entry too long and §7.2 a
count 2.6× under. Each is corrected in place.

**The largest item in the repo is not in this file at all.** `docs/RLS-SECURITY-REVIEW.md` has
been OPEN since 2026-07-22 and nothing here ever pointed at it — see §8.

---

## 1. Code structure

### 1.1 `parse-slides.ts` lives in the components tree — RESOLVED 2026-08-18

Moved to `src/lib/posts/parse-slides.ts`; all twelve importers updated. It was, as the entry
had claimed since July, ~5 minutes and zero behaviour change — which is the lesson worth
keeping. It survived four months because it was nobody's task, not because it was hard.

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

### 2.6 No "apply text style to all slides" — RESOLVED 2026-07-24, REBUILT 2026-08-16

- **Now (Wave 11):** "Apply style…" opens a panel in the editor showing what each other slide would
  look like, one tick per slide. Applying commits `applyStyleToDoc` into each slide's OWN undo
  history — one step each, undoable from the panel — and nothing is written until Save. The source
  slide is excluded from its own apply: `applyStyleToDoc` matches the FIRST node of a role, so a
  slide holding a duplicated headline would have the copy snapped onto the original's geometry.
- **Was (2026-07-24 → 2026-08-16):** a "Save & apply to all" button that saved the slide, then had
  each SURFACE re-compose every sibling server-side (`applyStyleToPostSibling` /
  `applyStyleToDraftSibling` behind `useGenerateVisuals.applyStyle` and `applyStyleAcrossDraft`).
  All of that is deleted. It wrote immediately with no preview, and its 409s were swallowed
  silently — after the in-editor carousel landed, a sibling saved moments earlier would 409 against
  a path the surface no longer held, and simply not be restyled.

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
  referenced by any doc's image nodes (`nodes[]` filtered by `isImageNode`, `src.storagePath`).
- **Extended 2026-08-16 (Wave 9c):** an outpaint uploads a PADDED intermediate (the original on a
  larger canvas) purely so the model has a file to edit, then uploads the composited result. The
  intermediate is never referenced by any doc and nothing collects it — same class and same posture
  as the raw inpaint output above it. One per Expand press.
- **Extended 2026-08-15 (Wave 8):** in-editor background generation adds a new orphan class —
  every generated candidate is stored, and only the one the user picks is ever referenced. The rest
  (and any generation the user cancels, which the server finishes regardless) are abandoned. For a
  DRAFT target they land under the client's `drafts/` prefix, so the existing discard cleanup
  (`DELETE /api/ai/generate-visual`) already reaches them; for a PERSISTED POST target nothing
  collects them — the canvas PUT deletes exactly one displaced background per save. Same posture
  as the rest of this entry: storage pennies, no integrity risk.

### 2.9 Supabase bucket MIME allowlist must include `image/svg+xml` (manual step)

- **What:** generated vectors upload with `contentType: 'image/svg+xml'`; a bucket MIME
  allowlist that omits it makes `/api/ai/generate-svg` fail at the upload step (500 with a
  storage error) — config lives in the Supabase dashboard, invisible to code and migrations.
- **Action:** verify once per environment (dashboard → storage → `post-images` → allowed MIME
  types). No code fix possible.
- **Also `image/webp`:** paste-from-web (`/api/ai/paste-from-url`) re-hosts pasted/dropped images
  and Pinterest commonly serves WebP, so the same `post-images` allowlist must include `image/webp`
  or those uploads 500 at the storage step. Same manual dashboard step, same per-environment check.
  The editor's own element upload accepts WebP directly as of the canvas-editor redesign, so this
  is now reachable from the file picker, not just from a paste.
- **SVG *upload* is deliberately not offered.** The file picker stops at JPEG/PNG/WebP because
  accepting an SVG needs more than a MIME entry: `validateImageFile` rejects it, uploads would need
  the same server-side sanitisation `/api/ai/generate-svg` applies (`lib/visual/sanitize-svg.ts`),
  and an SVG without intrinsic dimensions has no natural size to place from. Generated vectors are
  unaffected — they take the sanitised route.

### 2.11 Canvas doc v1 rows persist until each slide is next saved (accepted, 2026-08-15)

- **What:** the doc schema moved to v2 (one ordered `nodes[]` replacing v1's separate `layers` and
  `elements` bands, so z-order is fully general). There is **no data migration** — `doc` is jsonb,
  and `safeParseCanvasDoc` dispatches on the stored `version`: a v1 row is validated against
  `canvasDocSchemaV1` and upgraded in memory on every read. The next save of that slide persists v2.
- **Why no backfill:** the upgrade is pure and total, so a v1 row and its upgraded form render
  identically. A backfill would be a write across every historical row to buy nothing a reader
  cannot do for free.
- **Cost:** `src/lib/canvas/doc-v1.ts` (v1 types + v1 schema + `upgradeCanvasDoc`) outlives the
  format. It is a deliberate island — nothing but `doc-schema.ts` imports it — so it can be deleted
  whole once no v1 rows remain.
- **Action:** none now. Retiring it needs a deliberate backfill (`UPDATE post_canvas_docs` through
  the upgrader) plus a check that `doc->>'version' = '1'` returns no rows; only then delete the
  file and the v1 branch in `safeParseCanvasDoc`. Do not delete it because "everything looks
  upgraded" — a slide that has not been opened since the cutover is still v1 on disk.

### 2.12 A mirrored picture cannot be promoted to the slide background (accepted, 2026-08-15)

- **What:** `flipX`/`flipY` live on the node. `background` is a bare `{publicUrl, storagePath}` with
  no orientation of its own, so "Set as background" on a flipped picture would store the unmirrored
  file and silently undo the flip. `setNodeAsBackground` refuses instead, and the editor says why.
- **Why not just bake it:** carrying the mirror means drawing the flipped bitmap to a canvas and
  uploading the result — async work, inside what is otherwise a pure synchronous doc reducer that
  must stay one undo step.
- **Action:** if this turns out to bite, the fix is in `use-editor-asset-ops` (which already owns
  upload-then-mutate flows), not in `use-doc-actions`: bake, upload, then promote the new ref.

### 2.10 Inpaint dimensions round to multiples of 16 (accepted)

- **What:** gpt-image-2/edit only accepts dims in multiples of 16. Our pipeline sizes comply
  (1088×1360, legacy 1024²), but inpainting a manually-uploaded image with non-conforming dims
  resamples it to the nearest valid size (`roundTo16`) — a marginal, invisible quality cost.
- **Measured 2026-08-16** (two live probes against `openai/gpt-image-2/edit`): an ON-GRID request is
  honoured exactly (asked 1632×2048, got 1632×2048); an OFF-GRID one is **floored**, not rounded
  (asked 1632×2040, got 1632×2032). Our `roundTo16` uses `Math.round`, so the route and the model
  disagree at a .5 boundary — the route would ask for 2048 where the model, given 2040, would have
  produced 2032. The consequence for the existing inpaint path is narrow: the mask is built at the
  source's natural size while the output comes back on-grid, so `compositeEditedRegion` rescales by
  up to 8px (~0.4%) on an off-grid source. Feathered strokes hide it; it is a shift, not merely a
  resample, which is the part the original wording understated.
- **Consequence for any future outpaint:** the padded frame MUST be computed on-grid client-side, so
  the mask and the request agree. Leaning on the route's rounding would silently shift the mask.
- **Also measured:** the model regenerates globally even where the mask says keep — the preserved
  region came back with a mean absolute channel difference of 3.1/255 and a worst-case of 78/255.
  That is why `compositeEditedRegion` exists and why it is load-bearing, not belt-and-braces.
- **Action:** none; noted so a future "why is this 8 px off" bug hunt starts here.

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

The dedicated pass happened. All 9 errors are gone. **9 warnings remain** as of 2026-08-18
(the "11" this entry claimed had drifted): 8 deliberately `_`-prefixed unused vars and the
one `no-img-element` in `canva-design-picker`. None are gating.

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

### 5.6 Week-schedule query index — RESOLVED 2026-08-18 (it already existed)

`fetchWeekSchedule` filters `client_id + status + scheduled_at`, and
`20260731_add_roster_indexes.sql:17` creates `posts(client_id, status, scheduled_at)` — the
exact composite, in that order. The entry was written without checking the migrations, and the
`explain analyze` it asked for would have confirmed an index that had been there the whole time.

### 5.7 Pending type-regen cleanup (migrations 20260805 + 20260806) — RESOLVED 2026-08-10

- **What was:** three `as`-casts marked with WHY comments (`deletePost` discard insert, cron
  generate insert, `POST /api/posts` insert) and `topic_summary` selected via a per-page string
  append instead of `POST_COLUMNS`.
- **Closed by:** `20260805`–`20260817` applied to prod and `database.ts` regenerated. All three
  casts are gone; `topic_summary` had already been folded into `POST_COLUMNS`.
- **What the casts were hiding:** dropping them did *not* typecheck. `posts['Insert']` had been
  suppressing the whole row, and underneath it `slides_json`/`validation_json` were reaching the
  insert as `unknown` — which widens to `{}`, not `Json`. The read side types both columns
  `unknown` deliberately (each surface parses them into its own shape), so the narrowing now
  happens once, in `draftColumns`, the single place a draft becomes a write. Two asserted columns
  instead of fourteen unchecked ones.

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

### 5.10 Stored platform values are mixed-case — RESOLVED 2026-08-09, direction reversed

- **What was:** `posts.platform` held both `'Instagram'` (UI pickers pass `PLATFORMS` display
  values verbatim) and `'instagram'` (older writes), and `roster.ts` and the publish scheduler
  both compensated with case-insensitive compares.
- **Closed by:** migration `20260809_canonicalize_post_platform.sql`, applied to prod.
- **The direction is the opposite of what this entry used to prescribe.** It said "normalize
  to lowercase at every write boundary"; the canonical form is the **display** case in
  `PLATFORMS`, because that is what every picker submits and what the UI renders — lowercasing
  on write would have meant re-casing on read at every call site instead. `20260817` follows
  the same rule for `client_ideas.platform`. Anyone reading the old advice would have written a
  migration that fights the one that shipped.

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

**The primitive half — mostly done by 2026-08-18, and the remainder is not what this said.**
Re-measured: `components/ui/` now holds `button`, `modal`, `input`, `spinner`, `status-pill`
and `form/control-classes`. Input ×8, StatusPill ×5, spinner ×5, Modal, Button and the picker
header are all gone.

`ScoreBar` ×2 **is not a duplicate**, and the entry was wrong to list it as one.
`quality-scores.tsx` colours through `score-colors`' three bands (spring / pending / danger);
`insight-panel.tsx` uses a two-tone forest/pending split keyed on `REWRITE_SCORE_THRESHOLD`,
different DOM, and `scaleX` instead of `width`. Converging them changes what the calendar
renders — a design decision, and exactly the call this file already made about `timeAgo` two
paragraphs up. Left alone deliberately.

### 6.3b Wave 4 (styling) — applied 2026-08-06, NOT visually verified

Inline `style={{` across `src/` went **553 → 151**, and **119** as of 2026-08-18; those that remain are runtime-computed
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

**Mostly cleared** — the landing redesign settled the copy. `/forgot-password` is now a dialog
whose sent view reads *"If an account exists for that address, a reset link is on its way"*, so
the 404 had nothing left to display and the route answers 200 either way. The provider's own
failure is logged at the boundary and returned as a generic message, so it cannot leak the same
signal by another route. The route also gained the zod schema it was missing, and its entry left
`KNOWN_UNVALIDATED` in `boundary-validation.test.ts`.

**Still open:** `checkRateLimit`. The oracle is closed, but the endpoint will still send mail for
any address as fast as it is asked to.

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

### 7.2 `format:check` dropped from `check` — RESOLVED 2026-08-18

- **What it said:** prettier failed on 169 files, so the step was pulled from `check` rather than
  leave the gate permanently red (the §6.4 failure mode).
- **What was actually true by 2026-08-18:** **438 files.** The debt had grown 2.6× unnoticed,
  because nothing measured it — and **203 of those were never ours to format**: 168 vendored
  files under `.claude/skills` (superpowers + impeccable), the generated `database.ts`, and
  markdown whose reflow turns a one-line doc edit into a whole-file diff.
- **Closed in three commits**, deliberately separate: `.prettierignore` gains the vendored and
  generated paths (438 → 251), `npm run format` alone with nothing else in the diff (251 files),
  then `format:check` back into `check`.
- **This reversed a standing CLAUDE.md instruction** ("deliberately outside `check`. Do not add
  it."). That instruction was right when written and wrong once the reason expired. CLAUDE.md now
  records *why* it flipped rather than just dropping the line — read as a formatting preference,
  the old wording would have argued against restoring it forever.

### 7.3 Hand-written mirrors of database rows — `src/types/__tests__/row-mirrors.test.ts`

- **Rule:** a type whose fields are all columns of one table must derive from the generated row type
  (`Pick<PostRow, …>`, `Tables<'posts'>`), so a schema change lands as a build error.
- **Why:** migration `20260506` made `posts.platform`, `posts.post_type` and `clients.language`
  NOT NULL. The generated types updated; nine hand-written copies did not, and kept declaring
  `| null` for three months while read sites carried `??` fallbacks for an impossible state.
- **Backlog — 1 remaining** (was 12). Cleared 2026-08-07 in two passes:
  - **Triage first.** Four were never mirrors: `ClientSource`, `ClientSourceRow`,
    `ClientSourceSummary` and `DashboardBriefing` narrow a structurally-untyped `Json`
    column into the shape the app writes. Deriving them would replace a useful assertion
    with `Json` and push a cast to every use. Moved to `EXEMPT` with reasons — the initial
    backlog was over-inclusive because it was built from field *names* without checking
    field *types*.
  - **Then migration 20260813**, which let `ScheduleRow`, `ClientContext`,
    `BrandProfileContext`, `ReportHistoryEntry`, `EnrichedNotification`, `MetaConnection`
    and `AnalyticsReport` derive. Three of those derive *partially* — they narrow one
    column on purpose (`platform` to a two-way union, `type` to `NotificationType`,
    `metrics_json` to `AnalyticsMetrics`), so the Pick covers the rest and the narrowed
    field stays explicit with a comment.
- **Still open: `AgencyInfo`,** and it is waiting on a feature, not on effort. It declares
  `plan`, `mode`, `subscription_status`, `trial_ends_at` and `plan_client_limit` non-null
  over nullable columns, and `fetchAgencyById` casts to it. Those columns read as populated
  only because of table defaults — no code writes any of them, because **billing is not
  implemented**. Deriving it would break `capitalize(agency.plan)` and force a UI decision
  about a flow that does not exist. `trial_ends_at` should stay nullable even after billing
  ships: an active paid agency has no trial end date, and `plan-section.tsx` already guards
  for its absence.
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
- **Backlog — EMPTY as of 2026-08-18.** All thirteen cleared; `KNOWN_UNVALIDATED` is `[]`.
  Verified by deliberately un-validating `sources/discover` and confirming the guard names it,
  because an empty backlog that cannot detect a refill is just a deleted list.
- **The detector had a defect worth more than the backlog.** `PARSES` required a literal
  `.parse(`, so `posts/[id]/route.ts` — validated through the named wrapper `parsePostUpdate` —
  still counted as unvalidated, its line stayed, and the staleness assertion whose entire job is
  catching "fixed but not delisted" **passed anyway**. The published count was wrong in the
  safe-looking direction, and the rule quietly discouraged naming a parser, which is the house
  pattern. Widened to recognise `parse[A-Z]\w*(`.
- **Two entries were already stale** when re-measured: `posts/[id]` (above) and
  `auth/forgot-password`, fixed when its enumeration oracle closed. 15 → 13 → 0.
- **What clearing them found:** `intelligence/tip` read its body through a bare
  `as { topic?: string }` — an assertion, not a check — so a number would have reached
  `sanitizePromptField(...).trim()` inside the handler. `postType` and `rewriteReason` were
  typed unions nothing verified, each steering which validations run downstream, so an
  unexpected value chose a branch by falling through it.
- **Note:** `meta/data-deletion` is permanently exempt — its single-string payload is verified by
  HMAC-SHA256 with `timingSafeEqual`, a stronger check than a shape schema.

### 7.5 Post-status typos — `POST_STATUSES` in `src/lib/validation.ts`

Five query subsets each filter `posts.status` on a different set of literals, and nothing enumerated
the vocabulary, so a typo produced a silently-empty result rather than an error. Each subset now
carries `satisfies readonly PostStatus[]`. Verified by introducing `'publishng'`, which fails the
build with *"Did you mean 'publishing'?"*.

The subsets are legitimately different from each other and were **not** merged — consolidating them
would have invented an abstraction, not removed one.

### 7.6 Nothing detects dead code — `knip` is manual, and misses unused *fields*

- **Gap:** there is no dead-code tooling in `devDependencies` (no knip, ts-prune, depcheck) and
  `@typescript-eslint/no-unused-vars` only flags unused *locals*. An orphaned **export** compiles,
  lints and tests clean forever.
- **What that cost:** the 2026-08 pipeline refactor found `ClientData.topPerformingPosts` — a real
  20-caption DB query on every generation run, read by nothing — plus `FetchLimits.rssBudget`,
  `ENABLE_LLM_DEDUP`, `NGRAM_SIMILARITY_THRESHOLD`, `SOURCE_GROUNDING_MIN_CONFIDENCE`,
  `ResearchStreamEvent`, `GenerateStreamEvent`, `sanitizePromptArray`, three sentence-length
  constants, two `score-colors` helpers, and `ResearchRunContext.agencyId`/`.language` — two
  *required* fields both callers dutifully populated and neither read. All of the above are
  deleted as of 2026-08-11 and pinned that way by `src/app/__tests__/deletion-ledger.test.ts`.
  `DEFENSIVE_DATA_CLAUSE` has exactly one importer (`generate-best-time.ts`) and belongs on
  the research prompts too (§7.9 M10).
- **RESOLVED 2026-08-18.** knip is a devDependency, `knip.json` is committed, `npm run deadcode`
  is a step in `check`, and it reports **zero** — so any future hit is something that commit
  introduced. The "interim: run it by hand per commit that deletes anything" policy is exactly
  the kind nobody executes, which is why it never was.
- **What made the signal usable** was the config, not the tool. Next's framework exports
  (`page`/`layout`/`route`/`error`/`opengraph-image`) are entry points, not dead code; test files
  are entries too, or every fixture helper reads as unused; and `ignoreExportsUsedInFile` collapses
  the ~107 Props interfaces exported but read only beside their component, which is style rather
  than debt. Raw signal 29 exports + 71 types → **15 genuinely dead**, all deleted.
- **The barrel question is settled.** The dead `src/types/api.ts` request/response interfaces were
  deleted rather than exempted: the routes they claimed to describe have grown zod schemas, and the
  schema is the contract now. Deleting `ResearchResponse` then orphaned `ResearchFinding`, and
  clearing `sources/discover` later orphaned `DiscoverPagesRequest` — the cascade this entry
  predicted, caught by the new gate on the very next commit.
- **Every hit was grep-verified before deletion**, per this entry's own warning. That caught a
  near-miss: knip correctly reported `ToastProvider` as an unused export of a *used* file, and
  deleting the file would have broken 41 importers of `toast`.
- **The interim command does not cover TYPES.** Adding `types,duplicates` on 2026-08-16 reported
  184 unused type exports that had accumulated invisibly. **That raw number is misleading and the
  lesson generalises: 68 of the 184 were false positives** — knip follows neither re-export barrels
  nor test files, so it flagged types genuinely read by `date-helpers`, by the row-mirrors guard,
  and via `src/types/index.ts`. Un-exporting them on knip's word would have broken the build. Every
  entry was classified by grepping for real usage first. Acted on in `b31fda3`: 107 lost only their
  `export` (used solely inside their own file, mostly Props interfaces), 5 were deleted outright
  (`ClientRefresh`, `GenerateDraftVisualInput`, `SubmitIdeasInput`, `IGRefreshResponse`,
  `AnalyticsReportRequest`).
- **72 remain, and they are the barrel question above:** 40 in `src/types/index.ts`, 16 in
  `api.ts`, 4 generated, the rest scattered. They are dead in the strict sense — fifteen files
  import from `@/types`, but not those — yet clearing them cascades: delete a re-export and the
  underlying declaration becomes unused in turn, and then someone has to rule on whether the API
  request/response shapes are dead weight or documentation. `types` is deliberately NOT in the
  command above until that is settled: with 72 standing hits it would fire every run and be
  ignored, which is worse than not having it.
- **The part knip does not solve:** it works at export granularity, so an unused **field on a used
  type** is invisible to it. That is the shape most of the above took —
  `PostValidationResult.validationWarnings` (written at four sites, read by none),
  `SourceGroundingResult.corrected_text`/`.corrected_slides` (set, never read), `rssBudget`,
  `topPerformingPosts`. Every one was found by hand.
- **Fix shape:** add `knip` as a devDependency with a `knip.json` that exempts the type barrels and
  Next's framework exports (`POST`/`GET`/`maxDuration`/`metadata`/`default` have no in-repo
  referrer by design), seed a baseline of what exists today, then add it to `npm run check` so the
  list may only shrink — the same "backlog that only shrinks" shape as §7.3 and §7.4. Field-level
  detection needs something else: either a periodic manual audit, or a guard test that greps for
  writes-without-reads on the handful of types that carry evidence (`PostValidationResult`,
  `ClientData`, `FetchLimits`).
- **Why not now:** wiring a detector into the gate mid-refactor would fail the build on debt this
  work has not reached yet. Sequence it after the pipeline waves land.

### 7.7 Notification client names are regex-parsed back out of the message

`notification-item.tsx` recovers the client name by matching the message text — two
patterns now, because the approval flow writes "<Client> approved…" and the generate cron
writes "…ready to review for <Client>". The row carries `client_id`; the name should be
resolved from it instead.

Why it matters beyond tidiness: the same file's `titleForNotification` had no default
branch, so the cron's untyped notification fell through to "requested changes" and *every*
generation notice rendered as a change request from a client named "Client". The type is
fixed (`posts_ready`, added 2026-08-10); the name parsing is not.

**Fix shape:** pass the resolved name in from the shell, which already loads the agency's
clients for the sidebar, or join it in the notifications query. Then delete both regexes.

### 7.8 `/ideas` reads every idea an agency has ever received

`fetchIdeasForAgency` takes an optional `limit` and the inbox page passes none, so the
route selects the agency's entire idea history — including everything already generated
or dismissed — and ships it to the client to be filtered in memory.

Two things are sized by that read rather than by a page: the payload, and
`MARK_READ_MAX` in `features/ideas/schemas.ts`, which bounds the ids one mark-as-read may
carry. The cap is loose (500) precisely because the client legitimately sends as many ids
as it rendered; it can tighten to a page once there is a page.

**Fix shape:** server-side filtering with a bounded page (the `/clients` roster is the
pattern — URL params read in the Server Component), then narrow `MARK_READ_MAX` to that
bound in the same change.

### 7.9 Deferrals from the Client Ideas audit — 2026-08-06

The audit file (`docs/ideas-audit-2026-08-06.md`) has been deleted; it was a working
artifact. Roughly sixty findings were fixed across the eight waves. These are what is
left, with the audit's own ids so the reasoning is traceable.

**Needs a production query, not a code change.**
- **M16 — the schema baseline is not in version control.** No migration creates `agencies`,
  `clients`, `posts` or `users`, and `grep -rin 'policy' supabase/migrations/` returns
  nothing across 40 files. The RLS posture cannot be verified *or* fixed from this
  codebase. Cross-agency safety currently rests on hand-written `.eq('agency_id', …)`
  predicates, which are correct today. Needs a prod schema dump.
- **M21 — `generation_runs`/`generation_themes` are written with the user-scoped client on
  the wizard path and the admin client on the cron path.** If those tables are RLS-enabled
  with no user policy, every wizard theme insert is failing silently into
  `trackThemeSafe` — zeroing `doneCount` and emptying the theme exclusion list. One query
  settles it.

**Prompt hardening.**
- **M10 — third-party fetched text is interpolated raw into XML-delimited prompt sections.**
  RSS titles, website markdown, file text, Tavily snippets and IG captions reach
  `<rss_content>`…`<performance_content>` unescaped, and `buildGroundingPrompt` interpolates
  up to 4000 chars of fetched markdown untagged. `sanitizePromptField` exists for exactly
  this and is applied to none of them. `DEFENSIVE_DATA_CLAUSE` now has one consumer
  (`generate-best-time.ts`) and belongs on the research prompts too.
- **M11 — RESOLVED 2026-08-11.** `priorityPosts` now crosses the boundary through
  `priorityPostSchema` (title/brief caps, ISO date, platform enum); only
  `preloadedClientData` keeps the documented re-narrowing.

**Generation quality signals.**
- **M12 — wizard drafts are never persisted, but their themes are.** `trackTheme` fires
  unconditionally while the wizard persists nothing until approve, and
  `fetchThemeDescriptions` feeds the last 10 runs into "RECENTLY COVERED TOPICS (do NOT
  suggest these)". A theme rejected *because the draft was bad* is banned for ten runs,
  identically to one that shipped.
- **Skipped-pillar count uses a different allocation than the prompt** — `allocateByWeight`
  is computed twice with different inputs. ±1 item on marginal units only.

**Ideas feature.**
- **M18 — `idea_form_tokens.agency_id` can silently diverge from `clients.agency_id`.** Two
  independent FKs with no composite constraint; reassign a client between agencies and its
  old tokens keep minting ideas into the old agency.
- **M23 — the idea link is undiscoverable.** It only exists after someone opens the last
  client-settings tab and clicks Create. Onboarding never mentions it, so the realistic
  outcome is an empty `idea_form_tokens` table and a permanently empty inbox.
- **`fetchFormContext` issues two queries where an FK join would do.** The duplicate token
  lookup is gone; the join is not.

**Cross-cutting.**
- **The button focus ring is hand-written at ~10 sites.** `FOCUS_RING` now exists in
  `components/ui/form/control-classes.ts` and is used by `Button`, `ActionLink` and the
  public idea form. The remaining copies (visual-identity, onboarding, image-lightbox)
  are unchanged — a mechanical sweep, deliberately not bundled into a feature commit.
- **A client whose `fetchClientData` fails inside the cron loop vanishes with no trace** —
  no run row, no `results.errors` entry, no console line.

### 7.11 Coverage-aware pre-skip can empty a cron batch (accepted)

Since the 2026-08-11 pillar-coverage rework, `gatherSources` pre-skips any pillar
whose coverage state is `none` — including when a topic-limited tavily source is
active but limited away from it. A client whose *every* pillar is unservable now
produces zero topics, and the cron run fails cleanly (`cron/generate/route.ts`
already handles zero topics). Accepted rather than special-cased: that state is
only reachable by deliberately topic-limiting every source away from every
pillar, the sources page shows it loudly ("N pillars nothing feeds" + skipped
rows in the rail), and stale-id assignments degrade to feeds-all rather than
starving anything by accident.

### 7.10 Decisions and deferrals from the 2026-08-10 audit-fix round

Recorded here because each one reverses or defers something the refactor plan
specified; the reasoning must outlive the session that decided it.

**Decisions.**
- **"Ranked, not gated" stands — no `VARIANTS_PER_POST`.** The original plan wanted
  singles generated twice with the quality floor selecting the better; the decision
  (2026-08-11) is that doubling writer spend per post is not worth it. Quality is
  owed by the prompts, and a weak draft is surfaced by triage (`low_quality`,
  `not_validated`) for a human, not silently outcompeted. If draft quality sags,
  variants remain the known lever.
- **Two quality bars remain, deliberately distinct.** `QUALITY_FLOOR` (5) gates
  visuals spend; `REWRITE_SCORE_THRESHOLD` (7) drives triage and the rewrite offer.
  The third bar (a bare 7.5 exemplar cutoff) died with `fetchTopPostsByClient`.
  Reconciling the two that remain is a product decision, not a cleanup.

**Deferrals.**
- **`ClientIdea` is still a hand-written camelCase interface** rather than deriving
  from the generated row type; `row-mirrors.test.ts` does not cover it. Deriving it
  properly means threading the `clients(name, niche)` join shape through.
- **Ideas sort control and search** are drawn in the approved mock but not built;
  the list is server-ordered newest-first only.
- **Below-`md` responsive pass on the ideas grid** — the table drops columns at
  1180px but has no `md:` behaviour (actions to a second line, search into the
  rail) the plan sketched.

### 7.12 No test net for interactive behaviour — and jsdom would catch a minority of it

- **Gap:** `vitest` runs node-only (`vitest.config.ts` sets no environment), so there are no
  component tests and no browser tests. Every defect that lives in a component's *lifecycle* —
  effect keying, focus management, keyboard routing — reaches a human or nobody.
- **What that cost (canvas-editor arc, waves 1–11).** Eight interactive defects, against what a
  jsdom + testing-library setup could actually have seen:

  | Defect | jsdom? |
  |---|---|
  | Workspace collapsed to 11% zoom (`flex-1` under a block parent) | **No** — no layout engine |
  | Editor never full-screen (`backdrop-filter` capturing `position: fixed`) | **No** — same |
  | "Elements" clipped by the Label role's 0.16em tracking | **No** — same |
  | Line shape's resize handles inert (40px floor on a 6px box) | **No** — Konva/canvas |
  | Shape slider burning one undo step per tick | **No DOM needed** — a hook unit test reaches it |
  | Layers panel unreachable by keyboard (`tabIndex` keyed on selection) | **Yes** |
  | ⌘Z reaching the canvas through an open dialog | **Yes** |
  | Apply-style needing two clicks (`@8e1bfad`, fixed same day) | **Yes, IF the test models the parent re-render** |

- **The finding that matters:** jsdom covers 3 of 8, and **the three worst — the ones that made the
  editor visibly broken — are all layout**, which jsdom cannot see at all. The failure distribution
  points at a real browser, not at a DOM shim. The manual browser pass has, empirically, caught
  every layout defect in this arc, including two that a full typecheck, a clean lint, 1,100+ tests
  and twelve review agents all missed.
- **Note on the apply-style entry:** it is qualified for a reason. That panel broke because its
  PARENT re-rendered with a fresh `docsByPosition` after the panel's own commit. A test rendering
  it with static props passes happily. Catching it requires wiring a parent that commits — i.e.
  already having had the insight the test is meant to substitute for. Tests pin a lesson; they do
  not supply it. The durable half is the discipline in `feedback-trace-state-loops`: trace what a
  feature writes against what it reads, and key an *initialiser* effect on its trigger rather than
  on derived data.
- **Also worth knowing:** `react-hooks/exhaustive-deps` pushes you INTO that bug — it wants the
  derived value in the dep array and warns if you omit it. A clean lint is evidence of nothing here.
- **Fix shape, cheapest first:** (1) keep pushing behaviour out of components into pure functions
  that node tests already reach — the house pattern, and how `doc-history`, `layer-rows`, `snapping`
  and `resolve-slides` are covered; (2) keep the manual browser pass; (3) Playwright smoke tests
  against the real editor, which is the only automation matching where the defects actually are;
  (4) jsdom + testing-library last, for the keyboard/lifecycle third.
- **Why not now:** Playwright selectors against three more waves of editor churn (12–14: text
  effects, arch text, multi-format) would be maintenance for no signal. Sequence it after the arc
  settles. Adding jsdom instead would buy the minority of the problem and read as coverage.

---

## 8. Security posture — the items this file never recorded

Added 2026-08-18. Full reasoning in `docs/TECH-DEBT-PLAN.md` Part B.

### 8.1 RLS is off on most tables — OPEN, and the largest item in the repo

`docs/RLS-SECURITY-REVIEW.md` has been marked **OPEN** since 2026-07-22 and nothing in this
file ever pointed at it, which is why five audits passed over it.

Confirmed from the migrations: only `client_ideas`, `idea_form_tokens`, `discarded_drafts` and
`client_style_memos` ever run `enable row level security`. `posts`, `clients`, `agencies`,
`users`, `brand_profiles`, `social_connections`, `notifications`, `generation_runs`,
`post_canvas_docs` and `posting_schedules` have **no RLS statement in version control at all**.

Not exploited in-app — every server query carries a hand-written `.eq('agency_id', …)`. But
`NEXT_PUBLIC_SUPABASE_ANON_KEY` ships in every browser bundle by design and a signed-in user
holds a valid `authenticated` JWT, so PostgREST will serve **any agency's rows** to a raw
`fetch` against `/rest/v1/posts`. The app does not have to be involved.

Two tables (`post_images`, `brand_visual_identity`) have RLS **on with no policy**, toggled in
the dashboard rather than by a migration — which is why 53 files route through
`createAdminSupabaseClient`, and why "must use the admin client" is remembered as a rule rather
than as the symptom it is.

**Blocked on a prod schema dump** (§8.2). The review doc lays out options A/B/C and recommends
C; if C is too large, adopt B *explicitly in migrations* so no table's RLS state depends on a
dashboard click.

### 8.2 The schema baseline is not in version control — OPEN

48 migrations; **four** contain `create table`. Nothing creates `agencies`, `clients`, `posts`,
`users`, `notifications`, `post_images`, `generation_runs`, `social_connections`,
`brand_profiles` or `posting_schedules`.

So: the database cannot be rebuilt from the repo, `supabase gen types --local` against a fresh
DB produces nothing, and the posture in §8.1 cannot be reviewed *or* fixed from code. This was
§7.9 M16 — one bullet in an appendix, under "needs a production query". It is the foundation
the whole security wave stands on.

**Fix:** `supabase db dump --schema public` from prod, committed as
`supabase/migrations/00000000_baseline.sql`, guarded to be a no-op against an existing database.

### 8.3 Prompt injection via fetched source text — RESOLVED 2026-08-18

Was §7.9 M10, filed under "prompt hardening" and under-ranked. It was live and reachable.

`buildSourceMaterialBlock` interpolated RSS titles/descriptions/links, scraped page bodies,
uploaded document text, Tavily titles/snippets and Instagram captions **raw** into
`<rss_content>`…`<performance_content>`, and `buildGroundingPrompt` did the same with the
markdown a post is grounded on. Anyone controlling a subscribed feed or a page a client added
as a source could close the section and instruct the model, and the result would publish under
a client's name.

`sanitizePromptField` was imported into that exact file the entire time, applied to one thing:
the agency's own topic briefs. The lesson generalises past this bug — **a sanitiser present in
a file is not evidence it reaches the untrusted half.**

Closed by sanitising every fetched field, tagging the grounding bodies, and adding
`DEFENSIVE_DATA_CLAUSE` to both system prompts. Bodies go through a new `sanitizeSourceText`
rather than `sanitizePromptField`: their length is already budgeted in `source-gathering.ts`,
so re-capping would have shrunk research material by a factor of the source count — a quality
regression wearing a security fix. Pinned by `ai/research/__tests__/prompt-injection.test.ts`,
which asserts no fetched field can emit a raw angle bracket and that escaping does not drop text.

### 8.4 Server actions were outside every guard — RESOLVED 2026-08-18

`boundary-validation.test.ts` walks `src/app/api` for `route.ts` only. CLAUDE.md names three
boundaries — "form data, server action args, route handler bodies" — and exactly one was
enforced, so the rule held everywhere a test looked and nowhere else.

`submitApproval` is one of two unauthenticated writes in the app: authorised by a URL token,
running on the service-role client, taking `postNotes: Array<{postId, note}>` with no schema,
no array cap and no string cap, written straight to `client_note`. It hand-checked `status`
with a `!==` pair — the same tell §7.4 documents at the route layer, where one checked field
makes the rest look checked.

Closed: `features/review/schemas.ts` caps both dimensions, the four bare-id actions parse
through `lib/actions/parse-input`, and `features/__tests__/action-validation.test.ts` now
covers the second boundary with the same shrink-only shape. Its detector was verified against
the real before/after rather than assumed.

### 8.5 Unmetered paid endpoints — RESOLVED 2026-08-18

`ai/detect-slop` (a live model call) and `ai/analyze-url` (model call **plus** an outbound
fetch of a caller-supplied URL) had no rate limit at all, while seven cheaper text routes did.
The reason nothing looked wrong: the 429 block was copied at seven call sites, so a missing
copy is invisible at any single one. It is one `aiRateLimitResponse` helper now.

`auth/forgot-password` is throttled per client IP — keyed on IP, not address, because keying on
the address lets one caller walk a list one message at a time. This closes the §6.5 remainder.

`detect-slop` also gained its schema and a boundary `console.error`; its bare `catch {}` had
been turning every provider outage, timeout and parse failure into one opaque 500.

### 8.6 The rate limiter is per-instance on serverless — RULED, not changed

`lib/auth/rate-limit.ts` stores counts in a module-level `Map` and its header said *"suitable
for single-instance deployments"* — true of the code, false of Vercel. Each concurrent lambda
keeps its own counts, so the real ceiling is `max × warm instances`.

**Ruling:** it is a runaway-loop guard, not a spend ceiling, and the header now says so. A real
budget needs shared state (Postgres or Upstash) and is a deliberate change, not a constant edit.
Do not add a limit here and describe it as a budget.

### 8.7 Security headers — partially closed

`Strict-Transport-Security` and `Permissions-Policy` added. **CSP is still open** and wants its
own `report-only` rollout given Next's inline bootstrap and the Konva work — it is the
defence-in-depth layer for §8.3, so it belongs after it, not instead of it.

---

## 9. What the 2026-08-18 pass deliberately did NOT do

Sequenced, not forgotten. Ordered by what they are waiting on.

**Waiting on production access — start here.**
- §8.2 prod schema dump → unblocks §8.1, the largest item in the repo.
- §8.1 record each table's true RLS state, then one idempotent migration.
- §7.9 **M21**: are `generation_runs`/`generation_themes` RLS-enabled with no user policy? If
  yes, every wizard theme insert has been failing silently into `trackThemeSafe`, zeroing
  `doneCount` and emptying the theme exclusion list. One query settles it.
- **Migration reconciliation.** `20260808`, `20260814`–`20260819` are tracked as "pending prod"
  across four entries here and three memory notes. Confirm what is applied **once**, then
  regenerate `database.ts`. Nothing in the repo can answer this.
- §2.9 bucket MIME allowlist (`image/svg+xml` **and** `image/webp`), per environment.

**Waiting on a decision.**
- §1.2 / §1.3 the post-images domain and the shared review surface. `components/posts/review/`
  is now **12 files**, not the two §1.3 describes, and imports `features/canvas-editor` and
  `features/dashboard` — a whole feature in the shared layer. Both consumers (`review` and
  `generate`) need it, so "move it into the feature" does not work and the right home is a
  genuine choice. 44 external import sites for the lib half.
- §6.2 `api/meta/callback` — still 297 lines with six token-exchange helpers. The caution
  stands: this path cannot be exercised locally and must be verified against a real Live-mode
  consent.
- §6.3c the three rulebook contradictions, plus one this pass measured: **109 inline
  `.select('…')` strings against 38 constants in `select-columns.ts`.** A rule the code
  contradicts 109 times is not a rule — narrow it ("multi-column reads use a constant") or drop it.

**Sequenced behind other work.**
- §5.8 `generation_runs` unique-per-slot · §5.9 visuals retry spacing · §2.4 partial-success on
  approve · §7.7 notification names from `client_id` · §7.8 `/ideas` pagination · M18 composite
  FK · M12 theme tracking on unpersisted drafts.
- §2.2 / §2.7 / §2.8 are one storage-orphan job. **Do not start with it** — lowest value by this
  file's own repeated assessment ("storage pennies") and highest risk to get wrong, because a
  cleanup that mis-computes the skip set deletes live artwork.
- §5.2 calendar zod (the only §5 perf item with a measured number and no unmet precondition) ·
  §5.3 · §5.5 · §5.1.
- §7.12 Playwright. The analysis stands and should not be revisited: jsdom would have caught 3
  of 8 real editor defects and **the three worst were all layout**, which jsdom cannot see.
- Five features have no tests at all: `analytics`, `auth`, `marketing`, `settings`,
  `visual-identity`. `auth` and `settings` are where a bug is a security bug.

**Still owed, by five separate entries: the browser matrix.** §6.3b, the generate redesign, the
review-tab redesign, the sources redesign and the pipeline refactor each end with the same
sentence. Everything is verified by `tsc`, `next build` and 1,274 tests; **none of it has been
looked at in a browser.** Per §7.12 the manual pass has empirically caught every layout defect
in the editor arc, including two that a clean typecheck, a clean lint, 1,100+ tests and twelve
review agents all missed.
