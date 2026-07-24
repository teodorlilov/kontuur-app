Product Requirement Document (PRD)

Enterprise AI Carousel Creator & Automated Brand Engine


1. Product Vision & Value Proposition
This platform transforms raw business data (websites/social accounts) into highly engaging, consistent, multi-slide social media carousels. It eliminates the need for manual design skills. By combining brand data extraction with context-aware AI design, the application solves the "blank canvas" problem while ensuring every post looks professional, on-brand, and completely unique.


—————

## Implementation Status

**Phase 1 — Brand Visual-Identity Foundation — SHIPPED, then SLIMMED 2026-07-21** (branch
`feat/ai-visual-flow`, commits `ef575e8` → `bf27e38` → `71eb9e0`).

✅ **Implemented (current state)**
- **Brand extraction (§2):** onboarding extracts a **Color Palette** (5 colour roles: surface / ink /
  accent / accent-deep / line, WCAG-AA guaranteed) — on top of the pre-existing text extraction (name,
  niche, tone, pillars). Stored per client in `brand_visual_identity`; since Phase 3 the identity is
  `{ palette, style, palette_description? }` (style = user-chosen brand style, description = Haiku-written
  palette prose for image prompts).
- **Our own site capturer (not a 3rd-party API):** hardened headless Chromium
  (`src/lib/visual/capture/capture-site.ts`) — consent-overlay dismissal, tracker blocking, settle
  waits, bot-wall detection, retry, concurrency cap. Colours are **measured** via `getComputedStyle`
  and mapped deterministically by `deriveColorRoles`.
- **Fallback** so onboarding never blocks/errors: measured site → neutral default palette. Runs
  **async during the interview** (`/api/extract/start` via `after()`, Review polls `/api/extract/status`).
- **UI:** palette swatches + "Re-analyze from website" in the onboarding Review step and the
  Settings → Visual identity tab. Shared `VisualIdentityPanel` powers both surfaces.

⚠️ **Retired 2026-07-21 (supersedes parts of this PRD below)**
- **The 4 Vibe Presets (§3) are gone** — prompt-modifier matrices, negative prompts, guessed typography
  pairings, preset picker. Replaced by the **Brand Style registry** in the Phase 3 plan below.
- **The Claude-vision screenshot pass is gone** — the identity keeps only what is measured.
- **The first Phase-3 build (Recraft/FLUX backdrops + Konva compose) was removed** — over-prompted,
  produced off-topic visuals. Superseded by the `gpt-image-2` plan below (validated by hand).
- Migration `supabase/migrations/20260721_strip_legacy_visual_identity_fields.sql` strips the retired
  keys from stored rows.

—————

## Phase 3 — Visual Generation via `fal-ai/gpt-image-2` — SHIPPED 2026-07-22 (commit `357ca7b`)

**Core idea:** one short, conscious prompt per slide with exactly **three variables** — the slide TEXT,
the COLOR PALETTE (human-readable), and a STYLE paragraph — and an explicit "don't add text"
instruction. The image model reads the slide copy directly; no concept planner, no negative prompts,
no per-preset prompt matrices. One 1024² jpeg per slide, stored as a regular `post_images` row —
publishing needed **zero changes**.

**Shipped surfaces:**
- **Generation tab (wizard):** visuals **auto-generate** as each post's copy streams (concurrency 6 —
  a full carousel completes in one ~60s wave; per-slide progress, retry, regenerate; run-level
  "Generating visuals x/y" counter). Approve is never blocked — finished visuals attach to the new
  post row (`POST /api/posts` `images[]`), pending ones are aborted (add later in Calendar); discard
  deletes the draft files. Drafts stay in-memory; images upload statelessly to
  `post-images/{clientId}/drafts/` until approve.
- **/review tab:** images load server-side with the page (one indexed `post_images` query),
  "✨ Generate visuals (N)" button (stays visible with a spinner while running, N counts down),
  per-slot AI generate/regenerate/upload, N/M visuals badge in the post list.
- **Calendar:** per-slot generate/regenerate + bulk "Generate visuals (N)" for carousels; hidden for
  published/publishing posts. Image state uses functional upserts so concurrent completions never
  clobber each other.
- **Client approval page:** read-only visual previews per slide and for single posts — clients see
  what they approve.
- **Client details → Visual identity:** Brand style picker (portrait preview cards + full-size
  lightbox), palette editor; palette edits invalidate the stored palette description (regenerated on
  next use).
- **Everywhere an image exists:** full-width preview card (uncropped, ≤280px) with corner
  regenerate/delete actions and click-to-enlarge (`ImageLightbox`).
- Copy sanitization for prompts (URLs/#hashtags/@mentions stripped, word-boundary clamp); style prompts
  are colour-free — the measured palette is the only colour source. Cron posts get visuals manually via
  /review. Rewrites and copy edits never auto-regenerate visuals (the AI art is never re-rolled; since
  2026-07-24 they DO auto-re-bake the overlaid text — Phase 4 §6).

### The prompt contract (`buildVisualPrompt`, pure function)

```
create a visual for social media for this slide
TEXT - Slide {n} of {total}
{slide-role hint — cover / rich middle / quiet middle / CTA, see below}

Headline: {headline}
Body: {body}

COLOR PALETTE

{palette_description}

STYLE

{style.prompt}

Use the palette as the visual color foundation. Don't add text, just illustration relevant to the data the visual is for
```

- **Carousel:** one prompt (→ one image) per `slides_json` entry.
- **Single post:** `TEXT - Single image post` + the post caption (clamped ~500 chars).
- **§6.1 shipped 2026-07-24:** each carousel TEXT block now carries a one-line **slide-role hint**
  right after `Slide {n} of {total}` (`slideRoleHint` in `prompt.ts`, deliberately colour-free).
  The rhythm **alternates**: cover = one bold dominant focal subject; interior slides swing by
  parity between "richly detailed — embrace the full style" (even positions) and "quiet — a
  restrained, minimal take, ONE small supporting subject, mostly plain background" (odd); last =
  one simple structured CTA element on a mostly plain background. Every hint names the exact
  zones that must stay calm for baked text (top quarter + lower half). Wording is deliberately
  spatial and quantitative — the first, adjective-only version ("calm, generous negative space")
  lost to the maximalist style paragraph and every slide came out equally dense. Single posts
  unchanged.

### 1. Palette → human-readable description (Haiku)
`describePalette(palette)` (`src/lib/visual/describe-palette.ts`): one Haiku call (`callAnthropic` +
`LIGHT_MODEL`, tool-use schema) turns the 5 hexes into the validated block
("Dominant background: white … Palette character: cool, clean, modern…"). Stored as
`identity.palette_description`:
- generated eagerly at extraction; palette edits strip it; generation self-heals if missing;
- Haiku failure fallback: deterministic `role: hex` lines (gpt-image-2 reads hex fine).

### 2. Brand Styles — scalable registry, user-selected per client (replaces §3 presets)
`src/lib/visual/brand-styles.ts`: `BrandStyle = { id, name, description, prompt, previewSrc }`.
**Adding a style = one registry entry + one preview jpg** (`public/brand-styles/<id>.jpg`).
Two launch styles (prompts deliberately **stripped of all colour words** — the client palette is the
only colour source):
- **`graphic-editorial` (default):** contemporary editorial graphic design — modernist campaign,
  experimental magazine art direction, condensed sans + editorial serif contrast, asymmetric modular
  grid, analog collage/photocopy/halftone texture, editorial annotations, premium studio aesthetic.
- **`clinical-luxury`:** premium beauty-editorial — high-end close-up photography, minimalist
  Swiss layouts, generous negative space, refined editorial metadata; sensual, clinical, aspirational.

Selection stored as `identity.style` (zod enum + default → pre-Phase-3 `{ palette }` rows parse with no
migration). Preview images are user-curated references in `docs/desing-system-preview/`, copied to
`public/brand-styles/`.

**Style picker UI (client details → Visual identity tab):** a "Brand style" card grid — portrait
preview, name, one-liner, selected ring, zoom-to-lightbox. Scales with the registry; onboarding
silently applies the default.

### 3. fal adapter
`src/lib/visual/fal.ts` (`@fal-ai/client`, already a dep): `fal-ai/gpt-image-2`, 1024×1024, quality
medium, jpeg, 1 image. Credentials passed explicitly from `FAL_API_KEY` (lib default is `FAL_KEY`).
~52s/image. No auto-retry — regenerate is one click.

### 4. API — one image per request (as built)
Both routes share one pipeline (`src/lib/visual/generate-visual.ts`: identity → prompt → fal →
downloaded bytes) and are **rate-limited** (`VISUALS_RATE_LIMIT`, 60 per 10 min per user — above real
throughput at concurrency 6, stops runaway spend):
- **`POST /api/posts/[id]/visuals` `{ position }`** (`maxDuration = 120`) — persisted posts (review +
  calendar): auth + ownership → derive the TEXT block from the actual `slides_json`/caption →
  generate → `uploadPostImage` → replace-at-position → insert `post_images` → return `{ image }` in
  the upload route's shape. **Replace happens only after a successful generation + upload**, so a
  failure never loses the current image.
- **`POST /api/ai/generate-visual`** — wizard drafts (no `posts` row yet): client-ownership check →
  generate → upload under `{clientId}/drafts/{draftId}/` → return `{ position, publicUrl,
  storagePath }`. `DELETE` on the same route removes a discarded draft's files (paths must live under
  the client's drafts prefix).
- **`POST /api/posts`** accepts `images[]` and inserts the `post_images` rows atomically with post
  creation (attach-on-approve; only draft-prefix paths of that client are accepted).

A batch route would blow serverless limits at ~52s/image, so **the client orchestrates** multi-slide
runs (shared concurrency-6 semaphore, per-slot progress, per-slide retry for free). A unique index on
`post_images(post_id, position)` (migration `20260722`) makes overlapping same-slot inserts a clean
error instead of a duplicate carousel slide.

### 5. Carousel copy structure (fixed alongside — feeds the visuals their TEXT)
The requested slide count is now honoured: count-aware `carouselStructureRules(n)` (a 3-slide request
collapses to cover → core insight → CTA instead of contradicting the 4-role checklist), "EXACTLY N
slides" prompt wording, `minItems`/`maxItems` pinned on the generator's output schema, and a ~30-word
slide-body bound (keeps slides design-fit and image prompts tight). The validator grades against the
same count-aware rules.

—————

## Phase 4 — Konva Canvas Text-Overlay Editor + Auto-Compose — SHIPPED 2026-07-23 (commit `30a3ba4`)

**Core idea:** the editable source of truth per slide is a small **canvas doc** (`post_canvas_docs`,
one row per `(post_id, position)`): text layers + a contrast scrim over the CLEAN (text-free) AI
image. The flattened 1080×1350 jpeg in `post_images` stays the publish artifact — publishing needed
zero changes again. Every visual now ships **with copy baked in automatically** ("auto-compose");
the editor is for refinement, not a mandatory step.

### 1. Format change: the 4:5 pipeline

Generation moved from 1024² to **1088×1360** (`FAL_IMAGE_SIZE` in `src/lib/visual/fal.ts` —
gpt-image-2 needs multiples of 16; 1088×1360 is exact 4:5). The canvas authors and exports at
IG-recommended **1080×1350** (`CANVAS_WIDTH`/`CANVAS_HEIGHT` in `src/lib/canvas/constants.ts` —
the ONLY place these numbers exist). 3:4 was rejected: the IG Graph API (our auto-publish path)
hard-rejects anything taller than 4:5. Legacy 1024² squares cover-crop centered in the editor
(`src/lib/canvas/cover-crop.ts`); publishing passes only `image_url`, so nothing else changed.

### 2. Data model

**Migration `20260723_create_post_canvas_docs.sql`** (idempotent, no RLS/triggers, ends
`notify pgrst, 'reload schema'`):

```sql
create table if not exists post_canvas_docs (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  position   integer not null default 0,
  doc        jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, position)
);
create index if not exists post_canvas_docs_post_idx on post_canvas_docs (post_id);
```

Docs are fetched on-demand only (editor open / compose) — calendar and /review page payloads gained
nothing. `src/types/database.ts` carries the hand-added Row/Insert/Update block;
`POST_CANVAS_DOC_COLUMNS` lives in `select-columns.ts`.

**The doc shape** (`src/types/canvas.ts`, versioned `version: 1`):

```
CanvasDoc {
  version: 1
  canvas: { w, h }                       // 1080×1350
  background: { publicUrl, storagePath } // the CLEAN (text-free) image the doc composes over
  backgroundTransform?: { zoom, offsetX, offsetY }  // reposition (2026-07-24): pan/zoom of the
                                         // cover-crop window; zoom 1–3, offsets = fractions of
                                         // the crop slack (0.5 = centered); absent = cover fit
  flattenedStoragePath: string | null    // the artifact the last save produced
  scrim: { enabled, color, opacity, mode: 'full' | 'bottom' }
  layers: CanvasTextLayer[]              // capped at 20
}
CanvasTextLayer {
  id, role: 'headline' | 'body' | 'custom', text
  x, y, width                            // text wraps inside width; height derived
  fontFamily                             // FREE string, not a library enum — docs outlive library edits
  fontSize, fontWeight: 400|500|600|700, fill (hex), align, lineHeight
  rotation?: number                      // degrees around the top-left pivot (2026-07-24); absent = 0
  textOverridden?: boolean               // user hand-edited text → recompose keeps their wording
}
```

**Write gate:** `src/lib/canvas/doc-schema.ts` — zod schema with build-time type↔schema parity
guards (same pattern as `identity-schema.ts`), `parseCanvasDoc`/`safeParseCanvasDoc`. Zod for
canvas exists ONLY in this file. A malformed/legacy stored doc safeParses to **null → the editor
reseeds** — never a hard error.

### 3. The clean-background model (never doubled text)

Saving bakes text into the `post_images` jpeg; naively rendering doc layers over that image on
reopen would show every text twice. So the doc tracks TWO storage references (see shape above):

- **Reopen:** if the current `post_images` row's `storage_path === doc.flattenedStoragePath`, the
  current image is our own baked output → render layers over `doc.background` (the clean file).
- **Rebind:** otherwise the image changed underneath (AI regenerate / manual re-upload) → the
  CURRENT image is treated as the new clean background; the next save rebinds `doc.background`
  to it and best-effort deletes the orphaned old clean file (only when it isn't the incoming
  background, isn't the current image, and lives under `{clientId}/` — never outside the client's
  space). A stored `backgroundTransform` RESETS on every rebind (a pan/zoom belongs to the old
  art) — enforced at all three rebind sites: the editor's `resolveDoc`, the auto-compose reuse
  path, and the apply-to-all sibling path. Recompose after copy edits never rebinds, so the crop
  survives text refreshes.
- **`replaceExistingImage` gained `preserveStoragePath?`** (`features/publishing/lib/storage.ts`):
  the row is always deleted, the storage object kept when its path matches — so the clean file
  survives its own row being replaced by the flattened export. Existing callers unchanged.

### 4. Seeding & autofit

`src/lib/canvas/seed-doc.ts` (pure, node-tested):
- **Carousel slides** seed a headline layer (style display font, weight 700, y 128, size 88,
  auto-UPPERCASE when the style sets `headlineUppercase`) + a body layer (style body font, 400,
  y 760, size 44). Both at x 96, width 888, fill `palette.ink`, left-aligned.
- **Single posts** seed ONE headline = `captionHook(caption)`: sanitize (the `lib/visual/prompt.ts`
  URL/#tag/@mention stripper, reused) → first non-empty line → first sentence
  (`/^(.*?[.!?…])(?:\s|$)/`) → `clampAtWordBoundary` at 90 chars. Captions are generated
  hook-first, so sentence one IS the designed hook.
- Scrim defaults on: `mode 'bottom'`, `color palette.surface`, opacity 0.35. Empty copy seeds no
  layer (a zero-layer doc is never composed). `applyCopyToDoc` refreshes role layers from rewritten
  copy unless `textOverridden`; `createTextLayer` backs the editor's "Add text".
- **Autofit** (`features/canvas-editor/lib/measure-fit.ts`, §6.2 shipped): one detached
  `Konva.Text` singleton measures each layer; `computeFit` (ported from the retired branch) steps
  the size down ×1.15 to a floor of 24 until it fits above a 48px bottom margin. Runs once on
  first open — the fitted size is written INTO the doc, so what you see is what saves (WYSIWYG).
  `docOverflows` drives the top-bar overflow badge when even the floor doesn't fit.

### 5. API surface

- **`GET /api/posts/[id]/canvas?position=N`** → `{ doc | null, identity: { palette, style } }` —
  identity rides along so the editor opens in one round trip (`fetchVisualIdentityOrDefault`
  falls back to the default identity; no doc / invalid doc → null → reseed).
- **`PUT /api/posts/[id]/canvas`** — save is ONE multipart request (flattened jpeg + doc JSON +
  `baseImagePath` = the storage_path the editor opened against), so doc and image can never
  drift. Server order: validate (shared `validateImageFile`, 8MB jpeg/png) → ownership → re-read
  the current row → **409 when its storage_path ≠ `baseImagePath`** (stale-save guard; also
  covers two tabs — client toasts "reopen the editor", doc intact) → upload the flattened file →
  stale-background cleanup (§3) → doc upsert (`onConflict: 'post_id,position'`, stored with
  `flattenedStoragePath` = the new path) → `replaceExistingImage(..., preserveStoragePath:
  doc.background.storagePath)` → insert the new `post_images` row → `{ image }`. On any failure
  the editor stays open + dirty; retry rewrites both (idempotent).
- **`GET /api/clients/[id]/visual-identity`** — identity for wizard drafts (no post row yet).
- **`POST /api/ai/generate-visual/upload`** — multipart draft flattened upload (`file`,
  `clientId`, `draftId`, `position`, optional `previousStoragePath` — prefix-guarded best-effort
  delete, sent only for a previous FLATTENED file, never the doc's clean background).
- **`POST /api/posts`** `images[]` entries gained `canvasDoc?` — on approve
  `attachDraftCanvasDocs` safeParses each doc (skip invalid), guards that `doc.background` lives
  under the client's `drafts/` prefix, **moves each clean background out of `drafts/` into
  `{clientId}/{postId}/`** (`movePostImageObject`, parallel `Promise.all`, log-only on failure —
  the drafts path still serves), rewrites `doc.background`, batch-inserts. Discard collects BOTH
  paths per draft (flattened + clean, deduped) for the existing DELETE cleanup.

### 6. Auto-compose (all surfaces)

Compose = seed-or-reuse doc → inject fonts → `ensureFontsReady` → autofit → offscreen export
(`features/canvas-editor/lib/compose.ts`), loaded via **dynamic import** so Konva only downloads
when visuals arrive. Compose runs SERIALLY (one offscreen canvas at a time, `createSemaphore(1)`
from `lib/concurrency`); each adds ~100–300ms, invisible next to ~52s generation. **Any compose
failure degrades to the clean text-free image** (no doc, one `console.error`) — never blocks a run.

- **Wizard (`use-draft-visuals.ts`):** after each generate returns the clean image, the pipeline
  seeds from the draft copy (identity fetched once per run, cached synchronously), flattens, and
  uploads via the draft upload route — the `DraftVisual` becomes `{ status:'done', flattened
  publicUrl/storagePath, canvasDoc }`. Status stays `'generating'` until compose completes or
  falls back; the clean refs ride on the generating entry, so **approve mid-compose aborts the
  compose and attaches the clean image** (never blocks, never loses a slide). Single posts
  compose too, with the caption-hook headline.
- **Review/calendar (`use-generate-visuals.ts`):** a compose tail after each generate/regenerate —
  `composePersistedPosition` GETs the position's doc, **reuses it over the fresh image when one
  exists** (custom layouts survive regenerates: new art, same text, auto re-baked) or seeds from
  the post copy (`slideCopyAt` — the ONE mapping from `post_type`/`slides_json`/`caption` +
  position to slide copy), then saves through the canvas PUT with `baseImagePath`. The hook
  exposes `composingPositions`; the slot shows "Adding text…" after "Generating…". Cron posts get
  composed visuals via the existing /review bulk button with zero extra clicks.
- **Copy-change staleness (closed 2026-07-24):** every copy change auto-RE-composes via
  `applyCopyToDoc` — wizard rewrites AND review/calendar rewrites + manual caption/slide edits
  (`recomposePersistedPosition` + `useGenerateVisuals.recompose`; fresh copy passed explicitly
  by the surface). Hand-edited layers keep their wording via `textOverridden`; AI art is never
  re-rolled; positions without a doc are never touched; unchanged copy is a no-op. The old
  "text may be outdated" nudge is gone — its message survives only as the failure toast.

### 7. The editor (`src/features/canvas-editor/`)

Pencil action on every filled image slot — wizard drafts, /review, calendar (gated by the existing
`canGenerateVisuals` predicate: hidden for published/publishing). Mounted by the feature surfaces
(`review-post-view`, `schedule-card`, wizard `post-detail`) — NEVER inside shared `ImageSlot`/
`components/posts/*`, which only gained dumb `onEditImage` callbacks.

**UX:** full-screen overlay on `var(--color-sunken)` with the canvas framed (border + shadow on
surface); stage scaled to fit the viewport (vw − 300px panel − padding × vh − top bar); right
properties panel (font/size/weight/color(5 palette roles + custom)/align/line-height, layer list
with add/delete, scrim controls); top bar with slide label, overflow badge, undo/redo, Cancel,
Save. "Preparing canvas…" until background image AND fonts resolve — never a flash of system-font
text. Dirty-guard on Escape/backdrop/Cancel. Desktop-only: <768px renders a needs-larger-screen
notice. Undo/redo = doc-snapshot stack capped at 50 (`use-canvas-doc`), Cmd/Ctrl+Z / Shift+Cmd+Z,
shortcuts suspended while the inline-edit textarea is focused. **"Save & apply to all"
(2026-07-24):** on carousels with >1 image, a second top-bar button saves the slide and carries
its full look — role-matched layer position/width/font/size/weight/color/align/line-height +
scrim — onto every sibling (each keeps its own text; autofit reshrinks). Pure transfer =
`src/lib/canvas/apply-style.ts`; the editor stays single-position — the SURFACE orchestrates
siblings through `useGenerateVisuals.applyStyle` (review/calendar) or
`applyStyleAcrossDraft` (wizard), with the same serial queue, "Adding text…" slot feedback and
degrade-to-current-image failure posture as auto-compose. Doc-less siblings are seeded, styled
and composed in one pass.

**Background reposition + text rotation (2026-07-24):** the background is no longer fixed. A
"Background" panel section enters **Reposition mode** — text/scrim dim to 35% and lock, dragging
pans the art (pinned-drag Konva trick: the gesture surface never moves, only the crop window),
the wheel zooms toward the pointer, a panel slider zooms about the canvas center (1–3×), Reset
returns to the centered cover fit. Previews mutate the background node's crop attrs directly;
the doc gets ONE commit per gesture (drag end / settled wheel burst) so a whole drag is one undo
step. Escape/Cancel/backdrop step OUT of the mode before closing; Save is disabled while active.
The pure pan/zoom math lives in `src/lib/canvas/reposition.ts` (slack-normalized offsets,
focus-invariant zoom — node-tested). Text layers rotate via the transformer's **rotate handle**
(snaps at 0/±45/±90/180, tolerance 6°) or an exact degrees input in the panel; the inline-edit
textarea anchors at the unrotated pivot and mirrors the tilt via CSS `rotate()`. Rotation
propagates through "Save & apply to all" (part of the look — an unrotated source un-tilts
siblings); the background crop does NOT (each slide's crop belongs to its own art).

**Editing target** is a discriminated union: `{ kind:'post', postId, position }` (GET on open, PUT
on save) | `{ kind:'draft', clientId, draftId, position, doc? }` (identity GET, draft upload on
save, doc handed back to wizard memory).

**Konva implementation notes (hard-won):**
- ALL Konva code sits behind ONE `next/dynamic` `ssr:false` boundary (`canvas-editor.tsx`) —
  page navigation never pays for it; editor and compose share the chunk.
- Export runs on an **offscreen vanilla-Konva stage at native 1080×1350, pixelRatio 1**, `toBlob`
  jpeg q0.9 wrapped in a Promise, `stage.destroy()` in `finally` — no selection chrome, no
  fractional-scale off-by-one, no base64 memory doubling.
- Pure `doc → Konva attrs` builders in `src/lib/canvas/node-attrs.ts` are shared by the
  react-konva JSX AND the exporter (no dual mapping). Konva expresses weight via `fontStyle`
  strings (`'bold'`, `'500'`) — mapped once there, never inline.
- Transformer: `middle-left`/`middle-right` anchors + the rotate handle (snaps 0/±45/±90/180);
  `scaleX` folds into `width` DURING transform (not just transformend — else squished glyphs;
  the fold is rotation-agnostic, scaleX is local). Drag/transform sync React on end-events only
  — never per-frame through React; reposition previews follow the same rule via direct
  crop-attr mutation.
- Inline edit = textarea overlay positioned at `node.absolutePosition()` × stage scale, commit on
  blur/Esc, sets `textOverridden: true`.
- Background images load with `crossOrigin='anonymous'` from the RAW Supabase publicUrl (never a
  `/_next/image` URL) — anything else taints the canvas and kills `toBlob`.
- Google Fonts stylesheet is injected **imperatively** into `<head>` (`lib/fonts.ts`) — React 19
  treats `<link rel="stylesheet">` as a hoistable resource and throws hydration error #418 when a
  client-only surface mounts one. `document.fonts.load` (memoized per family+weight) gates the
  first stage draw AND re-runs inside the exporter, or a system face gets baked silently.
- React 19 lint compliance: no ref writes during render (shortcut handlers assigned in an
  effect), no sync setState in effects (derived-key comparisons for fonts/image readiness).

### 8. Fonts (PRD "fonts deferred" resolved)

Curated two-tier library, single-owned by `src/lib/canvas/font-library.ts` (`FontFamilyName` is
derived `keyof` the registry; weights are honest to what Google Fonts actually hosts — many
display faces are 400-only):

| Category | Cyrillic-safe (15) | Latin-only (5) |
|---|---|---|
| display | Unbounded, Sofia Sans Condensed, Oswald, Russo One | Bebas Neue, Anton, Abril Fatface |
| serif | Playfair Display, Prata, Cormorant Garamond, Lora | — |
| sans | Manrope, Commissioner, Source Sans 3, Golos Text, Montserrat | Poppins, Space Grotesk |
| script | Caveat, Marck Script | — |

**Smart filter:** `hasCyrillic` (one `/[Ѐ-ӿ]/` regex) + `availableFonts(requiresCyrillic)` — the
picker hides Latin-only entries when the selected layer's text contains Cyrillic (Bulgarian text
in a Latin-only face would silently fall back to a system font). A doc referencing an unknown
family still renders (system fallback, string preserved — docs outlive library edits).

**Per-style pairings** live ON the brand-style registry (`BrandStyle.fonts: { display, body,
headlineUppercase? }`): graphic-editorial → Oswald / Source Sans 3 + `headlineUppercase`
(condensed caps are the style's signature, applied at seed time); clinical-luxury → Playfair
Display / Commissioner. Adding a style now also picks its pairing — one registry entry.

### 9. Module organization (one-way layers, per docs/CLAUDE.md)

`src/types/canvas.ts` (domain types, no deps) ← `src/lib/canvas/` (constants, doc-schema,
font-library, google-fonts, seed-doc, autofit, cover-crop, node-attrs — **all pure and
node-testable**, no React/Konva/DOM) ← `src/features/canvas-editor/` (everything Konva/DOM:
components, hooks, export/compose/save libs, `ensureFontsReady`) + API routes. Konva imports
exist ONLY under `features/canvas-editor/`; multipart file rules ONLY in the extracted
`features/publishing/lib/validate-image-file.ts` (reused by the images route, canvas PUT, draft
upload, and client-side slot validation). `DraftVisual` stays the wizard's own type, importing
`CanvasDoc` one-way.

### 10. Concurrency & race guards

- **Stale save (editor vs regenerate/re-upload/second tab):** `baseImagePath` → server 409 (§5).
- **Double-save:** button disabled in flight; the `post_images(post_id, position)` unique index
  turns any interleaving into a clean error, never a duplicate slide.
- **Edit clicked mid-compose (wizard):** status stays `'generating'` until compose settles — the
  Edit/preview state only ever sees final entries.
- **Approve mid-compose:** never blocks — in-flight composes abort (per-draft AbortController,
  same one regenerate/discard cancel) and those slides attach the clean image without a doc.
- **Calendar/review state clobber:** unchanged Phase-3 functional upserts; editor saves flow
  through the same callbacks.

### 11. Tests & validation

Pure-module vitest suites: `lib/canvas/__tests__/` (doc-schema round-trip + rejects, seed-doc
incl. `captionHook` + `applyCopyToDoc`, autofit, cover-crop, apply-style, font-library incl.
filter + both style pairings resolve to Cyrillic-safe families), `lib/visual/__tests__/fal-size`
(multiples-of-16 + exact 4:5), `features/canvas-editor/lib/__tests__/slide-copy`,
`features/generate/lib/__tests__/draft-visuals`. Konva-interactive behavior is manual by design
(no browser-test infra): the E2E pass covers first-open seeding, the edit→save→reopen round trip
(text renders ONCE), doc-survives-regenerate rebind, legacy-square crop, single-post caption
hook, wizard auto-compose→approve attach (clean files moved out of `drafts/`), discard cleanup,
Cyrillic font filtering, overflow badge, the 409 stale-save guard, and a 4:5 publish to
Instagram.

🔜 **Still deferred (specified below, not yet planned)**
- **§4 Advanced Canvas:** SVGs-on-demand, DIS object isolation, free layer architecture,
  "Isolate Object" flow, inpainting, background filters.

✅ **Quick wins shipped 2026-07-24 (commit `a04f1f9`):** §6.1 slide-role prompt hints with the
alternating rich/quiet rhythm (see Phase 3 prompt contract), auto-recompose on persisted-post
copy edits (ex-TECH-DEBT 2.5) and "Save & apply to all" (ex-TECH-DEBT 2.6) — details woven into
the sections above.

✅ **Background reposition (crop/pan/zoom) + text rotation shipped 2026-07-24** — the two
cheapest §4 items, no layer architecture needed; as-built details in §2 (doc shape), §3
(rebind resets) and §7 (editor) above. Background *filters* stay deferred with §4.

**Setup:** migrations `20260718_create_brand_visual_identity.sql` +
`20260721_strip_legacy_visual_identity_fields.sql` + `20260722_post_images_unique_position.sql` +
`20260723_create_post_canvas_docs.sql`;
deps `@sparticuz/chromium` + `puppeteer-core` + `zod` + `@fal-ai/client` + `konva` + `react-konva`;
env `CHROME_EXECUTABLE_PATH` (local) + `FAL_API_KEY`. Requires Vercel Pro (`maxDuration=60` extract
routes, `120` visuals routes). ~52s + ~$0.04–0.07 per image; compose adds ~100–300ms client-side.

**Known trade-offs & deferred issues:** catalogued in `docs/TECH-DEBT.md` (orphan draft files from
abandoned tabs, palette-description race on a client's first generation — mitigated by "Re-analyze",
no cross-surface live sync, structure/layering cleanups).

—————

2. The End-to-End User Journey


📥 Onboarding         ✍️ Copy Gen          🎨 Visual Handshake   🛠️ Canvas Polish
┌────────────────┐    ┌────────────────┐    ┌─────────────────┐   ┌─────────────────┐
│ Paste URL/IG   │ ──>│ Pick Platform  │ ──>│ AI Auto-Blends  │──>│ Tweak Text/Crop │
│ Auto-Extract   │    │ Select Slides  │    │ Brand + Topic   │   │ Inpaint Brush   │
│ Brand Profile  │    │ Generate Copy  │    │ Wide Backdrop   │   │ Export Slides   │
└────────────────┘    └────────────────┘    └─────────────────┘   └─────────────────┘

Phase 1: Intelligent Onboarding & Brand Extraction
* The Input: The user pastes a business website URL or Instagram handle.
* The AI Background Scan: The system scrapes and builds a Core Brand Profile identifying:
    * Color Palette: Primary, secondary, and background hex colors.
    * Typography: Brand fonts or closest web-safe alternatives.
    * Identity Details: Brand name, exact niche, and target demographic.
    * Tone of Voice: Style of copy (e.g., professional, witty, casual).
    * Content Pillars: Master topics the business frequently covers.

Phase 2: Content Briefing & Copy Generation
* Client Selection: User chooses a client profile
* Platform Selection: User chooses single image or carousel post
* Slide Count: User selects the length of the carousel (e.g., 4 to 10 slides).
* AI Copy Generation: The writing engine crafts a cohesive hook, body points, and call-to-action (CTA), explicitly split across the chosen number of slides.

Phase 3: Visual Generation & Design Handshake
* The Design Blend: Before the user enters the editor, the app merges the Onboarding Brand Profile with the Generated Slide Content.
* Visual Backdrop: The AI outputs a relevant visual for the post topic while strictly respecting the brand's preset visual identity.
* Canvas Initialization: The text copy is instantly placed onto the slides over the background, delivering a 90%-finished layout immediately.

Phase 4: Creative Workspace & Final Polish
* Live Editing: Users tweak copy, drag elements across slides, crop media, or swap colors.
*  Export or Publishing: User can either export or publish the complete visuals

3. The Core Visual Engine (Presets & Prompt Matrix)
To cater to a broad spectrum ranging from sterile, luxury aesthetic clinics to high-energy digital marketing agencies, your app needs a highly versatile core framework. Instead of offering a massive list of confusing artistic terms, you should group your AI design engine into four distinct "Vibe Presets."
This allows any industry to find a matching visual language while keeping your app’s backend prompt templates manageable and highly scalable.

                           ┌───────────────────┐
                           ┌───────────────────┐
                           │   CORE ENGINE     │
                           └─────────┬─────────┘
                                     │
         ┌───────────────────┬───────┴───────────┬───────────────────┐
         ▼                   ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│Luxury Minimalist│ │ Modern Tech 3D  │ │Creative & Edgy  │ │Polished Photo   │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│• Aesthetic      │ │• Digital        │ │• Freelancers    │ │• E-commerce     │
│  Clinics        │ │  Marketing      │ │• Gen-Z Brands   │ │• Lifestyle      │
│• Skincare/Real  │ │• SaaS & B2B     │ │• Fashion Media  │ │• Food/Fitness   │
│  Estate         │ │  Startups       │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
🌟 3.1. The "Luxury Minimalist" Preset
* Target Clients: Aesthetic clinics, skincare brands, premium real estate, high-end coaching.
* Visual Style: Soft lighting, beige/neutral color palettes, marble or satin textures, and heavy negative space. It mimics editorial lookbooks and high-end magazine spreads.
* Why it works for carousels: It instantly builds trust and looks highly professional. The clean, uncluttered backgrounds ensure that text overlays remain effortlessly legible.
* AI Prompt Modifiers to hardcode: minimalist studio lighting, neutral muted tones, editorial composition, soft focus, vast negative space for text, high-end luxury aesthetic, clean lines --ar 4:1

⚡ 3.2 The "Modern Tech & Vector" Preset
* Target Clients: Digital marketing agencies, SaaS companies, crypto/finance startups, B2B creators.
* Visual Style: Clean 3D isometric shapes, vibrant flat vectors, glassmorphism UI elements, and sharp geometric layouts.
* Why it works for carousels: Marketing and tech agencies love data visualization, charts, and step-by-step frameworks. This style makes complex data look accessible, friendly, and highly shareable.
* AI Prompt Modifiers to hardcode: 3D minimalist vector illustration, flat vibrant colors, isometric view, tech corporate design style, isolated on solid background, clean corporate memphis --ar 4:1

🎨 3.3 The "Creative & Edgy" Preset
* Target Clients: Freelance designers, video editors, Gen-Z brands, streetwear lines, modern media agencies.
* Visual Style: Risograph textures, halftone dots, subtle cyberpunk neon accents, or 90s vintage vaporwave.
* Why it works for carousels: This style is designed to break the scroll on Instagram and TikTok. It stands out violently in a feed and positions the client as a forward-thinking trendsetter.
* AI Prompt Modifiers to hardcode: risograph texture print style, high contrast, vibrant ink overlay, retro-modern graphic design, gritty halftone, bold aesthetic --ar 4:1

📸 3.4 The "Polished Editorial Photo" Preset
* Target Clients: E-commerce stores, lifestyle influencers, restaurants, fitness trainers.
* Visual Style: Crisp, realistic lifestyle photography featuring real people, product close-ups, and natural sunlight.
* Why it works for carousels: Some clients just want real-looking photos. By utilizing a "seamless multi-slide background" technique, an aesthetic clinic can showcase a beautiful treatment room that spans continuously across three slides.
* AI Prompt Modifiers to hardcode: photorealistic candid photography, natural sunlight, organic textures, commercial lifestyle shoot, crisp details, neutral background --ar 4:1


🛠️ How to Implement This in the App’s UI
To deliver a true "multipurpose" experience without overwhelming a plastic surgeon or a media buyer, structure the user flow like this:
1. Step 1 (Select Industry Vibe): The user clicks one of the four presets above (labeled simply as Elegant Luxury, Modern Tech, Bold Creative, or Corporate Photo).
2. Step 2 (The Hook): Behind the scenes, your app injects the hardcoded style prompts.
3. Step 3 (The Text Overlays): Ensure your app automatically pairs the style with appropriate typography. For example, selecting the "Luxury Minimalist" vibe should auto-lock the carousel font to a sleek Serif or a thin Sans-Serif, while "Modern Tech" defaults to a bold, clean geometric font.




4. Advanced Canvas Customization & Intelligence
To step beyond static templates, the workspace includes on-demand asset generation and precise background interaction tools.

  ✨ SVGs-on-Demand (Recraft)                     ✂️ Smart Separation (DIS Model)
┌─────────────────────────────────┐               ┌─────────────────────────────────┐
│ • Type prompt ("3D abstract")   │               │ • User clicks background object │
│ • Vector loads instantly on stage│     ───>     │ • DIS model cuts it instantly   │
│ • Pure vector: infinite scale   │               │ • Object becomes separate layer │
│ • Change colors inside editor   │               │ • Move across slide boundaries  │
└─────────────────────────────────┘               └─────────────────────────────────┘

4.1 On-Demand SVG Element Generator (Powered by Recraft V4.1)
Users can inject unique supporting graphics mid-edit via a "Generate SVG" sidebar panel powered by the Recraft V4.1 Vector engine.
* Workflow: A user types a quick prompt (e.g., "Flat icon of an arrow" or "Minimalist line art leaf").
* Canvas Behavior: The asset drops onto the active canvas as an editable vector graphic. It can be resized infinitely 
* Brand Injection: The editor parses the SVG code paths, allowing users to map the asset's individual color channels directly to their onboarding brand color palette.

4.2 Intelligent Object Isolation (Dichotomous Image Segmentation - DIS)
To remove the limitation of a flat background image, users can extract elements directly out of the generated visual using an advanced DIS model.
* Workflow: A user toggles "Isolate Object" and clicks an element inside the generated background (e.g., a serum bottle or a geometric tech block).
* Canvas Behavior: The DIS model runs a high-precision boundary cut. The original background is preserved intact underneath, while the selected element is duplicated into a transparent cutout layer.
* Swipe-Bait Mechanics: Users can drag this newly isolated cutout directly on top of the slide boundaries, creating visual continuity that encourages scrolling.

4.3 Interactive Canvas Layer Architecture
The multi-slide canvas manages elements across four strict depth layers to optimize editing speed:
1. Layer 1: Continuous Backdrop (Bottom) – The generated image during the copy step, which is fully interactive using the DIS separation tool.
2. Layer 2: Custom Elements (Middle) – Holds on-demand generated Recraft SVGs and objects isolated via DIS, allowing users to layer decorative components freely.
3. Layer 3: Branding & Extras – Houses transparent brand logos, custom geometric layout borders, and structural frames.
4. Layer 4: Interactive Typography (Top) – Locked at the top to ensure font headlines and text calls-to-action (CTAs) never get buried or obscured by images.




5. Functional Editor Feature Requirements
To keep the design tool approachable for non-technical users, the editing canvas incorporates automated creative guardrails.

🔤 Advanced Typography & Guardrails
* Social Media Font Pairings: Includes pre-configured typography sets optimized for conversion rates (e.g., Cormorant Garamond paired with Montserrat for Luxury, Space Grotesk paired with Inter for Tech).
* Proportion Protection: Text bounding boxes only permit width expansion. Font sizes wrap lines automatically rather than stretching letters unevenly.
* Contrast Safety Mesh: The editor monitors background chaos. If an AI background is too cluttered, a semi-transparent brand-colored overlay drops behind the text to guarantee contrast.

🖌️ AI Brush Repair (Inpainting Mode)
* The Brush Tool: Users can enter an edit mode and paint a mask over any specific zone on their generated canvas.
* Text Commands: Users type what they want to change in that spot (e.g., "replace this vase with a skincare bottle" or "remove this abstract shape").
* Visual Blending: The background-repair engine swaps the item seamlessly without altering the rest of the layout or background texture.

🛡️ Platform Guardrails & Overlays
* Safe Zone Toggles: Visual overlays simulate target social platforms (e.g., where Instagram profile badges, UI counters, or LinkedIn navigation arrows live).
* Visual Warning Alerts: Warns users instantly if text or vital visual elements drift into platform interface dead-zones.

6. Other Considerations 
6.1 The "First Slide vs. Middle Slide" Visual Hierarchy Problem — ✅ SHIPPED 2026-07-24 (as-built above)
* The Gap: Inpainting, SVGs, treat all slides with equal weight. In reality, Slide 1 (The Hook) must have massive visual impact, while Slide 2 to 9 need high legibility for data, and the Final Slide requires a high-contrast Call to Action (CTA).
* The Solution: Adjust the Fal.ai prompt distribution. Instead of generating an identical texture density across the entire ribbon, the prompt must explicitly inject a heavy visual anchor on the far left (Slide 1) and a structured frame on the far right (Final Slide), keeping the center panels clean for body text.
* As built (deviation from the spec above): interior slides are NOT uniformly clean — after a
  prod run showed all-quiet middles reading flat, the shipped rhythm ALTERNATES rich/quiet
  interior slides by position parity (cover rich → quiet → rich → … → plain structured CTA).
  Every slide's hint also reserves the text-overlay zones (top quarter + lower half) since
  Phase 4 bakes copy onto every slide. See the Phase 3 prompt-contract section for wording.
6.2. Text Box Overflow Handling
* The Gap: The LLM generates text copy, and the app places it. However, if the LLM generates a paragraph that is too long for a single slide, the text will overflow past the grid boundary line into the next slide, ruining the user's layout.
* The Solution: Implement a Text-Overflow Boundary Guard. If a generated text block exceeds the bounding height limit of a single slide zone, Konva must automatically truncate the text, create a "Continued on next slide..." node, or alert the user with a highlight box.



—————

User Flow Specification: "Isolate Object" (DIS Model Integration)
This module defines the user experience, interaction states, and feedback loops for the Dichotomous Image Segmentation (DIS) tool within the editing workspace. The goal is to make a complex backend machine-learning process feel instantaneous, predictable, and foolproof for non-technical users.



🗺️ 1. The 4-State Tool Lifecycle

	[ 1. Idle State ] 	➔ [ 2. Active Selection ] 	➔ [ 3. Processing State ] 	➔ [ 4. Success Handoff ]
  • Background Flat     • Hover outlines         		• Background dims       	• New independent layer
  • Toolbar button off  • Crosshair cursor       		• Loading spinner       	• Transformer attached

State 1: Idle (Standard Canvas Editing)
* Canvas Behavior: The user is interacting with text layers or moving existing shapes. The generated visual backdrop is locked at the bottom layer (listening: false configuration).
* Sidebar UI: The "Isolate Object" tool is visible in the toolbar with a clean icon (e.g., a magic wand or a cutout lasso).

State 2: Active Selection Mode (User Targeting)
* Trigger: The user clicks the "Isolate Object" button in the toolbar.
* Visual Shift:
    * The toolbar button switches to a highlighted active state.
    * The user's cursor transforms into a precise crosshair icon.
    * A floating tooltip appears next to the cursor reading: "Click an object on the background to isolate it."
    * The typography and brand logo layers are temporarily given a 30% opacity reduction to signal that the background layer is now the focus.
* Hover Effect: As the user moves their mouse over the background image, the app runs a lightweight local edge-detection overlay. A soft, glowing boundary outline tracing potential shapes follows the mouse cursor to guide their selection.

State 3: Processing State (The AI Cutout Calculation)
* Trigger: The user clicks a targeted object on the backdrop.
* Visual Shift:
    * The entire canvas area shifts to a dimmed 50% opacity.
    * The selected object remains at full opacity, highlighted by a pulsing neon border.
    * A clean loading spinner appears over the item with micro-copy reading: "Analyzing details and cutting outlines..."
    * All user input on the canvas is temporarily frozen to prevent layer corruption while the segmentation model runs.

State 4: Success & Handoff Mode (The Layer Split)
* Trigger: The segmentation endpoint completes and returns the isolated cutout asset coordinates.
* Visual Shift:
    * The workspace instantly snaps back to 100% full brightness.
    * The "Isolate Object" toolbar button automatically toggles off, returning the user to standard editing mode.
    * A localized particle confetti burst triggers over the newly separated object.
    * The Handoff: The original background stays untouched underneath, while the isolated cutout is automatically duplicated into Layer 2: Custom Elements.
    * The editor automatically attaches a Transformer bounding box around the new asset so the user can immediately scale, rotate, or slide it across slide seams.


🛑 2. Error Handling & Edge Cases
To prevent user frustration when the AI model encounters ambiguous shapes or low-resolution textures, implement these fallback paths:

Edge Case A: Clicking flat negative space (e.g., a blank wall)
* System Action: If the DIS model cannot find a definitive object edge cluster inside the click radius, it cancels the processing state.
* UX Solution: Shake the background image slightly, return to State 2 (Active Selection), and display a floating toast notification: "No distinct object found here. Try clicking a specific product, bottle, or gadget."

Edge Case B: Clicking an item that is heavily obscured by text overlays
* System Action: Because text layers live on a higher plane, clicking text could block the user's intent.
* UX Solution: During Active Selection Mode, text layers are set to listening: false. The user can click directly "through" their headlines to target the hidden background objects seamlessly.



🛠️ 3. Interface Layout & Wireframe Placement

┌───────────────────────────────────────────────────────────────────────────┐
│ [← Back]  Project: Winter Skincare        [Undo] [Redo]    [Export PNG ↓] │
├───────────────────────────────────────────────────────────────────────────┤
│ TOOLBAR     │ 🟩 ACTIVE VIEWPORT (State 2: Active Selection)              │
│ ┌─────────┐ │                                                             │
│ │ Select  │ │  ┌───────────────────────┬───────────────────────┐          │
│ ├─────────┤ │  │   TEXT HEADLINE       │                       │          │
│ │ Text    │ │  │ ┌─────────┐           │                       │          │
│ ├─────────┤ │  │ │ ✨(   ) │ 🌟 [Hover]│                       │           │
│ │*Isolate*│ │  │ │  ( _ )  │  Outline  │                       │          │
│ ├─────────┤ │  │ └─────────┘           │                       │          │
│ │ SVGs    │ │  │    SLIDE 1            │    SLIDE 2            │          │
│ └─────────┘ │  └───────────────────────┴───────────────────────┘          │
│             │  [💡 Click an object on the background to isolate it]       │
└─────────────┴─────────────────────────────────────────────────────────────┘


* The Floating Bar Control: Once an item enters State 4 (Successfully Isolated), a micro-menu pins itself to the top of the asset’s transformer box offering immediate actions:
    * [ 🗑️ Delete Cutout ]
    * [ 🎨 Match Brand Palette ]
    * [ 🔀 Send to Back / Bring to Front ]



