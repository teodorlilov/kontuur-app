# Phase 1 — Implementation status

> Living tracker for [PHASE-1.md](PHASE-1.md). Update as tasks land. Last updated **2026-07-11**
> (all tasks code-complete). Phase 0 status: [PHASE-0-STATUS.md](PHASE-0-STATUS.md). Branch:
> `feat/composition-engine-phase0`.

## Status: all Phase-1 tasks are code-complete

Every task (1, 2.1–2.4, 3.1–3.3) is built, tsc-clean, build-green, and unit-tested where the logic is
pure. Everything from the extract routes and the React UIs onward is **deploy-gated** — structurally
sound but unverified until the app runs. **Three migrations to apply** (`post_visuals`,
`brand_kits/feed_systems`, `brand_kit_extractions`) + the `renders` bucket.

**One sub-item deferred:** §3.3's "thread `is_health_niche` into the photographic `negative`" — the
persisted kit has no subjects/negative field yet (subjects storage is a Phase-3 imagery concern per the
§1 scope note). The propagation *copy* and version bump (the §3.3 done-when) are done.

**Two §3.1 affordances not wired** (editor + save shipped; these triggers didn't): the Visual system
tab's **"Re-analyze from website" / "Upload reference image"** buttons, and an **image path in
onboarding**. The image extractor (2.2) works via the direct API but no UI sends it an image yet.

**E2E verification:** [PHASE-1-TEST-PLAN.md](PHASE-1-TEST-PLAN.md) (run [PHASE-0-TEST-PLAN.md](PHASE-0-TEST-PLAN.md) first).

## The landscape (what's verifiable locally vs on deploy)

Phase 1 splits sharply. **Verifiable locally:** the data model, and the deterministic "code clusters"
of the ensemble — colour clustering, type-scale fitting, font script-coverage filtering, report typing.
**Deploy-gated:** the Chromium measurement pass and Claude vision (2.1/2.2), the `waitUntil` async
wiring (2.3), and the React UIs (2.4 Review, 3.1 settings). I build those but they prove out only when
you run the app. Same contract as Phase 0.

## Built and verified locally (tsc + tests green)

| Task | State |
| --- | --- |
| 1 data model | Done — `supabase/migrations/20260712_create_brand_kits_feed_systems.sql`: `brand_kits` (unique client_id), `feed_systems` (seeded Editorial/Bold blocks/Quiet grid from product §3), `client_feed_systems` (partial-unique default), `post_visuals.feed_system_id` FK, default-kit backfill. `src/lib/brand-kit/tokens-schema.ts` (zod + parity guard), `queries.ts` (agency-scoped read). **Not yet applied.** |
| 2.1 website extractor | **Backbone built (deploy-gated)** — core done; plus `measure.ts` (Chromium `getComputedStyle` pass → categorised colours + size ladder + font stacks), `font-detect.ts` (serif/sans/mono classify), `vision.ts` (first Claude vision call in the repo — re-picks accent, infers mood/subjects/motifs/font-category/feed-system), `extract-website.ts` orchestrator, `/api/extract` route (fail-soft to default kit). tsc+build green; runs only on deploy. **Remaining: `analyze-url` verbal persistence lives in 2.3.** |
| 2.2 image extractor | **Backbone built (deploy-gated)** — core done; plus `extract-image.ts` (headless-canvas decode → k-means → roles; vision for mood/subjects/font category → `proposeFamilies`, fonts `guessed`). Shares `/api/extract` (`{image, mediaType}`). |
| 3.2 font filter core | **Done (pure)** — `src/lib/render/font-filter.ts`: `scriptsForLanguage`/`requiredSubsets`/`filterFamiliesForLanguages` (a Bulgarian client never sees a Latin-only face), `proposeFamilies` (category → suggestions for the image path). `subsets` metadata added to `FONT_LIBRARY`. Unit-tested. **Remaining: the picker UI + custom upload cmap-parse (in 3.2 UI, deploy-gated).** |
| §5 shared components | **Built (deploy-gated)** — `src/features/clients/components/visual-system/`: `ConfidenceBadge`, `PreviewCell`/`PreviewGrid` (mount Phase-0 `<Composition/>` client-side → instant recolour), `TokenEditor` (5 roles + language-filtered type), `FeedSystemPicker` (3 cards + live cover, recommendation as a sentence). `kitFontsHref` for preview parity. Render-without-throw tested. |
| 3.1 Visual system tab | **Built (deploy-gated)** — `settings/visual-system-tab.tsx` composes the §5 components; wired into `settings-nav` (Palette tab), `client-settings-form` (state + Save), and the edit page loader (fetches kit + feed systems). `actions/brand-kit-actions.ts` `saveBrandKit` (zod-validated, agency-scoped, bumps `version`). tsc+build green; needs the migration applied + a deploy to exercise. **§3.3 propagation copy (dependent-post counts) is the remaining slice.** |
| 2.4 Review UI | **Built (deploy-gated)** — a Visual system section in the onboarding Review (`step-review.tsx` → `VisualSystemSection`): TokenEditor with confidence badges + live PreviewGrid + FeedSystemPicker (recommendation as a sentence) + a confirm-fonts gate. `new/page.tsx` holds the visual state, blocks save when guessed fonts are unconfirmed, and calls `saveBrandKit` on client creation so a new client gets a kit + feed system. `STARTER_FEED_SYSTEMS` is the client-side catalog. |
| 2.3 async wiring | **Built (deploy-gated)** — `20260713_create_brand_kit_extractions.sql`; `/api/extract/start` inserts a `pending` row and runs the extractor in a Next `after()` callback (fetches the isolated `/api/extract`, writes `ready`/`fallback`/`failed`), returning instantly. Onboarding mints a session id, kicks extraction on URL submit, and polls `/api/extract/status` from the Review to hydrate tokens/report in place — never overwriting operator edits. **Uses polling, not realtime** (no publication config; realtime is a drop-in upgrade). **New migration to apply.** |
| 3.3 propagation copy | **Built (deploy-gated)** — the edit-page loader buckets the client's posts (drafts / scheduled / published) from already-loaded rows; the Visual system tab shows the honest consequence: *"Saving will re-render N drafts automatically. M scheduled posts will ask first. Published posts are never changed."* Version bump ships in `saveBrandKit`; no re-render fires (Phase 7). |

## Decisions taken (deviations / notable choices)

- **Adopted `zod`** for token validation — Phase 0's §2.1 explicitly deferred it as "a fast-follow if
  the surface grows"; Phase 1's user-editable kits are that point. A compile-time parity guard keeps
  `brandTokensSchema` and the `BrandTokens` type in lockstep.
- **`feed_systems` params:** the product §3 table maps to first-class columns (`font_reqs`,
  `photographic`, `treatment`, `mark_style`, `rhythm`, `plate_budget`) plus a `params` jsonb for the
  rest (scale, marginPct, textBlock, chrome). Colours never live on a feed system.
- **Backfill inlines the DEFAULT_TOKENS JSON** as a snapshot; re-analyze (§3.1) upgrades on demand.

## Next up (doc order)

`2.1 website extractor → 2.2 image extractor → 2.3 async wiring → 2.4 Review UI → 3.1 settings → 3.2 fonts → 3.3 save`

Building strategy: land each task's **pure, testable core** first (clustering, type-scale, font
filter), then the browser/vision/UI shells on top. Detect (2.x) fully before Author (3.x).

## Pending user actions

- [ ] Apply `20260712_create_brand_kits_feed_systems.sql`, then `supabase gen types` and drop the
      `as unknown as SupabaseClient` cast in `src/lib/brand-kit/queries.ts`.
- [ ] Everything Phase 0 already needs (see PHASE-0-STATUS.md).
