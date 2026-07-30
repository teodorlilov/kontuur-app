---
name: Kontuur
description: A green editorial system — warm paper, forest ink, and serif accents used sparingly.
colors:
  deep-pine: "#164430"
  pine-deep: "#0c2e20"
  living-green: "#2e9e68"
  living-green-text: "#278658"
  living-green-lite: "#7fd6a8"
  new-growth: "#cfea45"
  warm-paper: "#f1f0ea"
  surface: "#ffffff"
  sunken: "#f3f5f2"
  forest-ink: "#0f1512"
  ink-secondary: "#57625a"
  ink-tertiary: "#667068"
  hairline: "#e7ece7"
  hairline-strong: "#d5ddd6"
  wash: "#eef4ef"
  marker: "#d9eddd"
  surface-lime: "#e6eeae"
  sage: "#cfe4d4"
  clay: "#b04a38"
  clay-bg: "#fbefec"
  amber: "#8a6116"
  amber-bg: "#f7efdc"
typography:
  display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  headline:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  metric:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "31px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  title:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  caption:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.16em"
rounded:
  xs: "4px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "20px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "16px"
  card: "20px"
  card-wide: "24px"
  section: "32px"
  page: "40px"
  section-y: "48px"
  major: "64px"
components:
  button-primary:
    backgroundColor: "{colors.deep-pine}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.pine-deep}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.clay}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.xl}"
    padding: "20px 24px"
  card-dark:
    backgroundColor: "{colors.pine-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    padding: "20px 24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    typography: "{typography.body}"
  chip:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.deep-pine}"
    rounded: "{rounded.md}"
    padding: "3px 8px"
---

# Design System: Kontuur

## Overview

**Creative North Star: "Contour Calm"**

Kontuur is a green editorial system. Warm paper instead of white, forest ink instead of black, and a serif used so sparingly that each appearance reads as an authored moment rather than a style. The interface is a workroom for other people's brands: every decision that makes Kontuur more visible makes it worse at its job. Content — posts, captions, client names, calendars — is the thing. Chrome recedes.

Depth comes from tone before it comes from shadow. The system layers warm paper under white surfaces under deep pine, and separates them with 0.5px hairlines rather than heavy borders. Status colour is deliberately muted: a missed publish is clay, not red; a waiting draft is amber, not orange. Nothing in this interface shouts, because the work it manages is already urgent enough. Motion confirms and guides; it never decorates.

The one loud value in the palette is New Growth lime, and its power is entirely a function of its rarity. It marks the live present — today, in progress, happening now — and nothing else.

**Key Characteristics:**

- Warm paper ground (`#f1f0ea`), never pure white for page backgrounds
- Forest ink and a botanical green ramp; no blues, no unrelated hues
- Instrument Serif italic for accents only, and Latin-only by necessity
- Hairline separation (0.5px) with tonal layering as the primary depth cue
- Muted status colour; saturated defaults are rejected outright
- Tabular numerals on every metric

## Colors

A botanical ramp on warm paper: greens carry all brand meaning, and the two status hues are earthen rather than signal-bright.

### Primary

- **Deep Pine** (`#164430`): The brand green. Primary buttons, active navigation, links, published status text. The default answer whenever an element must read as "Kontuur".
- **Pine Deep** (`#0c2e20`): Hover state for Deep Pine, and the ground for dark surfaces — the dark stat capsule, the onboarding rail, the sidebar outside the app shell.

### Secondary

- **Living Green** (`#2e9e68`): The signal of health and motion — focus rings, live dots, chart strokes, the "ok" status. At 3.38:1 on white it clears the 3:1 bar for non-text UI, **but it fails as text.** Use **Living Green Text** (`#278658`, 4.53:1 on white) for any green *word* on a light ground — positive deltas, links, status labels. Over dark surfaces use **Living Green Lite** (`#7fd6a8`).
- **New Growth** (`#cfea45`): The lime. The loudest value in the system, the most governed, and — at **1.35:1 on white** — a fill, never a word. See The Living Present Rule.

### Tertiary

- **Wash** (`#eef4ef`): Tinted fill behind Deep Pine text — published chips, quiet emphasis panels.
- **Marker** (`#d9eddd`): The highlighter fill. Scheduled status, marker-highlight text treatments.
- **Surface Lime** (`#e6eeae`) and **Sage** (`#cfe4d4`): Tinted row and capsule surfaces. These are *surfaces*, not semantics — they must never be asked to encode data on their own.

### Neutral

- **Warm Paper** (`#f1f0ea`): The page ground. Never `#ffffff`, never a cool grey.
- **Surface** (`#ffffff`): Card and panel surfaces, sitting on warm paper.
- **Sunken** (`#f3f5f2`): Inset areas — table headers, search fields, wells.
- **Forest Ink** (`#0f1512`): Primary text. Headings, values, body.
- **Ink Secondary** (`#57625a`): Descriptions, form labels.
- **Ink Tertiary** (`#667068`): Hints, timestamps, placeholders. Corrected from the incumbent `#8b958d`, which measured 3.10:1 on Surface and 2.71:1 on Warm Paper — failing the 4.5:1 this system commits to, across roughly fifteen text roles. The replacement holds 4.51:1 on Warm Paper and 5.15:1 on Surface at the same hue and chroma, so it reads as the same grey, only legible.
- **Hairline** (`#e7ece7`) and **Hairline Strong** (`#d5ddd6`): Card edges and dividers; input borders respectively.

### Status

- **Clay** (`#b04a38`) on **Clay Background** (`#fbefec`): Errors and destructive actions.
- **Amber** (`#8a6116`) on **Amber Background** (`#f7efdc`): Pending, waiting, needs attention.

### Named Rules

**The Living Present Rule.** New Growth lime marks *now* — today, in progress, publishing, live — and nothing else. It is never a category colour, never decorative, and never assigned by position in a list. At most one lime element per view. *Audit test: if the lime element would still be lime tomorrow, it is wrong.*

**The Fill-Only Lime Rule.** New Growth is a fill, a marker, or a dot — never a word on a light ground. It measures 1.35:1 on Surface, so lime text on white or paper is unreadable regardless of size. Lime type is legitimate only on Pine Deep, where the relationship inverts.

**The Legible Tint Rule.** Text on a tinted surface (Surface Lime, Sage, Marker, Wash, and the status backgrounds) uses a **solid** ink token — Forest Ink or Ink Secondary — never an alpha-reduced ink. Measured: `ink/55%` lands at 4.10:1 on Surface Lime, 4.08:1 on Marker, and 3.74:1 on Sage, so the same line changes legibility depending on which tint sits under it. Alpha inks are for hairlines and overlays, not for reading.

**The Botanical Closure Rule.** Every hue in this system is a green, a neutral, or one of the two earthen status colours. There are no blues. A blue link, a `blue-500`, or a fifth unrelated hue for a fourth chart series is out of system — the metric ramp deliberately runs Deep Pine → Living Green → `#7fa588` → Pine Deep rather than four unrelated colours.

**The Muted Status Rule.** Status colour is earthen, never saturated. `green-500` and `red-500` are rejected on sight; a failure is Clay and a wait is Amber.

## Typography

**Display Font:** Instrument Serif (with Georgia, serif)
**Body Font:** Geist (with Arial, Helvetica, sans-serif)
**Mono Font:** Geist Mono

**Character:** A neutral, highly legible grotesque doing all the work, interrupted rarely by a warm serif italic. The serif never explains or labels — it appears at moments of address (a greeting, an empty state, an editorial aside) and then gets out of the way. The pairing's restraint is the point: the serif is memorable precisely because it is rationed.

### Hierarchy

- **Metric** (600, 31px, −0.02em, tabular-nums): Stat values. Always tabular.
- **Headline** (600, 23px, −0.02em): The dashboard greeting and page-level headings.
- **Display** (Instrument Serif italic, 400, 15–17px): Editorial asides, empty-state lines, the agency name in the greeting, the wordmark. Accents only.
- **Title** (600, 14.5px, −0.02em): Section titles.
- **Body** (400/500, 13–13.5px, 1.6): Body text, navigation items, table cells.
- **Caption** (400, 11.5–12px): Hints, captions, card sub-lines.
- **Micro** (500/600, 11px): Badges, pills, timestamps.
- **Label** (600, 9.5–10px, +0.16em, uppercase): Sidebar section labels.

### Named Rules

**The Latin-Only Serif Rule.** Instrument Serif ships no Cyrillic glyphs, and half this product's audience is Bulgarian. Any interpolated user string set in `font-display` **must** gate on `hasCyrillic()` and fall back to the sans face. This applies to agency names, client names, initials, and AI-generated copy alike — not just the greeting. *Audit test: if a string comes from the database and is set in the serif, it needs the gate.*

**The Rationed Serif Rule.** The serif is for the wordmark, greetings, empty states, and editorial one-liners. Never body text, never labels, never buttons, never anything a user must read in volume.

**The Weight Ceiling Rule.** 400 and 500 carry the interface; 600 is correct for titles, stat numbers, and section headings. **700 stays unused.**

## Layout

A fixed 224px sidebar beside a fluid content column, capped at 1280px and padded 40px horizontally. The spacing scale is closed — 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 — and intermediate values are not invented. Cards are padded `20px 24px`.

Density is moderate and deliberately uneven: metric rows and chip strips run tight, while editorial moments (greetings, empty states, briefings) are given conspicuous air. That contrast is the system's rhythm — compressing the breathing room around an empty state to fit more above the fold destroys it.

Content regions should be sized by what they contain rather than forced to a shared constant. Two panels answering different questions do not owe each other equal height.

## Elevation & Depth

**Tonal-first; shadow is a whisper.** Depth is carried primarily by the tonal stack — Warm Paper beneath Surface white, with Sunken for inset wells and the dark pine capsule at the top of the range — and by 0.5px hairlines. Shadows exist, but as ambient lift rather than structural drop: `--sh-card` is a 36px blur at 10% opacity with a 1px contact shadow, which reads as a card resting on paper, not floating above it.

Structural shadow is reserved for genuinely floating layers: popovers, dropdowns, modals, and dark surfaces.

Dark surfaces are never flat fills. They are a vertical gradient overlaid with `--dot-grid` at 13px 13px — a fine, almost-invisible texture that keeps large dark areas from reading as dead ink.

### Shadow Vocabulary

- **Card** (`0 1px 2px rgba(15,21,18,0.03), 0 14px 36px -14px rgba(15,21,18,0.1)`): Resting cards and panels.
- **Pop** (`0 12px 32px rgba(15,21,18,0.1)`): Dropdowns, popovers, tooltips.
- **Frame** (`0 24px 60px rgba(15,21,18,0.06)`): Modals and large framed compositions.
- **Dark** (`0 18px 44px -14px rgba(12,46,32,0.55)`): Dark capsules and pine surfaces.

### Named Rules

**The Resting Surface Rule.** Surfaces are at rest by default. Shadow answers state — floating, hovering, focused — never decoration. If two adjacent elements both cast shadow, at least one of them is wrong.

## Shapes

Corners are softly rounded on a deliberate scale: 4px for the smallest chrome, 8px for compact controls, 10px for buttons and chips, 14px for panels, and 20px for cards. The scale is declared in Tailwind's own `@theme` namespace so `rounded-lg` resolves to the Contour value everywhere in the app rather than Tailwind's default — this is intentional and must not be "fixed" back.

Borders are hairlines. Cards, panels, and dividers take **0.5px**; only inputs take a full 1px, so form fields read as the one genuinely interactive edge on a surface. Pills and avatars go fully round.

Texture is part of the form language: `--hatch` (45° repeating lines) marks open or unfilled states, and its inverse marks the same on dark. Hatching means *absence* — an unscheduled day, an empty slot — and must not be used as ornament.

### Named Rules

**The Hairline Rule.** Card borders are 0.5px, never 1px. A 1px border on a card is out of system and reads as a different product.

## Components

Components should feel **tactile and considered** — like well-made objects on a bench. They respond to touch (a 0.98 active scale), lift softly, and never bounce or flourish.

### Buttons

- **Shape:** Softly rounded (10px), `inline-flex`, 6px icon gap, `line-height: 1`.
- **Primary:** Deep Pine ground, white text, `8px 16px`. One primary action per page.
- **Secondary:** Transparent with a 0.5px Hairline Strong border, Forest Ink text. Secondary actions and destructive confirmations.
- **Ghost:** Transparent, Ink Secondary text, tighter `8px 10px`. Tertiary actions and cancels.
- **Danger:** Transparent, Clay text, Clay Background border. Destructive only.
- **Hover / Active:** Background and border transition at 150ms; `transform: scale(0.98)` at 100ms on active. Hover shifts tone, never hue.
- **Sizes:** `sm` = `5px 12px` at 12px with an 8px radius; `lg` = `11px 22px` at 15px.

### Cards / Containers

- **Corner Style:** 20px.
- **Background:** Surface white on Warm Paper; the dark variant is a pine gradient over the dot grid.
- **Shadow Strategy:** Ambient card lift only — see Elevation.
- **Border:** 0.5px Hairline.
- **Internal Padding:** `20px 24px`.

### Inputs / Fields

- **Style:** Surface or Sunken ground, 1px Hairline Strong border, 10px radius, `8px 12px`.
- **Focus:** `box-shadow: 0 0 0 3px rgba(46,158,104,0.12)` — a Living Green halo, not a hard outline.

### Navigation

- **Style:** 224px sidebar. Items at 13px body weight with Ink Secondary text; the active item takes Wash fill with Deep Pine text. Uppercase 10px `+0.16em` section labels above groups. Icons are 16px Lucide strokes, always paired with a text label.

### Chips / Badges

- **Style:** 10px radius, `3px 8px`, 11px micro type. Semantic pairs are fixed: published = Wash on Deep Pine; scheduled = Marker on Pine Deep; pending = Amber Background on Amber; draft = Sunken on Ink Secondary; error = Clay Background on Clay.

### Signature Component — The Coverage Strip

Seven chips in a row, one per day, encoding a client's week: solid for published, outlined for scheduled, hatched for open. It is the system's most distinctive object — a planting chart for content — and it carries real data in a purely visual form. Because of that, it must always be `aria-hidden` with an `sr-only` sentence restating the same counts in words. A coverage strip without its spoken equivalent is incomplete, not merely imperfect.

**The Two Facts Rule.** A day chip carries two independent facts — *is it today* and *is it covered* — and one must never consume the other. Today is marked with a 2px New Growth rule **beneath** the chip; the chip's own fill continues to encode published / scheduled / open. A lime chip that hides whether today has anything scheduled has spent the loudest colour in the system erasing the answer the strip exists to give.

The same applies to any bar or chip height that encodes volume: **an empty state must never render larger than an occupied one.** Height maps to count, with a small fixed floor for zero.

## Do's and Don'ts

### Do:

- **Do** use Warm Paper (`#f1f0ea`) for page grounds and Surface white for cards.
- **Do** use 0.5px hairlines on cards and dividers; 1px only on inputs.
- **Do** set every metric in tabular numerals with `-0.02em`.
- **Do** gate every interpolated user string set in the serif on `hasCyrillic()`.
- **Do** give every purely visual data encoding an `sr-only` sentence, as the coverage strip does.
- **Do** use `cubic-bezier(0.22, 1, 0.36, 1)` (`--ease-contour`) for state transitions.
- **Do** keep weight at 600 or below.
- **Do** reserve New Growth lime for the live present.

### Don't:

- **Don't** use pure white for a page background, or a cool grey anywhere.
- **Don't** introduce a hue outside the botanical ramp — no blues, no `blue-500` links, no unrelated fourth chart colour.
- **Don't** use saturated status colours (`green-500`, `red-500`); status is Clay and Amber.
- **Don't** use `font-weight: 700`.
- **Don't** set body text, labels, or buttons in Instrument Serif.
- **Don't** let a tinted surface (Surface Lime, Sage) encode data. They are surfaces; if a colour must carry meaning, it belongs to a status token with a legend.
- **Don't** assign colour, emphasis, or the dark treatment by position in a list. Visual weight follows state, never index.
- **Don't** animate `width`, `height`, `padding`, or `margin`; transition `transform` and `opacity`.
- **Don't** ship an interactive element without a visible `:focus-visible` ring.
- **Don't** set green text on a light ground in Living Green (`#2e9e68`, 3.38:1) — that is Living Green Text's job (`#278658`).
- **Don't** put lime type on paper or white, at any size.
- **Don't** use an alpha-reduced ink (`ink/55`, `ink/60`) for reading text on a tinted surface.
- **Don't** put a 1px border on a card.
