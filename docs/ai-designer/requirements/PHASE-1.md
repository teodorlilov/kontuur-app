# Phase 1 — Design System: Detect & Author

> **Goal:** turn a website **or a reference image** into a client's brand kit, let an operator edit it,
> and let an agency pick a feed system — all inside the existing onboarding and client-settings flows.
> **Covers:** F-1, F-2, F-3, F-4. (Feed-system *authoring*, F-5, is Phase 2.)
> **Depends on:** Phase 0 — the render service and `<Composition/>` are reused for extraction and for
> every preview.
> **Estimate:** 4–5 weeks, one engineer.

Two halves that share a data model but nothing else: **detect** (extraction, needs the browser) and
**author** (the `Visual system` editor, needs nothing). Build detect first — author has something to
show once a kit exists.

---

## For the implementing agent — read first

**Prerequisite:** Phase 0 is merged. The render service and the `src/lib/renderer` package exist and are
imported here for every preview.

**Repo facts you must build on (confirmed — do not re-litigate):**

- **No colour/font data exists on any client today.** `clients` has `{agency_id, language, name, niche,
  posts_per_week, website_url, contact_email}`; `brand_profiles` holds the *verbal* identity (`tone`,
  `content_pillars`, `target_audience`, `is_health_niche`, `secondary_language`). There is **no palette
  to back-fill from** — every existing client gets the neutral **`DEFAULT_TOKENS`** kit (§1).
- **A website analyzer already exists** — `src/ai/analyze-url/analyze-url.ts` (Claude on scraped page
  text → niche, tone, pillars, language, health flag). **Reuse it for the verbal layer.** It has no
  browser, so it cannot see colours or fonts — the *visual* layer is a new pass in the Phase-0 Chromium
  container.
- **Access control is app-level** (`createAdminSupabaseClient()` + `agency_id` filter), not RLS. New
  tables follow that pattern — there is no `posts` RLS policy to mirror.
- **There is no background-job queue** and only **2 crons** (`generate`, `publish`) — the plan's limit,
  so you **cannot add a cron**. The async mechanism is spelled out in §2.3.
- **Column names:** primary language = `clients.language`; secondary = `brand_profiles.secondary_language`;
  health flag = `brand_profiles.is_health_niche` (not `clients.is_health`).

**Ground rules:**

1. **One task at a time, numbered order.** Detect (§2.x) fully before Author (§3.x).
2. **Reuse Phase 0's renderer for every preview.** Mount `<Composition/>` client-side. Do not build a
   second rendering path for the 3×3 grid.
3. **Reuse `analyze-url` for the verbal layer.** Do not re-implement niche/tone/pillar detection.
4. **Build the shared components once (§5) and import them.** The Review step and the settings tab use
   the same `TokenEditor`, `PreviewGrid`, `FeedSystemPicker`. Duplicating them is the failure mode.
5. **Do not touch the copy-generation interview.** Extraction runs alongside it, never inside it.
6. **The font filter is the subtle one.** "Filter, don't warn" — a broken family is never *offered*.
7. **Ask before inventing** table names or the vision-call prompt shape. Commit per task:
   `phase1(2.1): visual extractor`.

**Resolution order for ambiguity:** this document → `COMPOSITION-ENGINE-TECHNICAL.md` §3/§4/§7 → repo
conventions → ask.

---

## 0. Definition of done

- [ ] Onboarding a client by URL produces a brand kit whose colours/fonts **visually match the live
      site** (not a "reference file"), with confidence badges, adding **zero perceived latency**.
- [ ] Onboarding by **reference image** produces an equally-first-class kit with fonts `guessed · confirm`.
- [ ] Skipping the URL produces the `DEFAULT_TOKENS` kit; the client is still renderable.
- [ ] The Review step shows tokens, a live preview, and the feed-system picker in the client's own colours.
- [ ] `Clients → [client] → Visual system` edits every token; changing a colour re-renders a 3×3 preview
      instantly, client-side, with no request.
- [ ] The font picker only offers families covering the client's post languages.
- [ ] Saving states the propagation consequence (the re-render engine is Phase 7; the copy ships now).
- [ ] **No prices are shown anywhere** (no "$0 line" on any card).

---

## 1. Data model

Ships `brand_kits` and `client_feed_systems` from TECHNICAL §3, plus the three starter feed systems as
seed rows.

`tokens` follows `BrandTokens` (TECHNICAL §4), with these Phase-1 refinements — validated by a zod
schema on write:

- **Colour: exactly five roles** — `surface`, `ink`, `accent`, `accent-deep`, `line`. One per painted
  element; reject a `tokens` blob missing any.
- **Type: `display` + `body` families**, each `{ family, weights[], tracking, case, lineHeight }`, plus
  `scale` (ratio) and `baseSize`. The H1/H2/caption/label ramp is these two families at scale steps,
  driven by the `TextLayer` slot — not extra families.
- **Spacing:** `space.steps: number[]` (e.g. `[4,8,12,16,24,32,48,64,96]`) plus `radius`, `hairline`.
- **Grid:** `marginX`, `marginY`, `baseline`.

> **Scope note — the "rich" design system is mostly Phase 2/3.** The graphic-language layer (grain,
> halftone, texture, decorative marks), the eight slide templates, and composition rules from the Haelan
> example live on the **feed system**, authored later. Phase 1's brand kit is deliberately the atoms —
> colour, type, spacing, subjects. Do not stuff feed-system concerns into `brand_kits`.

- [ ] `brand_kits` table, `unique (client_id)`. Access via the admin client + `agency_id` filter.
- [ ] `client_feed_systems` join table, with a partial unique index `(client_id) where is_default`.
- [ ] Add the nullable `feed_system_id` FK to `post_visuals` (left nullable by Phase 0's 2.0).
- [ ] Seed `feed_systems` with **Editorial / Bold blocks / Quiet grid** as parameter rows
      (`photographic`, `font_reqs`, `rhythm`, `mark_style`, `plate_budget` from the product doc's §3
      starter table). Packs and compositions stay empty until Phase 2 — previews here use the Phase-0
      reference compositions with **placeholder marks**.
- [ ] **Backfill = default kit for everyone.** An idempotent migration writes one `brand_kits` row per
      existing client using `DEFAULT_TOKENS` (there is no palette to read). Per-client
      *Re-analyze from website* (§3.1) upgrades on demand.

**Done when:** every client has exactly one brand kit; a `tokens` blob missing `accent` is rejected; a
query for agency A cannot read agency B's kit through the helper.

---

## 2. DETECT

Extraction is an **ensemble**, not a single oracle (see the tool map): the browser *measures*, vision
*judges*, code *clusters*, the operator *confirms*.

### 2.1 Website extractor — 5 days

A new extractor that reuses the Phase-0 `@sparticuz/chromium` setup — its own Vercel function with
`maxDuration = 300` (Pro). **Website and image are peers — neither is "primary."**

```
src/app/api/extract/route.ts
```

Pipeline (URL path):

- [ ] `page.goto(url)`, wait for network idle + `document.fonts.ready`. On block/timeout → fail soft to
      the default kit + the reference-image affordance (never hard-fail onboarding).
- [ ] **Measure, in-page** (`page.evaluate` → `getComputedStyle` on h1–h3, body, buttons, links, largest
      backgrounds): resolved `font-family`, `color`, `background-color`, `font-size`, `letter-spacing`,
      `margin`. → badged **`measured`**.
- [ ] **Cluster** (code): colours by frequency × painted area → `surface`, `ink`, `accent`,
      `accent-deep`, `line` (`line` = the common border colour, else a low-contrast tint of `ink`).
- [ ] **Type scale** (code): fit a ratio to the observed size ladder → `scale`, `baseSize`, `lineHeight`.
- [ ] **Screenshot** 1440×2400 → **Claude vision**, qualitative only: which measured colour is truly the
      accent, mood, subject + motif vocabulary, feed-system recommendation signal. → badged **`inferred`**.
- [ ] **Verbal layer:** call the existing `analyze-url` (scraped text) for niche/tone/pillars/health →
      writes `brand_profiles`. Do not duplicate it.
- [ ] *(optional, evaluate)* a Brandfetch-style domain lookup as a fast first pass for logo + colours;
      treat as a supplement — coverage is thin for small/local businesses.
- [ ] Emit an `ExtractionReport` tagging every field `measured` / `inferred` / `guessed`.

**Done when:** `haelan.bg` returns tokens that visually match the live site (colours `measured`, mood
`inferred`), plus a feed-system recommendation; a bot-blocked URL falls back cleanly.

### 2.2 Reference-image extractor — 2 days (a first-class path)

Runs in the app (no browser). Often *more* reliable for "the look" than scraping a site.

- [ ] k-means over pixels weighted by area → palette; map to roles by luminance + saturation.
- [ ] **Claude vision** → mood, subject + motif vocabulary, and a **font category** only.
- [ ] Propose the three nearest curated families in that category. Fonts badged **`guessed`**.

**Done when:** one reference image yields a plausible kit; no font is ever labelled `measured`.

### 2.3 Async wiring into onboarding — 3 days

The existing flow is `entry (Start) → loading (Analyzing) → interview → review`
(`src/features/onboarding/components/onboarding-shell.tsx`). Add extraction **without a cron and without
a Vercel function that lives for 25s**:

- [ ] On step-1 submit, the route kicks the extractor with **`waitUntil()`** (`@vercel/functions`) so the
      request returns instantly while the function keeps running up to `maxDuration` (300s on Pro). No
      new cron, no separate service.
- [ ] The extractor writes progress/result to a new `brand_kit_extractions` row `{ onboarding_session_id,
      status, tokens, report }`.
- [ ] Add two **non-blocking** Analyzing rows: *Extracting colours and type*, *Building visual system*.
      They must not gate the Continue button.
- [ ] The operator proceeds through the interview (~4 min). The **Review step subscribes to the
      `brand_kit_extractions` row via Supabase realtime**; if not ready it renders a skeleton and
      hydrates in place.
- [ ] `Skip — I'll answer manually` → no extraction → `DEFAULT_TOKENS` + an *Upload a reference image*
      affordance in `Visual system`.
- [ ] Extraction failure → default kit, reason surfaced, onboarding never blocks.

**Done when:** a full onboarding by URL adds no measurable wait; a skipped one still finishes with a
renderable client; killing the container mid-extract still lets onboarding complete on the default kit.

### 2.4 Review step UI — 3 days

Extends the existing Review screen, built from the §5 shared components, on Kontuur's light surfaces.

- [ ] **Tokens block:** five colour chips, display + body families, each with its badge
      (`measured` / `inferred` / `guessed · confirm`).
- [ ] **Live preview:** a 3×3 grid of real compositions in the proposed tokens, via the Phase-0 renderer
      **client-side**. The preview must load the **same font files the container uses** (same
      `@font-face` source) or it won't match the export — this is the one drift users notice.
- [ ] **Confirm-fonts gate:** if any font is `guessed`, the operator must confirm before finishing.
- [ ] **Feed-system picker (F-3):** three cards, same headline, same palette, each a real slide +
      six-cell grid in the client's colours; one recommended with its reason; a font-requirement conflict
      is **named, not silently substituted**. `Quiet grid` says *"never generates a photograph"* — **no
      price on any card.**
- [ ] Accept → writes `brand_kits` + `client_feed_systems (is_default)`.

**Done when:** Review for `haelan.bg` shows correct green tokens, a live preview matching what a render
would export, and three pickable systems — before the operator has seen a single generated post.

---

## 3. AUTHOR

### 3.1 `Visual system` settings tab — 4 days

New tab in `Clients → [client] → Settings`, a sibling of `Brand profile`. Mirror the shipped pattern
exactly.

- [ ] `src/features/clients/components/settings/visual-system-tab.tsx`, added to `settings-nav.tsx`,
      matching `brand-profile-tab.tsx` (left sub-nav, right pane, serif heading, `Cancel / Save changes`).
- [ ] **Colour:** five role editors; editing any re-renders a live 3×3 preview instantly, client-side,
      no network (CSS-variable swap, per TECHNICAL §8.5).
- [ ] **Type:** display + body pickers (§3.2), scale, tracking, case, line-height.
- [ ] **Subjects:** editable photographic + motif vocabularies (chips).
- [ ] **Feed system:** current system with a `Change` action (re-opens the F-3 picker).
- [ ] `Re-analyze from website`: re-runs 2.1 against `clients.website_url` — never asks for it again.
- [ ] Upload a reference image → runs 2.2 to seed/replace tokens.

**Done when:** an operator changes `accent` and watches nine previews recolour with no save and no request.

### 3.2 Font picker + language filter — 3 days

The subtle, high-value piece. Filter, don't warn.

- [ ] Curated library of ~50 Google families with metadata (category, weights, variable axes, **subsets**)
      cached locally — do not hit the Google Fonts API per keystroke.
- [ ] `requiredSubsets = scripts(clients.language) ∪ scripts(brand_profiles.secondary_language)`.
- [ ] The picker **only lists families covering `requiredSubsets`.** English-only keeps the full Latin
      library; a Bulgarian client never sees a Latin-only face.
- [ ] Families that break the assigned feed system's `font_reqs` sit behind *"Show all — may break this
      system."*
- [ ] A bilingual client needs one family covering both scripts; never pair two.
- [ ] Custom upload: WOFF2/TTF/OTF, agency-scoped, parse the `cmap` for real coverage (not the filename),
      store in Supabase Storage.
- [ ] **Language-change re-check:** if the operator changes a client's languages and a current family no
      longer covers them, flag it here — the one place a warning is correct.

**Done when:** switching a client to Bulgarian removes Latin-only families; switching back restores them;
a family lacking the new script raises a flag, not a silent break.

### 3.3 Save + propagation copy — 2 days

The re-render engine is Phase 7. The **honesty** ships now.

- [ ] On `Save changes`, count dependent posts by status (draft / scheduled / published), scoped by
      `agency_id`.
- [ ] Show the consequence before the click: *"Saving will re-render 12 drafts automatically. 3 scheduled
      posts will ask first. Published posts are never changed."*
- [ ] Bump `brand_kits.version` on save (dirties the Phase-0 render hashes for Phase 7).
- [ ] Thread `brand_profiles.is_health_niche` into the stored photographic `negative` so Phase 3+ inherits
      the clinical exclusions.

**Done when:** saving a colour change shows correct dependent counts and increments the version; no
re-render fires yet (Phase 7), but the promise on screen is accurate.

---

## 4. Sequencing

```
1 data model ─► 2.1 website ──┬─► 2.3 async wiring ─► 2.4 review ─┐
               2.2 image ──────┘                                   ├─► 3.1 settings ─► 3.2 fonts ─► 3.3 save
                                                                   (author reuses review's components)
```

Detect before Author: the settings tab is pointless until a kit exists, and 2.4's Review UI and 3.1's
settings UI share the token-editor and preview components — build them in 2.4, reuse them in 3.1.

---

## 5. Shared components to build once

| Component | Built in | Reused in |
| --- | --- | --- |
| `TokenEditor` (5 colour roles + type) | 2.4 | 3.1 |
| `PreviewGrid` (3×3 live compositions, font-parity loaded) | 2.4 | 3.1, F-3 picker |
| `FeedSystemPicker` (3 cards) | 2.4 | 3.1 `Change` |
| `ConfidenceBadge` | 2.4 | 3.1 |
| `FontPicker` (language-filtered) | 3.2 | onboarding + settings |

---

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| Extraction slower than the interview | it runs *during* the interview; Review skeletons if late |
| A site blocks headless browsers | fall back to the default kit + the reference-image path; never hard-fail |
| No palette to back-fill from | that's expected — everyone starts on `DEFAULT_TOKENS`, upgrades via re-analyze |
| Colour clustering picks a junk accent | vision re-picks it; Review is a *proposal* the operator adjusts |
| Live preview ≠ exported PNG | load the container's exact fonts client-side; same `@font-face` source |
| Vision invents a subject vocabulary | badge it `inferred`; editable in `Visual system` |

---

## 7. Explicitly deferred

- Feed-system **authoring** (F-5), the style pack, motif generation, and the richer graphic-language /
  template layer → Phase 2.
- Any actual re-render on save → Phase 7.
- The slide editor → Phase 4.
- Instagram-grid extraction (`source_kind: 'instagram'`) → after Meta permissions clear.
