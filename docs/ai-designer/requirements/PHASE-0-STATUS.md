# Phase 0 — Implementation status

> Living tracker for [PHASE-0.md](PHASE-0.md). Update it as tasks land. Last updated **2026-07-11** (2.4 built).
> Deploy verification steps: [PHASE-0-TEST-PLAN.md](PHASE-0-TEST-PLAN.md).

## The gate that orders everything

The remaining tasks split into two buckets: what can be proven with `tsc` + unit tests, and what can
only be proven by a **working Chromium render on a Vercel Pro deploy**. Until one real PNG comes back,
anything that asserts "the screenshot looks right" is written but unverified.

**Do not start 2.4 / fonts / 2.7 until the first successful render.** If the Chromium version pairing
(`@sparticuz/chromium@149` + `playwright-core@1.61`) misbehaves on first deploy, the fix lands in
`browser.ts` and ripples downstream — find it before stacking more tasks on top.

## Built and verified locally (tsc clean, 315 tests pass)

| Task | State |
| --- | --- |
| 2.0 migration `post_visuals` | Written — `supabase/migrations/20260711_create_post_visuals.sql`. **Not yet applied.** |
| 2.1 scene graph + validators | Done — `src/lib/scene-graph/` |
| 2.2 `<Composition/>` renderer + `DEFAULT_TOKENS` | Done — `src/lib/renderer/` |
| 2.3 `/render/[id]` route + token + fonts href + middleware exempt | Done — `src/app/render/`, `src/lib/render/{token,google-fonts,tokens-for-render}.ts` |
| 2.5 render function | Done — `src/app/api/render/route.ts`, `src/lib/render/{browser,render,service,hash,app-url}.ts` |
| 2.6 hash cache | Done — `src/lib/render/cache.ts` (hit → return before Chromium; miss → render + persist). Decision predicate `isCacheHit` unit-tested; "no launch on hit" is structural (returns before `renderComposition`). |
| 2.4 autoFit | Done — `src/lib/renderer/autofit.ts`. Pure `computeFit` step-down algorithm unit-tested (ok / shrunk:1 / overflow); `<Stage>` runs the DOM pass after fonts, before `__stageReady`. **The in-browser shrink + screenshot timing is only provable on deploy** (jsdom has no layout). |

## Decisions taken during 2.5 (deviations from the doc — revisit if wrong)

- **`NEXT_PUBLIC_APP_URL`, not `APP_BASE_URL`.** Reused the repo's existing base-url var instead of
  adding a second one. Helper: `src/lib/render/app-url.ts`.
- **`/api/render` auth reuses `CRON_SECRET`** (the existing trusted server-caller bearer) rather than a
  new `RENDER_API_SECRET`. Swap if you want a dedicated secret.
- **`RENDERER_VERSION` lives in `src/lib/render/hash.ts`** (needed for the render filename in 2.5; 2.6
  wires the cache around it).

## Deferred tasks — order and timing

**Next up: baked fonts** (an asset decision), then 2.7. Both effectively wait on the first deploy.

1. **Baked fonts** (2.5 sub-item) — *blocked on an asset decision.* This is the Bulgarian-`locl`
   correctness fix and is **not pure codegen**: pick a family (candidates: Nunito / PT Sans /
   Source Sans 3), obtain the WOFF2, and confirm against a specimen that it carries BG localized
   letterforms. Then wire `@font-face` + drop the Google fetch for it. Until then the `/render` page
   fetches a Google Fonts subset (Latin + basic Cyrillic works; BG `locl` is the open risk).
2. **2.7 reference compositions + golden snapshots** — *last, in-container by design.* Author the 4–5
   fixtures anytime; the golden test must generate + compare snapshots inside the render container, so
   it needs the working deploy. This is the acceptance harness that locks the renderer.

Doc sequencing (unchanged): `2.2 → 2.3 → 2.5 → 2.6 → 2.7`, with `2.4` folding in beside `2.2`.
Done so far: `2.0–2.6` (all code tasks). Remaining: baked fonts + 2.7.

## Pending user actions before / at first deploy

- [ ] Apply the migration (`supabase db push` or dashboard), then `supabase gen types` and drop the
      `as unknown as SupabaseClient` casts in `src/app/render/[postVisualId]/page.tsx` and
      `src/app/api/render/route.ts`.
- [ ] Create a public **`renders`** storage bucket (mirror `post-images`).
- [ ] Set env in Vercel prod: `RENDER_TOKEN_SECRET` (given:
      `o09bFtqExr+mYwKyZ2YkbcjKEySDXTjURSqN6VOA3SI=`). `CRON_SECRET` and `NEXT_PUBLIC_APP_URL` already
      exist.
- [ ] Raise the `/api/render` function memory in the Vercel dashboard (~1 GB+).
- [ ] For local render testing only: set `CHROME_EXECUTABLE_PATH` to a system Chrome (the
      `@sparticuz` binary is Linux-only).
- [ ] First-render smoke test: seed one `post_visuals` row, `POST /api/render`, confirm a PNG URL.
