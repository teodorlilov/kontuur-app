# AI-Generated Visuals — Carousel & Single-Post Design System

> **Status:** Planned (v2 — revised 2026-07-07 after codebase verification)
> **Goal:** Every generated post leaves the pipeline as a finished, publishable visual —
> branded slide PNGs attached via `post_images` — with a post-scoped parametric editor
> for the tweaks that AI output will inevitably need.

---

## 0. Codebase verification notes (2026-07-07)

Every assumption in this plan was checked against the codebase. Verified anchors:

- `GenerationPipeline` lives in `src/ai/generation/generation-orchestrator.ts`
  (batched theme processing, `validatePost` hook point, `onProgress` callback) —
  the design pass hooks in after validation.
- `CarouselSlide.slide_role: 'cover' | 'content' | 'cta'` exists
  (`src/types/api.ts`) — the per-role default template fallback works as written.
- SSE streaming already exists (`src/app/api/ai/generate-stream/route.ts`);
  the new `images` event extends it, not new infrastructure.
- `post_images` CRUD exists (`src/app/api/posts/[id]/images/route.ts`);
  publishing reads it unchanged. **RLS gotcha:** `post_images` blocks user-scoped
  access — the render service must write via the admin client.
- Vercel Hobby is at its two-cron limit (`vercel.json`); this plan adds no crons.
  The generate cron already runs `maxDuration = 300` with elapsed-budget tracking.
- `EditableField` interaction logic exists (`src/components/posts/carousel-slides.tsx`)
  — reused for overlay text editing.
- **satori and sharp are NOT yet dependencies** — both are new installs (Phase 0).
- There is no existing `design_note` field or concept — the design pass input is
  `slides_json` + brand kit + post type (see §4).
- fal.ai hosts the full model lineup (`fal-ai/nano-banana-2`,
  `fal-ai/nano-banana-2/edit`, `google/nano-banana-2-lite`, Flux 2 Pro) at
  $0.08/image at 1K (verified 2026-07-07).

---

## 1. Architecture summary

```
Design system (brand kit, set once at onboarding)
        │ guides every step
        ▼
Text pipeline ──► Art generation ──► Satori composite ──► post_images
(existing)        (AI image, metered)  (text layer, free)
                        ▲                    │
                        │  regenerate · $    ▼
                        └────────── Design editor ◄── opened from results /
                                    (free text + style edits,   review / calendar
                                     instant re-render)
                                             │
                                             ▼
                              Review queue → calendar → publish cron
                              (images ride along, unchanged)
```

### Core decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Rendering | **Satori (JSX → SVG) + sharp (SVG → PNG)** | Deterministic, ~50ms, zero marginal cost, runs in Vercel serverless. satori + sharp are **new dependencies** (verified absent from package.json). Renders write `post_images` via the **admin client** (RLS). One template source, one render engine everywhere — see Preview parity. |
| Preview parity | **Client-side Satori in the editor** | The editor runs the *same pinned satori version* in the browser (pure JS + WASM Yoga, ~50ms/render); the preview shows the exact SVG the server rasterizes with sharp — parity by construction, no second renderer to drift. In-place text editing via overlay inputs on template-declared text zones. `next/og` rejected: its bundled satori can't be version-pinned to the client copy. |
| Text on slides | **Always composited by Satori, never baked into AI images** | Text correctness guaranteed by construction (validated string renders verbatim — critical for Bulgarian). Post-approval text edits are free 50ms re-renders, not metered AI edit round-trips. |
| AI imagery | **Background/art layer only**, via provider abstraction | Photographic quality from the model, typographic discipline from templates. Prompt enforces negative space for the text zone. |
| Primary image model | **Nano Banana 2** via fal.ai (`fal-ai/nano-banana-2`) | Generation + editing + subject consistency in one model family; 4:5 aspect native; $0.08/image at 1K on fal (verified 2026-07-07). Behind `src/lib/imagegen/` interface — swappable (Flux 2 Pro is the vetted alternative, same vendor). |
| Product imagery | **Edit real asset photos, never generate the product** | Diffusion invents fake products. Asset library + image-to-image scene editing keeps the real product, AI supplies the environment. |
| Entry point | **Inline phase in the generation pipeline** (non-blocking) | Preserves generate → finished-post mental model; cron path gets visuals for free; failed renders never sink a run. |
| Editor | **Post-scoped, parametric** (field change → re-render), no freeform canvas | Freeform breaks parametric re-render, the AI-override contract, and cron. Escape hatches (upload / Canva) already exist for bespoke design. |
| Economics | **All editor actions free; only AI image calls metered** | Renders cost ~nothing. Inverts the Kittl token-anxiety model; future billing dimension. |
| AI/human contract | **AI never overwrites a field present in `design_overrides`** | Human edits are sacred; "Reset to AI design" is the explicit undo. |

---

## 2. Database changes

> New migration in `supabase/migrations/`. RLS on all new tables (agency-scoped
> via client → agency, same pattern as `client_sources`).

### 2.1 `brand_kits` (1:1 with client)

```sql
create table brand_kits (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade unique,
  colors_json     jsonb not null default '{}',
  -- { primary, secondary, accent, text_bg, extra: [] } — hex strings
  font_pairing    text not null default 'playfair-inter',
  -- key into the curated, Cyrillic-safe pairing set (app-hosted font files)
  logo_path       text,                     -- Supabase Storage path
  template_ids    text[] not null default '{}',
  -- which slide templates the AI design pass may pick from
  visual_direction text,
  -- reusable prompt fragment, prepended to every image brief
  allow_ai_people boolean not null default false,
  style_reference_paths text[] not null default '{}',
  -- uploaded reference images (their best posts, admired accounts)
  version         int not null default 1,
  -- bumped on edit; rendered posts pin the version they used
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

### 2.2 `client_assets`

```sql
create table client_assets (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  storage_path text not null,
  public_url  text not null,
  label       text,                          -- "Whitening gel", "Dr. Petrova"
  kind        text not null default 'product',
  -- 'product' | 'person' | 'location' | 'other'
  created_at  timestamptz not null default now()
);
```

Storage: new bucket `brand-assets` (public, same setup as post images bucket).

### 2.3 `posts` — new columns

```sql
alter table posts
  add column visuals_status   text not null default 'none',
  -- 'none' | 'pending' | 'ready' | 'degraded' | 'failed' | 'manual'
  add column visuals_error    text,
  add column visuals_attempts int not null default 0,
  add column design_json      jsonb,   -- AI-authored design decisions
  add column design_overrides jsonb,   -- sparse, human-authored; wins over design_json
  add column brand_kit_version int;    -- kit version used at render time
```

`post_images` is reused unchanged — rendered PNGs are ordered images, so the
publishing pipeline needs **zero changes**.

---

## 3. `design_json` / `design_overrides` schema

Both share one shape. `design_json` is complete (AI writes it); `design_overrides`
is sparse (only human-touched fields). **Effective design = deep-merge(design_json,
design_overrides)** — computed in one shared helper, used by renderer and editor.
The AI design pass and any "regenerate" action must never write a path that exists
in `design_overrides`.

```typescript
// src/types/design.ts
interface PostDesign {
  version: 1
  slides: SlideDesign[]          // single posts: array of one
}

interface SlideDesign {
  slide_index: number
  template_id: string            // 'cover-dark' | 'content-light' | 'stat-accent' | ...
  layout_variant?: string        // per-template: 'text-top' | 'text-bottom' | 'quiet' ...
  emphasis_word?: number         // headline word index for italic/accent treatment
  color_variant?: string         // key into brand kit colors: 'primary' | 'accent' ...
  text_treatment?: string        // 'none' | 'highlight-bar' | 'underline' | ...
  scrim?: { position: 'top' | 'bottom' | 'full'; opacity: number }   // 0–0.8
  background: {
    type: 'solid' | 'generated' | 'asset' | 'edited_asset'
    color_key?: string           // for 'solid'
    image_path?: string          // storage path of the active image
    brief?: string               // image prompt (before visual_direction prepend)
    candidates?: string[]        // storage paths of kept alternatives (free to switch)
    asset_id?: string            // for 'asset' / 'edited_asset'
    edit_instruction?: string    // for 'edited_asset' ("on marble counter, morning light")
    model_key?: string           // editor-chosen model tier; absent → routing table default
    focal_point?: { x: number; y: number }   // 0–1, object-position
    zoom?: number                // 1–2
  }
}
```

Slide **text** (headline/body/cta) stays in `slides_json` — single source of truth.
The renderer reads text from `slides_json` and design from the merged design object,
so text edits anywhere in the app automatically re-render correctly.

---

## 4. New modules

| Module | Responsibility |
|---|---|
| `src/lib/rendering/` | Pure render service: `renderSlide(text, design, brandKit) → PNG buffer`. Satori + sharp. Templates in `templates/` are pure **isomorphic satori JSX** (flexbox-only, inline styles, no hooks) and each exports a **zone map** (headline/body/CTA rects in 1080×1350 space) — imported by both the server PNG path and the editor bundle. Font files in `fonts/` (full Cyrillic TTFs, app-hosted). All storage/`post_images` writes use the admin client. |
| `src/lib/imagegen/` | Provider interface: `generate(brief, opts)`, `edit(imagePath, instruction, opts)`. **Single launch adapter: `fal.ts`** (fal.ai) — one key, one bill, and every model this plan routes to lives there: backgrounds/covers → `fal-ai/nano-banana-2`, asset edits → `fal-ai/nano-banana-2/edit`, editor preview cycles → `google/nano-banana-2-lite`, premium editorial (opt-in) → Flux 2 Pro. **fal.ai chosen over Replicate:** output-based pricing maps 1:1 onto credit metering, fastest warm inference (editor candidate loop), media-native queue + webhook API (fits the non-blocking pipeline and cron batches), curated officially-licensed endpoints, day-one access to new image models. Internal routing table maps job type → model — raw model ids stay internal; the editor exposes friendly tier labels only (see Phase 5). The same table doubles as the failover map, ending at the Satori solid-color floor. A direct `gemini.ts` adapter (official price floor, ~$0.067 vs $0.08 at 1K; cross-vendor failover) is the documented follow-up — a one-file add when volume or fal reliability demands it. No grey-market proxies (Kie/apiyi-style resellers) — unofficial licensing is unacceptable for a commercial multi-tenant product. Env: `FAL_KEY`. |
| `src/ai/design/` | Design pass pipeline (Haiku, `outputSchema` structured output): `slides_json` (headline/body + `slide_role`) + brand kit + post type/platform in → `PostDesign` out. Includes the legibility QA check (vision call scoring composited output; fail → escalate down the ladder). |
| `src/app/api/ai/design/route.ts` | `POST { postId, regenerate?: 'all' | slideIndex }` — runs design pass and/or render for one post. The single call-site behind pipeline, retry buttons, and editor saves. |

### Degradation ladder (applied per slide)

```
generated background fails / QA fails twice
        → solid brand color (visuals_status: 'degraded')
design pass returns invalid JSON
        → default template per slide_role (cover→cover, cta→cta, else content)
render itself throws (Satori/sharp/storage)
        → retry once → visuals_status: 'failed' + visuals_error
```

A failed visual **never** blocks the text result, the run, or approval.
Publish/schedule to Instagram warns (not blocks) on `none`/`failed`.

---

## 5. Phases

> Each phase ships independently and is verified before the next starts.
> Phase 0 retires the single biggest technical risk first.

### Phase 0 — Satori + Cyrillic spike (½ day)

1. `npm install satori sharp`; verify satori's browser/WASM yoga entry bundles
   under Next 16.
2. Local script: satori + sharp render one cover template at 1080×1350 with real
   Bulgarian copy in both typefaces (full-family TTFs from Google Fonts download,
   **not** the CSS API Latin subsets).
3. Verify glyphs (no tofu), line-wrapping on long Bulgarian headlines, render time.
4. Parity smoke test: render the same template + props through satori in Node and
   in a browser context; assert **SVG output string equality**.
5. Pick + commit the initial curated font pairing set (each pairing verified for
   Cyrillic coverage).

**✓ Gate:** `slide.png` with correct Bulgarian in display + body type, <200ms server
render; byte-identical SVG from both runtimes; client render <100ms.

### Phase 1 — Brand kit

1. Migration: `brand_kits` (+ storage bucket).
2. Client settings → new "Brand kit" tab: colors, font pairing select, logo upload,
   template style toggles, visual direction, `allow_ai_people`.
3. "Propose kit" action: extend `analyze-url` extraction + Claude draft from brand
   profile → pre-filled kit, agency confirms (same pattern as profile review).
4. Kit versioning: bump `version` on save.

**✓ Verify:** kit CRUD; proposal pre-fills from a real client website; RLS blocks
cross-agency reads.

### Phase 2 — Render service + templates

1. `src/lib/rendering/` with 5 templates: `cover-dark`, `content-light`,
   `stat-accent`, `quote`, `cta-dark` — each parameterized entirely by brand kit +
   `SlideDesign`, satori-compatible JSX (flexbox subset, no CSS grid, inline
   styles — they also run in the browser), each exporting its text-zone map.
2. Wire output → Supabase Storage → `post_images` rows (correct positions) — all
   writes via the admin client (`post_images` RLS blocks user-scoped access).
3. Deep-merge helper for `design_json` + `design_overrides` (shared, tested).

**✓ Verify:** script renders a full 6-slide deck from a real post's `slides_json`
into `post_images`; images visible in the existing post modal; carousel publishes
via existing pipeline in a test run.

### Phase 3 — Design pass + pipeline integration (solid backgrounds only)

1. `src/ai/design/` design pass (Haiku, structured output) consuming `slides_json`
   + brand kit + post type.
2. Hook into `GenerationPipeline` **after** validation, non-blocking:
   emit existing `result` event immediately; new `images` stream event when renders
   land. `visuals_status` transitions: `pending → ready | degraded | failed`.
3. Wizard: Step 3 gets the "Generate branded visuals" toggle (disabled + setup link
   when no kit); Step 4 gets a "Designing visuals" stage row (doesn't block Results);
   Step 5 slide area shows renders with a Text/Design toggle; status badges on cards.
4. Review queue: `visuals_status` badge + `failed` filter + Retry (calls
   `/api/ai/design`).
5. **Early editor slice — in-place text editing on the render.** In the Step 5
   slide preview, clicking headline/body opens an overlay `<textarea>` positioned
   on the template's declared text-zone rect (reusing `EditableField` interaction
   logic); keystrokes → 150ms debounce → client-side satori render (~50ms) → swap
   preview SVG. Writes to `slides_json`; keystroke-to-preview stays well under the
   300ms budget. The single most-used editing action exists from the first moment
   users see renders — the full editor (Phase 4) grows around it rather than
   replacing it.
6. **Design-pass observation log.** While Phase 3 runs internally, keep a running
   note of what the AI design pass gets wrong per deck (template choice? scrim?
   emphasis word? slide rhythm?). This list drives which Phase 4 controls get
   front-row placement — the editor is organized around observed failure modes,
   not imagined ones.

**✓ Verify:** full wizard run produces a deck of solid-template renders; clicking
a headline on the render edits it in place with instant preview update; kill the
render service mid-run → text results still stream, post lands in review as
`failed`, Retry recovers it; `npx tsc --noEmit` clean.

### Phase 4 — Design editor

> **This is the flagship phase.** The pipeline's job is to make visuals exist; the
> editor's job is to make them *right*, and it is the surface users touch most.
> It gets the largest frontend budget in the plan and its own UX quality bar —
> functional completion alone does not close this phase.

1. Editor component (post-scoped): live preview is the **client-side satori SVG**
   (same pinned satori version as the server — extends the Phase 3 text-editing
   slice); slide-strip thumbnails are the same SVGs scaled down; keyboard nav
   between slides (←/→).
2. Free controls → `design_overrides`: template swap (live thumbnails — actual
   mini-renders of *this* slide's content in each template, not generic icons),
   layout variant, color variant, emphasis word (click a word in the headline),
   text treatment, scrim slider, art focal-point drag directly on the canvas + zoom.
3. Interaction quality details:
   - Every control change updates the preview via a debounced client-side satori
     render (~50ms) — no spinner, no server round-trip before feedback.
   - Undo/redo stack over `design_overrides` (in-memory, per session) — safe play
     is the point of the free zone.
   - Visible free/credited split: free controls and AI actions live in two
     labeled groups; the credit counter appears only inside the AI group.
   - "Manually edited" indicator per slide once overrides exist.
4. Contract enforcement: any human write goes to `design_overrides`; regenerate
   paths skip overridden fields; "Reset to AI design" clears overrides (confirm).
5. Save → server Satori render → replace `post_images`; validation quality badge
   greys to "edited" on text change (optional Re-validate action).
6. Entry points: results view, review queue, calendar post dialog ("Edit design"
   next to the image slot; dialog dropzone shows rendered image when
   `visuals_status != 'none'`, with Replace → flips slide to `manual`).
7. Prioritize control placement using the Phase 3 observation log: the most common
   AI mistakes get the most prominent fixes.

**✓ Verify — functional:** regenerate after a manual template swap does not revert
it; all three entry points open identical state; undo restores exactly; automated
parity test — server and client satori produce **byte-identical SVG** for the
template test set (holds by construction; kept as a regression tripwire for
version skew).

**✓ Verify — UX bar (gates the phase):**
- [ ] Text edit: preview updates in <300ms per keystroke, no flicker
- [ ] Template/color/scrim change: visible result in <1s including thumbnails
- [ ] Cold test: a person who has never seen the editor fixes a deliberately bad
      slide (wrong template + drowned text) in under 60 seconds, unprompted
- [ ] Nothing in the free zone can produce an off-brand result (colors, fonts,
      and text zones are provably bounded by the kit)
- [ ] Mobile/tablet: editor is at minimum review-usable at 768px (full editing
      desktop-first is acceptable; broken layouts are not)

#### Implementation sketch

- Feature module `src/features/design-editor/` — components:
  `design-editor-dialog` (Radix Dialog, near-fullscreen), `slide-canvas`,
  `slide-strip`, `control-panel`, `text-zone-overlay`; hooks: `use-design-editor`,
  `use-slide-preview`.
- `use-slide-preview`: dynamic-import satori + WASM yoga once per session, fetch
  kit fonts once, render slide → SVG → blob URL → `<img>`; 150ms debounce,
  ~30–80ms render; thumbnail cache keyed by hash(slide text + effective design +
  kit version). Template-picker live thumbnails = this slide rendered through
  each candidate template.
- `use-design-editor`: single reducer `{ designJson, overrides, slidesJson,
  activeSlide, undoStack }`; free controls dispatch `SET_OVERRIDE(path, value)`
  (inverse patch → undo stack); effective design via the shared deep-merge helper
  from `src/lib/rendering/`; text edits dispatch to `slidesJson`.
- In-place editing: template zone rects scaled to display size become invisible
  click targets over the preview `<img>`; click mounts a positioned textarea
  (`EditableField` behavior); focal-point drag uses the same mechanism on the
  background layer.
- Save: POST `{ design_overrides, slides_json }` to `/api/ai/design` →
  agency-scope check → merge → satori + sharp render of dirty slides → storage
  upload via admin client → replace `post_images` rows.
- Contract enforcement is server-side: one tested util strips override-present
  paths from any regenerate write.
- All three entry points mount `<DesignEditorDialog postId>` with a single loader
  GET (post + kit + design), guaranteeing identical state.

### Phase 5 — AI imagery (generated + asset-based)

1. Migration: `client_assets`; brand kit tab gains asset library section.
2. `src/lib/imagegen/` with the single launch adapter `fal.ts` (see module table).
   Job-type routing table: backgrounds/covers → `fal-ai/nano-banana-2`; asset
   edits → `fal-ai/nano-banana-2/edit`; editor preview cycles →
   `google/nano-banana-2-lite`; premium editorial (opt-in) → Flux 2 Pro.
   Failover order per job type mirrors the table, ending at the Satori
   solid-color floor.
3. Design pass extension: per-slide background decision + image brief
   (visual_direction prepended; negative-space composition constraint; "no people"
   unless `allow_ai_people`). Default deck policy: **1 generated cover + optional
   1 asset scene, solid everywhere else** (~2 image calls ≈ $0.16/post at fal 1K
   pricing, verified 2026-07-07).
4. Legibility QA: vision check on composited photo-slides (headline readable, no
   subject collision) → auto-escalate scrim → next candidate → solid.
5. Editor AI section ("uses credits"): editable brief, 3 candidates (kept in
   `design_json.candidates`, switching free), "New art", "Edit art" (image-to-image
   instruction), "From assets" (+ scene instruction), and a **per-slide model
   dropdown** — friendly tiers backed by the routing table, credit cost shown:
   "Standard — Nano Banana 2", "Fast draft — Nano Banana 2 Lite", "Premium —
   Flux 2 Pro". Default = the routing table's pick for the job type; a selection
   persists as `background.model_key` and is respected by regenerate. The
   pipeline/cron path never shows the dropdown and always uses the routing table.
   Simple per-agency monthly counter (hard-coded quota; Stripe metering later).

**✓ Verify:** cover generates with usable copy-space ≥ 8/10 runs on a real client
kit; deliberately bad prompt degrades to solid without failing the post; asset
scene edit preserves the product recognizably; candidate switching costs no call.

### Phase 6 — Autonomy + surfacing polish

1. Cron generate path runs the same design+render (already shared via pipeline) —
   confirm timeouts/budgets fit Vercel limits (renders are ms; image calls are the
   long pole → cap concurrency).
2. Calendar chips: small indicator for scheduled posts with `failed`/`none` visuals.
3. Schedule/Publish gates: warn on missing visuals (pending is allowed — images
   attach before publish cron); publish pre-flight already requires images.
4. Brand kit re-render action: "Apply new kit to scheduled posts" (skips `manual`
   and posts with overrides on affected fields).

**✓ Verify:** overnight cron run lands fully-visual posts in review with zero human
input; a failed visual shows as one badge, not a failed run; kit color change +
re-render updates scheduled posts and leaves manually-edited ones untouched.

---

## 6. Implementation order

```
Phase 0 → fonts/ + render spike script            ← gate: Bulgarian PNG
Phase 1 → migration + brand-kit tab + proposal
Phase 2 → lib/rendering/ + 5 templates + storage  ← gate: deck renders end-to-end
Phase 3 → ai/design/ + pipeline + wizard + review + in-place text editing slice
Phase 4 → editor + entry points                   ← flagship phase: largest frontend
                                                    budget, gated by UX bar not
                                                    feature completion
Phase 5 → client_assets + lib/imagegen/ + QA + editor AI section
Phase 6 → cron + calendar + gates + kit re-render
```

---

## 7. What is NOT in this plan

| Item | Why excluded |
|---|---|
| Freeform canvas editor | Breaks parametric model, two-renderer drift, AI-override contract, cron. Revisit only as "detach to canvas → manual PNG" (Polotno embed) if Upload/Canva escape-hatch usage after Phase 4 proves demand. |
| Baked text-in-image mode | Text correctness by construction wins for a revision-heavy, Bulgarian-first pipeline. `render_mode` concept parked; revisit per-slide opt-in if a real need appears. |
| Style preset gallery + reference-style extraction | Phase 2 of the vision (Kittl-inspired). `style_reference_paths` column ships now; the browsing UI and vision-extraction pass come after base validation. |
| Credit metering / billing | Simple quota counter only; real metering lands with Stripe billing work. |
| Direct `gemini.ts` adapter | fal-only at launch keeps one vendor/key/bill; the provider interface makes gemini a one-file follow-up for the official price floor (~$0.067 vs $0.08 at 1K) or cross-vendor failover if fal falters. |
| Reels/video visuals | Separate plan. |
| Per-theme post-type mixing, carousel candidate competition | Text-pipeline improvements, tracked separately. |

---

*Kontuur — AI-Generated Visuals Plan*
*AI paints the art, Satori sets the type, the brand kit holds the line.*
*The same Satori draws the preview and the PNG — what you see is what publishes.*
*Editing is free and instant; only new AI art costs a credit. Failures degrade,
never block. The cron ships finished posts while everyone sleeps.*