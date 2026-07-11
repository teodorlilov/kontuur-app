# Phase 0 — Render Core

> **📍 Implementation status + deferred-task order live in [PHASE-0-STATUS.md](PHASE-0-STATUS.md).**
> Built so far: 2.0–2.3 + 2.5. Deferred: 2.6, 2.4, baked fonts, 2.7 — all gated on the first deploy.

> **Goal:** build a headless-Chromium render service and a typed scene graph — the foundation every
> later phase renders through.
> **Ships to users:** nothing.
> **Reference:** `COMPOSITION-ENGINE-TECHNICAL.md` §5, §6.
> **Estimate:** 3 weeks, one engineer. Add the ½-day Recraft spike (§0.1) up front.

> **This is greenfield, not a replacement.** The app has **no Satori and no image renderer today** —
> visuals are uploaded PNGs (`post_images`) or made in Canva. There is nothing to port or pixel-compare
> against. Phase 0 is purely additive: it builds a new renderer beside the existing upload/Canva path,
> and nothing calls it until Phase 4.

---

## For the implementing agent — read first

**Stack (verified against this repo — do not substitute):** Next.js 14 App Router · TypeScript strict ·
Supabase (Postgres + Storage) · Tailwind · **Vercel Pro** · **vitest** (test runner) · migrations in
`supabase/migrations/` named `YYYYMMDD_description.sql`. Render service: **headless Chromium in a
dedicated Vercel serverless function** — `@sparticuz/chromium` + `playwright-core`, Fluid Compute for
warm reuse (§2.5). Single vendor; no second bill.

**Repo facts you must build on (already confirmed — do not re-litigate):**

- **No monorepo.** No `packages/`, no workspaces. Shared code lives under `src/lib/`. This doc uses
  `src/lib/scene-graph` and `src/lib/renderer`.
- **Access control is app-level, not Postgres RLS.** Only `client_ideas` / `idea_form_tokens` have RLS;
  core tables (`clients`, `posts`, `post_images`) do **not**. Server code scopes data with
  `createAdminSupabaseClient()` (service role, `src/lib/supabase/admin.ts`) + an explicit `agency_id`
  filter. **Follow that pattern — there is no `posts` RLS policy to mirror.**
- **The renderer is Chromium; so is the extractor in Phase 1.** One browser engine, two jobs.

**Ground rules:**

1. **Do not touch the existing generation, upload, or publishing code.** Phase 0 is additive.
2. **One task at a time, in the numbered order.** Each `### 2.x` is a unit of work with its own
   "Done when." Do not start the next until the current one's checks pass.
3. **Write the test in the same PR as the code.** Every "Done when" is a test, not a vibe.
4. **Ask before inventing.** If an env var or an auth pattern isn't specified here or already in the
   repo, stop and ask — do not guess a convention.
5. **No hex literals, no font-family literals in any composition or renderer default.** §2.1 enforces
   it; CI checks it. Colours and families come from tokens only.
6. **Commit per task.** Message format: `phase0(2.3): render route`. Keep PRs to one `### 2.x`.

**Before writing code, confirm by inspecting the repo (do not assume):**

- [ ] the `posts` / `clients` / `agencies` table shapes (§2.0 references `posts` and `agencies`)
- [ ] how `createAdminSupabaseClient()` is used in an existing server route, and copy that scoping shape
- [ ] how the app reads `SUPABASE_URL` / service key today (reuse the same env names)

**When a task is ambiguous, the resolution order is:** this document → `COMPOSITION-ENGINE-TECHNICAL.md`
→ existing repo conventions → ask the user. Never the reverse.

---

## 0. Definition of done

- [ ] `POST /render` returns a PNG in Supabase Storage for any `post_visuals` row, rendered against a
      supplied token set.
- [ ] The six scene-graph layer types render correctly, verified against committed **in-container**
      reference snapshots with a pixel tolerance.
- [ ] A two-plate composition with `mix-blend-mode` + `clip-path` (rect/ellipse) composites correctly.
- [ ] Bulgarian text renders with correct `lang="bg"` localised letterforms, verified against a
      committed reference specimen **rendered in a font with confirmed Bulgarian `locl`** (§2.5).
- [ ] `autoFit` text shrinks to fit and reports the outcome; impossible text reports `overflow`
      without clipping.
- [ ] Unchanged `composition_json` **and** unchanged token version serves a cached PNG without
      re-rendering (§2.6).
- [ ] Warm render of one slide < 3s; an 8-slide carousel < 12s.
- [ ] Every `### 2.x` "Done when" has a passing test committed alongside it.

---

## 0.1 Pre-work: Recraft + fal spike (½ day, before any code)

Not part of the render core, but it gates the model registry the whole project pins against. Run it now
while the container is being set up. **No code merged — a written memo only.**

- [ ] On `fal`, confirm the response shape of `recraft/v4.1/text-to-vector` — SVG URL, inline, or zip.
- [ ] Attempt V3 `create-style` → `style_id` → vector generation. **Can you export SVG?**
- [ ] Generate 8 marks from one style clause across 8 different subjects. Eyeball style drift.
- [ ] Run one mark through the sanitiser + role-snapper logic. Measure the ΔE at which fills stop being
      separable against a canonical role palette.
- [ ] Pin exact model slugs for `plate` (fal · nano-banana), `inpaint`, `edit`, `segment`, `vector`.

**Deliverable:** a half-page memo — chosen Recraft path, measured ΔE threshold, pinned registry.

---

## 1. Architecture at a glance

```
 Vercel Pro — one deployment
 ┌──────────────────────────┐         ┌──────────────────────────────┐
 │ /render/[id]  page route │◄────────│ /api/render  function        │
 │   renders <Stage/>       │ navig.  │ @sparticuz/chromium (warm)   │
 │   sets window.__ready    │  +token │ screenshot #stage            │
 └───────────┬──────────────┘         └───────────┬──────────────────┘
             │ reads                               │ writes PNG
             ▼                                     ▼
        post_visuals.composition_json         Supabase Storage
```

The render function points Chromium at **our own page route on the same deployment**. The Phase 4 editor
mounts the same `<Stage/>` in the browser. **One React tree, three consumers, no second renderer, no
drift.** The same `@sparticuz/chromium` setup is reused by the Phase-1 website extractor.

---

## 2. Work breakdown

### 2.0 Migration: `post_visuals` — 0.5 day

The one table Phase 0 owns. `brand_kits` and the rest arrive in Phase 1; this row is what `/render`
reads. **Phase 0 renders against a hardcoded default token set (§2.2), because `brand_kits` does not
exist yet.**

```sql
-- supabase/migrations/<date>_create_post_visuals.sql
create table post_visuals (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references posts(id) on delete cascade,
  slide_index       int  not null,
  composition_json  jsonb not null,
  brand_kit_version int  not null default 1,
  feed_system_id    uuid,                        -- FK added in Phase 1
  rendered_url      text,
  render_hash       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (post_id, slide_index)
);
```

- [ ] Migration in `supabase/migrations/` with the repo's `YYYYMMDD_description.sql` naming.
- [ ] **Access control follows the app pattern, not RLS.** All reads/writes go through
      `createAdminSupabaseClient()` in server code, always filtered to the caller's `agency_id` via the
      `post → client → agency` join. Add a small `agencyOfPostVisual(id)` helper and use it in every
      query. (If the team later decides to adopt real RLS, that's a separate, repo-wide decision — do
      not introduce a one-off policy here.)
- [ ] The render service reads with the service key; that path is server-only and already trusted.

**Done when:** the migration applies clean; a row inserts with a minimal valid `composition_json`; a
unit test proves a query for agency A cannot return agency B's row through the helper.

### 2.1 Scene graph types + validators — 3 days

New module `src/lib/scene-graph/`.

```
src/lib/scene-graph/
├── types.ts          # the discriminated unions from TECHNICAL §5 + BrandTokens (§4)
├── binding.ts        # resolve(Binding<T>, tokens) → T
├── validate.ts       # the no-hex / no-literal-family guards (hand-rolled, no new dep)
├── default-tokens.ts # DEFAULT_TOKENS
├── index.ts
└── __tests__/
    └── scene-graph.test.ts
```

Tasks:

- [ ] Port every type from TECHNICAL §5 verbatim: `Binding<T>`, `Rect`, `Clip`, `BlendMode`, the six
      `*Layer` types, `Composition`, `MarkSlot`, plus `BrandTokens` (§4). `TextLayer.slot` includes
      `kicker | headline | body | cta | caption | label | free` (caption/label support a full type ramp).
- [ ] `resolve<T>(binding, tokens)`: `bound` → look up the dot-path in `tokens`; `literal` → return the
      value. Throw on an unknown token path — a dangling reference is a bug, not a fallback.
- [ ] **The two hard refinements**, as hand-rolled recursive guards over a template's `layers` (no new
      dependency — a full zod mirror is a fast-follow if the surface grows):
      - no string anywhere in the `layers` blob matches `/#[0-9a-f]{3,8}/i`
      - no `TextLayer.family` is a `literal` — a shared composition binds families, never names one
- [ ] CI job runs `validate` over every row in `compositions` and `pack_elements`. A hex literal fails
      the build. (These tables are empty until Phase 1/2; the CI job is written now and passes trivially.)

**Done when:** the six fixtures validate; a fixture with a hex literal fails with a readable error;
`resolve` is 100% covered.

### 2.2 The `<Composition/>` renderer + default tokens — 5 days

New module `src/lib/renderer/` (pure React, **no server-only imports** — both the render route and the
Phase 4 browser editor import it).

```
src/lib/renderer/
├── Stage.tsx           # 1080×1350 root; sets CSS role variables; signals ready
├── Composition.tsx     # maps layers[] → components in array order
├── layers/             # PlateLayer, MarkLayer, TextLayer, ChromeLayer, ShapeLayer, GroupLayer
├── chrome/             # rule, corner-frame, dot-grid, arc, badge, numeral, index-dots
├── useTokenVars.ts     # tokens → { '--role-accent': '#…', … }
└── default-tokens.ts   # DEFAULT_TOKENS: BrandTokens — the neutral default kit
```

Tasks:

- [ ] **`DEFAULT_TOKENS`** — a valid `BrandTokens` (neutral: achromatic `surface`/`ink`, one accent,
      `accent-deep`, `line`; `Inter` display + body; scale 1.25). This is Phase 0's only token source.
      It is also the kit Phase 1 assigns to clients with no extraction. Five colour roles, per
      TECHNICAL §4.
- [ ] `<Stage>` sets `--role-*` custom properties from the token set, `lang` on the root, `#stage` id,
      fixed 1080×1350 box.
- [ ] `<Composition>` renders `layers` in array order — index 0 paints first (bottom). Document order
      is paint order; there is no `z-index` field.
- [ ] Each layer resolves its `Binding` props through `resolve` against the token set.
- [ ] `MarkLayer` inlines a stored, sanitised SVG string and lets its inline
      `style="fill:var(--role-accent)"` resolve against Stage's variables; `roleOverrides` set a scoped
      variable on the element. **Phase 0 uses a hand-authored sanitised SVG fixture** (real marks and
      `clip: {kind:'mark'}` arrive with packs in Phase 2 — the code path exists but is exercised later).
- [ ] `TextLayer`: `lang` per layer, `case`, `tracking`, and `autoFit` (§2.4). Text is always a real
      DOM node, never drawn into anything.
- [ ] `blendMode` → CSS `mix-blend-mode`; `clip` → `clip-path` (rect/ellipse) or an SVG `clipPath`.
- [ ] Signal readiness: `<Stage>` awaits `document.fonts.ready` and every `<img>` `decode()`, then sets
      `window.__stageReady = true`.

**Done when:** the six fixtures render in a local browser and match committed **in-container** snapshots
(within tolerance — see §2.7); a two-plate fixture with `multiply` + rect `clip` composites correctly.

### 2.3 The app render route — 1 day

```
src/app/render/[postVisualId]/page.tsx
```

- [ ] Server component. Loads `post_visuals` by id, verifies the short-lived signed `token` (§2.5) — not
      a user session; the render service is not logged in.
- [ ] **Resolves tokens from `DEFAULT_TOKENS` in Phase 0.** (Phase 1 swaps this for a real `brand_kits`
      row pinned at `brand_kit_version`. Leave a single `getTokensForRender(row)` seam so Phase 1 is a
      one-function change.)
- [ ] Renders `<Stage><Composition/></Stage>` and nothing else. No app chrome, no nav, transparent page
      background.
- [ ] Injects `@font-face` for the kit's families. **Baked families (§2.5) load from a local path;**
      only non-baked families fetch a Google Fonts subset URL. `font-display: block` so nothing paints
      in a fallback. Subsets include `cyrillic,latin`.

**Done when:** hitting the route in a browser shows one slide, fonts loaded, `window.__stageReady` true.

### 2.4 Text measurement / autoFit — 2 days

Runs in Chromium, in the renderer.

- [ ] `TextLayer` with `autoFit: {min,max}` renders at `size`, measures `scrollHeight` vs the box, and
      steps `size` down by the type scale until it fits or hits `min`.
- [ ] Report the outcome on the element as `data-fit="ok | shrunk:N | overflow"` so the service can read
      it back after render.
- [ ] If still overflowing at `min`, do **not** clip. Leave `overflow` and mark `data-fit="overflow"` —
      the generation pipeline (Phase 4) turns that into a copy-shorten or a flag.

**Done when:** a fixture with a deliberately long Bulgarian headline shrinks one step and reports
`shrunk:1`; an impossible one reports `overflow` without clipping.

### 2.5 Render function (Vercel Pro + `@sparticuz/chromium`) — 4 days

**Hosting is locked: Vercel Pro.** Chromium runs inside its own Vercel serverless function via
`@sparticuz/chromium` + `playwright-core` — single vendor, no second bill. Pro supplies the longer
`maxDuration` and the memory this needs, and **Fluid Compute** keeps a warm browser across invocations.
Keep it isolated in one route so the Chromium dependency never bloats the rest of the app bundle (the
~250 MB function unzipped limit is unchanged by the plan tier).

```
src/app/api/render/route.ts     # the render function
src/lib/render/browser.ts       # module-level browser singleton; relaunch if disconnected
src/lib/render/render.ts        # navigate → wait → screenshot → upload
src/lib/render/service.ts       # renderService.render(postVisualId) — swappable seam
src/lib/render/fonts/           # baked WOFF2, incl. a verified Bulgarian-locl family
```

- [ ] `export const runtime = 'nodejs'`, `export const maxDuration = 300`, high memory. Launch with
      `@sparticuz/chromium`'s `args` / `executablePath`.
- [ ] **Warm-browser singleton** at module scope, reused across warm invocations (Fluid Compute);
      relaunch if `browser.isConnected()` is false. Never cold-launch per request when avoidable.

**Fonts (this is where the Bulgarian bug hides):**

- [ ] Bundle WOFF2 for the default families **and at least one family with confirmed Bulgarian `locl`
      alternates.** Do **not** assume Inter or Noto Sans carry them — verify against a specimen first
      (candidates to check: Nunito, PT Sans, Source Sans 3). Register them so the `/render` page paints
      without a Google fetch; only exotic families fetch remotely.

**Token contract:** the caller mints an HMAC-SHA256 token over `{postVisualId, exp}` with
`RENDER_TOKEN_SECRET` (base64url, TTL 120s, single-`postVisualId` scope); the `/render/[id]` route
verifies it before loading anything. Chromium navigates to `${APP_BASE_URL}/render/{id}?token=…` on the
same deployment.

**Env vars (server-only):** `RENDER_TOKEN_SECRET`, `APP_BASE_URL`. Storage + DB reuse the app's existing
`createAdminSupabaseClient()` — no separate service credentials. Never expose to the browser; there is no
client-side render call.

**Error contract for the render call:**

| Case | Response |
| --- | --- |
| bad/expired token | 401, no body |
| `postVisualId` not found | 404 |
| `__stageReady` not set within 15s | 504, `{error:'render-timeout'}` |
| a plate/image URL 404s or hangs | still screenshot at 15s; the missing layer falls back to its token gradient |
| screenshot/upload failed | 502, `{error, retryable:true}` |
| success | 200, `{url, hash, fit: FitReport[]}` |

Tasks:
- [ ] `render(postVisualId, token)`: verify token → load row → build app URL → `page.goto` →
      `waitForFunction(() => window.__stageReady)` capped at 15s → `#stage` screenshot → read back
      `data-fit` → upload to `renders/{postVisualId}/{hash}.png` → return `{url, hash, fit}`.
- [ ] Render an 8-slide carousel by reusing one browser context across slides, sequentially.
- [ ] Expose it behind `renderService.render(postVisualId)` (`service.ts`) so moving Chromium to a
      dedicated container later (Fly.io / Railway) is a one-file change if Vercel latency disappoints.

**Done when:** calling the render function for a seeded `post_visuals` id returns a correct PNG URL in
under 3s warm; 8 slides in under 12s; a dead image URL still returns a complete PNG, not a hang.

### 2.6 Render hashing + cache — 1 day

- [ ] `render_hash = sha256(canonicalize(composition_json) + brand_kit_version + rendererVersion)`.
      Canonicalise key order so semantically-equal JSON hashes equal. Include `rendererVersion` so a
      renderer bugfix re-renders old posts.
- [ ] Before rendering: if `post_visuals.render_hash` matches and `rendered_url` exists, return it.
- [ ] On success: store `rendered_url` and `render_hash`.
- [ ] A brand-kit version bump changes the hash for every dependent row — this is what makes Phase 7
      propagation a re-render rather than a rebuild. **Verify:** bumping the version alone (composition
      unchanged) must dirty the hash, or rebrand silently no-ops.

**Done when:** re-requesting an unchanged slide serves the stored PNG with no Chromium launch; a
one-property edit forces exactly one re-render; a version bump with no composition change also forces a
re-render.

### 2.7 Reference compositions — 3 days

There is nothing to migrate (no Satori, no templates). Author a small set from scratch to prove the
schema generalises and to give Phase 1's previews something real to render.

- [ ] Author 4–5 `Composition` fixtures — cover, statement, list, quote, cta — referencing tokens only,
      no hex, no font names.
- [ ] Cover a spread of layer types: plate + scrim + text, two-plate blend, mark(fixture SVG) + text,
      text-only.
- [ ] **Golden-image test, in-container:** snapshots are generated **inside the render container image**
      and compared with a pixel tolerance (e.g. `pixelmatch` at a small threshold) — never against a dev
      machine's output, and never "eyeballed against hand-drawn references." A deliberate layout shift
      fails CI.
- [ ] These become the seed compositions the three starter feed systems draw from in Phase 1.

**Done when:** all reference compositions render correctly, their in-container snapshots are committed,
and a deliberate layout regression fails CI.

---

## 3. Sequencing

```
0.1 spike ─┐
2.1 types ─┼─► 2.2 renderer+DEFAULT_TOKENS ─► 2.3 route ─┬─► 2.5 service ─► 2.6 cache ─► 2.7 reference comps
           │                                 2.4 autoFit ┘
```

2.1 and 2.2 are the critical path. 2.4 folds into 2.2's second week. 2.5 can start against a stub route
as soon as 2.3 exists. 2.7 gates Phase 1's previews.

---

## 4. Risks specific to Phase 0

| Risk | Mitigation |
| --- | --- |
| Chromium cold start dominates latency | Vercel Pro Fluid Compute keeps the browser singleton warm; `renderService` seam allows moving to a container if latency disappoints |
| Font subset fetch inside Chromium adds ~1s | bake the default + Cyrillic families; fetch only exotic ones |
| `lang="bg"` localised forms silently wrong | bake a **verified-`locl`** family; golden specimen test in the DoD |
| Golden snapshots flaky across machines | generate & compare **in-container**, with a pixel tolerance |
| Rendering against no real tokens yet | `DEFAULT_TOKENS` is the single source in Phase 0, swapped by one seam in Phase 1 |
| Render token leaks | short TTL, single-`postVisualId` scope, constant-time compare |

---

## 5. What Phase 0 deliberately leaves out

Extraction (Phase 1). Any editing surface. Photograph generation. Recraft marks. The `Visual system`
UI. Everything visible. Phase 0 is the foundation the visible work stands on: a render service, a typed
scene graph, and a renderer shared by the future exporter and editor.
