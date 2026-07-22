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
  /review. Rewrites and copy edits never auto-regenerate visuals.

### The prompt contract (`buildVisualPrompt`, pure function)

```
create a visual for social media for this slide
TEXT - Slide {n} of {total}

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

🔜 **Still deferred (specified below, not yet planned)**
- **§4 Advanced Canvas:** SVGs-on-demand, DIS object isolation, layer architecture, "Isolate Object" flow.
- **§5 Editor guardrails** and the Phase-4 canvas workspace.
- **§6:** first-vs-middle-slide prompt distribution and the text-overflow boundary guard.
- **Fonts** (user decision 2026-07-21): visuals are text-free, so the font library lands with the
  text-overlay/canvas phase, with per-style default pairings.

**Setup:** migrations `20260718_create_brand_visual_identity.sql` +
`20260721_strip_legacy_visual_identity_fields.sql` + `20260722_post_images_unique_position.sql`;
deps `@sparticuz/chromium` + `puppeteer-core` + `zod` + `@fal-ai/client`; env `CHROME_EXECUTABLE_PATH`
(local) + `FAL_API_KEY` (local ✓, add to Vercel). Requires Vercel Pro (`maxDuration=60` extract routes,
`120` visuals routes). ~52s + ~$0.04–0.07 per image.

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
6.1 The "First Slide vs. Middle Slide" Visual Hierarchy Problem
* The Gap: Inpainting, SVGs, treat all slides with equal weight. In reality, Slide 1 (The Hook) must have massive visual impact, while Slide 2 to 9 need high legibility for data, and the Final Slide requires a high-contrast Call to Action (CTA).
* The Solution: Adjust the Fal.ai prompt distribution. Instead of generating an identical texture density across the entire ribbon, the prompt must explicitly inject a heavy visual anchor on the far left (Slide 1) and a structured frame on the far right (Final Slide), keeping the center panels clean for body text.
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



