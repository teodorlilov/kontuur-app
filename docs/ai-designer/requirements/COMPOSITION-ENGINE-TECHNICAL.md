# Composition Engine — Technical Design

> **Status:** Proposed — not built.
> **Companion:** [`COMPOSITION-ENGINE-PRODUCT.md`](./COMPOSITION-ENGINE-PRODUCT.md) — what must be true.
> **Retires:** the Satori renderer and everything built on it.
> **Feature IDs** (`F-1`…`F-12`) refer to the product document.

---

## 1. Why Satori goes

Satori implements a subset of CSS on its own layout engine. No `z-index` — paint order is
document order. No pseudo-elements, no `filter`, no `mix-blend-mode`, no `background-clip: text`,
no CSS Grid, no OpenType features, no WOFF2.

The result is not unambitious templates. It is that **no design involving layering, cropping,
blending, or photographic compositing is expressible.**

Two quieter costs:

- **No measurement.** Satori cannot tell us, before render, whether a headline overflows.
- **Two renderers.** The editor preview is React in a browser; the export is Satori on the
  server. Different implementations of the same design, and they drift.

Replacement: **headless Chromium pointed at our own Next.js route.**

> **The editor canvas and the PNG exporter are the same React tree.** Not shared components —
> the same tree, in the same runtime, driven by the same `composition_json`.

Everything below follows from that sentence.

---

## 2. Architecture

```
  Brand kit (client)          Feed system (agency, shared)
  tokens, subjects            compositions, chrome, pack, photographic style, rhythm
        │                                │
        └────────────┬───────────────────┘
                     ▼
         composition_json  (scene graph, LLM-authorable, diffable)
                     ▼
            <Composition/>  — one React renderer
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
   Editor canvas           Chromium → PNG
   (react-moveable)        (Fly.io render service)
```

**Generators, and what constrains them:**

| | Produces | When | Constrainable? |
| --- | --- | --- | --- |
| Recraft Vector | marks (SVG) | system creation | **Yes** — `rgb_colors`, then snap |
| fal diffusion | photographic plate | post generation | **No** — steer only |
| Claude | chrome (SVG), copy | system creation, generation | Deterministic |
| Chromium | everything else | every render | Deterministic, free |

**The asymmetry to internalise.** Vector output can be constrained exactly. Diffusion output
cannot. So do not try to make the diffusion model brand-compliant. Make it produce a good
photograph and impose the brand at composite time — a `multiply` treatment layer, a scrim,
exact-colour chrome, exact-colour type.

Twelve posts look like one campaign because they share a **treatment**, not because the model
remembered.

---

## 3. Data model

New tables, all scoped to an agency and protected by RLS, consistent with the existing schema. Not
all carry `agency_id` directly — see *Row-level security* below.

```sql
create table brand_kits (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references agencies(id) on delete cascade,
  client_id          uuid not null references clients(id) on delete cascade,
  version            int  not null default 1,
  tokens             jsonb not null,
  subject_vocabulary jsonb not null default '[]'::jsonb,
  motif_vocabulary   text[] not null default '{}',        -- ['leaf','sun','droplet','hand']
  source_kind        text not null,      -- 'website' | 'image' | 'manual'
  source_ref         text,
  extraction_report  jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (client_id)
);

create table feed_systems (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agencies(id) on delete cascade,
  name         text not null,
  visibility   text not null default 'agency',    -- 'private' | 'agency' | 'marketplace'
  photographic jsonb not null,
  mark_style   text  not null,       -- style clause only; never a subject
  font_reqs    jsonb not null,
  rhythm       jsonb not null,
  plate_budget text not null default 'cover-only', -- 'none'|'cover-only'|'every-third'|'all'
  version      int  not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table compositions (
  id             uuid primary key default gen_random_uuid(),
  feed_system_id uuid not null references feed_systems(id) on delete cascade,
  role           text not null,   -- 'cover'|'statement'|'list'|'quote'|'cta'|'single'
  size           jsonb not null,
  layers         jsonb not null,  -- TEMPLATE layers; a mark position is a MarkSlot, resolved to a MarkLayer at generation (§9.1 step 4)
  plate_count    int  not null default 0,
  focal_zones    jsonb,
  created_at     timestamptz not null default now()
);

create table pack_elements (
  id             uuid primary key default gen_random_uuid(),
  scope          text not null,     -- 'style' | 'motif'
  feed_system_id uuid references feed_systems(id) on delete cascade,
  brand_kit_id   uuid references brand_kits(id)   on delete cascade,
  svg            text not null,
  paint_roles    jsonb not null,   -- { pathId: { fill?: role, stroke?: role } } — fill AND stroke, see §8.4
  ordinal        int  not null,    -- rotation order; no tagging, no matching
  source_prompt  text,
  curated        boolean not null default false,
  created_at     timestamptz not null default now(),

  constraint pack_owner_exclusive check (
    (scope = 'style' and feed_system_id is not null and brand_kit_id is null) or
    (scope = 'motif' and brand_kit_id   is not null and feed_system_id is null)
  )
);

create table client_feed_systems (
  client_id      uuid not null references clients(id) on delete cascade,
  feed_system_id uuid not null references feed_systems(id) on delete cascade,
  is_default     boolean not null default false,
  overrides      jsonb not null default '{}'::jsonb,
  primary key (client_id, feed_system_id)
);

create table post_visuals (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references posts(id) on delete cascade,
  slide_index       int  not null,
  composition_json  jsonb not null,
  brand_kit_version int  not null,
  feed_system_id    uuid not null references feed_systems(id),
  rendered_url      text,
  render_hash       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (post_id, slide_index)
);

create table plate_edits (
  id             uuid primary key default gen_random_uuid(),
  post_visual_id uuid not null references post_visuals(id) on delete cascade,
  parent_id      uuid references plate_edits(id) on delete cascade,
  layer_id       text not null,
  op             text not null,   -- 'generate'|'reroll'|'reprompt'|'inpaint'|'erase'|'upload'
  prompt         text,
  mask_url       text,
  result_url     text not null,
  seed           bigint,
  created_at     timestamptz not null default now()
);
```

`plate_edits` is a **tree, not a stack.** Branching is free; undo is a pointer move. Cost is not
stored here — `image_jobs` (§10.9) is the single source of spend, so nothing can drift.

### Row-level security

Only `brand_kits`, `feed_systems`, and `image_jobs` carry `agency_id` directly. The rest are scoped
**by join**, and their policies must enforce it: `compositions` and `pack_elements` through
`feed_system_id → feed_systems.agency_id`; `client_feed_systems` and `post_visuals` through
`client / post → clients.agency_id`; `plate_edits` through `post_visual_id → post_visuals → …`. A
policy that forgets the join is a cross-agency read of another studio's brand kits and photography.
Write it once as a reusable `agency_of(...)` predicate, tested — never per-table by hand.

### Versioning

`brand_kits` is `unique (client_id)` — one row per client — so `version` bumps **in place**; there
is no kit history. `post_visuals.brand_kit_version` is therefore a *stale-or-current* flag, not a
key you can reconstruct an old palette from. That is intentional: published posts are locked, and
drafts always re-render **forward** to the current tokens (§11). Nothing ever needs the old values.

### Hard constraint, enforced in code and in CI

> A `compositions.layers` blob or a `pack_elements.svg` containing a hex literal or a font family
> name is a **validation failure**, not a code smell.

Write the check as a zod refinement plus a migration-time SQL check. It is the only thing
standing between a shared feed system and thirty forked ones.

---

## 4. Token schema

```ts
type ColorRole =
  | 'surface'      // page ground
  | 'ink'          // display + body type
  | 'accent'       // kicker, rule, mark highlight
  | 'accent-deep'  // plates, solid blocks, deep panels
  | 'line'         // hairlines, frames, corner marks

type BrandTokens = {
  color: Record<ColorRole, string>
  type: {
    display: { family: string; weights: number[]; tracking: number; case: 'none'|'upper' }
    body:    { family: string; weights: number[]; tracking: number }
    scale:    number     // ratio, e.g. 1.333
    baseSize: number     // px at 1080×1350
  }
  space: { unit: number; radius: number; hairline: number }
  grid:  { marginX: number; marginY: number; baseline: number }
}
```

Five roles, one per painted element — nothing abstract. That direct element→role link is the whole
point: a mark declares `stroke: line`, a plate declares `fill: accent-deep`, and both recolour
cleanly for every client. There is no sixth "extra tone" a composition would have to reason about,
which is also why role-snapping (§8.4) has more separation to work with. Never `color1`…`color5`; a
shared feed system cannot reason about `color3`.

The **photographic style** lives on the feed system — it is a look, and looks are what get shared:

```ts
type PhotographicStyle = {
  lighting: string          // 'soft natural daylight'
  grade: string             // 'cool desaturated'
  depth: string             // 'shallow, f/2'
  texture: string           // 'fine film grain'
  negative: string          // always includes 'no text, no letterforms, no watermark'
  treatment: 'none' | 'duotone' | 'tint' | 'grain' | 'mono'
  treatmentStrength: number // 0–1
}
```

The **subject vocabulary** lives on the brand kit — it is industry-specific:

```ts
type SubjectVocabulary = string[]   // ['skincare routine', 'sun exposure', 'clinical setting']
```

Full plate prompt = `PhotographicStyle` + one subject sentence. §9.2 explains why the operator
may edit only the second half.

### Font requirements, not font choices

```ts
type FontRequirement = {
  category: 'grotesk' | 'condensed' | 'serif' | 'slab' | 'geometric' | 'any'
  maxWidthRatio?: number   // avg advance / em, measured at ingest
  weights: number[]
}
```

The feed system declares requirements; the brand kit supplies the family; the fit check (§8.2)
absorbs the residual mismatch.

---

## 5. Scene graph, and the binding discriminant

Forty lines of schema, and the difference between a tool people trust and a tool people fight.

```ts
type Binding<T> =
  | { mode: 'bound';   token: string }   // 'color.accent', 'type.display'
  | { mode: 'literal'; value: T }

type Rect = { x: number; y: number; w: number; h: number; rotate: number }

type Clip =
  | { kind: 'none' }
  | { kind: 'rect'; radius: number }
  | { kind: 'ellipse' }
  | { kind: 'mark'; packElementId: string }

type BlendMode = 'normal'|'multiply'|'screen'|'overlay'|'soft-light'|'luminosity'

type LayerBase = {
  id: string
  name: string
  locked: boolean
  hidden: boolean
  rect: Rect
  opacity: Binding<number>
  blendMode: Binding<BlendMode>
  clip: Clip
}

type PlateLayer = LayerBase & {
  type: 'plate'
  source: 'generated' | 'uploaded'
  editHeadId: string | null            // pointer into plate_edits
  src: string
  treatment: Binding<PhotographicStyle['treatment']>
  focalZone?: Rect
}

type MarkLayer = LayerBase & {
  type: 'mark'
  packElementId: string
  roleOverrides: Record<string, { fill?: Binding<string>; stroke?: Binding<string> }>
}

type TextLayer = LayerBase & {
  type: 'text'
  slot: 'kicker' | 'headline' | 'body' | 'cta' | 'free'
  content: string
  lang: string                          // BCP-47; drives OpenType `locl`. See §6.
  family: Binding<string>
  size: Binding<number>
  weight: Binding<number>
  color: Binding<string>
  align: Binding<'left'|'center'|'right'>
  autoFit: { min: number; max: number } | null
}

type MarkSlot = { markSource: 'style' | 'motif' }   // template-only; resolved to a MarkLayer at generation (§9.1 step 4)

type ChromeLayer = LayerBase & {
  type: 'chrome'
  component: 'rule'|'corner-frame'|'dot-grid'|'arc'|'badge'|'numeral'|'index-dots'
  params: Record<string, Binding<unknown>>
}

type ShapeLayer = LayerBase & {
  type: 'shape'
  shape: 'rect' | 'ellipse'
  fill: Binding<string>
}

type GroupLayer = LayerBase & { type: 'group'; children: Layer[] }

type Layer = PlateLayer | MarkLayer | TextLayer | ChromeLayer | ShapeLayer | GroupLayer

type Composition = {
  id: string
  feedSystemId: string
  brandKitVersion: number
  size: { w: 1080; h: 1350 }
  layers: Layer[]        // array order IS paint order; index 0 is bottom
}
```

Notes that matter:

- **`z-index` is array order.** No field. Drag in the layer panel = `splice`.
- **`blendMode` and `clip` ship in v1** because two plates per slide are allowed. This is what
  makes duotone splits and framed insets expressible. Satori could express none of it.
- **`autoFit` is a range, not a boolean.** The renderer measures.
- **Propagation flows through `bound` and stops at `literal`.** That is the entire purpose of
  `Binding<T>`.
- **Template vs instance.** `compositions.layers` is the *template*: a mark position is a `MarkSlot`
  declaring `style` or `motif`, nothing concrete. Generation (§9.1 step 4) resolves each slot to a
  `MarkLayer` with a real `packElementId`; that resolved tree is what `post_visuals.composition_json`
  stores and what `<Composition/>` renders. The editor only ever sees resolved layers.

---

## 6. The render service

```
  Fly.io container (one warm instance)
  ├── Playwright + Chromium
  ├── fonts baked in (Inter, Noto Sans, agency uploads mounted from Storage)
  └── POST /render { postVisualId, token }
        ├─ navigate → https://kontuur.app/render/{postVisualId}?token=…
        │     a Next.js route rendering <Stage/> and nothing else
        ├─ await document.fonts.ready
        ├─ await window.__stageReady        (set after images decode)
        ├─ page.locator('#stage').screenshot({ type: 'png' })
        └─ upload → Supabase Storage → { url, hash }
```

No serialisation step. No second renderer. No drift.

**Not `@sparticuz/chromium` on Vercel.** Cold starts and the 50 MB bundle ceiling will make this
miserable. A dedicated container is cheaper and faster. Render eight slides sequentially in one
browser context rather than eight cold lambdas.

**Render skipping.** `render_hash = sha256(composition_json)`. Unchanged hash → serve the stored
PNG. A token change dirties every hash; nothing else does.

### Two font problems, both silent

**Subsets.** Required scripts are derived from what the client **posts in**, not where they are:

```ts
requiredSubsets = scriptsFor(client.primary_language)
               ∪ scriptsFor(client.secondary_language ?? null)
```

A client posting in Bulgarian needs `cyrillic`. A Sofia-based client posting only in English does
not, and must keep the full Latin library. A client posting in both needs one family carrying both
subsets — never two families paired across languages.

Query the Google Fonts API for `subsets` — **never hard-code a blocklist.**

> An earlier draft of this plan cited Playfair Display as lacking Cyrillic. It does not: Playfair
> ships Cyrillic, Cyrillic small-caps, and lists Bulgarian. The mechanism was right, the example
> was wrong. Query, never assume.

The primary defence is F-4: filter the font picker by `requiredSubsets` so a broken family is never
offered. The save-time check remains a backstop for two cases the filter cannot cover — custom font
uploads, and a client whose languages change after the kit was written. In the second case a
warning is the correct response, because the choice was valid when it was made.

**Localized letterforms.** Bulgarian Cyrillic uses different shapes from Russian for
б, в, г, д, ж, з, и, к, л, п, т, ц, ш, щ. Fonts implementing the OpenType `locl` feature emit them
**only when the text is tagged `lang="bg"`.**

Set `lang` on `#stage` and on any text layer whose language differs from the post's primary. Hence
`TextLayer.lang`.

Chromium honours this. Satori, with no OpenType feature support at all, never could. **This is the
single most likely silent failure in the system** — the fallback looks plausible to anyone who
doesn't read Bulgarian.

**The library.** The picker draws from ~50 curated Google Fonts families, not the full catalogue —
the curation is the product. Display and body are independent roles with suggested (not enforced)
pairings; variable axes (`wght`, `opsz`, `slnt`) surface as sliders where the family exposes them.

**Custom fonts.** WOFF2/TTF/OTF, agency-scoped. Parse the `cmap` table at upload to determine
actual script coverage. Serve from Storage via signed URL; the render route injects `@font-face`.
Cache WOFF2 in the container — a cold Google Fonts fetch inside Chromium adds ~1s to every render.

---

## 7. Extraction (F-1, F-2)

### Website — measurement, not inference

Reuse the Playwright container. This is why F-1 depends on the render service.

1. Navigate; await network idle and `document.fonts.ready`.
2. Sample DOM nodes (h1–h3, body, buttons, links, backgrounds). Read `getComputedStyle`. This
   yields resolved font families, actual hex, actual size ladder, actual spacing.
3. Cluster colours by frequency × painted area — one per painted element, all five roles:
   - largest background → `surface`
   - dominant text colour → `ink`
   - highest-saturation colour on interactive elements → `accent`
   - darkest tint of accent → `accent-deep`
   - most common border / rule colour, else a low-contrast tint of `ink` → `line`
4. Fit a ratio to the observed size ladder → `type.scale`.
5. Screenshot 1440×2400 → Claude vision, for the **qualitative** layer only: density, contrast
   strategy, photographic character, subject vocabulary.

Steps 2–4 are measurement. Only step 5 is inference. Record which:

```ts
type ExtractionReport = {
  fields: Record<string, { confidence: 'measured' | 'inferred' | 'guessed'; note?: string }>
}
```

Also compute the metrics that drive the feed-system recommendation (F-3):

| Measured | Recommend |
| --- | --- |
| serif display · margin ratio > 10% · low text density | Editorial |
| sans display · h1 weight ≥ 700 · large flat colour areas | Bold blocks |
| sans display · weight ≤ 600 · high whitespace · hairline borders | Quiet grid |

### Reference image

k-means over pixels weighted by area → palette, mapped to roles by luminance and saturation.
Vision for mood and subject vocabulary. **Fonts cannot be recovered from a JPEG** — propose the
three nearest families in the vision-detected category, badge `guessed`, require confirmation.

### Async, not blocking

Extraction adds 15–25s. Run it behind the existing `Skip to interview →`. The operator spends four
minutes on the interview; extraction finishes; Review renders the result. If not, Review shows a
skeleton and hydrates in place.

The two new Analyzing checklist rows must not gate the Continue button.

---

## 8. Element packs and role snapping (F-5, F-5b)

### 8.1 Two packs, one prompt structure

A shared feed system cannot contain meaning — one of its clients is a law firm. So marks split
exactly the way plate prompts split:

```ts
markPrompt = feedSystem.markStyle          // locked, shared
           + brandKit.motifVocabulary[i]   // per client, per mark
```

`feed_systems.mark_style` is a style clause, never a subject:

```
'single-weight line drawing, organic, unfilled, rounded terminals,
 flat, no perspective, no shading, no text'
```

`brand_kits.motif_vocabulary` is a flat list of subjects derived at onboarding from the client's
niche — the same LLM step that produces the photographic subject vocabulary:

```ts
motifVocabulary: string[]   // ['leaf', 'sun', 'droplet', 'hand', 'bottle', …]
```

**No pillar tagging.** Twelve motifs across five pillars gives two candidates per pillar, which is
rotation wearing a costume — and it costs a classification step, a column, a fallback rule, and a
new failure mode whenever a pillar is added. Motifs are decoration. Selection is deterministic
(§9.1 step 4).

| Pack | Scope | Count | Curated? |
| --- | --- | --- | --- |
| **style** | feed system | 30 → keep 15 | **yes, mandatory** |
| **motif** | brand kit | 12 | no, default-accept |

Curate what is shared, because its quality compounds across every client. Auto-accept what is
per-client, because it is one click to replace.

Moving a client to a different feed system offers to regenerate their motifs in the new style —
offered, never silent. The motif vocabulary follows the client's niche, so adding a content pillar
changes nothing about it.

### 8.2 Calling Recraft

Vector generation goes through the same adapter as everything else metered (§10.2). It is a batch
path — thirty marks is minutes, not seconds — so it uses `fal.queue.submit` plus a webhook, never a
held-open request.

```ts
{ kind: 'mark.generate',
  markStyle: feedSystem.mark_style,          // locked style clause
  subject:   'a leaf',                       // one motif, or one abstract form
  rgbColors: CANONICAL_ROLE_PALETTE }        // NOT the client's palette — see below
```

**`rgb_colors` is seeded from a canonical role palette**: a neutral reference set with one
maximally-separated hue per role. Not any client's colours. The separation is the entire point —
it is what makes the returned fills recoverable by nearest-neighbour in §8.4. Seed it with a
client's actual palette, where `accent` and `accent-deep` sit a few ΔE apart, and the snapping step
cannot tell them apart.

Recraft returns an SVG URL. Fetch the text, sanitise it, store the string in `pack_elements.svg`.
Marks are small; they belong in Postgres, not object storage.

fal exposes the full Recraft API — vector generation and `create-style` alike — so there is no
separate Recraft integration or key. It is one more model behind `FAL_KEY`, routed through the same
adapter (§10.2) as everything else.

Two Recraft paths remain open until Phase 0:

- **V3 + trained `style_id`** — stronger stylistic coherence, but SVG export alongside a registered
  style is unconfirmed.
- **V4.1 Vector + image reference + `strength` + `rgb_colors`** — SVG confirmed, coherence rests on
  the prompt.

If the first works, use it. If not, the second, and the curation ratio absorbs the difference.

### 8.3 Sanitisation — this is a security boundary

**Recraft output is untrusted input, and we inline it into the DOM.** An SVG can carry `<script>`,
event handlers, `<foreignObject>`, external `<use href>`, and remote `<image href>`. Inlining a raw
provider response into the editor canvas is stored XSS with an AI in the middle of it.

Sanitise server-side, at ingest, once. Allowlist only:

```
elements:   svg g path circle ellipse rect line polyline polygon defs clipPath
attributes: d fill stroke stroke-width stroke-linecap stroke-linejoin
            cx cy r rx ry x y x1 y1 x2 y2 width height points transform
            viewBox clip-path id
```

Everything else is stripped, not escaped. `<script>`, `on*`, `href`, `xlink:href`, `style`,
`<foreignObject>`, `<image>`, `<text>` — all removed. Reject the element if any of them appeared;
a mark that arrived with a script tag is not a mark we want in a shared pack.

Then normalise:

- Collapse `width`/`height` to nothing; keep `viewBox`, rescaled to `0 0 100 100`.
- Assign deterministic ids in document order — `p1`, `p2`, … `pn` — to every drawable node.
- Reject if the node count exceeds 40. A mark with 200 paths is a traced blob, not a shape a person
  can select in the layer panel.

### 8.4 Role snapping — the ingest step that makes sharing possible

For each sanitised SVG:

1. For each unique `fill` and each unique `stroke`, compute ΔE (CIEDE2000) against every canonical
   role colour.
2. Snap to the nearest role if `ΔE < threshold`. If **any** paint is unassignable, reject the whole
   element — the model went off-palette and the mark will never recolour cleanly. Surface the
   rejection with its reason (F-5).
3. Rewrite the paint as a CSS variable reference (§8.5) and record the mapping.

```ts
type PaintRole = { fill?: ColorRole; stroke?: ColorRole }
type RoleMap   = Record<string, PaintRole>   // pathId → roles
```

Note `stroke`, not just `fill`. `Editorial`'s marks are single-weight line drawings — most of their
colour lives in strokes. An earlier draft of this schema had `fillRoles` only, and would have
silently dropped every outline.

The ΔE threshold is **measured in Phase 0, not guessed.**

### 8.5 Role binding is a CSS variable, not a render-time substitution

At ingest, each paint becomes an inline style referencing a custom property:

```html
<path id="p3" style="fill:var(--role-accent); stroke:var(--role-ink)" d="…"/>
```

`<Stage/>` sets `--role-accent`, `--role-ink`, and the rest from the active brand kit. The browser
resolves them.

This is worth stating plainly because it collapses three problems into zero work:

- **Rebrand re-render is free.** Change the variables on the wrapper; every mark in every stored
  post recolours. Nothing is regenerated, nothing is even rewritten.
- **The editor's per-path recolour is a variable swap**, not an SVG mutation.
- **`MarkLayer.roleOverrides` layers on top** as a scoped variable on that one element.

Inline `style` supports `var()`. Presentation attributes (`fill="var(--x)"`) do not — write the
style attribute. This is exactly the kind of thing Satori could not do, and it is why the mark
system is possible at all.

`style` is stripped by the sanitiser on input and written by us on output. Provider-supplied styles
never survive; ours are the only ones present.

### 8.6 Rejection rules, stated once

An element is rejected — and the reason surfaced in the curation grid (F-5) — if it:

| Reason | Why |
| --- | --- |
| contains `<text>` | the no-text contract applies to vectors too; a mark with baked letterforms cannot be translated |
| contains `<image>` or `<foreignObject>` | it is a raster or an HTML payload wearing an SVG costume |
| carries a gradient or pattern fill | cannot be snapped to a single token role |
| has any unassignable paint (`ΔE ≥ threshold`) | will never recolour cleanly per client |
| exceeds 40 drawable nodes | unusable in the layer panel; almost certainly a trace |
| arrived with a script tag or event handler | discard, and log it |

Expect a rejection rate. Phase 0 measures it, and the measurement sets the generation count: if 3
of 40 are rejected, generate 30 to keep 15. If 15 are, the prompt template is off-palette and
generation goes to 50.

### 8.7 What we do not use Recraft for

- **Photographs.** Its photorealism trails Flux and Nano Banana.
- **Vectorising uploads.** `recraft/vectorize` exists, and a traced logo produces exactly the
  200-path blob §8.3 rejects. An agency's logo is uploaded as an SVG or it is uploaded as a raster
  and stays one.
- **Per-post generation.** Marks are system assets. Nothing is generated per post except the
  photograph.

---

## 9. Generation and editing

### 9.1 Generation pipeline (F-6)

The wizard gains no steps. Step 4 does the work:

1. Rhythm rules map slide index → composition role.
2. Copy binds into slots (`kicker`, `headline`, `body`, `cta`). `lang` set per layer.
3. **Fit check.** Render headless, measure each `autoFit` layer. Overflow → step `size` down
   within `[min, max]` → still overflowing → ask the copy model to shorten to ≤ N chars → still
   failing → flag with reason.
4. Marks. The composition's mark slot declares `markSource: 'style' | 'motif'`. Selection is
   `pack[(slideIndex + seed) % pack.length]`, rejecting any mark used on the previous slide. No
   matching, no model call, free.
5. **Plate placeholders**: token-derived gradients. No fal calls.
6. **Legibility guard.** Sample the composite beneath each text bounding box; compute WCAG
   contrast against the resolved colour; below 4.5:1 insert a scrim layer directly under the text.
7. Render. Concurrency 5.

Order matters: fit before plate (cheap before expensive); legibility last, because it must see the
final composite.

Plates are generated when the operator lands on **Results**, per `feed_systems.plate_budget`.

### 9.2 Editor (F-8)

**Routing is a function of selection, not a user choice.**

```ts
const ROUTE = {                                                     // cost = internal metering only, never shown
  plate_masked: { model: 'nano-banana-edit | flux-fill', cost: 4 },
  plate:        { model: 'same as original',             cost: 4 },  // subject half only
  mark:         { model: 'recraft/v4.1/text-to-vector',  cost: 8 },
  path:         { model: null,                           cost: 0 },  // bar disabled
  text:         { model: 'claude',                       cost: 0 },
  none:         { model: null,                           cost: 0 },  // composition swap
}
```

One prompt bar. It shows what the action will do before the operator commits — never a price, never
a model name.

**Modes: `Select` and `Mask`.** `Mask` is enabled only with a plate selected. It is a raster
`<canvas>` overlay producing a PNG alpha mask via `fal-ai/sam2` on click, brush and lasso as
fallback. It never touches the scene graph.

**DOM and SVG, not Fabric or Konva.** A canvas library is a second renderer, and two renderers
diverge. Marks are inlined SVG with `data-layer-id` per path, so shape-level editing is DOM
manipulation — no path math. `react-moveable` + `react-selecto` for transform and marquee.
`zustand` + `immer` for state; immer patches give free undo/redo and a path to multiplayer.

**Constrained-first controls.** Every snapped slider goes continuous on `Alt`, and at that moment
flips its `Binding` from `bound` to `literal`. One gesture, one visible consequence.

`Margin` is not a text property — it lives on the composition. The panel says so and links there.

### 9.3 Plate edit chain (F-9)

Every operation appends a `plate_edits` row with `parent_id`. `PlateLayer.editHeadId` points into
the tree. Undo moves the pointer; nothing is destroyed; branching is free.

Any op that replaces the whole plate (`reroll`, `reprompt`, `upload`) **clears the active mask**,
and the UI says so rather than silently keeping a stale selection.

After every plate op, re-run the legibility guard. Treatment and scrim reapply automatically —
they were never baked into the image.

### 9.4 Model routing table

Which model answers is decided here and nowhere else. §10 covers how the call is made.

| Operation | Model | Note |
| --- | --- | --- |
| Vector marks | `fal · recraft/v4.1/text-to-vector` | pack creation only; queue + webhook; sanitised at ingest (§8.3) |
| Trained style (if viable) | `fal · recraft/v3/create-style` | **Phase 0 must verify SVG export survives** |
| Plate | `fal · nano-banana` / Flux | Recraft photorealism trails both |
| Segment on click | `fal-ai/sam2` | mask only, no generation |
| Inpaint | Flux Fill **and** Nano Banana edit | NB better at "match this"; Flux at "add this" — A/B |
| Erase | inpaint, empty prompt | |
| Chrome | Claude writes SVG | parametric, token-bound, deterministic |
| Composite | Chromium | treatment, blend, scrim, type — deterministic |

Every plate call appends `no text, no letterforms, no watermark` to the negative prompt, always.
When `clients.is_health` is set, append the clinical exclusions from F-4.

---

## 10. The diffusion layer and the fal.ai integration

Everything metered runs through one adapter. Nothing above it knows which provider answered.

### 10.1 Why fal, and the one thing that isn't on it

`fal` is an aggregator: one key, one client, one billing surface, output-based pricing, and low
enough cold-start latency to survive an editor loop where the operator is watching. It carries
**every image model this system uses** — Recraft (vector *and* `create-style`), Flux, SAM2, and Nano
Banana — so it is the single provider for everything metered. One integration, one key, one place to
reconcile our own costs, no second image vendor to keep pinned and in sync. We pay the aggregator
margin and take the simplicity.

**The one exception is Claude,** which is not an image model and is not on fal. Chrome SVG and copy
rewriting go to Anthropic directly, as they do now. That is the only non-fal call in the system.

### 10.2 The adapter boundary

```ts
type ImageJob =
  | { kind: 'plate.generate'; style: PhotographicStyle; subject: string; seed?: number }
  | { kind: 'plate.reroll';   parentId: string; seed: number }
  | { kind: 'plate.reprompt'; parentId: string; subject: string }
  | { kind: 'plate.inpaint';  parentId: string; maskUrl: string; prompt: string }
  | { kind: 'plate.erase';    parentId: string; maskUrl: string }
  | { kind: 'mark.generate';  markStyle: string; subject: string; rgbColors: string[] }
  | { kind: 'mask.segment';   imageUrl: string; point: [number, number] }

type ImageResult = {
  url: string          // OUR storage, never the provider's
  provider: string     // always 'fal' (kept for the audit trail)
  model: string        // pinned id
  seed: number | null
  costCents: number
  latencyMs: number
}
```

Callers construct an `ImageJob`. They never choose a model, never see a provider URL, never hold a
raw prompt. This is the same rule the editor enforces on the operator (§9.2), applied one layer
down.

### 10.3 Model registry — pin, never float

```ts
export const MODELS = {
  plate:    { provider: 'fal', id: 'fal-ai/nano-banana' },
  plateAlt: { provider: 'fal', id: 'fal-ai/flux-pro/v1.1' },
  inpaint:  { provider: 'fal', id: 'fal-ai/flux-pro/v1/fill' },
  edit:     { provider: 'fal', id: 'fal-ai/nano-banana/edit' },
  segment:  { provider: 'fal', id: 'fal-ai/sam2/image' },
  vector:   { provider: 'fal', id: 'fal-ai/recraft/v4.1/text-to-vector' },
} as const
```

> **These slugs are illustrative.** Confirm each against fal's live model registry in Phase 0 and
> pin the exact identifier. A floating alias means a provider update silently changes every
> client's photography, and `render_hash` will not catch it because the composition never changed.

Every `plate_edits` row stores `provider`, `model`, `seed`, and the full resolved prompt. A plate
must be reproducible and auditable eighteen months later, when a client asks why their feed
changed.

### 10.4 Prompt assembly

Assembled in one place, never by a caller:

```
{style.lighting}, {style.grade}, {style.depth}, {style.texture}
{subject}
--negative {style.negative}
        + "no text, no letterforms, no watermark, no logos"          // always
        + healthExclusions if clients.is_health                       // §F-4
```

The `no text` clause is appended unconditionally, at the adapter, not the call site. It is what
keeps Cyrillic working, and it must not be possible to forget it.

**Reroll** reuses the prompt, changes the seed. **Reprompt** replaces only `{subject}`; the style
clause is never reachable from the editor. This is enforced by the `ImageJob` shape — there is no
variant that accepts a style override.

### 10.5 Sync, queue, and where each belongs

| Path | Mechanism | Why |
| --- | --- | --- |
| Editor: inpaint, erase, segment | `fal.subscribe`, 30s cap | The operator is watching. Latency is the product. |
| Editor: reroll ×3 | three parallel `fal.subscribe` | Variants arrive as they land, not as a batch |
| Results: plate generation | `fal.queue.submit` + webhook | 8 slides × 20s exceeds any sane request lifetime |
| System creation: 30 marks | `fal.queue.submit` + webhook | Minutes, not seconds |

Never hold a serverless request open waiting on a queue. The webhook writes `plate_edits` and the
UI subscribes to the row via Supabase realtime — the same pattern the existing generation pipeline
already uses.

`FAL_KEY` is server-only. There is no browser-side fal call, ever, because a browser-side call is an
unmetered call.

### 10.6 Persist immediately

Provider result URLs are treated as **ephemeral**. On completion the adapter downloads the bytes,
normalises them (§10.7), uploads to Supabase Storage under
`plates/{agencyId}/{postVisualId}/{editId}.jpg`, and returns *that* URL.

`composition_json` never contains a provider URL. If it did, a rebrand two months later would
re-render against a dead link, and the free-propagation promise (F-11) would be a lie.

### 10.7 Resolution, aspect, and the focal-zone problem

Slides are 1080×1350 (4:5). Diffusion models emit their own supported sizes.

Generate at the model's nearest 4:5 size at or above 1080×1350, then `sharp` → cover-crop to
exact. Store **both** the raw provider output and the normalised plate; edits chain from the raw
one, so repeated inpaints never compound crop loss.

**Composition cannot be commanded.** Asking a diffusion model to "leave the lower third empty"
works perhaps two-thirds of the time. Three mitigations, in order of reliability:

1. **The scrim.** A gradient under the text guarantees legibility regardless of what the model put
   there. This is why legibility is enforced rather than checked.
2. **The prompt.** Append `{composition.focalHint}` — e.g. *"subject positioned upper right,
   negative space lower left"*. Helps. Does not guarantee.
3. **Detection, then a flag.** After generation, run `segment` on the plate to find the dominant
   subject's bounding box; store it as `PlateLayer.focalZone`. Overlap with the headline box raises
   the F-7 focal-zone warning.

That third step is the only honest answer to *"the model put her face under the headline."* We
detect it and tell the operator. We do not pretend we can prevent it.

### 10.8 Masks

Mask semantics are provider-specific and the adapter normalises them: **white = the region to
regenerate, black = keep.** Single channel, no anti-aliasing beyond a 2px feather.

Two rules that will otherwise cost a day each:

- The mask is generated against the **displayed** plate but must be applied at the **raw** plate's
  resolution. Scale it at the adapter, from stored dimensions, never from the DOM.
- Any op that replaces the whole plate — `reroll`, `reprompt`, `upload` — **invalidates the mask.**
  The geometry no longer describes anything. Clear it, and say so in the UI.

`segment` takes a click point in plate coordinates and returns a mask. If SAM2 returns the wrong
object, brush and lasso write a mask directly; the adapter cannot tell the difference.

### 10.9 Metering, idempotency, and caps

```sql
create table image_jobs (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references agencies(id) on delete cascade,
  idempotency_key text not null,
  kind            text not null,
  status          text not null default 'pending',  -- pending|running|done|failed
  provider        text,
  model           text,
  cost_cents      int not null default 0,
  request         jsonb not null,
  error           text,
  created_at      timestamptz not null default now(),
  unique (agency_id, idempotency_key)
);
```

The row is written **before** the call, with `status = 'pending'` and the cost we expect to incur.
A double-clicked `Reroll` collides on `idempotency_key` and returns the in-flight job rather than
buying a second one.

- **Concurrency:** 5 in-flight image jobs per agency, matching the existing generation pipeline.
- **Retries:** exponential backoff on `429` and `5xx` only. A completed generation is never
  retried — that is a second charge for the same picture.
- **Soft cap:** warn at 10 plate operations on one post (F-9). The warning is about *operation
  count*, not spend, and reads from `image_jobs`, not a client-side counter.
- **Spend is summed from `image_jobs`** for the agency's own cost records only. It is internal
  accounting — no price is shown to the operator anywhere in the product.

### 10.10 Failure is not an empty slide

If a plate job fails after retries, the slide falls back to its token-derived gradient and renders
normally. It is a complete, on-brand, publishable slide — because the design system, not the
photograph, is what makes it look good (F-6).

The operator sees the reason and a retry, in the existing banner style. They never see a broken
image, and the carousel never blocks on publish.

This is the whole cost rule turned into a failure mode: **the free path always works.**

---

## 11. Propagation (F-11)

`post_visuals.brand_kit_version` versus `brand_kits.version` is the dirty check.

Propagation fires on `Save changes` in `Visual system` — not in a background job the operator
never sees.

| Post status | Behaviour |
| --- | --- |
| `draft`, `pending_review` | re-render automatically |
| `approved`, `scheduled` | offer; never forced (the re-render is free) |
| `published` | never; editor opens read-only |

The offer surfaces in a calendar banner and in the schedule modal of each affected post.

The re-render is free because plates are stored raw and only the composite changes. `render_hash`
ensures unchanged slides are skipped.

---

## 12. Phases

### Phase 0 — Recraft capability spike *(1 day, first, no code merged)*

Take four Haelan brand assets. On `fal`, attempt:

- **(a)** V3 `create-style` → `style_id` → vector generation. **Can you get SVG out?**
- **(b)** V4.1 Vector + image reference + `strength` + `rgb_colors`.

Generate the same 8-mark pack both ways. Run role snapping (§8.2) on both outputs. Compare palette
adherence and stylistic coherence.

Alongside it, settle the fal questions that §10 leaves pinned to placeholders:

- Confirm every model slug in `MODELS` against fal's live registry. Pin exact identifiers.
- Confirm Recraft's vector response shape: an SVG URL, or inline markup, or a zip.
- **Measure the rejection rate** against the §8.6 rules. It sets the generation count.
- Confirm mask polarity for the chosen inpaint model — white-to-edit or black-to-edit.
- Confirm SAM2's output format and coordinate space.
- Confirm Nano Banana via fal: latency and unit cost acceptable for the highest-volume call.
- **Style drift across subjects.** Generate twelve *different* motifs from one `mark_style` clause.
  Palette drift is fixable with role snapping; style drift is not. This is the difference between a
  coherent motif pack and twelve unrelated icons.

**Deliverable:** the generation adapter's shape, a measured ΔE threshold, and a pinned model
registry.

*Acceptance:* a written decision. If SVG and trained styles turn out to be mutually exclusive,
stylistic coherence rests on the prompt template and the curation ratio moves from 30→15 to 50→15.

### Phase 1 — Render service + scene graph *(the unblock; ships nothing visible)*

- Fly.io container, Playwright, `POST /render`.
- `/render/[postVisualId]` route rendering `<Stage/>`.
- Scene graph types (§5) with zod validators, including the no-hex-no-family refinement.
- `<Composition/>` renderer: all six layer types, `Binding` resolution, blend, clip.
- Port existing Satori templates to compositions, by hand.
- `render_hash` skipping.

*Acceptance:* every current template renders through Chromium, pixel-compared against Satori
output. Cyrillic correct, `lang="bg"` set, `locl` forms verified against a reference specimen.
`satori` removed from `package.json`. **No user-visible change.**

> It will feel like a wasted sprint. It is the only sprint that makes the other six possible.

### Phase 2 — Extraction → brand kit (F-1, F-2)

Website extractor (async from onboarding step 2), image extractor, `ExtractionReport` badges,
Review step extended, neutral default kit, `brand_kits` table.

*Acceptance:* onboard `haelan.bg` through the existing four steps; tokens visually match the live
site within tolerance; zero perceived latency added. Skip the URL and still get a renderable kit.

> Depends on Phase 1 — extraction and rendering share the Playwright container.

### Phase 3 — Feed systems + packs (F-3, F-5, F-5b)

Tables, Recraft adapter, role snapping, seven chrome components, curation grid, visibility
`private | agency`. Style pack per system; motif pack per client, generated from
`motif_vocabulary` in the feed system's `mark_style`. **Author all three starter systems, not
one.**

*Acceptance:* one feed system renders correctly under two different brand kits from the same
style-pack rows. A skincare client and a law-firm client on the same feed system get different
motifs in the same drawing style. Mark selection makes no model call. Zero hex values anywhere in
`compositions` or `pack_elements`.

> Build all three starters. If `Bold blocks` needs a field `Editorial` doesn't have, the schema is
> wrong. One starter system proves nothing.

### Phase 4 — Generation flow (F-6, F-7)

Composition assignment, fit check, plate placeholders, `plate_budget`, legibility guard, slide tabs
→ thumbnails.

**Visual notes**, not a Visual score. Steps 3 and 6 of the pipeline each emit an adjustment
record — `{ slideIndex, kind: 'type-step-down' | 'copy-shortened' | 'scrim-inserted', detail }` —
and Results renders them as a list. They are reported from what the renderer did, never inferred
afterwards. An empty list renders nothing.

**Focal-zone collision** is the one flag: compare `PlateLayer.focalZone` against the union of text
layer bounding boxes. Overlap beyond a threshold raises a banner naming the slide, in the existing
`3 pillars skipped — Fix in Research Sources →` style.

Fit, legibility, and palette are enforced and never surfaced as passing checks. Rhythm moves to
F-12, where it is a property of the grid rather than of a post.

*Acceptance:* eight-slide Bulgarian carousel. No overflow. Nothing under 4.5:1. **Step 4 generates
no photography** — it runs entirely on the free renderer. Results generates one plate on
`cover-only`. Discard + rerun re-runs only the free steps. Every automatic adjustment appears in
Visual notes; a run with no adjustments shows no notes section.

### Phase 5 — Slide editor (F-8, F-10)

Layer panel, `react-moveable`, `react-selecto`, `zustand`+`immer`, contextual property panels,
bound/override dot, shape-level mark editing, add-layer, `PlateLayer.source: 'uploaded'`.
Reachable from Results, review queue, and calendar — one route. Remove the `6 of 6 images` gate.

*Acceptance:* change a headline, swap a mark, upload a client photo as a plate, re-render, without
leaving the page. The uploaded photo comes out duotoned and typeset like every other slide.
Overridden properties survive a token change; bound ones do not.

### Phase 6 — Plate editing (F-9)

Reroll ×3, reprompt (subject only), SAM2 click-to-mask, brush/lasso fallback, inpaint, erase,
`plate_edits` tree, undo as pointer move, soft cap, debounce.

*Acceptance:* tap a subject's eyes, type *"give her sunglasses"*, get them, with headline and
chrome untouched. Undo twice, branch, redo. Reroll clears the mask and says so.

### Phase 7 — Propagation, grid view, Canva sunset (F-11, F-12)

Version bump on save with the consequence stated, auto-propagate drafts, banner + per-post offer
for scheduled, lock published, bulk re-render job, calendar `Month / Grid` toggle, deprecate
`Design in Canva`.

*Acceptance:* change `accent`. Twelve drafts re-render. A banner offers three scheduled posts. One
published post untouched, modal read-only. Grid view shows the next nine posts.

---

## 13. Risks

1. **Recraft trained styles may not emit SVG.** Phase 0 answers it. Do not discover it in Phase 3.

1b. **Recraft output is untrusted markup we inline into the DOM.** Sanitisation (§8.3) is a security
   boundary, not a tidiness pass. It gets a test suite with hostile fixtures, and it runs at ingest
   so a stored mark is safe by construction rather than safe by whoever renders it.

2. **Chromium cold start.** Keep one warm instance; render slides sequentially in a single browser
   context.

3. **Five type-scale steps may be too few for Cyrillic.** Bulgarian runs 15–25% longer than
   English. Measure in Phase 1, when the renderer can finally tell you. Consider seven steps, or a
   lower ratio for Cyrillic-primary clients.

4. **Shared systems degrade under mismatched fonts.** `FontRequirement` plus the fit check
   mitigate. Surface a warning at assignment time; accept the residual.

5. **Element pack quality is the gating aesthetic risk.** Curation is the mitigation and it is not
   optional.

6. **Two plates per slide invites mud.** Ship starter compositions that use it well.

7. **Provider drift.** A floating model alias means a vendor update silently changes every client's
   photography, and `render_hash` will not catch it — the composition never changed. Pin model ids;
   store `provider`, `model`, and `seed` on every `plate_edits` row.

8. **Composition cannot be commanded.** No prompt reliably keeps a subject's face out of the
   headline zone. The scrim guarantees legibility; detection plus a flag is the only honest answer
   to the rest. Do not promise focal-zone control in any UI copy.

9. **`lang="bg"` is the failure nobody catches.** Every other defect in this system degrades
   visibly. This one produces a plausible-looking headline in the wrong letterforms. Put it in the
   Phase 1 acceptance test with a reference specimen.

---

## 14. Explicitly not built

- Point-level bezier editing.
- Freeform canvas.
- Flatten-to-vector export.
- Text rendered into any generated asset, ever.
- A model picker, or a global "AI" button.
- Feed-system marketplace UI (schema supports it).
- Video / Reels — `HyperFrames`, sequenced after this.
