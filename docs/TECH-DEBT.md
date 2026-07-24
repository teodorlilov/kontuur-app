# Tech Debt & Deferred Issues

Catalogued 2026-07-22 during the Phase-3 AI-visuals review (branch `feat/ai-visual-flow`).
None of these block shipping; each entry says what it is, why it was deferred, and the intended fix.

---

## 1. Code structure

### 1.1 `parse-slides.ts` lives in the components tree but is imported by an API route
- **Where:** `src/components/posts/parse-slides.ts`, imported by `src/app/api/posts/[id]/visuals/route.ts`
  (and by `slides-section`, `post-content-display`, `review-post-list`, `use-draft-visuals`).
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
- **Why it's this way:** the id union and the registry must never drift, and this makes *adding a brand
  style a one-file edit*. The orthodox layout (union in `types/`) trades that for convention.
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

---

## 3. Cost/perf watch-list (no action needed yet)

- **Vercel image optimization:** every generated visual is a unique URL through `next/image`; each
  regenerate mints a new one. If quota becomes a problem: `unoptimized` for small thumbnails or
  tighter `sizes`.
- **fal queue time vs `maxDuration 120`:** ~52s render + queueing headroom. If 502s cluster on the
  visuals routes, this is the first suspect.
- **1024² vs Instagram's 1080² recommendation:** IG upscales slightly; bump to 1088×1088 (multiple of
  16) in `lib/visual/fal.ts` if pixel-exactness is wanted.
- **Visuals route does two sequential DB reads** (ownership check + post fields) — could be one query;
  micro-optimization, not worth the coupling today.

---

## 4. Pre-existing lint errors (not from the visuals branch)

Verified identical on `HEAD` before the branch's changes:
- `react-hooks/set-state-in-effect` in `schedule-card.tsx` (pre-fill effect), `calendar-view.tsx`
  (editPost deep-link effect), `use-extraction-status.ts` (ref write during render),
  `post-content-display.tsx` / `carousel-slides.tsx` (editable-field effects).
- `react-hooks/preserve-manual-memoization` in `calendar-view.tsx` (month nav callbacks).
- `@next/next/no-img-element` in `canva-design-picker.tsx`.

Fix as a dedicated lint-cleanup pass, not opportunistically.
