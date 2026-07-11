# Phase 1 — Implementation status

> Living tracker for [PHASE-1.md](PHASE-1.md). Update as tasks land. Last updated **2026-07-11** (Task 1).
> Phase 0 status: [PHASE-0-STATUS.md](PHASE-0-STATUS.md). Branch: `feat/composition-engine-phase0`.

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
