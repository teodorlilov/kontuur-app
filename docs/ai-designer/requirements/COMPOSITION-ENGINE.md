# Composition Engine



## 0. The stance

Kontuur's UX thesis, already visible everywhere in the shipped product, is that **the system
shows its reasoning.**

The onboarding Analyzing screen names each step as it runs. The quality panel writes out *why*
slide 5 is not a payoff. The pillar warning names the problem and links to the fix. Nothing is
presented as a fait accompli.

Everything in this document extends that same move to visuals:

- extracted tokens carry `measured` / `inferred` / `guessed` badges
- the plate prompt shows its locked style half, so the operator understands why their edit
  stayed on-brand
- the Visual quality dimension states *"Slide 4 headline is 3.1:1 over its plate"* and links to
  the editor
- every metered button carries its price
- the layer panel marks which properties are bound to the design system and which are overridden

This is what makes the product feel like a colleague rather than a slot machine. It is also
the first thing that gets cut under time pressure. **Do not cut it.**

---

## 1. What this replaces and why

Kontuur renders post visuals with **Satori**. Satori implements a subset of CSS on its own
layout engine. It has no `z-index` — paint order is document order. No pseudo-elements. No
`filter`. No `mix-blend-mode`. No `background-clip: text`. No CSS Grid. No OpenType kerning
or ligatures. No WOFF2.

The consequence is not that our templates are unambitious. It is that **no design involving
layering, cropping, blending, or photographic compositing is expressible.** The templates are
flat because the renderer forces them to be flat.

Two further consequences, both quiet and both expensive:

1. **No text measurement.** Satori cannot tell us, before rendering, whether a Bulgarian
   headline overflows its box. We ship overflowing slides and discover it visually.
2. **Two renderers.** The editor preview is React in a browser. The export is Satori on the
   server. They are different implementations of the same design and they drift. Every
   "the preview doesn't match the download" bug traces to this.

We replace Satori with **headless Chromium pointed at our own application**. Every CSS feature
returns. Measurement becomes possible. And the preview and the export become, literally, the
same React tree — not "shared components," the same tree.

That last point is the architectural core of this document. Everything else follows from it.

---

## 2. The factorization

The current model has one object — a template — owned by a client. That is wrong, and it is
why nothing is reusable.

There are **two** systems, and a post is their product:

```
  Brand kit                      Feed system
  (client-owned)                 (agency-owned, shareable)
  ───────────────                ────────────────────────────
  colour tokens                  compositions (slide templates)
  type tokens                    chrome (parametric SVG)
  space + grid tokens            element pack (Recraft marks)
  subject vocabulary             photographic style
  logo                           rhythm rules
        │                                │
        └──────────────┬─────────────────┘
                       ▼
        post = brand kit × feed system × copy
```

A **brand kit** answers *what does this client look like*. A **feed system** answers *how do
posts get built*. Neither knows about the other until render time.

### The rule that makes sharing work

> **A feed system contains zero literal colours and zero literal font families.**

Not in compositions. Not in chrome parameters. And — the non-obvious one — **not inside the
element pack SVGs.**

When Recraft returns a mark, we do not store `fill="#4FB457"`. We store a **role map**:

```json
{
  "svg": "<svg …><path id=\"p1\" …/><path id=\"p2\" …/></svg>",
  "fillRoles": { "p1": "accent", "p2": "surface", "p3": "accent-deep" }
}
```

At render time the roles resolve against whichever brand kit is in scope. The same stored
mark renders green for Haelan and burgundy for the next client. This is what lets an agency
build one system and apply it across their whole book, and it is the difference between a
feature and a business.

Section 7 covers how role assignment happens on ingest.

### Font requirements, not font choices

A feed system designed around a condensed display face will break under a wide serif. Feed
systems therefore declare **requirements**, not families:

```ts
type FontRequirement = {
  category: 'grotesk' | 'condensed' | 'serif' | 'slab' | 'geometric' | 'any'
  maxWidthRatio?: number   // avg advance / em, measured at ingest
  weights: number[]        // required weights
}
```

The brand kit supplies the family. The fit-check (§9, step 3) catches the residual mismatch
and steps the type scale down within an allowed range. If it still will not fit, the operator
is told which slide and why — not shown a broken PNG.

---

## 3. Data model

New tables. All scoped by `agency_id` with RLS, consistent with the rest of the schema.

```sql
-- Client-owned. One per client. Replaces the ad-hoc palette on `clients`.
create table brand_kits (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references agencies(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  version           int  not null default 1,
  tokens            jsonb not null,          -- §4
  subject_vocabulary jsonb not null default '[]'::jsonb,
  source_kind       text not null,           -- 'website' | 'image' | 'manual'
  source_ref        text,                    -- url or storage path
  extraction_report jsonb,                   -- confidence per field, §6
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (client_id)
);

-- Agency-owned. Shareable across clients. Contains no literal colours.
create table feed_systems (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agencies(id) on delete cascade,
  name          text not null,
  visibility    text not null default 'agency',  -- 'private' | 'agency' | 'marketplace'
  photographic  jsonb not null,      -- §4 PhotographicStyle
  font_reqs     jsonb not null,      -- §2 FontRequirement per role
  rhythm        jsonb not null,      -- grid cadence rules
  version       int  not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Slide templates. Scene graphs with token references, never values.
create table compositions (
  id              uuid primary key default gen_random_uuid(),
  feed_system_id  uuid not null references feed_systems(id) on delete cascade,
  role            text not null,     -- 'cover' | 'statement' | 'list' | 'quote' | 'cta' | 'single'
  size            jsonb not null,    -- { w, h }
  layers          jsonb not null,    -- §5 Layer[]
  plate_count     int  not null default 0,
  focal_zones     jsonb,             -- where plate subjects must not sit
  created_at      timestamptz not null default now()
);

-- Recraft-generated marks, stored with role maps not colours.
create table pack_elements (
  id              uuid primary key default gen_random_uuid(),
  feed_system_id  uuid not null references feed_systems(id) on delete cascade,
  svg             text not null,
  fill_roles      jsonb not null,    -- { pathId: tokenRole }
  tags            text[] not null default '{}',
  source_prompt   text,
  curated         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Which feed systems a client may use, and per-client overrides.
create table client_feed_systems (
  client_id       uuid not null references clients(id) on delete cascade,
  feed_system_id  uuid not null references feed_systems(id) on delete cascade,
  is_default      boolean not null default false,
  overrides       jsonb not null default '{}'::jsonb,
  primary key (client_id, feed_system_id)
);

-- The rendered artifact for a post. One row per slide.
create table post_visuals (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references posts(id) on delete cascade,
  slide_index       int  not null,
  composition_json  jsonb not null,   -- the resolved, editable scene graph
  brand_kit_version int  not null,
  feed_system_id    uuid not null references feed_systems(id),
  rendered_url      text,
  render_hash       text,             -- sha of composition_json; skip re-render if unchanged
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (post_id, slide_index)
);

-- Non-destructive plate edit history. §11.
create table plate_edits (
  id           uuid primary key default gen_random_uuid(),
  post_visual_id uuid not null references post_visuals(id) on delete cascade,
  parent_id    uuid references plate_edits(id) on delete cascade,
  layer_id     text not null,
  op           text not null,      -- 'generate'|'reroll'|'reprompt'|'inpaint'|'erase'
  prompt       text,
  mask_url     text,
  result_url   text not null,
  seed         bigint,
  cost_cents   int  not null default 0,
  created_at   timestamptz not null default now()
);
```

`plate_edits` is a tree, not a stack. Branching is free and undo is a pointer move.

---

## 4. Token schema

Semantic roles. Never `color1`…`color5` — a shared feed system cannot reason about
`color3`.

```ts
type ColorRole =
  | 'surface' | 'surface-alt'
  | 'ink' | 'ink-muted'
  | 'accent' | 'accent-deep'
  | 'line'

type BrandTokens = {
  color: Record<ColorRole, string>          // hex
  type: {
    display: { family: string; weights: number[]; tracking: number; case: 'none'|'upper' }
    body:    { family: string; weights: number[]; tracking: number }
    scale:   number                          // ratio, e.g. 1.25
    baseSize: number                         // px at 1080×1350
  }
  space: { unit: number; radius: number; hairline: number }
  grid:  { marginX: number; marginY: number; baseline: number }
}
```

The photographic style lives on the **feed system**, not the brand kit — it is a look, and
looks are what get shared:

```ts
type PhotographicStyle = {
  lighting: string        // 'soft natural daylight'
  grade: string           // 'cool desaturated'
  depth: string           // 'shallow, f/2'
  texture: string         // 'fine film grain'
  negative: string        // 'no text, no watermark, no logos, no hands'
  treatment: 'none' | 'duotone' | 'tint' | 'grain' | 'mono'
  treatmentStrength: number  // 0–1
}
```

Subject vocabulary lives on the **brand kit**, because it is industry-specific:

```ts
type SubjectVocabulary = string[]   // ['skincare routine', 'sun exposure', 'clinical setting']
```

The full plate prompt is `PhotographicStyle` + one subject sentence. §11 explains why the
user may edit only the second half.

---

## 5. Scene graph, and the binding discriminant

This is the schema that decides whether the product feels trustworthy. Forty lines.

Every visual property is either **bound** to a token or **overridden** with a literal.

```ts
type Binding<T> =
  | { mode: 'bound';    token: string }      // 'color.accent', 'type.display'
  | { mode: 'literal';  value: T }

type Rect = { x: number; y: number; w: number; h: number; rotate: number }

type Clip =
  | { kind: 'none' }
  | { kind: 'rect';    radius: number }
  | { kind: 'ellipse' }
  | { kind: 'mark';    packElementId: string }   // use a pack mark as a mask

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

type PlateLayer   = LayerBase & {
  type: 'plate'
  editHeadId: string | null        // pointer into plate_edits
  src: string
  treatment: Binding<PhotographicStyle['treatment']>
  focalZone?: Rect
}

type MarkLayer    = LayerBase & {
  type: 'mark'
  packElementId: string
  fillOverrides: Record<string, Binding<string>>   // pathId → colour
}

type TextLayer    = LayerBase & {
  type: 'text'
  slot: 'kicker' | 'headline' | 'body' | 'cta' | 'free'
  content: string
  family: Binding<string>
  size: Binding<number>
  weight: Binding<number>
  color: Binding<string>
  align: Binding<'left'|'center'|'right'>
  autoFit: { min: number; max: number } | null
}

type ChromeLayer  = LayerBase & {
  type: 'chrome'
  component: 'rule' | 'corner-frame' | 'dot-grid' | 'arc' | 'badge' | 'numeral' | 'index-dots'
  params: Record<string, Binding<unknown>>
}

type ShapeLayer   = LayerBase & {
  type: 'shape'
  shape: 'rect' | 'ellipse' | 'gradient'
  fill: Binding<string>
}

type GroupLayer   = LayerBase & { type: 'group'; children: Layer[] }

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

- **`z-index` is array order.** No separate field. Drag in the layer panel = `splice`.
- **`blendMode` and `clip` exist in v1** because multiple plates per slide are allowed. This
  is what makes duotone splits, before/after halves, and collage expressible. Satori could
  express none of it.
- **`autoFit` is on text only**, and is a *range*, not a boolean. The renderer measures.
- **The editor shows a dot** beside every property whose `mode` is `'literal'`. Clicking it
  re-binds. This one affordance is the entire propagation story made visible.

---

## 6. Extraction — reference or website → brand kit

Two paths, unequal quality, and the UI must say so.

### 6.1 Website (primary)

Playwright is already running for the render service. Reuse it.

1. Navigate. Wait for network idle and `document.fonts.ready`.
2. Walk the DOM. For a sampled set of nodes (headings, body, buttons, links, backgrounds),
   read `getComputedStyle`. This yields **measured** values: actual `font-family` after
   fallback resolution, actual hex, actual `font-size` ladder, actual spacing.
3. Cluster colours by frequency × area. The largest background is `surface`. The dominant
   text colour is `ink`. The highest-saturation colour used on interactive elements is
   `accent`. Darkest tint of accent is `accent-deep`.
4. Derive the type scale by fitting a ratio to the observed size ladder.
5. Screenshot at 1440×2400. Pass to Claude vision for the **qualitative** layer only:
   density, contrast strategy, whether photography is warm or cool, subject vocabulary.

Everything in steps 2–4 is measurement. Only step 5 is inference. Store which is which:

```ts
type ExtractionReport = {
  fields: Record<string, { confidence: 'measured' | 'inferred' | 'guessed'; note?: string }>
}
```

### 6.2 Reference image (secondary)

1. k-means over pixels, weighted by area, → palette. Map to roles by luminance and saturation.
2. Claude vision → density, mood, photographic style, subject vocabulary.
3. **Fonts cannot be recovered from an image.** Do not pretend. Vision proposes a category
   (`grotesk`, `serif`, …); we suggest the three closest Google Fonts in that category and
   the user confirms. The field is marked `guessed` in the report and the UI shows it.

### 6.3 Confirmation step

Neither path writes a brand kit directly. Both produce a **proposal**, rendered as a 3×3
preview grid of real compositions in the proposed tokens. The user adjusts and accepts.
Extraction that lands straight in the database is extraction the user does not trust.

Confidence is surfaced, not hidden. A font measured from a website's computed styles and a
font guessed from a JPEG must not be presented identically. Badge them: `measured` /
`inferred` / `guessed · confirm`.

---

## 6A. Where this lives in onboarding

The existing four-step onboarding flow (**Start → Analyzing → Interview → Review**) already
takes a website URL, already runs a checklist, already ends in a confirmation screen. Visual
extraction slots into it. **No fifth step.**

| Step | Today | Change |
| ---- | ----- | ------ |
| **1 Start** | Website URL + Instagram handle | none — the URL is already the extraction source |
| **2 Analyzing** | 4 checklist rows | **+2 rows:** *Extracting colours and type*, *Building visual system* |
| **3 Interview** | 9 questions, auto-detected answers pre-filled | none |
| **4 Review** | confirm client profile | **+ tokens with confidence badges, 3×3 preview grid, feed-system picker** |

### Why colour does not go in the interview

The interview is verbal and pre-filled from analysis. Colour is not something a person answers
in a chat bubble; it is something they look at. Keep the interview conversational. Make Review
visual.

### Latency

Computed-style extraction requires a real browser boot, plus a screenshot, plus a vision call
— 15–25 s on top of what Analyzing does today.

**Run it asynchronously.** The existing `Skip to interview →` affordance is the escape hatch.
The operator proceeds into the interview; extraction completes behind them; by the time they
reach Review the tokens are there. If it has not finished, Review renders a skeleton. Nobody
notices, because they just spent four minutes typing answers.

This means Analyzing's two new checklist rows may complete after the operator has left the
screen. That is acceptable. It is also the reason they must not *block* the Continue button.

### The feed-system picker

Three systems, each rendered as **a real slide plus a 6-cell grid preview, in the client's own
extracted colours**, before the operator has ever seen a post. Costs nothing — the systems are
token-bound and resolve at render.

> **The picker must not compare palettes.** Colour comes from the brand kit, not the feed
> system. Three cards differing only in how green and teal squares are arranged are three
> pictures of the same thing. Render the **same headline** in all three, in the **same
> palette**, and let typography, margins, chrome, and photographic cadence do the distinguishing.

Selection writes `client_feed_systems` with `is_default = true`.

---

### The manual path

`Skip — I'll answer manually` means no URL, therefore no extraction. That path must still
produce a brand kit — every downstream render assumes tokens exist. It gets:

- a **neutral default kit** (achromatic surface/ink, one blue accent, Inter + Inter),
- the default feed system,
- a prominent *Upload a reference image* affordance in Brand kit.

A client with no tokens is an unrenderable client. Never create one.

### Instagram handle (deferred)

The handle is collected at Start and currently unused for visual purposes. A client's existing
grid **is** their photographic style, stated better than any prompt we would write. Pulling it
cleanly requires Meta permissions we do not have. Note it; do not design it out. `brand_kits`
already carries `source_kind` — `'instagram'` is a future value, not a schema change.

---

---

## 6B. The three starter systems

A feed system's identity is typography, geometry, chrome, photographic cadence, and rhythm.
Never colour. These three ship in-house and are the reference implementations of the schema.

| | **Editorial** | **Bold blocks** | **Quiet grid** |
| --- | --- | --- | --- |
| Display requirement | serif, high-contrast | grotesk, weight ≥ 700 | grotesk, weight ≤ 600 |
| Scale ratio | 1.333 | 1.5 | 1.2 |
| Case / tracking | none / tight | upper / −2% | none / 0 |
| Margins | wide, 12% | tight, 6% | medium, 9% |
| Text block | bottom-left, baseline-hung | fills the frame | centred, generous leading |
| Chrome | one hairline rule | none — solid blocks, numerals | frames, corner marks, dot grid |
| Element pack | organic, single-weight line marks, ~1 in 6 slides | geometric, filled, high coverage | minimal geometric line marks |
| `plateBudget` | `every-third` | `cover-only` | `0` |
| Treatment | `grain` @ 0.3 | `duotone` @ 0.9 | `mono` |
| Rhythm | photography forms a column | no two adjacent slides share a background role | strict light/dark alternation |

Same JSON. Different values. On a 3-column Instagram grid, `every-third` places photography in
a single column; `alternate` produces a checkerboard. **A grid-level design decision expressed
as a modulo.** This is the capability Later and Buffer cannot have, because they do not own the
schedule.

Note also that `Quiet grid` never generates a plate. It costs **$0 per post, forever.** That is
a legitimate product tier, not a degraded one.

### Recommending a system from the extraction

The website extractor already measured what it needs.

| Measured | Recommend |
| -------- | --------- |
| serif display · margin ratio > 10% · low text density | **Editorial** |
| sans display · h1 weight ≥ 700 · large flat colour areas | **Bold blocks** |
| sans display · weight ≤ 600 · high whitespace · hairline borders | **Quiet grid** |

State the reason on the card, per §0. Not a badge — a sentence:

> *Recommended — your site uses a high-contrast serif and wide margins.*

### When the choice conflicts with the brand kit

If the operator picks `Editorial` for a client whose site uses Inter, the system's display
requirement is unmet. **Do not silently substitute.** Say it:

> Editorial needs a serif display. Your site uses **Inter**. We'll set headlines in **Lora** —
> change in Visual system.

The operator learns that the system has requirements, their brand kit has facts, and Kontuur
reconciles the two rather than pretending. Same move as the confidence badges.

---

## 7. Element pack — generation and role snapping

The pack is the feed system's visual vocabulary: 20–30 marks. Generated once. Never
regenerated per post.

### 7.1 Generation

`fal-ai/recraft/v4.1/text-to-vector`, with `rgb_colors` seeded from a **canonical role
palette** (not any client's palette — a neutral reference set, one distinct hue per role).
This is what makes the returned fills separable.

Prompt template lives on the feed system. Generate **40**. Cost ≈ $3.20.

> **Verify before building the adapter.** Recraft's trained custom styles (`create-style` →
> `style_id`) are documented as V3-only, and SVG export has been reported as unavailable when
> a registered style is used. Confirm empirically whether *SVG output + brand-locked colour +
> style consistency* survives in a single call. If not, style consistency comes from the
> prompt template on V4.1 Vector, and the trained-style path is dropped. This is an afternoon
> and it decides the adapter's shape. Do it first.

### 7.2 Role snapping (the ingest step that makes sharing possible)

For each returned SVG:

1. Parse. Assign a stable `id` to every `<path>` lacking one.
2. For each unique fill, compute ΔE (CIEDE2000) against each canonical role colour.
3. Snap to nearest role if ΔE < threshold. Discard the element if any fill is unassignable —
   the model went off-palette and the mark will never recolour cleanly.
4. Strip all `fill` attributes. Store the SVG plus `fillRoles: { pathId → role }`.

At render, `<Mark>` inlines the SVG and applies `fill` per path from the active brand kit.
Recolouring a whole pack when a client rebrands is a re-render, not a regeneration. It costs
nothing.

### 7.3 Curation

Never auto-accept. Show the 40 in the proposed brand kit's colours, keep 20. If the marks
look like stock AI icons, the system looks like stock AI regardless of typography.
Curation is a feature, not friction.

---

## 7A. Fonts

Absorbs `plans/FONT-LIBRARY.md`.

### The library

~50 curated Google Fonts families, not Google's full catalogue. **The curation is the product.**

Display and body are **independently selectable roles**, with suggested pairings shown rather
than enforced. Variable axes (`wght`, `opsz`, `slnt`) surface as sliders where the family
exposes them.

### Filter, do not warn

The client's `primary` and `secondary` languages determine which families are *visible at all*.
A Bulgarian client never sees a Latin-only face.

Then filter again by the active feed system's `FontRequirement.category`. Everything else goes
behind **"Show all — may break this system."**

This supersedes the save-time subset warning in §10.1. Warning after a bad choice is worse than
never offering it. Keep the save-time check as a backstop for custom uploads and for clients
whose language changes after the fact.

### Custom uploads

WOFF2 / TTF / OTF, agency-scoped. License attestation at upload. **Parse the `cmap` table at
upload time** to determine actual script coverage — do not trust the filename or the vendor's
claim. Stored in Supabase Storage; the render route injects `@font-face` from a signed URL.

### Caching

Cache WOFF2 files in the render container. A cold Google Fonts fetch inside Chromium adds
roughly a second to *every* render.

### The rule that keeps this from unravelling

> **The slide editor has no font picker.**

A text layer selects a **role** — `display` or `body` — never a family. Families are chosen once,
in `Visual system`. Permit per-layer family selection and twelve posts will use nine typefaces
inside a month.

An override exists, because there is always a reason. It sits behind the same unlock as every
other override, it marks the property `literal`, and it stops propagating on rebrand. Available,
not offered.

---

## 7B. What a text layer can and cannot change

| Control | Default | Unlocked | Lives on |
| ------- | ------- | -------- | -------- |
| **Size** | ± steps along the type scale | continuous px | text layer |
| **Weight** | the role's declared weights | any weight the family carries | text layer |
| **Position** | snaps to grid margins, baseline, sibling edges | free `x` / `y` | text layer |
| **Alignment** | the composition's alignment | left / centre / right | text layer |
| **Tracking** | the role's tracking token | continuous | text layer |
| **Family** | the role's family | any visible family | text layer *(override only)* |
| **Margin** | — | — | **the composition. Not the layer.** |

**Margin is not a text property.** It is the composition's frame, shared by every slide using
that composition. Nudging it on one slide is the first step toward a freeform canvas. It is
changed in the system editor, where it propagates to every post — which is the behaviour the
operator actually wants and did not know to ask for.

### The unlock gesture

Every constrained control is a snapped slider. **Hold `Alt` while dragging and it goes
continuous** — and at that moment the property flips from `bound` to `literal` and the dot beside
it fills in.

One gesture, one visible consequence. The operator learns what the design system *is* by feeling
it resist.

---

## 8. The render service

**The editor canvas and the PNG exporter are the same React tree.**

Not shared components. The same tree, in the same runtime, driven by the same
`composition_json`.

```
  Fly.io container
  ├── Playwright + Chromium
  ├── fonts baked in (Inter, Noto Sans, + agency uploads)
  └── POST /render { postVisualId, token }
         │
         ├─ navigate → https://kontuur.app/render/{postVisualId}?token=…
         │   (a Next.js route that renders <Stage/> and nothing else)
         ├─ await document.fonts.ready
         ├─ await window.__stageReady   (set after images decode)
         ├─ page.locator('#stage').screenshot({ type: 'png' })
         └─ upload → Supabase Storage, return url + hash
```

There is no serialisation step, no second renderer, and therefore no drift. What the operator
sees is what Instagram gets, by construction.

**Not `@sparticuz/chromium` on Vercel.** Cold starts and the 50 MB bundle ceiling will make
this miserable. A dedicated container is cheaper and faster.

**Cyrillic.** The route loads Google Fonts with `subset=cyrillic,latin` and blocks on
`document.fonts.ready`. The current Satori subset-loading hack is deleted.

**Render skipping.** `render_hash = sha256(composition_json)`. Unchanged hash → serve the
stored PNG. A token change dirties every hash; nothing else does.

---

## 9. Generation flow

The wizard is five steps today — **Client & platform → Priority posts → Post type →
Generating → Results**. It gains **no new steps.** Step 4 gains work; step 5 gains visuals.

### 9.1 The cost rule

> **Never spend the metered thing before the free thing has passed judgment.**

Results already shows a quality panel that can score `Brief 4/10` with three red ✗, next to a
`New run` button. That post is likely to be discarded. If step 4 had generated six plates, we
paid $0.24 for nothing, and the operator pays again on the rerun.

So **step 4 generates copy, validates it, and renders slides through Chromium with no plates.**
Free. ~1 s per slide. And the slides still look good, because the design system is what makes
them look good — typography, chrome, marks, colour, all $0.

Photography is an **upgrade**, applied at Results or on approve. Not a default.

### 9.2 Step 4 — Generating

1. **Assign compositions.** The feed system's rhythm rules map slide index → composition role.
2. **Bind copy** into slots: `kicker`, `headline`, `body`, `cta`.
3. **Fit check.** Render headless, measure each `autoFit` text layer. Overflowing → step `size`
   down within `[min, max]`. Still overflowing → ask the copy model to shorten to ≤ N chars,
   preserving meaning. Still failing → flag the slide with the reason. We never ship an
   overflowing slide again.
4. **Marks.** Selected from the pack by tag ↔ content-pillar match. Free.
5. **Plate placeholders.** Slides that want a plate get a token-derived gradient. In a
   well-built system this is not a downgrade.
6. **Legibility guard.** Sample the composite beneath each text layer's bounding box, compute
   WCAG contrast against the resolved text colour. Below 4.5:1 → insert a scrim layer under the
   text. Deterministic. Runs on every render, including after every later edit.
7. **Render.** Concurrency 5, matching the existing pipeline.

Fit before plate (cheap before expensive). Legibility last, because it must see the final
composite.

### 9.3 Plate budget

Not a wizard field. A property of the **feed system**, set once by the agency:

```ts
plateBudget: 0 | 'cover-only' | 'every-third' | 'all'   // default: 'cover-only'
```

A six-slide carousel on `cover-only` costs **$0.04**. Show it on the button, the way the
editor shows it on reroll:

> ⚡ **Generate posts** · ~$0.04

Plates for the budgeted slides are generated when the operator lands on Results. Any further
plate is an explicit `Add photography · $0.04` on the slide.

### 9.4 Step 5 — Results

The slide tabs (`1 2 3 4 5 6`) become **rendered thumbnails**, numbered as now. Selecting one
shows the composition beside its copy, with `Edit slide` and `Add photography`.

`Approve all` re-renders nothing that is unchanged — `render_hash` handles it.

### 9.5 The Visual quality dimension

The existing quality panel scores **Brief** and **Craft**, each as per-item ✓/✗ with a written
reason. This is the best pattern in the product and it is the same stance as the onboarding
Analyzing checklist: *the system shows its reasoning.*

Add a third dimension, **Visual**, scored identically:

| Check | Passes when |
| ----- | ----------- |
| **Fit** | no text layer overflows its box |
| **Legibility** | every text layer ≥ 4.5:1 against the composite beneath it |
| **Palette** | no colour resolves outside the brand kit |
| **Focal zone** | the plate's subject does not sit under the headline |
| **Rhythm** | no two plates adjacent in the grid |

Every failing check renders as a stated problem plus a link that fixes it — exactly the shape
of the existing `3 pillars skipped — Fix in Research Sources →` banner:

> ⚠ Slide 4 headline fails contrast over its plate. **Fix in editor →**

Fit, legibility, palette, and rhythm are all **computed, not inferred.** No LLM call. They are
free, deterministic, and they are the only quality checks in the product that cannot be wrong.

---

## 10. Three editing surfaces — only one is a canvas

Building one canvas for all three is how these products become clunky.

### 10.1 System editors — two, because there are two systems

The existing IA already separates **client settings** from **agency settings**. The
factorization in §2 maps onto it exactly. Neither is a canvas.

**Client settings → Visual system** (new tab, sibling of `Brand profile`)

`Brand profile` is the client's *verbal* identity — voice, tone, pillars. `Visual system` is
the visual one. Same client, two halves. Do not merge them; do not rename the shipped tab.

- Token fields. Change `accent` → a live 3×3 preview grid re-renders instantly, client-side.
- Subject vocabulary.
- Assigned feed system + `Change` (opens the picker from onboarding).
- `Re-analyze from website` — re-runs extraction against the URL already on `Basic info`.

**Agency settings → Design** (left rail, bottom — *not* a top-level tab)

```
SETTINGS
  Team
  Account
  Design            ← new
    ├ Feed systems       list, visibility, which clients use each
    ├ System editor      compositions, chrome params, photographic style, rhythm
    └ Element packs      curation grid, add-by-prompt, role reassignment
```

Structured exactly like client settings — left sub-nav, right pane. Zero new IA patterns.

#### Why this is not a top-level tab

The rail reads as a workflow: *Dashboard → Clients → Generate posts → Review queue → Calendar
→ Client ideas → Analytics.* See, manage, make, judge, schedule, listen, measure. Every item is
touched weekly.

An agency authors **two to four feed systems, ever**, and reuses them across thirty clients.
Low frequency, high stakes. That belongs in Settings. Inserting `Design systems` into the rail
breaks the arc and puts a twice-a-year action beside a daily one. Nav real estate is not free —
each item added makes the other seven slightly harder to find.

Discoverability comes from **entry points**, not permanence:

1. Onboarding's feed-system picker → `+ Create new system`
2. Client settings → Visual system → `Change` → `+ Create new system`
3. A Dashboard card: *"Feed systems · 2 · Editorial, used by 3 clients"*

The Dashboard card is the one that matters. It is where an agency owner notices this exists.

#### Promotion trigger — write it down now

Promote `Design` to the left rail when **any one** of these becomes true:

1. The median agency holds **more than two** feed systems — they are iterating, not configuring.
2. **Marketplace ships.** Browsing other agencies' systems is a workflow, not a setting.
3. Telemetry shows operators entering Settings and going straight to Design in **> 30 %** of
   Settings visits.

Recorded here because in six months someone will add the tab because it "feels important," and
nobody will remember there was a criterion.

#### Creating a feed system is a wizard, not a page

Same shape as client onboarding, because it does the same job:

| Step | Does |
| ---- | ---- |
| **1 Start** | reference image, a URL, or blank |
| **2 Analyzing** | extract photographic style; propose compositions |
| **3 Curate** | generate 40 marks, keep 20 |
| **4 Review** | see the system applied to a real client's tokens |

Note the asymmetry that makes this cheap to build: **one reference image feeds two extractions.**
Colour and type go to the **brand kit**. Lighting, grade, texture, and mark vocabulary go to the
**feed system**. Same upload, different targets. Onboarding writes the first; system creation
writes the second.

`Curate` is the only genuinely new screen in the whole flow. Steps 1, 2, and 4 reuse patterns
already shipped twice.

#### Two validations that must run on save

**Font subsets vs. client languages.** `Basic info` carries a primary and an optional
secondary language. A client posting in Bulgarian needs a display family carrying the
`cyrillic` subset. Many Google display faces carry Latin only. If it is missing, Chromium falls
back silently *mid-headline* and we ship a slide set in two typefaces.

Check the family's subsets (the Google Fonts API exposes them) against the client's languages.
**Warn before writing, and offer alternatives in the same category that do carry the subset.**
Do not hard-code a blocklist of families — query the API. *(An earlier draft of this plan cited
Playfair Display as a family lacking Cyrillic. It is not: Playfair Display ships Cyrillic,
Cyrillic small-caps, and lists Bulgarian among supported languages. The mechanism is right; the
example was wrong. Query, never assume.)*

**Bulgarian localized letterforms.** Bulgarian Cyrillic uses different shapes from Russian for
б, в, г, д, ж, з, и, к, л, п, т, ц, ш, щ. Fonts implementing the OpenType `locl` feature emit
them **only when the text is tagged `lang="bg"`.** Set `lang` on the stage element and on any
text layer whose language differs from the post's primary.

Chromium honours this. Satori, which has no OpenType feature support at all, never could. A
Bulgarian client whose headlines render in Russian letterforms will hate the result and will
not be able to tell you why.

This is the single most likely silent failure in the whole system.

**Health flag → photographic negative prompt.** The `Health-related client` toggle already
gates copy guidelines. Imagery carries more risk than copy: a generated before/after or a
depicted procedure is both a Meta ad-policy problem and an ethical one. When the flag is set,
append to `PhotographicStyle.negative`:

```
no before/after comparison, no clinical procedures, no treatment applied to skin,
no medical devices in use, no visible injection, no exposed wounds
```

One line. Nobody remembers it until a client complains.

### 10.2 Slide editor — `/editor/{postVisualId}`

The canvas. Reachable from **wizard Results, the review queue, and the calendar schedule
modal** — the same route, the same component, in all three places.

#### The organising idea

> **The operator never chooses a model. They choose an object.**

The selected layer type determines which generator is reachable. There is exactly **one prompt
bar**, at the foot of the canvas, and it routes on selection. Per §0, it states its routing and
its price *before* the operator commits.

| Selection | The prompt does | Model | Cost |
| --------- | --------------- | ----- | ---- |
| **Plate** + mask | inpaint the masked region | Nano Banana / Flux Fill | $0.04 |
| **Plate**, no mask | rewrite the *subject* half of the prompt | same model as the original | $0.04 |
| **Mark** | generate a replacement mark | Recraft V4.1 Vector | $0.08 |
| **`<path>` inside a mark** | *bar disabled* | none | — |
| **Text** | rewrite / shorten / translate | Claude | ~$0 |
| **Nothing** | swap this slide's composition | none — a template pick | $0 |

When a `<path>` is selected the bar greys out and says: *"Recolour or transform directly — no
prompt needed."* Teaching the operator that some things are free is worth more than letting
them prompt their way to the same result.

#### Modes

`Select` and `Mask`. That is the entire mode system.

Mask mode is reachable only with a plate selected. It is SAM2 on click; brush and lasso are
fallbacks within it. It is a raster `<canvas>` overlay producing a PNG alpha mask, and it never
touches the scene graph.

No pen tool. No bezier handles. No shape tool beyond rect and ellipse. Each is a month of work
and none is why an agency bought this.

#### Panels

- **Layer panel (left).** Ordered list = paint order. Drag to reorder. Nested groups. Lock,
  hide. Mark layers expand to their individual `<path>` children. A dot marks any property
  overridden away from the design system.
- **Canvas (centre).** `react-moveable` + `react-selecto`: drag, resize, rotate, snap to grid
  and to sibling layers, bulk select. Hit testing is native DOM.
- **Property panel (right).** Contextual per layer type. Bound/override dot on every property.
  For a plate: the locked style half shown read-only, treatment picker, reroll ×3, remove
  object, upload photo, and the **edit history tree** (§11.5) with a running per-post spend.
- **Prompt bar (below canvas).** Routed, chipped, priced.

#### Add layer

Text, shape, mark from pack, second plate, or **a new mark by Recraft prompt**. That last is
the only place user-invoked Recraft lives, and if the operator keeps the result it writes back
into the feed system's pack.

#### Undo

`immer` patches into a bounded stack. Free redo. Migrates to multiplayer later without rework.
Plate operations undo by moving the `editHeadId` pointer, not by regenerating.

#### Why DOM and SVG, not Fabric or Konva

A canvas library is a second renderer, and two renderers always diverge. Marks are inlined SVG
with `data-layer-id` on each path, so shape-level editing — select a path, recolour, transform,
delete — is DOM manipulation. No path math. Point-level bezier editing is explicitly **out of
scope**: months of work, and no agency operator drags bezier handles before posting to
Instagram.

#### What must never appear in this UI

- **A model picker.** *"Recraft or Flux?"* is not a question an operator should have.
- **A global "AI" button.** Generation is a property of objects, not of the application.
- **Text inside a generated asset.** Every plate call appends `no text, no letterforms, no
  watermark`, always. This is what keeps Cyrillic working.
- **An unpriced metered button.**
- **A freeform canvas.** It breaks the parametric model and the propagation contract.

#### The three generators, one sentence each

**Recraft** produces the *vocabulary* — vector marks, at system-creation time, snapped to token
roles so one mark recolours per client.

**fal diffusion** produces the *plate* — one photographic layer per post, brand-neutral by
design, made on-brand by the treatment layer above it.

**Chromium** produces *everything else* — type, chrome, blend, scrim, clip, composite. It is
the only one that is not metered, and it does most of the work.

The editor's job is to make that division invisible while the price tags keep it honest.

### 10.3 Feed view — a projection of the calendar, not a new surface

The calendar **is** the feed, ordered by date. Add a view toggle in the existing header:

```
[ Month ]  [ Grid ]
```

`Grid` renders scheduled posts as a 3-column Instagram preview in publish order. Rhythm checks
(§9.5) run against this projection. It forces a single client — `All clients` cannot produce a
meaningful grid.

Kontuur owns the schedule. That is the entire reason grid-aware rhythm is possible here and
not in Later or Buffer. It should not sit behind a nav item nobody clicks.

*(An earlier draft of this plan proposed a standalone `/feed` editor. It is deleted.)*

### 10.4 Upload becomes a plate source

The schedule modal currently uploads one PNG per slide and gates publishing on `6 of 6 images`.
Both change.

```ts
PlateLayer.source: 'generated' | 'uploaded'
```

An uploaded photograph lands **as the plate layer**, beneath the treatment, the scrim, the
chrome, and the type. The client's own photography therefore comes out on-brand automatically,
with the same duotone and the same typography as everything else. Strictly better than what
upload does today, and free.

**`6 of 6 images` disappears.** Under the composition engine every slide has a rendered visual
by construction. A carousel can never be at 4 of 6. An entire class of stuck posts is removed.

### 10.5 Canva, and why it eventually goes

`Design in Canva` exists because Satori could not produce anything good. Keep it as a fallback
through Phase 4. Deprecate it once parity lands, and be honest about the reason:

> **A Canva-designed post is a flat raster. It cannot propagate.** When the client rebrands,
> every Kontuur-composed post re-renders for $0.00 and every Canva post keeps the old palette,
> permanently.

Canva is not a competing editor. It is an opt-out from the design system — a whole-post
`mode: 'literal'`. Fine as an escape hatch, fatal as a default.

---

## 11. Plate editing

Three operations, deliberately distinct.

### 11.1 Reroll

Same prompt, new seed. Return **three variants at once** — the user picks rather than gambles
repeatedly. Handles most "the plate is wrong."

### 11.2 Reprompt — half the prompt

The prompt is two concatenated things and the UI must show both:

```
┌─ Style · from system ─────────────────────────┐  ← read-only, greyed
│ soft natural daylight, shallow depth,         │
│ cool desaturated grade, fine film grain       │
└───────────────────────────────────────────────┘
┌─ Subject ─────────────────────────────────────┐  ← editable
│ a woman applying sunscreen, outdoors          │
└───────────────────────────────────────────────┘
```

If the user can free-text the whole prompt, brand coherence dies on the first edit. Locking
the style half is also the moment the design system stops being an abstraction to them — they
edit the subject, and it still looks like their brand.

### 11.3 Masked region edit

Kittl requires you to circle the region. We do better: **click the object.** `fal-ai/sam2`
returns a mask from a click point. Lasso and brush remain as fallback when segmentation picks
the wrong object.

Then `{ plate, mask, prompt }` → inpaint.

**The one place a raster canvas belongs** is the mask painter: a `<canvas>` overlaid on the
selected plate layer, brush + lasso + eraser, exporting a PNG alpha mask. ~200 lines. It is
a mask tool, not a design tool, and it never touches the scene graph.

### 11.4 Why this is structurally safer than Kittl

Kittl inpaints a **flat raster** — text, graphics, and photo on one surface. Edit near a
headline and the model smears the letterforms.

We inpaint the **plate beneath the composite**. Text is DOM. Chrome and marks are SVG. The
model never sees them and cannot touch them. When the edited plate returns, treatment, scrim,
and typography reapply on top automatically, because they were never baked in.

The architecture makes region editing safe, which is what makes it usable.

### 11.5 Non-destructive chain

Every op appends a `plate_edits` row with `parent_id`. `PlateLayer.editHeadId` points into
the tree. Undo moves the pointer. Nothing is destroyed; every intermediate stays in Storage.
Branching — *"go back to variant 2 and try the sunglasses there"* — is free.

### 11.6 Metering

Every plate op is a billed API call.

- **Price on the button.** Users tolerate cost; they do not tolerate surprise.
- **Soft per-post cap.** Warn at 10 ops.
- **Debounce.** Disable reroll while a job is in flight.
- **Published posts are read-only.** Instagram cannot swap media. Say so in the UI rather
  than failing at publish time.

### 11.7 Marks have no inpainting

They are SVG. "Edit this region" on a mark means selecting a `<path>` and recolouring or
transforming it — deterministic, instant, free. A genuinely different mark is a new Recraft
call, not an inpaint. Two layer types, two mental models; the layer type selects the panel.
Do not let them bleed.

---

## 12. Propagation

`post_visuals` stores `brand_kit_version`. When a brand kit is saved, its version increments.

**Propagation fires on `Save changes`.** Not in a background job the user never sees. Client
settings already uses a `Cancel / Save changes` pair; the confirmation dialog belongs on that
button, and the panel should state the consequence *before* the click:

> Saving will re-render **12 drafts** automatically. **3 scheduled posts** will ask first.
> Published posts are never changed.

| Post status | On token change |
| ----------- | --------------- |
| `draft`, `pending_review` | propagate automatically, re-render, no prompt |
| `approved`, `scheduled` | **offer**: "Your brand colours changed. Re-render 3 scheduled posts?" |
| `published` | never; editing disabled |

Never silently mutate something a client approved.

**The scheduled-post offer lives in two places**, because the operator may arrive from either:

1. A calendar-level banner: *"Brand colours changed. 3 scheduled posts use the old palette.
   Review →"*
2. The schedule modal itself, on the affected post: *"Brand colours changed since this post was
   approved. **Re-render · $0.00** · **Keep as is**"*

The price is stated, and the price is zero. Plates are stored raw; only the composite changes.
Saying so out loud is what makes the operator click it.

**Published posts lock.** The modal's edit affordances disappear and it says why — Instagram
cannot replace media on a published post. Explain it there rather than failing at publish time.

Propagation flows through **bound** properties and stops dead at **overridden** ones. That is
the whole reason `Binding<T>` exists.

**The demo:** a client rebrands. Change six hex values. Every draft, every scheduled post,
every stored plate re-composites in the new palette in seconds, for **$0.00**, because plates
are stored raw and the treatment is a composite layer. No competitor can do this.

---

## 13. Model routing

| Operation | Model | Notes |
| --------- | ----- | ----- |
| Vector marks | `recraft/v4.1/text-to-vector` | pack creation only; ~$0.08 ea |
| Trained style (if viable) | `recraft/v3/create-style` | **verify SVG export survives** |
| Plate | Nano Banana / Flux via `fal` | Recraft photorealism trails both |
| Segment on click | `fal-ai/sam2` | mask only, no generation |
| Inpaint region | Flux Fill **and** Nano Banana edit | NB better at "match this"; Flux better at "add this" — A/B |
| Erase object | inpaint, empty prompt | |
| Chrome | Claude writes SVG | parametric, token-bound, $0 |
| Composite | Chromium | treatment, blend, scrim, type — $0 |

**The asymmetry to internalise:** vector output can be constrained exactly (`rgb_colors`, then
snap). Diffusion output cannot. So stop trying to make the diffusion model brand-compliant.
Make it produce a good photograph, and impose the brand at composite time — a `multiply`
treatment layer, a scrim, exact-colour chrome, exact-colour type.

Twelve posts look like one campaign because they share a **treatment**, not because the model
remembered.

### Cost, end to end

| | |
| --- | --- |
| Feed system creation (40 marks, curate to 20) | ~$3.20, once |
| Slide with plate | ~$0.04 |
| Slide without plate | $0 |
| Text edit, colour change, mark swap, reorder | $0 |
| Full back-catalogue re-render after rebrand | $0 |

---

## 14. Phases

### Phase 0 — Recraft capability spike *(1 day, do this first)*

Pull four Haelan brand assets. Attempt, on `fal`:
(a) V3 `create-style` → `style_id` → vector generation → **can you get SVG out?**
(b) V4.1 Vector + image reference + `strength` + `rgb_colors`.

Generate the same 8-mark pack both ways. Compare palette adherence and stylistic coherence.
Run role snapping (§7.2) on both. **Deliverable:** a decision on the generation adapter, and
a measured ΔE threshold.

*Acceptance:* the adapter shape is decided and written down. No code merged.

### Phase 1 — Render service + scene graph *(the unblock)*

- Fly.io container, Playwright, `POST /render`.
- `/render/[postVisualId]` route rendering `<Stage/>`.
- Scene graph types (§5), zod validators.
- `<Composition/>` React renderer: all six layer types, `Binding` resolution, blend, clip.
- Port the existing Satori templates to compositions, by hand.
- `render_hash` skipping.

*Acceptance:* every current template renders through Chromium, pixel-inspected against the
Satori output, with Cyrillic correct. Satori is deleted from `package.json`. No user-visible
change.

### Phase 2 — Extraction → brand kit, inside onboarding

- Website extractor (computed styles + vision), run **async** from step 2.
- Image extractor (k-means + vision), for the Brand kit tab.
- `ExtractionReport` confidence badges.
- Two new Analyzing checklist rows — non-blocking.
- Review step extended: tokens, 3×3 preview grid, feed-system picker.
- Neutral default kit for the manual-skip path.
- `brand_kits` table, versioning.

*Acceptance:* onboard `haelan.bg` through the existing four steps. Review shows tokens matching
the attached design-system file within visual tolerance, fonts badged `measured`. Skip the URL
and finish manually — the client still has a renderable brand kit. Onboarding gains **zero**
perceived latency.

> Depends on Phase 1: extraction and rendering share the same Playwright container.

### Phase 3 — Feed systems + element pack

- `feed_systems`, `compositions`, `pack_elements`, `client_feed_systems`.
- Recraft adapter + role snapping (§7.2).
- Chrome components (7 of them), parametric.
- Curation grid.
- Visibility: `private | agency`. **Marketplace deferred.**
- Author two starter systems in-house.

*Acceptance:* one feed system renders correctly under two different brand kits, from the same
stored `pack_elements` rows. Zero hex values in `compositions` or `pack_elements`.

### Phase 4 — Generation flow

- Composition assignment from rhythm rules.
- Fit check with bounded auto-fit → LLM shorten → flag.
- Plate placeholders (token gradients) at step 4; **plates only at Results**.
- `plateBudget` on the feed system; estimated cost on the Generate button.
- Legibility guard.
- **Visual** dimension in the existing quality panel, with fix-links.
- Slide tabs → rendered thumbnails.

*Acceptance:* generate an 8-slide Bulgarian carousel. No overflow. No text under 4.5:1. Step 4
spends **$0.00**. Landing on Results spends $0.04 (`cover-only`). Discarding the run and
starting a new one costs nothing extra.

### Phase 5 — Slide editor

- Layer panel, `react-moveable`, `react-selecto`, `zustand` + `immer`.
- Property panels per layer type, bound/override dot.
- Shape-level mark editing (path select, recolour, transform, delete).
- Add layer, including add-mark-by-prompt.
- `PlateLayer.source: 'uploaded'` — upload replaces the plate, treatment reapplies on top.
- Reachable from wizard Results, review queue, and the calendar schedule modal — one route.
- Remove the `6 of 6 images` publish gate.

*Acceptance:* an operator changes a headline, swaps a mark, uploads a client photo as a plate,
and re-renders, without leaving the page. The uploaded photo comes out duotoned and typeset
like every other slide. Overridden properties survive a token change; bound ones do not.

### Phase 6 — Plate editing

- Reroll ×3, reprompt (subject only), SAM2 click-to-mask, brush/lasso fallback.
- Inpaint + erase.
- `plate_edits` tree, undo as pointer move, revert-to-original.
- Cost display, soft cap, debounce.

*Acceptance:* click a subject's sunglasses, type "give her sunglasses", get them, with the
headline and chrome untouched. Undo twice, branch, redo.

### Phase 7 — Propagation, grid view, Canva sunset

- Version bump on brand kit save; the `Save changes` dialog states the consequence.
- Auto-propagate drafts; banner + per-post offer for scheduled; lock published.
- Bulk re-render job.
- Calendar `Month / Grid` toggle; rhythm checks run against the grid projection.
- Mark `Design in Canva` deprecated; keep it working, stop featuring it.

*Acceptance:* change `accent`. Twelve drafts re-render. A calendar banner offers to re-render
three scheduled posts, priced at $0.00. One published post is untouched and its modal is
read-only. Grid view shows the client's next nine posts as they will appear on Instagram.

---

## 15. Open risks

1. **Recraft style + SVG export may be mutually exclusive.** Phase 0 answers this. If it is,
   stylistic coherence within a pack rests on the prompt template, and packs will need more
   curation. Not fatal; do not discover it in Phase 3.

2. **Shared feed systems degrade under badly mismatched fonts.** Font requirements (§2) plus
   the fit check mitigate. A system authored for condensed display and used with a wide serif
   will still look worse than it should. Accept, and surface a warning at assignment time.

3. **Chromium cold start.** Keep one warm instance. Rendering 8 slides sequentially in a
   single browser context is far cheaper than 8 cold Lambdas.

4. **Element pack quality is the gating aesthetic risk.** Curation is the mitigation and it
   is not optional.

5. **Two plates per slide invites bad design.** The layer panel stays legible, but operators
   who are not designers will make mud. Ship starter compositions that use the second plate
   well (duotone split, framed inset) so the feature is discovered through a good example
   rather than a blank canvas.

---

## 16. What is explicitly not built

- Point-level bezier editing.
- Freeform canvas (no compositions, no tokens, no AI contract).
- Flatten-to-vector export.
- Text rendered into any generated asset, ever.
- Feed-system marketplace (schema supports it; UI deferred).
- Video / Reels — `HyperFrames` remains sequenced after this.