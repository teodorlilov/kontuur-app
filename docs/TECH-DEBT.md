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
been OPEN since 2026-07-22 and nothing here ever pointed at it — see §8. **Both halves of §8
are now closed** (2026-08-24): the schema baseline is in version control, and all 31 tables
carry an agency-scoped policy, verified by anon-key probe. That review doc should be re-read
against reality or retired; it is the source of the twice-wrong diagnosis §8.1 records.

**Fix pass 2026-08-24.** Everything closable without production access was closed: §2.4, §5.2,
§5.8, §5.9, §7.7, §7.8, §8.7 (to report-only) and a new §8.8 this file had never recorded. §9 is
rewritten around what remains. Its two migrations were applied the same day, columns and
indexes both verified against production, and every cast they needed is deleted — see §9.

**Audit of the finished files, same day.** The fix pass was then re-read whole rather than as a
diff, which found ten things the diff review had not — including that §5.2's payload was never
actually removed, that `POST /api/posts` was re-checking by hand what its own zod schema should
have guaranteed (§7.4's anti-pattern, at a boundary this pass had just touched), and an
eleventh that predates all of it: **§2.2's drafts-cleanup caveat is incomplete in a way that
would delete live artwork.** All fixed or recorded. The lesson is the method — reviewing the
diff shows what changed, reviewing the file shows what it now says.

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
- **The caveat above is incomplete, and a cleanup job written to it would delete live artwork
  (found 2026-08-24).** It names only the canvas docs. But `attachDraftImages` inserts
  `post_images.storage_path` **verbatim**, and nothing moves the flattened composite out of
  `drafts/` — so every wizard-approved post has live, currently-displayed image rows pointing
  *inside the drafts prefix*. A job that treats "under `drafts/`" as "abandoned" and skips only
  the doc backgrounds would delete the visuals of every approved post. Any such job must skip
  `post_images.storage_path` too — which, given the paths are indistinguishable by shape, means
  the skip set has to be built from the tables, never from the prefix.

### 2.3 No cross-surface live sync for generated images

- **What:** generation triggered in one tab/surface doesn't live-update another already-open surface;
  rows exist server-side and appear on next load.
- **Action:** accepted — no realtime plumbing planned.

### 2.4 Approve attaches images best-effort — RESOLVED 2026-08-24

The writes are still best-effort, and deliberately so: the post is already committed, and losing
it to a failed side-write would be worse. What changed is that the shortfall is no longer only in
a server log. `attachDraftImages` and `attachDraftCanvasDocs` each return whether they delivered,
`POST /api/posts` answers `{ post, warnings? }`, `approveDraft` returns
`{ postId, warnings }`, and the generate review view raises each warning as a 12s error toast
beside the success one.

`attachDraftCanvasDocs` also reports docs its own parse/prefix guard *rejected*, not just failed
inserts — from the user's side a canvas that never arrived is the same event either way, and that
branch previously returned silently.

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

### 5.2 Calendar bundles zod client-side — RESOLVED 2026-08-24

Fixed exactly as this entry prescribed: the calendar page adapts through `toValidationData` — the
same function `/review` already used, not a second adapter — and `CalendarPost.validation_json`
became `validation: ValidationData | null`. `parseStoredValidation` is gone from
`schedule-card.tsx`.

**The payload half needed a second pass, and the first attempt's claim here was false.** Dropping
the field from the type removed the zod chunk but *not* the bytes: the page builds each post with
`const { post_approval_tokens: _tokens, ...rest } = p`, and **TypeScript does not
excess-property-check a spread**, so `validation_json` kept riding along in `rest` — typed as
absent, shipped on every post, read by nothing. Found by an audit of the finished files rather
than of the diff. It is now destructured out explicitly. **A field removed from a type is not a
field removed from the wire** whenever a spread is involved.

**Measured, before and after, by rebuilding at both revisions** and reading which routes name the
280 KB zod chunk in their `page_client-reference-manifest.js` (the eager list — the lazy
`react-loadable-manifest` is not the same thing and reading it instead would have shown a false
pass):

    before: /generate · /ideas/[token] · /ideas · /calendar
    after:  /generate · /ideas/[token]

**`/ideas` was the same defect and this entry never noticed it.** `ideas-view.tsx` imported one
integer (`MARK_READ_MAX`) from `features/ideas/schemas.ts`, and that file imports zod — so the
whole chunk shipped to read a number. The constant moved to `idea-filters.ts`, which is
types-only; `schemas.ts` imports it back. The lesson generalises past both: **a client component
importing anything at all from a schemas file pulls zod with it**, so the cheap check is the
import graph, not the call site.

The two survivors are correct. `/generate` and the public `/ideas/[token]` form both validate in
the browser on purpose — the form enforces `ideaBriefSchema`'s caps as you type rather than
letting a client discover them as a rejection.

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

### 5.8 generation_runs has no unique-per-slot constraint — RESOLVED 2026-08-24

Closed the way this entry's first option said: `20260830_generation_run_slot_claim.sql` adds
`generation_runs.slot_key` and a partial unique index on `(client_id, slot_key)`.
`startGenerationRun` now takes the slot instant and returns
`{ runId } | { runId: null, slotTaken }`, and the cron passes `getScheduleDue`'s `scheduledAt` —
both racers of a tick compute the same key, so one insert wins and the loser skips into
`results.slot_already_claimed` rather than into `errors`.

**The index is partial on three predicates and every one is load-bearing.** `kind = 'cron'` keeps
a run a human asked for from cancelling a scheduled batch; `slot_key is not null` keeps manual
runs from colliding with each other (and NULLs do not conflict in a unique index anyway, which is
why manual runs pass an explicit null); `status <> 'failed'` is what preserves the same-day retry
this file's dedup query already allowed — updating a row to `'failed'` removes it from a partial
index, freeing the slot.

**The snapshot guard stayed**, deliberately. It is the cheap pre-filter that decides without doing
any work; the claim is the guarantee. Only one of them can be either.

The claim happens before any model call, so a lost race costs two DB reads.

### 5.9 Visuals attempt cap has no retry spacing — RESOLVED 2026-08-24

`20260831_posts_visuals_attempted_at.sql` adds the column this entry named.
`pickVisualBacklog` takes `retrySpacingMs` beside `maxAttempts`, the cron sets it to 6h and
mirrors the filter in SQL (a second `.or(...)`, ANDed with the quality one), and `countAttempt`
stamps the column alongside the counter.

Six hours, so three attempts span half a day: exhausting the cap now means the post cannot be
painted, which is the only thing the cap should ever have meant. A never-attempted post has no gap
to wait out — stated explicitly on both sides, since `NULL >= x` is unknown in SQL and would
otherwise have excluded every post that had never been tried.

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

### 6.1 New migration must reach prod before deploy — RESOLVED 2026-08-24

**`20260808_unique_tavily_source_per_client.sql` is applied.** Confirmed by finding
`client_sources_one_tavily_per_client` in the production schema dump, not by the CLI — see §9 on
why `migration list` cannot answer this and never could. The race it closes is closed.

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

### 7.7 Notification client names are regex-parsed back out of the message — RESOLVED 2026-08-24

Both regexes are deleted. `ShellProvider` already received the agency's roster for the sidebar,
so it now exposes `clientName(clientId)` on the shell context — backed by a memoised Map and
falling through the existing `formatClientName`, so a notification about a since-removed client
renders the same placeholder every other surface uses. `NotificationItem` reads it.

The fix shape this entry proposed was right, and the reason it mattered is worth keeping: the
name came from prose, so a client whose name contained "approved", "requested" or "for" parsed
wrong, and any third writer with a third phrasing rendered as "Client". The id was on the row the
whole time.

### 7.8 `/ideas` reads every idea an agency has ever received — RESOLVED 2026-08-24

The page now reads `?pages=` (default 1) and asks for `pages * IDEAS_PAGE_SIZE + 1` rows — the
extra row is the probe that says whether anything older exists, without a second count query. The
view renders "Showing the N most recent" with a "Show older" link, and at `MAX_IDEA_PAGES` says to
filter by client instead. `pagesShown` rejects junk, repeats and out-of-range values down to page
one, because the fallback on a param that sizes a server read must never be "load more".

**`MARK_READ_MAX` is gone rather than narrowed**, which is the part this entry got slightly wrong
by proposing to keep it. It would have been `= IDEAS_PAGE_SIZE`, and knip correctly flagged two
exported names for one value as a duplicate export. The client sends what it rendered and it
renders in pages, so the page size *is* the cap: `ideaIdsSchema` and `markIdeasReadSchema` bound
on it directly, 500 → 100.

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

### 8.1 RLS — FULLY RESOLVED 2026-08-24, and the original diagnosis was wrong twice

**What this entry claimed this morning:** "RLS is off on most tables; a signed-in user can
read any agency's rows via PostgREST." **False.** RLS was already enabled on all 28 public
tables. I inherited that premise from `docs/RLS-SECURITY-REVIEW.md`, which had reasoned it
from the migrations — on a project where version control and the database had never been
connected. Neither of us measured before writing it down.

**What measuring found instead** — the exposure was real but the opposite shape:

    post_approval_tokens_public_read   FOR SELECT TO public USING (true)

One policy, on the one table where it mattered most. `batch_id` there is not data, it is
the credential: `sendApprovalBatch` mints it as `crypto.randomUUID()` so an approval link
cannot be guessed, and this published the guess to anyone holding the anon key — which
ships in every browser bundle by design. With one batch_id an anonymous caller could read
a client's unpublished posts through `/api/approval/<batch_id>` and forge that client's
approval through `submitApproval`. `client_email` sits in the same row.

Confirmed by probe, not inference: an anon-key request with no JWT returned rows, while the
same request against `posts` returned zero.

**Fixed and applied to prod.** `20260818_drop_approval_token_public_read.sql` drops it — a
drop rather than a rewrite because it served nothing; every reader of that table uses the
service-role client or the agency-scoped policy. Verified after: the probe returns `[]`,
and a sweep of all 28 tables with the anon key returns data from **none**.

**The root cause, and the durable fix.** Not one `CREATE POLICY` had ever been in version
control — 48 migrations, zero policies, against 18 in the live database. There was no diff
the bad policy could have appeared in. `20260818_capture_rls_policy_baseline.sql` now
records all 17 survivors exactly as production enforces them, and
`src/app/__tests__/rls-policies.test.ts` fails any migration whose policy predicate is
`true` or which never names the caller — verified by dropping the real vulnerable policy
back in, which it catches by name.

**The transferable mistake:** twice in one day this entry was wrong in opposite directions
— first that RLS was absent, then implicitly that "has a policy" meant "is safe". Both
times the fix was to measure. Do not diagnose this database from its migrations until §8.2
is closed, and do not treat a policy count as a security property.

**The last open half — CLOSED 2026-08-24.** 11 tables ran RLS-on with zero policies
(service-role only), reached through `createAdminSupabaseClient` after an ownership check in
code — which is why 59 files import that client. `20260832_close_the_policyless_tables.sql`
gives all 11 an agency-scoped policy, transcribed from the baseline's patterns rather than
invented. **Applied to prod and verified twice:** `pg_policies` returns 31 rows, one per table
in the schema, and an anon-key probe with no JWT against all 11 returns `[]` from every one.

**It is additive and could not have broken the unauthenticated paths.** `service_role` has
BYPASSRLS, so every admin-client read still works byte for byte — the public approval page
reading `post_images`, the public idea form writing `client_ideas`. What changed is that a
route forgetting its agency filter is no longer the only thing between two agencies.

**This entry's own framing of `client_ideas`/`idea_form_tokens` as "the sharpest case" was
wrong**, and worth recording because it is a tempting mistake: the public form being
unauthenticated is an argument for keeping service-role on the PUBLIC path, not against a
policy for the authenticated one. The dashboard reads both as a signed-in user. They are
included.

**A side effect worth knowing:** `post_images` had no policy, so a *user-scoped* read of it
returned nothing — that is the cause of the empty calendar images in session 9 and a standing
reason to reach for the admin client. Those reads now work. The admin-client workaround stays
valid; it is simply no longer the only thing that does.

**Guarded, and the guard was wrong first.** `rls-policies.test.ts` now cross-checks every table
in the schema baseline against the policy set — impossible before §8.2, when the migrations
described 12 of 31 tables. Building it exposed that the existing name regex used `[^"\s]+`,
which stops at the first space: the two policies named
`"Users can manage their agency's client sources"` were recorded as named `Users` and their
`on` clause never parsed, so they reported as checked while nothing checked them. Same shape as
§7.4's detector defect — wrong in the safe-looking direction. Fixed, and the coverage assertion
was verified by deleting a policy and confirming it names the table.

### 8.2 The schema baseline is not in version control — RESOLVED 2026-08-24

**`supabase/migrations/00000000_baseline.sql` is committed** — 204 statements generated from
production: 31 tables, 95 constraints, 39 indexes, 6 functions, 1 trigger and 31
`enable row level security` flags. Every one is guarded (`if not exists`, or a `do $baseline$`
existence check for the 96 constraints and triggers), so replaying it is a no-op.

**Was:** 63 migrations, **eight** containing `create table`, covering 12 of the 31 tables.
Nothing created `agencies`, `clients`, `posts`, `users`, `notifications`, `posting_schedules`,
`social_connections`, `brand_profiles`, `generation_runs` or `post_approval_tokens`. This was
§7.9 M16 — one bullet in an appendix, under "needs a production query" — and it was the
foundation the whole security wave stood on.

**How, and why it took six days it did not need to take.** The entry prescribed
`supabase db dump --schema public`, so the item silently inherited *that command's*
prerequisites — a Docker daemon, then a live CLI token — and got filed under "waiting on
production access". Neither was a prerequisite of the question. The schema is in the catalog,
the catalog is queryable from the dashboard, and `supabase/queries/rls-audit.sql` had already
demonstrated exactly that pattern in this same directory for the harder §8.1.
`supabase/queries/schema-baseline.sql` is the generator; re-run it rather than hand-editing the
output.

**Verified rather than assumed:** the emitted DDL carries `slot_key`, `visuals_attempted_at`,
and `generation_runs_one_batch_per_slot` **with all three of its WHERE predicates intact** —
the partial-index case a naive emitter flattens, which would have produced a baseline that
rebuilds a database where §5.8's race is silently open.

**What this does NOT buy: `supabase db push` is still unsafe**, and that is now measured rather
than inferred — see §9. Recording the schema and being able to replay the history are two
separate problems; this closes the first.

**Fix, and it no longer needs the tooling this entry assumed.** The prescription was
`supabase db dump --schema public`, which runs pg_dump inside a Docker container — so the entry
sat blocked behind a daemon, then behind a CLI access token, for six days. Neither is a real
prerequisite: the schema is in the catalog and the catalog is queryable from the dashboard, which
is how §8.1 was answered.

`supabase/queries/schema-baseline.sql` emits the whole thing — tables with columns and defaults,
primary keys, uniques, checks, foreign keys, non-constraint indexes (partial predicates verbatim,
which matters for `20260830`'s slot claim), functions, triggers and the RLS enable flags — as one
ordered `ddl` column. Paste, copy the column, save as
`supabase/migrations/00000000_baseline.sql`. Every statement is guarded (`if not exists`, or a
`do $$` existence check for constraints and triggers), so replaying it against the live database
is the no-op this entry asked for.

**One thing a `db dump` would not have told you either:** committing the baseline does not make
`supabase db push` safe. The 63 existing migrations were never tracked by the CLI, so after the
baseline they would all replay against a database that already has their changes. A rebuilt
database needs the baseline applied and the prior versions marked history via
`supabase migration repair --status applied`. Recording the schema and being able to replay the
history are two separate problems; the query closes the first.

**Status:** executed against production 2026-08-24, clean on the first run. Its output is
`supabase/migrations/00000000_baseline.sql`.

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

### 8.7 Security headers — CSP now shipping report-only, 2026-08-24

`Strict-Transport-Security` and `Permissions-Policy` were added 2026-08-18.
`Content-Security-Policy-Report-Only` is now in `next.config.ts`, exactly the rollout this entry
asked for and no further: Next inlines its bootstrap, the canvas editor fetches Google Fonts
stylesheets at runtime and draws through `blob:`, so an enforcing policy has several ways to break
a surface nothing in this repo can see.

`img-src` is derived from `REMOTE_IMAGE_HOSTS` — the same array `images.remotePatterns` is built
from, mapping next/image's `**.` wildcard onto CSP's `*.` — so the two lists cannot drift into
disagreeing about which hosts are allowed.

**Still open: enforcement.** That means reading the reports, then removing `'unsafe-inline'` from
`script-src`, which needs nonces, which needs middleware rewriting every response. A deliberate
change, not a constant edit — and the same caution §8.6 records about calling a guard a budget.

### 8.8 `/api/extract/status` read across agencies — RESOLVED 2026-08-24

Not in this file before; found 2026-08-24 while re-verifying §8.1's "reached through
`createAdminSupabaseClient` after an ownership check in code" claim against the routes that
actually do it. This one did not.

`GET /api/extract/status` called `resolveAuth()` — so it required a signed-in user — and then read
`brand_kit_extractions` through the service-role client filtered on `onboarding_session_id`
alone. Being authenticated was the entire check, so any signed-in user holding a session id could
read another agency's extracted palette, logo and confidence report. `/api/extract/start` stamps
`agency_id` on the row, so the scope was there to filter on the whole time.

**Severity is bounded by the id, not by the code:** the session id is `crypto.randomUUID()`
minted in the browser, so it is not guessable and there is no evidence of exposure. That is luck
holding a door shut, not a control.

`fetchExtraction` now takes `agencyId` as a **required** parameter rather than an optional one —
the point being that the next caller cannot omit it the way this one did.

**The generalisable part:** every other admin-client route checked has its guard
(`verifyPostOwnership`, `verifyClientOwnership`). This one was missed because the ownership check
in that family is a *convention*, not something a test can see — §8.4's lesson at a different
layer. The 11 policy-less tables in §8.1 all depend on it.

---

## 9. What is still open

Rewritten 2026-08-24 after a fix pass closed §2.4, §5.2, §5.8, §5.9, §7.7, §7.8, §8.7 (to
report-only) and §8.8. Sequenced, not forgotten. Ordered by what they are waiting on.

**Settled against production 2026-08-24 — do not re-open.**
- **§8.2 is closed** — `00000000_baseline.sql` is committed. See the entry.
- **Migration reconciliation is closed, and the question was malformed.** Four entries here and
  three memory notes tracked `20260808` and `20260814`–`20260819` as "pending prod".
  `supabase migration list --linked` cannot answer that and never could: **every one of the 64
  migrations reports an empty `remote` column**, because the remote history table has never had
  a single row written to it. "Pending" was never a state this project could observe.
  Answered instead by checking each migration's *artifacts* against the freshly dumped schema —
  `client_sources_one_tavily_per_client`, `generation_runs.kind`,
  `generation_runs_cron_dedup_idx`, `idea_form_tokens_one_per_client` and `client_style_memos`
  are all present, and `pg_policy` holds 20 policies with zero rows named
  `post_approval_tokens_public_read`. **Everything is applied. Nothing was ever pending.**
- **The transferable part, twice over.** §8.2 sat blocked because the entry named a *command*
  (`supabase db dump`) and the item inherited that command's prerequisites instead of the
  question's. This one sat open because it named a *tool's notion of state* ("pending prod")
  that the tool was never wired up to track. **When an entry names a command or a status, check
  that it is measuring the thing you actually want to know.**
- **`supabase db push` remains unsafe, now measured.** With an empty remote history, a push
  would replay all 64 files against a database that already has every one of them. A rebuilt
  database needs the baseline applied and the prior versions marked history via
  `supabase migration repair --status applied`. This is why the repo has deliberately never had
  a `db:push` script — keep it that way.

**Waiting on production access — nothing in the repo can answer these.**
- §2.9 bucket MIME allowlist (`image/svg+xml` **and** `image/webp`), per environment.

**Verified against production 2026-08-24 — closed, do not re-open.**
- **`20260830` / `20260831` fully landed.** Columns confirmed by regenerating `database.ts`,
  and both indexes confirmed by `pg_indexes` — `generation_runs_one_batch_per_slot` and
  `posts_visuals_backlog` are present. Every cast either migration needed is deleted and
  `visuals_attempted_at` derives from `PostRow` in `BacklogPost`'s `Pick`.
  **The two checks are not interchangeable and both were needed.** `gen types` describes
  columns, not indexes, so a regenerated `database.ts` would have looked identical had only the
  `alter table` half of `20260830` run — and in that world the unique index is absent, the 23505
  branch never fires, §5.8 is not fixed, and `npm run check` is still green. A constraint is
  verified by querying the catalogue, never by the types.

**Answered without production access — do not re-open.**
- §7.9 **M21** asked whether `generation_runs`/`generation_themes` are RLS-enabled with no user
  policy, silently failing every wizard theme insert. **They are not.**
  `20260818_capture_rls_policy_baseline.sql:63` and `:113` record `FOR ALL` agency-isolation
  policies on both, and Postgres reuses a `FOR ALL` policy's `USING` as its `WITH CHECK` when the
  latter is omitted — so the inserts pass. This was listed under "needs a production query" for
  six days after the query that answered it had been committed.
- **"Five features have no tests at all"** (below) was stale: `analytics` has 21 test files now,
  `auth`, `settings` and `visual-identity` one each. Only `marketing` is genuinely at zero.

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
- M18 composite FK · M12 theme tracking on unpersisted drafts.
- §2.2 / §2.7 / §2.8 are one storage-orphan job. **Do not start with it** — lowest value by this
  file's own repeated assessment ("storage pennies") and highest risk to get wrong, because a
  cleanup that mis-computes the skip set deletes live artwork.
- §5.3 shared-shell supabase client · §5.5 unbounded review payload · §5.1 layout badge count.
  §5.2 is closed; these three have no measured number and no trigger met.
- §8.7 CSP **enforcement** — the report-only policy ships, reading its reports is the next step.
- §7.12 Playwright. The analysis stands and should not be revisited: jsdom would have caught 3
  of 8 real editor defects and **the three worst were all layout**, which jsdom cannot see.
- **`marketing` has no tests at all**, and `auth`, `settings` and `visual-identity` have one file
  each. `auth` and `settings` are where a bug is a security bug. (Re-measured 2026-08-24 — the
  version of this line naming five features was two arcs out of date.)

**Still owed, by six separate entries now: the browser matrix.** §6.3b, the generate redesign, the
review-tab redesign, the sources redesign, the pipeline refactor — and the 2026-08-24 fix pass,
which changed two rendered surfaces: the ideas inbox gained a "Show older" footer, and the
notification row now resolves its client name from the roster. Everything is verified by `tsc`,
`next build` and 1,590 tests; **none of it has been looked at in a browser.** Per §7.12 the
manual pass has empirically caught every layout defect in the editor arc, including two that a
clean typecheck, a clean lint, 1,100+ tests and twelve review agents all missed.
