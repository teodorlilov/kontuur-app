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
  near-white-paper: "#fbfcfa"
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
  label-stat:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.3
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

> **The single design document.** Read this before writing any UI. It is design
> authority for the whole app — tokens, rules, and how they are spelled in code.
>
> It absorbed `docs/STYLE-GUIDE.md`, which was deleted on 2026-08-01. That file
> still specified the pre-Contour palette (`--paper: #f1f0ea`, `--text3: #8b958d`,
> a `--raised` card gradient) — the exact three values this document says must
> never be restored — while instructing readers to trust it over everything else.
> Anything from it that was still true is in § Implementation.
>
> **Related, and deliberately not merged here:** [docs/CLAUDE.md](docs/CLAUDE.md)
> owns code structure and conventions; [docs/plans/LANDING-REDESIGN.md](docs/plans/LANDING-REDESIGN.md)
> is a locked-but-unimplemented plan that predates Contour and still carries the
> old palette — reconcile it against this document before building it.

## Overview

**Creative North Star: "Contour Calm"**

Kontuur is a green editorial system. Warm paper instead of white, forest ink instead of black, and a serif used so sparingly that each appearance reads as an authored moment rather than a style. The interface is a workroom for other people's brands: every decision that makes Kontuur more visible makes it worse at its job. Content — posts, captions, client names, calendars — is the thing. Chrome recedes.

Depth comes from tone before it comes from shadow. The system layers warm paper under white surfaces under deep pine, and separates them with 0.5px hairlines rather than heavy borders. Status colour is deliberately muted: a missed publish is clay, not red; a waiting draft is amber, not orange. Nothing in this interface shouts, because the work it manages is already urgent enough. Motion confirms and guides; it never decorates.

The one loud value in the palette is New Growth lime, and its power is entirely a function of its rarity. It marks the live present — today, in progress, happening now — and nothing else.

**Key Characteristics:**

- Near-white ground (`#fbfcfa`) carrying the contour field, never flat pure white
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
- **Surface Lime** (`#e6eeae`) and **Sage** (`#cfe4d4`): Tinted row and capsule surfaces. These are *surfaces*, not semantics — they must never be asked to encode data on their own. With Pine Deep they form the coverage-row rhythm (see The Stable Rhythm Rule).

### Neutral

- **Near-White Paper** (`#fbfcfa`): The page ground, and the ground the contour field is drawn on.
  Corrected from the incumbent warm `#f1f0ea`. This is deliberate and must not be "fixed" back: on a
  near-white ground a white card separates by 1.05:1, so tone cannot carry depth and the terrain has
  to — which is the whole premise of cards-as-clearings below. Never flat `#ffffff`.
- **Surface** (`#ffffff`): Card and panel surfaces, sitting on warm paper.
- **Sunken** (`#f3f5f2`): Inset areas — table headers, search fields, wells.
- **Forest Ink** (`#0f1512`): Primary text. Headings, values, body.
- **Ink Secondary** (`#57625a`): Descriptions, form labels.
- **Ink Tertiary** (`#667068`): Hints, timestamps, placeholders. Corrected from the incumbent `#8b958d`, which measured 3.10:1 on Surface and 2.71:1 on Warm Paper — failing the 4.5:1 this system commits to, across roughly fifteen text roles. The replacement holds 5.00:1 on Near-White Paper and 5.15:1 on Surface at the same hue and chroma, so it reads as the same grey, only legible.
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

**The Stable Rhythm Rule.** Repeating surfaces may carry a decorative cycle — the coverage capsules run Surface Lime → Sage → Pine Deep — but the cycle must key to something that belongs to the item, not to where it currently sits. Keyed to a row's position on a paginated page, the same client wears three different capsules in three minutes and decoration starts reading as data. *Audit test: paginate, and every visible item must keep the surface it had.*

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
- **Stat Label** (500, 12.5px): The label above a metric. A real half-step between Body and Caption — a stat label must read as quieter than body text without dropping to caption size.
- **Body** (400/500, 13–13.5px, 1.6): Body text, navigation items, table cells.
- **Caption** (400, 11.5–12px): Hints, captions, card sub-lines.
- **Micro** (500/600, 11px): Badges, pills, timestamps.
- **Label** (600, 9.5–10px, +0.16em, uppercase): Sidebar section labels.

### Named Rules

**The Latin-Only Serif Rule.** Instrument Serif ships no Cyrillic glyphs, and half this product's audience is Bulgarian. Any interpolated user string set in `font-display` **must** gate on `hasCyrillic()` and fall back to the sans face. This applies to agency names, client names, initials, and AI-generated copy alike — not just the greeting. *Audit test: if a string comes from the database and is set in the serif, it needs the gate.*

**The Rationed Serif Rule.** The serif is for the wordmark, greetings, empty states, and editorial one-liners. Never body text, never labels, never buttons, never anything a user must read in volume.

**The Weight Ceiling Rule.** 400 and 500 carry the interface; 600 is correct for titles, stat numbers, and section headings. **700 stays unused.**

**The Closed Ramp Rule.** The eight roles above are the ramp. A literal size that is not one of them is drift, not a decision — the app currently carries nineteen distinct literal sizes, which is nineteen ad-hoc values with a ramp described over them. Add a step only when a role genuinely exists and recurs; snap one-offs to the nearest documented size instead.

## Layout

A 240px sidebar that collapses to 78px, beside a fluid content column capped at 1280px. The content column's horizontal padding is 16px, stepping to 32px at `md` — it is one constant, `PAGE_SHELL` in `src/components/layout/page-header/shared.ts`, applied to the header inner *and* every page body so a title and its actions stay in one visual field on a wide monitor.

The spacing scale is closed — 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 — and intermediate values are not invented.

Card padding is `20px 24px` by default, but it is genuinely per-surface: the roster table, the review queue and the briefing bar each pad differently because they hold different things. `Card` therefore takes padding through `className` rather than baking one value in. That is variation, not drift — a shared padding would be false consistency.

Density is moderate and deliberately uneven: metric rows and chip strips run tight, while editorial moments (greetings, empty states, briefings) are given conspicuous air. That contrast is the system's rhythm — compressing the breathing room around an empty state to fit more above the fold destroys it.

Content regions should be sized by what they contain rather than forced to a shared constant. Two panels answering different questions do not owe each other equal height.

## Elevation & Depth

**Figure and ground, not elevation.** Depth is carried by the contour field and by hairline edges — not by shadow. A card is a *clearing*: opaque Surface white, a hairline edge, and the contour lines simply stopping at its boundary. Nothing on the dashboard ground casts a resting shadow, and hover does not add one either, because resting and hover elevation make the same claim this system rejects. Sunken remains for inset wells and the dark pine capsule for the top of the range. `--sh-card` and `--sh-pop` survive only for genuinely floating chrome — popovers, dialogs, the sidebar panel beside the scroll area.

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

Borders are hairlines, achieved by **alpha, not by sub-pixel width**. A card edge is `border border-ink/[0.05]` — a full 1px at 5% ink. The pre-Contour system specified literal `0.5px`, and that was retired: sub-pixel borders round inconsistently across device pixel ratios, so the same card showed a crisp line on one display and nothing on another. 1px at very low alpha reads as the same hairline and renders identically everywhere. Inputs take `border-line2` at full strength, so form fields remain the one genuinely interactive edge on a surface. Pills and avatars go fully round.

Literal `0.5px` borders survive only on surfaces that predate Contour — the public approval page and the settings tabs. Each one is a marker that the surface has not been rebuilt yet.

Texture is part of the form language: `--hatch` (45° repeating lines) marks open or unfilled states, and its inverse marks the same on dark. Hatching means *absence* — an unscheduled day, an empty slot — and must not be used as ornament.

### Named Rules

**The Hairline Rule.** A card edge is carried by alpha, not weight: `border-ink/[0.05]`, or `border-line` where a divider needs to be slightly more present. A card border that reads as a *line* rather than as an edge is out of system. Never introduce a literal `0.5px` border in new work.

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
- **Background:** Surface white on Near-White Paper, no shadow; the dark variant is a pine gradient over the dot grid.
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

## Implementation

Everything above is the decision. This section is how it is spelled in the codebase.

### Token plumbing

Raw values live in `src/app/globals.css` as prefix-free custom properties (`--paper`, `--ink`, `--forest`). `@theme inline` registers them as Tailwind utilities under names outside Tailwind's own namespaces, so no existing utility changes meaning. **Components use classes, never inline `style` objects** — the exception is a genuinely computed value, such as a bar height that encodes a count.

| Utility | Token |
| --- | --- |
| `bg-paper` `bg-surface` `bg-sunken` | surfaces |
| `text-ink` `text-text2` `text-text3` | text ramp |
| `border-line` `border-line2` | borders |
| `bg-forest` `bg-forest-deep` `bg-spring` `bg-wash` `bg-marker` | greens |
| `bg-lime` `bg-sage` `text-accent` | capsule tiers + the rare accent |
| `bg-danger-bg` `text-danger` `bg-pending-bg` `text-pending` | status |
| `rounded-chip` (10) `rounded-panel` (14) `rounded-card` (20) | radii |
| `shadow-card` `shadow-pop` `shadow-frame` `shadow-dark` | elevation |
| `ease-contour` | the house easing curve |
| `font-display` | Instrument Serif |

The radius scale is declared in plain `@theme` rather than `@theme inline`, because `--radius-*` are Tailwind's own names — this **replaces** its defaults app-wide instead of shadowing them, so `rounded-lg` resolves to 14px everywhere including surfaces not yet rebuilt. That is deliberate.

A legacy compatibility block in `globals.css` aliases the pre-Contour `--color-*` and `--sidebar-*` names onto Contour values, so unmigrated surfaces follow the palette rather than stranding on the old navy. **Each alias is deleted as its surface is rebuilt** — an alias still in that block is a to-do list entry.

### Structural class hooks

`.app-shell`, `.app-sidebar` and `.app-content` are the only structural class hooks in the frame. The analytics print stylesheet (`globals.css`, `@media print`) targets them **by name**, so keep the classes if you restructure the layout. `.print-hide` marks anything that must not print.

> `.app-topbar` is still referenced by that print block but nothing renders it any more — the shell topbar was removed in favour of each page's own `PageHeader`. Harmless, but it is dead weight.

### Shared components

Reach for these before writing a new one:

| Component | Use |
| --- | --- |
| `components/ui/card.tsx` | A clearing. Padding comes from `className`. |
| `components/ui/section-heading.tsx` | An `h2` with its icon chip; `tone="wash" \| "marker"`. |
| `components/ui/action-link.tsx` | A `next/link` styled as an action. |
| `components/ui/button.tsx` | A button that acts. Token choices mirror `ActionLink`. |
| `components/ui/section-card.tsx` | A settings panel — titled, with a divider header. |
| `components/layout/page-header/` | The header every dashboard page opens with. |

`Card` and `SectionCard` are both current and are not duplicates: one is a bare container, the other owns a header structure.

### Where the rest lives

Component placement, data-fetching rules, validation and error handling are in [docs/CLAUDE.md](docs/CLAUDE.md). This file is design authority only; it does not restate them.

## Do's and Don'ts

### Do:

- **Do** use Near-White Paper (`#fbfcfa`) for page grounds and Surface white for cards.
- **Do** carry card and divider edges with low-alpha ink (`border-ink/[0.05]`, `border-line`); reserve full-strength `border-line2` for inputs.
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
- **Don't** let a *state* signal be carried by position. A row that means "needs you" must look that way wherever it sits. Decorative rhythm is the exception below, and it is the only one.
- **Don't** let a decorative tier change under the same item. The coverage capsules cycle lime → sage → dark, which is rhythm rather than data — so the cycle is keyed to the client's place in the whole roster, never its row on the current page. A client that changes colour when you paginate has turned decoration into a false signal.
- **Don't** animate `width`, `height`, `padding`, or `margin`; transition `transform` and `opacity`.
- **Don't** ship an interactive element without a visible `:focus-visible` ring.
- **Don't** set green text on a light ground in Living Green (`#2e9e68`, 3.38:1) — that is Living Green Text's job (`#278658`).
- **Don't** put lime type on paper or white, at any size.
- **Don't** use an alpha-reduced ink (`ink/55`, `ink/60`) for reading text on a tinted surface.
- **Don't** write a literal `0.5px` border in new work — it renders inconsistently across DPRs, which is why Contour carries hairlines with alpha instead.
