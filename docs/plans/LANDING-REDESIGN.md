# Landing Redesign — Locked Design & Implementation Plan

**Status: DESIGN LOCKED (v21b, 2026-07-29). Implementation not started.**

- Live mock (pixel source of truth): https://claude.ai/code/artifact/43ff4d26-cde5-41c8-91dc-cfa17b320ffc
- Repo copies (scratchpad is volatile — these are canonical now): [docs/redesign-mocks/](../redesign-mocks/)
  - `landing.html` — built, self-contained; open in a browser to inspect any pixel/timing
  - `landing.template.html` — editable source; `direction-01.html` — base CSS/tokens; `build_landing.py` — assembler
  - `auth.html`, `dashboard.html` — sibling-surface mocks (dashboard has its own future plan)
  - `img-*-c.jpg` — all fal.ai-generated photography used by the mocks
- Companion audit (already done, applies to Phase A): `~/.claude/plans/virtual-moseying-kernighan.md` → "Out of scope — repo implementation" section. Key items are inlined in Phase A below.

---

## 1. Locked design decisions (do not relitigate)

1. **Kittl pattern.** One landing page: huge left-aligned headline hero + imagery marquee walls; every capability proven by a live demo section further down. **Sign-in / sign-up are dialogs over the page** — the `/login`, `/signup`, `/forgot-password` standalone pages are retired.
2. **Organized bands.** Every mid-page section is a real CSS-grid band (`1fr 1fr`, `align-items: center`, gap 72px, wrap 1280px): text column + ONE large flat demo panel. No tilt, no parallax, no pulled offsets on section visuals. Art-direction flourishes (ghost serif words, floating polaroids, aurora) live **only in the hero and final CTA**.
3. **Contour brand system** (from the name: *kontuur = the line that describes a shape without filling it*):
   - Page paper `#F1F0EA`, raised cards `linear-gradient(180deg, #FFFFFF, #FBFAF6)`, ink `#0E2B21`.
   - **Accent `#CFEA45` is rare by rule**: the 5th hero contour line, the analytics peak callout, signup-panel accents, the dark CTA capability card, auth-panel details. Never used as a surface tint (that's `#E6EEAE`).
   - Density rule: landing = full contour field (8-line hero SVG) · auth dialogs = 2 lines · dashboard = data only.
4. **Honesty rules.** No fabricated logos, stats, testimonials, or domains. Product output is the imagery. Every demo mirrors a real shipped feature.
5. **No image reuse across surfaces.** Each surface gets its own fal.ai-generated editorial photography, visually QA'd before use. Copy↔visual pairing is literal (the engine demo's photo matches its generated caption word-for-word).
6. **Motion is conceptual and calm.** Entrances gate on visibility (never bare on-load). `prefers-reduced-motion` always renders the settled end-state. No route-change animations anywhere (session-8 nav-perf lesson).

---

## 2. Design tokens

Base tokens (from `direction-01.html`) + landing overrides. These become the new `globals.css` palette in Phase A.

```css
:root {
  /* surfaces */
  --paper: #F1F0EA;        /* landing/auth page bg (base mock default was #FBFCFA; contour spec wins) */
  --surface: #FFFFFF;      /* cards pair with the raised gradient: #FFFFFF → #FBFAF6 */
  --ink: #0F1512;          /* near-black text; dark surfaces use #0E2B21 (ink-forest) */
  --text2: #57625A;  --text3: #8B958D;
  --line: #E7ECE7;   --line2: #D5DDD6;   /* hairline on paper: #D8DAD0 */
  /* greens */
  --forest: #164430;  --forest-deep: #0C2E20;  --spring: #2E9E68;
  --wash: #EEF4EF;    --marker: #D9EDDD;       /* marker-highlight fill */
  --surface-lime: #E6EEAE;  --sage: #CFE4D4;   /* graduated capsule tints */
  --accent: #CFEA45;        /* RARE — see rule 3 above */
  /* status */
  --danger: #B04A38; --danger-bg: #FBEFEC; --danger-line: #E8CFC9;
  --pending: #8A6116; --pending-bg: #F7EFDC;
  /* chaos-chip dots (problem section only) */
  /* red #C4543F, amber #C99A3C */
  /* type */
  --serif: 'Instrument Serif', Georgia, serif;
  --sans: 'Geist', -apple-system, 'Helvetica Neue', sans-serif;
  /* geometry */
  --r-sm: 8px; --r-md: 10px; --r-lg: 14px;   /* big panels use 16–20px */
  --sh-pop: 0 12px 32px rgba(15,21,18,0.10);
  --sh-frame: 0 24px 60px rgba(15,21,18,0.06);
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
}
```

**Dark surface treatment** (signup panel, dark capability card, poster slides): `linear-gradient(180deg, #113429 0%, #0E2B21 100%)` + dot-grid texture `radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1.5px)` at `13px 13px`.

**Hatched "open slot" texture**: `repeating-linear-gradient(45deg, rgba(…) 0 2px, transparent 2px 5px)`.

**Type scale (landing):** display `clamp(52px, 7.6vw, 108px)`; section titles `clamp(30px, 2.7vw, 39px)`; section note 16px; body 14–15px; micro-labels 11px uppercase `letter-spacing: 0.13em`.

**Signature type devices:**
- Serif-italic `<em>` inside headlines (Instrument Serif italic, weight 400).
- Marker highlight: absolutely-positioned `::before`, `height: 0.44em`, `bottom ~0.03em`, `background: var(--marker)`, `skewX(-8deg)`; animated variant scales `scaleX(0→1)` from left.
- Stroked "contour" type (auth panel quote): transparent fill + `-webkit-text-stroke` in `#CFEA45`.
- Ghost words (hero "composed.", approvals "approve.", CTA "quietly."): serif italic, `clamp(130px, 20vw, 280px)`, transparent fill, stroke `rgba(22,68,48,0.09)`, z-index 0.

**Fonts:** `next/font` — Geist (variable, sans) + `Instrument_Serif` (weight 400, styles normal+italic, subset latin). Instrument Serif has **no Cyrillic** — serif accents appear only on English/Latin chrome; Bulgarian strings stay sans (already the visual-identity rule). Replaces Playfair everywhere (audit: safe — approve page's serif renders English-only strings).

---

## 3. Page structure & per-section spec

Order: nav → hero → #calm (problem) → #capabilities → #engine → serif marquee → #features (approvals) → ideas → #autopilot → #product (dashboard frame) → #visuals (+ assembly) → #editor → #analytics → reverse marquee → CTA → footer → 2 dialogs.

Wrap widths: default 1140 · `wide` 1320 · `split` 1280 (gap 72) · engine/capabilities 1280 · visuals 1200. Split collapses ≤980px to 1 column (visual always BELOW text via `order`).

### 3.1 Nav
Wordmark `kontuur.` (serif, spring-colored dot) · links: **See it work → #engine · Features → #features · How it works · Product → #product** · "Sign in" (opens sign-in dialog) · `Start free` primary button (opens sign-up dialog). Condenses on scroll (height + shadow). **Fix during implementation: "How it works" points at deleted `#how` — retarget to `#visuals` (the "How a whole post comes together" block) or drop the link.**

### 3.2 Hero (left-aligned, v21b)
- Eyebrow `THE AI SOCIAL STUDIO FOR AGENCIES` → H1 two overflow-masked lines: **"Beautiful client posts —" / "written, designed & *published*."** ("published" = serif italic + animated marker swipe) → sub: *"Kontuur writes the copy, composes the visuals in each brand's identity, gets your client's approval, and publishes on schedule — for every client you manage."* → CTAs: `Start free →` (primary, magnetic hover) + `See how it works` (underline link → #engine). All left-aligned; sub `margin: 24px 0 0`.
- Background: 8-path wavy contour SVG (viewBox 1200×820, stroke `rgba(14,43,33,0.09)` 1.5px, **5th line `#CFEA45`** 2px @ 0.9 opacity), drifting ±12px horizontally, 22s alternate. Ghost word "composed." bottom-left. Two floating polaroids (132×168, 4px white border, r12): skincare `right:3%; top:64px; rot 6°`, botanical `right:9%; bottom:170px; rot −7°`, idle bob via `translate` property (8s / 10s alternate, −4s phase) — **`translate`, not `transform`, to avoid fighting scroll parallax**.
- Two marquee walls below (258px tiles, r14): photo tiles with serif overlay words (*seasonal / protein, honestly / behind the seams / slow rituals*) + typographic post tiles (dark caps "5 myths about protein" 1/5 · wash serif "Slow mornings, back on the menu." 1/4). Row 1 →, 46s; row 2 ←, 62s; pause on hover; even tiles offset 18px down.
- **Entrance (gated):** wait `document.fonts.ready` → IntersectionObserver on the text block (threshold 0.2) → +280ms → run; 4.5s safety fallback; reduced-motion = instant. Sequence: eyebrow fades up (0.9s) → headline lines rise from mask (1.3s each, line 2 +0.18s) → marker swipe (0.9s @ 1.6s) → sub (+0.55s) and CTAs (+0.75s).

### 3.3 #calm — the problem
50/50 band. Left: eyebrow `THE PROBLEM`, title **"Every week, every client, *from a blank page*"**, note *"Running social for clients means doing the whole job — writing, designing, approvals, scheduling, reporting — multiplied by every brand you manage. It looks like this:"*, then 5 pain rows (7px dots, red `#C4543F` / amber `#C99A3C` alternating):
1. A blank page for every client, every Monday
2. Visuals that need a designer you don't have time to brief
3. Approvals lost in WhatsApp threads and screenshots
4. Posting times missed while you're in meetings
5. Reports assembled by hand at month-end

Punchline: **"Kontuur deletes that week. *All of it.*"** (serif-italic marker phrase) — starts hidden (opacity 0, y+8px), **revealed exactly when the stage composes**, stays on.
Right: chaos stage 572×505 — white week card (r16, 348px, THIS WEEK header, Mon–Fri rows 55px with dashed empty slots, Mon = "today" bold forest) under 10 scattered wobbling chips (*Reel due today · Caption still empty · Client: "tweak it?" · No visual yet · Approvals stuck · 3 · Idea buried in email · What to post next week? · Hashtags again · Report due Friday · 9 tabs open*). **Loop** (starts on IO 0.35 +400ms): chips fly to their day rows (90ms stagger, 0.85s ease-out, dots turn spring, bg → wash) → "Composed ✓" pill pops (+550ms) → hold 5.6s → scatter back (50ms stagger) → repeat every 7.8s.

### 3.4 #capabilities — index grid
Centered head: eyebrow `CAPABILITIES`, title **"Everything the feed needs, *built in*"**, note *"Seven jobs that used to be your week — handled by one system. Each one is demonstrated live further down the page."* 4×2 grid (gap 16, cards r~14, raised gradient, padding 24). Each card: 38px icon tile → bold name → value line → animated mini-motif → `→` link that **anchors to its live demo section**:
1. **AI post generation** → #engine (typing lines + caret)
2. **Visual design systems** → #visuals (palette dots)
3. **AI carousels** → #visuals `#asm` (slide strip, 3 filled + 1 empty)
4. **Built-in editor** → #editor (selection handles)
5. **Client approvals** → #features (link chip)
6. **Ideas inbox** → ideas section (bubble)
7. **Auto-publishing** → #autopilot (IG/FB + pulse)
8. **Analytics** → #analytics (mini bars)
Card 8 slot = **dark dot-textured CTA card**: sparkle icon, "Your week, back", *"Start free — 14 days, no card. Set up your first client in minutes."*, lime "Free trial" chip, `Start free →` in `#CFEA45`; opens sign-up dialog. (`role="button"` — **add Enter/Space key handling in React**.)

### 3.5 #engine — live generation demo (v20)
Centered head: eyebrow `THE ENGINE`, title **"Watch a post get *composed*"**, note *"Every post starts from your client's actual business — their articles, their menu, their launches — written in their voice and quality-checked before it reaches you. Copy and visual are generated **together**: a post never arrives half-done."* Centered `↻ Run it again` chip below.
Grid `1fr 560px`, gap 88, center-aligned. Left — 4 steps (dot + bold title + sub + green benefit line, inactive 0.4 opacity):
1. **Reading the sources** — source chip — *→ content tied to their business, never generic*
2. **Writing in the brand's voice** — voice line — *→ sounds like the client, not a chatbot*
3. **Composing the visual** — visual line — *→ on-brand, and editable in the built-in editor*
4. **Quality checks** — chips `Grounded in source ✓ · On-brand ✓ · No clichés ✓` — *→ nothing half-baked reaches the feed*

Right — post card 560px (r18, avatar chip + client + SAMPLE, image 400px, caption area min-height 72px, footer source + status pill Waiting→Composing→Ready for review). **Three datasets cycle** (auto-run on scroll-in, replay advances):
- **GreenLeaf Café** (photo `img-eng-cafe-c.jpg` — pumpkin cortado + cardamom buns; serif overlay word *seasonal* 42px + marker): caption *"The autumn menu is here — pumpkin cortado, cardamom buns, and slow Sunday brunch is back. First pour is on us this weekend."* — photo matches caption **verbatim** (locked device).
- **VitaFit Nutrition** (photo `img-eng-protein-c.jpg` — skyr bowl; caps overlay `PROTEIN, / HONESTLY` 25px, spring band): caption *"Protein myth #4: more is always better. It isn't — timing beats total. Our dietitian on what actually moves the needle."*
- **Atelier Nord** (no photo — forest-deep poster, serif italic 34px *"behind / the seams"*): caption *"Fourteen hours of hand-stitching go into every collar. This week: the work no one sees."*
Choreography: step 1 activates (100ms) → caption typewrites (~interval per char) while step 2 active → photo develops (blur→sharp, `s1`) → overlay word + marker (`s2`) → quality chips pop (150ms + 180ms stagger) → pill "Ready for review" + publish ring (`s4`).

### 3.6 Serif marquees (2, full-bleed)
Forward: `composed · approved · scheduled · published ·` (repeat). Reverse (after #analytics): `no logins · no blank pages · no missed posts · no AI slop ·`. Large serif italic, dots in muted `#CFEA45`.

### 3.7 #features — approvals band
Left text: eyebrow `CLIENT APPROVALS`, title **"Approval in *one tap* — no logins"**, note *"Send your client a link. They see the post exactly as it will run, approve it or ask for changes — and it lands on the calendar the moment they say yes. No accounts, no PDFs, no screenshots in WhatsApp."*
Right: 640px approval vignette (flat, r20): link pill → post preview (photo 300px + caption lines) → `Approve ✓` / `Request changes` buttons → status flip → *"No account. No login. One tap."* Loop a1–a4 (tap animates, status pill flips to Approved, calendar chip). Ghost word "approve." top-right (allowed: it's outside the band? **No — v18 hides it; keep hidden**). **Image TODO: replace reused café photo (see §5).**

### 3.8 Ideas band (visual LEFT, text right)
Vignette: client bubble (*"Client · via their ideas link"*) typewriting **"We're launching the winter menu next week — can we tease it somehow?"** → 3-dot flow → draft card: photo, title **"Winter menu — a first look"**, caption lines, wash pill `Draft ready for review`. Loop i2/i3. Text: eyebrow `IDEAS INBOX`, title **"Client ideas become *drafts*"**, note *"Every client gets their own ideas link. Whatever they send — a launch, a promo, a half-formed thought — arrives in your Ideas inbox and comes back as a composed post, ready for review. No more "can you make a post about…?" emails."* **Image TODO (§5): generate a winter-menu image so title↔photo pair.**

### 3.9 #autopilot band
Left text: eyebrow `AUTOPILOT`, title **"Schedule once. It *publishes itself*"**, note *"Approved posts go out to Instagram and Facebook at exactly the right time, every time — while you're doing literally anything else. The calendar shows every client's week at a glance."*
Right: 640px vignette, 3 **graduated capsule rows** (row 1 `--surface-lime`, row 2 `--sage`, row 3 forest-dark + dot grid): `Mon 09:00 · 5 seasonal specials worth trying · IG` / `Tue 12:30 · Protein myths, part two · IG FB` / `Thu 11:00 · Behind the seams — atelier week · IG`; each status crossfades `Scheduled → Published ✓` in sequence. Footer: *"You were asleep for two of these."*

### 3.10 #product — dashboard frame
Centered head: eyebrow `PRODUCT`, title **"One calm dashboard for *every client*"**. Wide (1320) app frame: light sidebar (Dashboard·Ideas·Review·Calendar·Clients·Analytics), topbar, 3 count-up metrics (Scheduled this week 24 +6 with spring sparkline · Published this month 118 +12% · Awaiting review 7), Upcoming table (3 rows, status pills scheduled/pending/published). Micro-motion only (count-ups, pill pulse). **Keep in sync with the real dashboard rebuild later — this is a marketing screenshot-equivalent, not the real app.**

### 3.11 #visuals — design systems + assembly
Head: eyebrow `VISUALS`, title **"Posts that don't *look AI-made*"**, note *"Every caption ships with its visual, generated as a pair — you never get text without the picture. And every brand gets its own design system — palette, typography and layout templates derived from its real visual presence. A café never looks like a gym, and none of it looks like AI."*
- 3 identity cards (r20): specimen tile 72px + name + tagline + 4 palette dots — GreenLeaf (cream `#F5F1E6`/forest serif-italic Aa · "Editorial serif · photo-led" · #164430/#7FA588/#F5F1E6/#C99A3C), VitaFit (green `#1B5E48` bold AA · "Bold caps · marker bands" · #1B5E48/#9BE1B8/#F2F7F1/#0F2A20), Atelier Nord (ink `#0C2E20` gold serif Aa · "Poster type · deep tones" · #0C2E20/#D9C9A8/#F2F5F1/#3E4A42). Caption: *"Built from each brand's site, feed and materials — then applied to every post, automatically."* ("Aa" specimens are OK here — explicit design-system context.)
- Assembly block, title **"How a whole post comes together — *theme, copy, every slide*"**: 3 numbered capsule phases — **1 Researching the theme** (lime capsule; pills *Autumn menu launch* [selected → forest solid] · *Baking behind the scenes* · *Meet the roaster*) → **2 Writing the copy** (sage capsule; sunken field typewrites *"The autumn menu lands Friday — pumpkin cortado, cardamom buns, and slow Sunday brunch is back."*) → **3 Generating a visual for every slide** (dark capsule + dot grid; 4 slide tiles with white notch numbers: photo+*seasonal* · type slide "GreenLeaf · Menu / Three new drinks, one weekend." · photo · CTA slide "First pour on us / greenleaf café" + one hatched ghost tile) → pager *"Carousel · 4 slides, one visual each"* + lime pill `Ready for review`. Loop ~2.2s + typing + 6.8s hold.

### 3.12 #editor
Head: eyebrow `THE EDITOR`, title **"Need a tweak? *Open the editor*"**, note *"Every visual is fully editable inside Kontuur — move and restyle the type, swipe a marker highlight, drop in elements, cut subjects out of photos. No Canva round-trips, no export-import dance."*
Wide frame 960px (r20): top bar (*seasonal specials · GreenLeaf Café* / `Save to draft`), left tool rail (select/text/pen/shapes/eraser), canvas `#F0F2EF` with 320×400 art. Loop e1–e5: dashed spring selection + 4 corner handles ON → word block translates (8px, −46px, −2°) → marker swipes under *seasonal* → botanical SVG element pops in (spring overshoot `cubic-bezier(0.34,1.56,0.64,1)`, rot 8°) → deselect/save. **Image TODO (§5).**

### 3.13 #analytics band
Left text: eyebrow `ANALYTICS`, title **"Know what worked, *without digging*"**, note *"Follower trends, top posts and audience insights for every client — with an AI summary that tells you what to do next, and a client-ready report in one click."*
Right: 640px vignette — head `Last 30 days` + `AI summary` chip; 8 fat capsule bars (scaleY stagger, heights 32→90%, peak carries **lime callout `Reels · 3.1×`**); AI summary typewrites *"Reels beat static posts 3:1 for this client — schedule more video next month."*

### 3.14 CTA + footer
CTA (flourish zone): aurora, ghost "quietly.", serif line **"Run every feed from one *quiet place*."** (marker on "quiet place"), `Start free →` magnetic button, cap *"14-day free trial · no card required"*.
Footer: wordmark · Privacy · Terms · Data deletion · hello@kontuur.app · © 2026 Kontuur. **Wire to the real routes** (`/privacy`, `/terms`, `/data-deletion` exist for Meta review).

### 3.15 Auth dialogs (replaces auth pages)
Backdrop: `rgba(…)` + `backdrop-filter: blur(10px)` over the landing.
**Sign-in dialog** (single column, r~20, raised): logomark gradient "k." tile + wordmark; 3 views —
- `dv-in` **Welcome back** / *Sign in to review this week's drafts.* / Email + Password (sunken fields `#F3F5F2`, borderless, spring focus ring, per-field error lines: *Enter your email to sign in. / Password is required.*) / `Sign in` full-width ink button / *Forgot your password?* / swap: *Don't have an account yet? Sign up*
- `dv-fp` **Reset your password** / *We'll email you a link to set a new one.* / email / `Send reset link` / back link. Error: *Enter the email you signed up with.*
- `dv-sent` check-ring + **Check your inbox** / *If an account exists for that address, a reset link is on its way.* / back link.
Empty-submit shake animation on invalid fields.
**Sign-up dialog** (two columns ~1.04/0.96): left form — **Create your free account** / *14-day trial · no card required* / Your name + Work email + Password (*8+ characters*; errors: *Tell us your name. / A work email is required. / Choose a password with 8+ characters.*) / `Create account` / terms line; right **ink panel** (dark gradient + dot grid + 2 contour SVG lines that draw progressively as the 3 fields fill): headline **"From blank feed to *booked calendar*."** (em in `#CFEA45`) + 4 lime-check lines: *Posts written and designed in each client's own brand identity · Clients approve with one tap — a link, no logins · Publishes itself to Instagram & Facebook, on schedule · Analytics with an AI summary and client-ready reports* + foot *Built for agencies & solo marketers*. Panel hides ≤760px.

---

## 4. Motion reference table (as-built v21b)

| Animation | Trigger | Timing |
|---|---|---|
| Hero entrance | fonts.ready → IO(.hero-inner, 0.2) + 280ms; fallback 4.5s | eyebrow 0.9s → lines 1.3s (+0.18s) → marker 0.9s @1.6s → sub +0.55s → CTAs +0.75s |
| Contour lines draw | with hero `.go` | dashoffset 1500→0, 3.5s, stagger ×0.15s per line |
| Contour field drift | ambient | ±12px, 22s ease-in-out alternate |
| Hero marquees | ambient | 46s fwd / 62s reverse, linear, pause on hover |
| Polaroid bob | ambient | `translate` −7px↔+9px, 8s/10s alternate |
| Scroll reveals (.rv) | IO, per-element `--d` delays | opacity+y, ~0.6s ease-out |
| Chaos→composed | IO 0.35 + 400ms, loops | settle 0.85s ×90ms stagger → pill +550ms → hold 5.6s → reset ×50ms → loop 7.8s |
| Punchline sync | on first "composed" | fade-up 0.5s, persists |
| Engine run | IO on section; replay button | typewriter per-char; photo `s1` blur→sharp 0.45–0.6s; word `s2`; chips 150+180ms; states via `t0/t1/t2` |
| Autopilot statuses | IO, sequential | crossfade Scheduled→Published per row |
| Analytics bars | IO | scaleY stagger; then summary typewriter |
| Assembly loop | IO | phase 1 select → typing → slides pop → hold 6.8s → loop |
| Editor loop | IO | e1–e5; element pop 0.6s spring overshoot |
| Count-ups (#product) | IO | rAF cubic ease-out |
| Magnetic buttons | pointer | small translate toward cursor, reset on leave |

`prefers-reduced-motion`: every loop renders its settled end state; no typewriters, no marquee (acceptable: paused), entrance instant.

---

## 5. Asset inventory & TODOs

All photography = fal.ai `flux/schnell` (REST `https://fal.run/fal-ai/flux/schnell`, `Authorization: Key $FAL_API_KEY` — **.env.local value is quoted; strip quotes**), `num_inference_steps: 4`, `image_size: landscape_4_3`, jpeg → `sips -Z 900 -s formatOptions 72`. **Always visually QA the output before use.** Prompt style: "Editorial ⟨niche⟩ photography … soft natural light, minimal calm styling, no people, no text".

In repo (`docs/redesign-mocks/`), currently used by the landing:
- Hero wall + misc: `img-cafe-c` (latte), `img-nutrition-c`, `img-atelier-c`, `img-interior-c`, `img-skincare-c`, `img-botanical-c`
- Engine (v20, exclusive): `img-eng-cafe-c` (pumpkin cortado + cardamom buns), `img-eng-protein-c` (skyr bowl, sage linen)
- Auth deck (auth mock only): `img-florist-c`, `img-bakery-c`, `img-ceramics-c`

**Generate during implementation (no-reuse rule — these currently borrow hero-wall images):**
1. Approvals vignette photo (§3.7) — e.g. café tabletop, different scene/angle from both café shots.
2. Ideas draft card (§3.8) — **winter menu** scene (matches "Winter menu — a first look").
3. Assembly slides 1 & 3 (§3.11) — autumn-menu pair distinct from the engine photo.
4. Editor canvas art (§3.12) — its own "seasonal specials" image.
Hero wall keeps its 6. Dialogs use no photography.

---

## 6. Implementation phases (repo)

Work directly on `main` (project git rule). Mock-first phase is over once this plan is picked up.

### Phase A — design-system foundation (~0.5 day)
1. `globals.css`: replace the old navy/terracotta token block with §2 tokens (Tailwind 4 `@theme`). Var-driven components (badge, inputs, buttons, modal) auto-propagate.
2. **Widened sweep** (audit findings — the flip alone is NOT enough):
   - `rgba(44,62,80,…)` and `rgba(192,123,85,…)` literals; creams `#F4EFE6` / `#F7F4EF`
   - `APPROVAL_STATUS_STYLES` hardcoded map — `features/review/components/types.ts:8`
   - Toaster inline styles — `app/layout.tsx:71`
   - `NextTopLoader color="#2C3E50"` — `(dashboard)/layout.tsx:66`
   - Input error red `#E24B4A` — `field-styles.ts:17` → `--danger` token
   - Button: **add missing focus-visible ring**
3. Fonts: next/font Geist + Instrument Serif (normal+italic); remove Playfair.
4. Verify app still renders coherently (dashboard keeps working with flipped tokens; its full rebuild is a separate plan).

### Phase B — landing page (~2 days)
1. Replace `src/app/page.tsx` content + `features/marketing/*` with `features/landing/`: one component per §3 section (`Nav`, `Hero`, `Problem`, `Capabilities`, `Engine`, `SerifMarquee`, `Approvals`, `Ideas`, `Autopilot`, `ProductFrame`, `Visuals`, `Editor`, `Analytics`, `Cta`, `Footer`, `dialogs/SignInDialog`, `dialogs/SignUpDialog`).
2. Server component shell; client islands only for animated sections. Shared hooks: `useReveal` (IO + `--d`), `useSectionLoop` (IO-gated loop with cleanup), `useTypewriter`, `useCountUp`; marquees pure CSS.
3. Port §4 timings exactly; visibility-gated hero entrance; reduced-motion branches; **clear all timers on unmount** (rAF/interval cleanup — same class of bug as the Stage-E rAF gotcha).
4. Images: generate §5 TODOs, place in `public/landing/` (or imported statics), serve via `next/image` with explicit sizes; below-fold `loading="lazy"`.
5. SVGs (contour field, mini-motifs, icons) inline as JSX.

### Phase C — auth as dialogs (~1 day)
1. Radix Dialog (matches app stack) styled per §3.15, `backdrop-filter: blur(10px)`.
2. Wire existing Supabase server actions: sign-in, sign-up, forgot-password (→ `dv-sent`). Client-side field validation + shake; server errors surface in the same error-line style.
3. `?auth=signin|signup` URL param opens the dialog (deep-linking); middleware redirects `/login` & `/signup` → `/?auth=…`. Keep `/setup-password` (magic-link landing) and check-email as minimal routed pages restyled with the same field/button components.
4. Delete retired auth page UIs after redirects are in.

### Phase D — QA & polish (~0.5 day)
- Full scroll-through vs `docs/redesign-mocks/landing.html` side-by-side.
- Dialogs: all views, validation, real auth round-trip, focus trap, Esc/overlay close.
- Reduced-motion emulation; keyboard pass (incl. capability CTA card); 980/900/760/560 breakpoints; Lighthouse (target: no CLS from marquees/images, lazy below-fold).
- Session-8 rule holds: zero route-transition animation.

---

## 7. Explicitly out of scope (separate efforts)
- Dashboard rebuild per `docs/redesign-mocks/dashboard.html` (needs: per-client coverage cached query in `src/lib/queries/cache.ts`; fix undated "Published this month" query + hardcoded "+1 this month").
- App-internal forms/dialogs/dropdowns restyle beyond what the Phase A token flip propagates.
- `/styleguide` route (nice-to-have later).
- Recraft palette adherence + bucket MIME svg check (older backlog).
