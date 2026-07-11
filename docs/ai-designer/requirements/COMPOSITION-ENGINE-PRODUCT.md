# Composition Engine — Product Requirements

> **Status:** Proposed. Not built.
> **Technical companion:** [`COMPOSITION-ENGINE-TECHNICAL.md`](./COMPOSITION-ENGINE-TECHNICAL.md) — how it is built.

---

## 1. Problem

Kontuur has no visual creation system — it renders plain, single-layer text slides. It cannot layer,
blend, crop, or composite photography, and it cannot measure text before rendering.

- Agencies design in Canva instead. A Canva post is a flat image we cannot re-render or keep
  on-brand.
- A template belongs to one client. An agency with thirty clients rebuilds thirty times.

## 2. Solution

Use Chromium. Assemble every post from a client's **brand kit** and an
agency's reusable **feed system**, so text stays live text and photography is one layer beneath it.

```
post = brand kit × feed system × copy
```

| | Owner | Contains |
| --- | --- | --- |
| **Brand kit** | client | colours, type, grid, photographic subjects, motifs, logo |
| **Feed system** | agency, shared | slide layouts, chrome, abstract marks, photographic style, rhythm |

A feed system carries **no colours, no typeface names, no meaning.** It refers to roles that resolve
against whichever brand kit is in scope. That is why one system serves thirty clients.

Both generated asset types split the same way:

| | Style — feed system | Subject — brand kit |
| --- | --- | --- |
| Photograph | lighting, grade, depth, texture | "a woman applying sunscreen" |
| Mark | organic, single-weight, unfilled | "a leaf" |


## 3. Starter feed systems

Three ship in-house. They differ in typography, geometry, chrome, photographic cadence, and rhythm —
never in colour. They are the reference implementations of the schema: same JSON, different values.

| | Editorial | Bold blocks | Quiet grid |
| --- | --- | --- | --- |
| Display | serif, high-contrast | grotesk, weight ≥ 700, uppercase | grotesk, weight ≤ 600 |
| Scale ratio | 1.333 | 1.5 | 1.2 |
| Margins | wide (12%) | tight (6%) | medium (9%) |
| Text block | bottom-left, baseline-hung | fills the frame | centred, generous leading |
| Chrome | one hairline rule | none — solid blocks, numerals | frames, corner marks, dot grid |
| Marks | organic single-weight line, ~1 in 6 slides | geometric, filled, high coverage | minimal geometric line |
| Photography | every third post | cover only | none |
| Treatment | grain, light | duotone, strong | mono |
| Rhythm | photography forms one grid column | no two adjacent slides share a background | strict light/dark alternation |

`Quiet grid` never generates a photograph. For a clinic or a law firm that is the right answer, not
a degraded tier.

Rhythm is a grid-level decision expressed as a rule over slide index: `every-third` places photography
in a single column of the Instagram grid; alternation produces a checkerboard. A tool that does not own
the schedule cannot do this.

**Recommended from the extraction.** The website extractor already measured what it needs, so the
picker recommends one system with a reason stated as a sentence, not a badge:

| Measured on the site | Recommend |
| --- | --- |
| serif display · wide margins · low text density | Editorial |
| sans display · heavy weight · large flat colour areas | Bold blocks |
| sans display · light weight · high whitespace · hairline borders | Quiet grid |

> *Recommended — your site uses a high-contrast serif and wide margins.*

---

## 3A. Onboarding integration

Visual extraction slots into the existing four-step onboarding — **Start → Analyzing → Interview →
Review** — and adds **no fifth step.**

| Step | Today | Change |
| --- | --- | --- |
| **1 Start** | Website URL + Instagram handle | none — the URL is already the extraction source |
| **2 Analyzing** | checklist rows | **+2 rows:** *Extracting colours and type*, *Building visual system* |
| **3 Interview** | questions, pre-filled from analysis | none |
| **4 Review** | confirm client profile | **+ tokens with confidence badges, a 3×3 preview grid, and the feed-system picker** |

- Colour is decided at **Review, not in the interview**. The interview is verbal; colour is something
  you look at, not answer in a chat bubble. Keep the interview conversational; make Review visual.
- **Extraction runs asynchronously.** It adds 15–25s — a browser boot, a screenshot, a vision call.
  The operator proceeds past `Skip to interview →`, spends ~4 minutes answering, and extraction
  finishes behind them; Review shows the tokens, or a skeleton that hydrates in place. The two new
  Analyzing rows must **not** gate the Continue button.
- **The manual path still produces a kit.** `Skip — I'll answer manually` means no URL and no
  extraction, but every downstream render assumes tokens exist. That path gets a neutral default kit
  (achromatic surface/ink, one accent, Inter + Inter), the default feed system, and a prominent
  *Upload a reference image* affordance. A client with no tokens is unrenderable — never create one.
- **The Instagram handle is deferred.** A client's existing grid *is* their photographic style, but
  pulling it needs Meta permissions we do not have. `source_kind` reserves `instagram` as a future
  value; it is noted, not designed.

---

## 4. Features

### F-1 · Extract a brand kit from a website

Loads the client's site, reads colours, type, and spacing off the rendered page, screenshots it,
proposes a brand kit.

- [ ] Runs during onboarding step 2 without blocking progress to the interview.
- [ ] Proposes five colour roles, display + body families, type scale, margins, subject vocabulary.
- [ ] Colours and fonts are badged `measured`. Mood and vocabulary are badged `inferred`.
- [ ] Onboarding gains zero perceived latency. If unfinished at Review, Review shows a skeleton.
- [ ] Failure lands the client on the neutral default kit, with the reason stated.
- [ ] `haelan.bg` produces a token set that visually matches the live site.

### F-2 · Extract a brand kit from a reference image

- [ ] Colours are extracted and mapped to roles.
- [ ] Fonts from an image are never badged `measured`. Kontuur proposes three families in the
      detected category; the operator confirms before finishing onboarding.

### F-3 · Feed-system picker

Three systems, each rendered as a real slide plus a six-cell grid, **in the client's own colours.**

- [ ] All three show the same headline in the same palette. Only type, margins, chrome, and
      photographic cadence differ.
- [ ] One is recommended with a reason drawn from the extraction: *"Recommended — your site uses a
      high-contrast serif and wide margins."*
- [ ] If the chosen system's font requirement conflicts with the extracted family, Kontuur names the
      substitute rather than switching silently.
- [ ] `Quiet grid` shows *"never generates a photograph."*
- [ ] Changeable later in `Visual system` without re-onboarding.

### F-4 · Visual system settings

New tab in client settings, sibling of `Brand profile`. Colours, type, subjects, assigned feed
system. Not a canvas.

- [ ] Changing a colour re-renders a live 3×3 preview instantly, client-side.
- [ ] The font picker shows only families covering the scripts the client posts in — the union of
      `primary` and `secondary language`. A client posting only in English keeps the full Latin
      library, wherever they are based.
- [ ] A bilingual client needs one family covering both scripts. Kontuur never pairs two families
      across languages.
- [ ] Changing a client's languages re-checks the current families and flags any that no longer cover
      the new scripts. This is the one case where a warning is correct — the choice was valid when it
      was made.
- [ ] Families that break the assigned feed system sit behind *"Show all — may break this system."*
- [ ] The picker draws from a curated library of ~50 Google Fonts, not the full catalogue — the
      curation is the product. Display and body are chosen independently, with pairings suggested,
      not enforced.
- [ ] The **slide editor has no font picker.** A text layer selects a *role* (`display` or `body`),
      never a family. Families are chosen once, here in `Visual system`. A per-layer override exists,
      behind the same unlock as any override, and it stops propagating on rebrand.
- [ ] Custom font uploads (WOFF2/TTF/OTF) are agency-scoped, with a licence attestation, and their
      real script coverage is read from the font file — never trusted from the filename.
- [ ] `Re-analyze from website` reuses the URL in `Basic info`. It never asks twice.
- [ ] Before saving, the panel states the consequence: *"Saving will re-render 12 drafts
      automatically. 3 scheduled posts will ask first. Published posts are never changed."*
- [ ] With `Health-related client` on, generated photography cannot depict before/after comparisons,
      procedures, treatment on skin, devices in use, injections, or wounds.

### F-5 · Feed-system authoring

Agency settings gains a `Design` section: feed systems, layouts, chrome, style pack, visibility.

- [ ] Creation is a four-step wizard: **Start → Analyzing → Curate → Review.**
- [ ] `Curate` generates 30 abstract style marks; the operator keeps 15. Shown in a real client's
      colours, noting *"You are judging form, not palette."*
- [ ] Style marks carry no meaning — arcs, seed shapes, frames, chevrons. A shared system cannot
      contain a leaf; one of its clients is a law firm.
- [ ] Marks whose colours cannot map to token roles are rejected, with the reason shown.
- [ ] A mark containing letterforms is rejected. The no-text rule applies to vectors.
- [ ] A mark too complex to select shape-by-shape is rejected. It is a trace, not a shape.
- [ ] A saved feed system contains zero hex values and zero font family names.
- [ ] `Design` lives in Settings, not the left rail. Promote it only when the median agency holds more
      than two systems, the marketplace ships, or >30% of Settings visits go straight there.
- [ ] Discoverability comes from entry points, not a nav slot: the onboarding picker's *+ Create new
      system*, `Visual system → Change → + Create new system`, and a Dashboard card *"Feed systems · 2
      · Editorial, used by 3 clients."* The Dashboard card is where an owner notices this exists.
- [ ] One reference image feeds two extractions: colour and type go to the **brand kit**; lighting,
      grade, texture, and mark vocabulary go to the **feed system**. Same upload, different targets —
      which is why `Curate` is the only genuinely new screen in the authoring flow.

### F-5b · Motif pack

The semantic marks. A clinic gets a leaf, a sun, a droplet. A law firm gets scales and a column.
Generated **in the feed system's style**, so Haelan's leaf is an *Editorial* leaf.

- [ ] Motif vocabulary is derived at onboarding from the client's niche. Editable in `Visual system`.
- [ ] Each slide layout declares whether its mark slot wants a style mark or a motif. Selection
      rotates by slide index without repeating adjacently. No tagging, no model call.
- [ ] Twelve motifs per client, generated once.
- [ ] Motifs are not curated at onboarding. Curation is mandatory only for the shared style pack,
      where quality compounds across every client.
- [ ] Changing a client's feed system offers to regenerate motifs in the new style — offered, never
      silently.

### F-6 · Generation flow

The five-step wizard gains no steps. Step 4 renders every slide **without photography**, on the free
renderer. Photography is applied at Results.

**Rule: never spend the metered thing before the free thing has passed judgment.**

- [ ] Step 4 generates no photography — it runs entirely on the free renderer.
- [ ] No slide ships with overflowing text. Kontuur steps the type scale down, then shortens the copy,
      then flags the slide with the reason.
- [ ] How much photography a run uses is set on the feed system, not chosen per run.
- [ ] Discarding a run and starting over re-runs only the free steps.
- [ ] An eight-slide Bulgarian carousel: no overflow, nothing illegible.

### F-7 · Visual notes

Not a third score. Fit, contrast, and palette adherence are *guaranteed* by F-6 — the scale steps
down, the scrim inserts, the tokens resolve. Scoring them yields a number that reads 10 on every
post, which teaches operators to stop reading the panel.

What matters is what Kontuur silently did:

> Headline reduced one step on slide 3. Copy shortened on slide 5. Scrim added on slide 4.

- [ ] `Brief` and `Craft` remain the only scores.
- [ ] Results and the review queue list the automatic adjustments, naming the slide. An empty list
      renders nothing — no "all clear" row.
- [ ] Notes come from what the renderer did, never inferred afterwards.
- [ ] One flag, for the one thing nothing can auto-fix: *"⚠ On slide 4 the subject sits under the
      headline. Fix in editor →"*
- [ ] Rhythm is not checked here. Adjacent photographs are a property of the grid → F-12.

### F-8 · Slide editor

Click any element and change it. Reachable from Results, the review queue, and the calendar — the
same editor in all three.

**The operator never chooses a model. They choose an object.** One prompt bar, routed by selection.

| Selected | Prompt does |
| --- | --- |
| Photograph + masked region | changes that region |
| Photograph, no mask | rewrites the subject, never the style |
| A mark | generates a replacement |
| A shape inside a mark | **nothing — bar disabled** |
| Text | rewrites, shortens, translates |
| Nothing | swaps the slide's layout |

- [ ] Selecting a shape inside a mark disables the prompt bar: *"Recolour or transform directly — no
      prompt needed."*
- [ ] No font picker in the editor. A text layer selects a **role**, not a family.
- [ ] Size snaps to steps on the type scale. `Alt` breaks the snap and visibly marks the property as
      overridden from that moment.
- [ ] Margins cannot be edited on a slide. The panel says where they live and links there.
- [ ] Two modes: `Select` and `Mask`. `Mask` exists only when a photograph is selected.
- [ ] Change a headline, swap a mark, upload a client photo, re-render — without leaving the page.
- [ ] Published posts open read-only, with the reason: Instagram cannot replace media.

**What a text layer can and cannot change:**

| Control | Default | Unlocked (`Alt`-drag) | Lives on |
| --- | --- | --- | --- |
| Size | steps along the type scale | continuous px | text layer |
| Weight | the role's declared weights | any weight the family carries | text layer |
| Position | snaps to margins, baseline, sibling edges | free x / y | text layer |
| Alignment | the composition's alignment | left / centre / right | text layer |
| Tracking | the role's tracking token | continuous | text layer |
| Family | the role's family | any visible family *(override only)* | text layer |
| Margin | — | — | **the composition, not the layer** |

Margin is the composition's frame, shared by every slide using it. It is changed in the system editor,
where it propagates to every post — which is the behaviour the operator actually wants.

### F-9 · Photograph editing

Three operations, not one button.

**Reroll** — same prompt, new seed, three variants at once.
**Reprompt** — the style half comes from the feed system and is read-only. Only the subject is
editable.
**Masked region edit** — tap the object, describe the change, only that region regenerates.

- [ ] The style half is visible, greyed, labelled *"from system"*, and unreachable from the editor.
- [ ] Tapping an object produces a mask without the operator drawing. Brush and lasso remain as
      fallback.
- [ ] Editing a photograph never disturbs text, chrome, or marks.
- [ ] Edits are non-destructive. Undo steps back through the chain; the operator can return to an
      earlier variant and branch.
- [ ] Soft warning after ten operations on one post.
- [ ] Rerolling clears any active mask and says so. It no longer describes anything.

### F-10 · Uploaded photography

- [ ] An uploaded photograph becomes the photographic layer, inheriting the feed system's treatment
      and the brand's typography automatically.
- [ ] The `6 of 6 images` publish gate is removed. Every slide has a rendered visual by construction;
      a carousel can never be missing media.

### F-11 · Propagation on rebrand

Photographs are stored unmodified; only the composite changes. Re-rendering a client's entire back
catalogue is therefore free.

- [ ] Drafts and pending-review posts re-render automatically, no prompt.
- [ ] Approved and scheduled posts are offered, never forced: *"Brand colours changed. 3 scheduled
      posts use the old palette. Re-render · Keep as is."*
- [ ] Published posts are never touched.
- [ ] The offer appears in a calendar banner and in each affected post's schedule modal.
- [ ] Properties the operator overrode do not change. Properties still bound to the system do.
- [ ] Re-rendering the back catalogue is free, and it is true.

### F-12 · Feed grid preview

Calendar gains a `Month / Grid` toggle. `Grid` shows scheduled posts as a three-column Instagram
preview in publish order.

- [ ] Requires a single client. `All clients` cannot produce a meaningful grid.
- [ ] The rhythm check lives here, flagged in place, where the operator can reorder.
- [ ] No new navigation item. The calendar already is the feed, ordered by date.

---

## 5. Canva

`Design in Canva` keeps working through F-6, then stops being featured.

A Canva post is a flat image. It cannot propagate — when the client rebrands, every Kontuur post
re-renders for free and every Canva post keeps the old colours, permanently. Canva is not a competing
editor; it is an opt-out from the design system.

---

## 6. What is generated, and when

The product shows the operator no prices. What governs cost is *what gets generated and when*, and
two rules keep that small:

**Vectors are system assets, photographs are post assets.** Nothing is generated per post except the
photograph — marks and chrome are made once, at system or client creation, and reused everywhere.

**Never spend before validation.** Copy is written and scored, and every slide is rendered on the
free renderer, before a single photograph is generated. The metered step is always last, and always
optional.

---

## 7. Success metrics

Baselines are unmeasured. Pull real numbers before treating any of these as targets.

| Metric | Target |
| --- | --- |
| Posts using `Design in Canva` | large reduction within two months of F-8 |
| Slides shipped with overflowing text | 0 |
| Clients per feed system, agencies with 5+ clients | ≥ 3 |
| Median time from Results to Approved | unchanged or better |

The last one decides whether the editor was worth building. If approval gets slower, the editor is
wrong.

---

## 8. Open questions

1. **Is five type-scale steps enough?** Bulgarian runs 15–25% longer than English; auto-fit may
   exhaust its range. Measure against real copy in Phase 1.
2. **Does the kicker need its own property panel?** Kicker tracking is arguably a system decision,
   not a per-slide one.
3. **Is there a hard per-post operation cap, or only the soft warning?** A business decision.
4. **Two photographs per slide is allowed.** It unlocks duotone splits; it also lets non-designers
   make mud. Mitigation is shipping layouts that use it well.
