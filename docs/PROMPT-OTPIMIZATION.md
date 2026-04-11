# Prompt Pipeline Fixes Plan — Carousel & Single Image

> **Implementation document for Claude Code.**
> Run `npx tsc --noEmit` after every step.
> **Rule: bugs first, redundancy second, inefficiency third.**
> Never combine a bug fix with a redundancy cleanup in the same step.

---

## Context

Two prompt chains (single image and carousel) share the same pipeline:
research → generation → validate source → validate quality → validate language.

Five bugs produce wrong behaviour. Ten redundancies waste tokens on identical content sent
multiple times. Five inefficiencies send content that is either wrong or discarded.

All bugs must be fixed before any redundancy work. Redundancy changes reduce token cost and
improve maintainability but do not change correctness. Efficiency changes follow.

---

## File Map

| File                     | What it builds                                                               |
| ------------------------ | ---------------------------------------------------------------------------- |
| `generation-criteria.ts` | `AI_TELL_PATTERNS`, `SOURCE_GROUNDING_RULES`, platform limits, structures    |
| `client-profile.ts`      | Generation user prompt — client profile, register, brand voice, health rules |
| `source-grounding.ts`    | Source fidelity section in generation and validation                         |
| `carousel-generator.ts`  | `buildDirective()` — carousel-specific slide rules, JSON format              |
| `post-generator.ts`      | `buildDirective()` — single post planning step                               |
| `validation-criteria.ts` | `buildCriteriaChecklist()` — used by validate quality                        |
| `validate-quality.ts`    | Quality system prompt assembly                                               |
| `validate-language.ts`   | Language system prompt + user message assembly                               |
| `validate-post.ts`       | Orchestrator — threads context between validators                            |
| `content-section.ts`     | `buildContentSection()` — carousel/single content blocks                     |
| `scoring.ts`             | `QualityContext` type definition                                             |

---

## Build Order

```
── PHASE 1: Bug Fixes ───────────────────────────────────────────────────────
Step 1  → Fix carousel word count validator (wrong metric for carousel)
Step 2  → Fix carousel declared structure not threaded to validator
Step 3  → Fix empty slide body labels in content section builder
Step 4  → Fix "based on the listing type" remnant in source fidelity rules
Step 5  → Fix "Slides 2 to 2" range calculation in carousel directive
Step 6  → Phase 1 verification

── PHASE 2: Redundancy Cleanup ──────────────────────────────────────────────
Step 7  → Single source for register rules (formatFormalityRules)
Step 8  → Single source for AI tell patterns (AI_TELL_PATTERNS constant)
Step 9  → Single source for brand voice (buildBrandVoiceDescription)
Step 10 → Single source for source fidelity rules (SOURCE_GROUNDING_RULES)
Step 11 → Fix validate language rules sent twice to same call
Step 12 → Phase 2 verification

── PHASE 3: Efficiency Improvements ────────────────────────────────────────
Step 13 → Remove chosen_structure / chosen_opener from carousel JSON or thread them
Step 14 → Compress target audience in generation and validation
Step 15 → Compress topics to avoid — remove items covered by health rules
Step 16 → Remove standalone specificity requirement section
Step 17 → Compress Bulgarian naturalness block to DB-driven single source
Step 18 → Phase 3 verification
```

---

## Phase 1 — Bug Fixes

---

## Step 1 — Fix Carousel Word Count Validator

> **File:** `features/ai/validation/content-rules/validation-criteria.ts`
> — `buildCriteriaChecklist()`

The criteria checklist includes a word count check pulled from `PLATFORM_LIMITS[platform]`.
For carousel, this check fires against the main caption — but Instagram carousel captions are
max 3 lines by the generation directive, not 150-220 words. The word count check is designed
for single posts.

Two separate issues:

1. The word count check runs on the carousel caption using single-post limits
2. Carousel slides have no per-slide body length check at all

**Fix:**

Add a `postType` parameter to `buildCriteriaChecklist` context and skip word count for
carousel, replacing it with a slide body check:

```typescript
export function buildCriteriaChecklist(ctx: {
  platform?: string
  postType?: 'single' | 'carousel' | 'reels' // ADD
  hasSource?: boolean
  isHealthClient?: boolean
  languageConfig?: LanguageConfig
  theme?: string
  declaredStructure?: string
}): string {
  const sections: string[] = []
  const isCarousel = ctx.postType === 'carousel'

  // ... other sections ...

  if (ctx.platform) {
    if (isCarousel) {
      // Carousel: check caption length (max 3 lines) and slide body presence
      sections.push(`[] CAPTION LENGTH: Max 3 lines. Teases carousel — does not summarize it.
[] SLIDE BODIES: Content slides (not cover or CTA) must have 2-3 sentence bodies.
   Cover and CTA slides intentionally have no body — do not flag these as incomplete.`)
    } else {
      // Single post: check word count and hashtags
      sections.push(`[] WORD COUNT: ${formatWordCount(ctx.platform)}
[] HASHTAGS: ${formatHashtagRules(ctx.platform)}`)
    }
  }
}
```

**Thread `postType` from validate-post.ts into QualityContext:**

```typescript
// validate-post.ts
const ctx: QualityContext = {
  platform: input.platform,
  postType: input.slides && input.slides.length > 0 ? 'carousel' : 'single', // ADD
  languageConfig: input.languageConfig,
  ...input.qualityContext,
}
```

**Add `postType` to `QualityContext` in scoring.ts:**

```typescript
export interface QualityContext {
  // ... existing fields ...
  postType?: 'single' | 'carousel' | 'reels' // ADD
}
```

### ✓ Step 1 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Carousel validate quality prompt shows slide body check, not word count check
- [ ] Single post validate quality prompt still shows word count check
- [ ] Generate a carousel — validator does not flag caption word count

---

## Step 2 — Fix Carousel Declared Structure Not Threaded to Validator

> **Files:** `carousel-generator.ts`, `generation-run.ts`, `validate-post.ts`,
> `validation-criteria.ts`

The carousel generator asks the model to return `chosen_structure` in the JSON response but
this value is never extracted and never passed to the quality validator. The criteria checklist
therefore never shows a `[] DECLARED STRUCTURE` check for carousel posts — meaning a carousel
caption using MYTH-BREAKER can include a CTA without the validator catching it.

### 2a — Extract chosen_structure from parsed carousel result

```typescript
// In CarouselResult type (types.ts):
export interface CarouselResult {
  chosen_structure?: string // already present but unused
  chosen_opener?: string
  main_caption: string
  slides: CarouselSlide[]
}
```

`chosen_structure` is already in the type — the gap is that it is never forwarded.

### 2b — Thread through generation-run.ts collectCarousel

```typescript
async function collectCarousel(theme: Theme, result: CarouselResult) {
  // ...
  const validation = await validateContent(result.main_caption, theme, {
    label: 'carousel',
    slides: result.slides,
    declaredStructure: result.chosen_structure ?? undefined, // ADD
  })
  // ...
}
```

### 2c — Thread through validateContent helper

```typescript
async function validateContent(
  caption: string,
  theme: Theme,
  opts: {
    label: string
    slides?: CarouselSlide[]
    declaredStructure?: string
  }
): Promise<PostValidationResult> {
  return validatePost({
    caption,
    slides: opts.slides,
    languageConfig: ctx.client.languageConfig,
    label: opts.label,
    platform: ctx.platform,
    sourceContext: buildGroundingContext(theme),
    qualityContext: {
      ...sharedQualityContext,
      theme: theme.description,
      declaredStructure: opts.declaredStructure, // already in QualityContext from align plan
    },
  })
}
```

After this, `buildCriteriaChecklist` already handles `declaredStructure` (from the
Gen-Val Alignment plan Step 13) — the checklist will show the declared structure check for
carousel captions the same as single posts.

### ✓ Step 2 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Generate a carousel — validate quality prompt includes `[] DECLARED STRUCTURE` entry
- [ ] Generate a carousel with MYTH-BREAKER caption that includes a CTA — validator flags it
- [ ] Generate a carousel with OBSERVATION caption — no CTA exemption applied

---

## Step 3 — Fix Empty Slide Body Labels in Content Section Builder

> **File:** `features/ai/validation/prompts/shared/content-section.ts`

Cover (slide 1) and CTA (slide 4) intentionally have empty body text. The current content
section builder formats them as:

```
[SLIDE 1]
Headline: Защо точковите шокуейв уреди не разбиват калцификати хомогенно
Body:
```

The validator sees an empty `Body:` field and may flag slides as incomplete or flag filler
content. Fix by labelling intentional absences:

```typescript
export function buildContentSection(
  text: string,
  slides: Array<{ headline: string; body: string; slide_role?: string }> | undefined,
  opts: ContentSectionOpts
): string {
  if (!slides?.length) {
    return `\n<${opts.captionTag}>\n${text}\n</${opts.captionTag}>`
  }

  const slidesText = slides
    .map((s, i) => {
      const roleLabel =
        s.slide_role === 'cover'
          ? ' [COVER — no body text by design]'
          : s.slide_role === 'cta'
            ? ' [CTA — no body text by design]'
            : ''

      const bodyLine = s.body?.trim() ? `Body: ${s.body}` : `Body:${roleLabel}`

      return `[SLIDE ${i + 1}]\nHeadline: ${s.headline}\n${bodyLine}`
    })
    .join('\n\n')

  const intro = opts.introText ? `\n${opts.introText}` : ''
  const slidesSection = opts.slidesTag
    ? `\n<${opts.slidesTag}>\n${slidesText}\n</${opts.slidesTag}>`
    : ''

  return `${intro}\n[CAPTION]\n<${opts.captionTag}>\n${text}\n</${opts.captionTag}>${slidesSection}`
}
```

Pass `slide_role` from `CarouselSlide` through `buildContentSection`. The `CarouselSlide` type
already has `slide_role: 'cover' | 'content' | 'value' | 'cta'`.

### ✓ Step 3 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Generate a carousel — validate quality user prompt shows:
  ```
  [SLIDE 1]
  Headline: ...
  Body: [COVER — no body text by design]
  ```
- [ ] Validator does not flag cover or CTA slides as having filler/missing content

---

## Step 4 — Fix "based on the listing type" Remnant

> **File:** `features/ai/generation/prompts/source-grounding.ts`

The single image (and research) source fidelity rules contain a real-estate remnant:

```
- Do NOT extrapolate, infer, or "fill in" details that seem plausible based on
  the listing type, location, or niche.
```

This was cleaned from the carousel version but not the single image version. After the
`SOURCE_GROUNDING_RULES` constant is introduced (Step 10), there will be one definition.
But this must be fixed now so the current output is correct.

**In `buildGroundingPrompt` or wherever this text is assembled, replace:**

```typescript
// REMOVE:
'Do NOT extrapolate, infer, or "fill in" details that seem plausible based on the listing type, location, or niche.'

// REPLACE WITH:
'Do NOT extrapolate or "fill in" details that seem plausible but are not explicitly stated in the source.'
```

Confirm no other real-estate vocabulary exists in the source fidelity section:

```bash
grep -r "listing type\|кв\. Беломорски\|apartment in\|floor number" src/features/ai/
# Expected: nothing
```

### ✓ Step 4 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "listing type" src/features/ai/` — nothing
- [ ] Generate a single post with source — rendered source fidelity rules contain no
      real-estate vocabulary

---

## Step 5 — Fix "Slides 2 to 2" Range Calculation

> **File:** `features/ai/generation/generators/carousel-generator.ts`
> — `buildDirective()`

For a 4-slide carousel the directive currently outputs:

```
- Slide 1 (Cover): ...
- Slides 2 to 2: One distinct idea per slide...
- Slide 3: Value/payoff slide...
- Slide 4 (Last): CTA only...
```

"Slides 2 to 2" means one content slide but the model sees a range of one — confusing.
The calculation `slideCount - 2` for the upper bound of content slides is off by one.

For a 4-slide layout: cover (1) + content slides (2-3) + value (implicit in content or explicit)

- CTA (4). But the current structure lists cover, content range, value, CTA as four roles —
  so for 4 slides: cover (1), content (2 to 2 = one slide), value (3), CTA (4). The
  value slide should be slide 3, CTA slide 4. With 4 slides there is only ONE content slide
  (slide 2), which is correct — but "Slides 2 to 2" makes it look like a bug.

**Fix — generate the roles explicitly, not as a range:**

```typescript
protected buildDirective(input: GenerationInput): string {
  const n = input.slideCount ?? 4

  // Build explicit slide role list
  const slideRoles: string[] = [
    `- Slide 1 (Cover): Bold hook headline only. Opens a loop the reader must swipe to resolve. Add approved swipe cue. No body text.`,
  ]

  // Content slides: slides 2 through n-2 (inclusive)
  if (n > 4) {
    slideRoles.push(
      `- Slides 2 to ${n - 2}: One distinct idea per slide. Headline + 2-3 sentence body. Self-contained.`
    )
  } else {
    // For 4 slides there is exactly one content slide
    slideRoles.push(
      `- Slide 2: One distinct idea. Headline + 2-3 sentence body. Self-contained.`
    )
  }

  slideRoles.push(
    `- Slide ${n - 1}: Value/payoff slide. Emotional or informational peak.`,
    `- Slide ${n} (Last): CTA only. Low-pressure. Include button text suggestion.`
  )

  return `CAROUSEL-SPECIFIC RULES:
SLIDE STRUCTURE:
${slideRoles.join('\n')}

SLIDE HEADLINE RULES:
Every headline must contain a specific number, named tension, or counterintuitive claim.
NEVER use topic labels or generic positives.

SLIDE BODY RULES:
Body text must add NEW information beyond the headline. Never explain the headline — extend it.
Minimum 2 sentences per content slide.
Each slide covers a DISTINCT idea — check all prior slides before writing the next.

SWIPE CUES — use ONLY these approved phrases, never invent new ones:
${swipeCues}

REGISTER PER SLIDE: Apply the same register rules to every slide individually.

MAIN CAPTION: max 3 lines, teases carousel, ends with an approved swipe cue, 1-3 niche hashtags at end.

Theme: ${input.theme}
You MUST return exactly ${n} slides in the JSON array.

First choose your structure for the main caption, then write.
FOR EACH SLIDE: provide a design note (1-2 sentences) for Canva.

Return JSON only:
{
  "chosen_structure": string,
  "main_caption": string,
  "slides": [{
    "slide_number": number,
    "slide_role": "cover" | "content" | "value" | "cta",
    "headline": string,
    "body": string,
    "cta_text": string | null,
    "design_note": string
  }]
}`
}
```

Note: `chosen_opener` removed from JSON format here — aligns with Step 2 (only
`chosen_structure` is needed, opener is not prescribed).

### ✓ Step 5 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] 4-slide carousel directive shows `- Slide 2: One distinct idea...` (not "Slides 2 to 2")
- [ ] 6-slide carousel directive shows `- Slides 2 to 4: One distinct idea...` (correct range)
- [ ] JSON format no longer includes `chosen_opener`

---

## Step 6 — Phase 1 Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Functional verification

- [ ] Generate a 4-slide carousel — directive is unambiguous, model returns correct structure
- [ ] Carousel validate quality prompt: shows slide body check not word count check
- [ ] Carousel validate quality prompt: shows `[] DECLARED STRUCTURE` entry
- [ ] Cover and CTA slides labelled `[no body text by design]` in validator input
- [ ] Single post source fidelity rules: no real-estate vocabulary
- [ ] 4-slide carousel: slide roles listed clearly, no "Slides X to X" pattern

---

## Phase 2 — Redundancy Cleanup

---

## Step 7 — Single Source for Register Rules

> **Files:** `client-profile.ts`, `validate-quality.ts`, `validate-language.ts`,
> `language-validation-rules.ts`

The LANGUAGE REGISTER block with BAD/GOOD/WHY examples appears in all three validators and
in the generation user prompt. Each call assembles it independently from the same DB data
via `formatFormalityRules(lc)`.

**Confirm `formatFormalityRules` is already the single assembly function:**

```bash
grep -rn "^export function formatFormalityRules" src/
# Expected: 1 result — formality-guidance.ts
```

**Confirm all three consumers import it:**

```bash
grep -rn "formatFormalityRules" src/features/ai/
# Expected: client-profile.ts, validate-quality.ts, validate-language.ts,
#           language-validation-rules.ts
```

If any consumer has an inline register block instead of calling `formatFormalityRules`,
replace it with the function call.

**Limit formality examples to 1 per language** — currently sends 2 BAD/GOOD/WHY triplets
(~100 tokens). One example establishes the pattern; two is redundant:

```typescript
// In formatFormalityRules (formality-guidance.ts):
const langExamples = (register.examples[langKey] ?? register.examples['general'] ?? []).slice(0, 1) // was unlimited — cap at 1 example per language
```

**Saving:** ~100 tokens per consumer × 3 consumers = ~300 tokens per generation cycle.

### ✓ Step 7 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "LANGUAGE REGISTER (FORMAL)" src/features/ai/` — nothing hardcoded inline
- [ ] Each prompt shows exactly 1 BAD/GOOD/WHY example, not 2
- [ ] Register rules text is identical across generation, validate quality, validate language

---

## Step 8 — Single Source for AI Tell Patterns

> **Files:** `generation-criteria.ts`, `validation-criteria.ts`, `client-profile.ts`

AI tell patterns are defined in `validation-criteria.ts` but used in both the generation
system prompt and the quality validation system prompt. They are a generation rule and belong
in `generation-criteria.ts`.

**Move `AI_TELL_PATTERNS` and `formatAiTellPatterns()` to `generation-criteria.ts`.**
Re-export from `validation-criteria.ts` for backward compatibility.

This is Step 1 of the Gen-Val Alignment plan. If already done, confirm and skip.

```bash
grep -rn "^export const AI_TELL_PATTERNS" src/
# Expected: 1 result — generation-criteria.ts

grep -rn "AI_TELL_PATTERNS" src/features/ai/validation/content-rules/validation-criteria.ts
# Expected: re-export line only, not a definition
```

**Confirm generation system prompt and quality validation use the same patterns:**

Render the generation system prompt for Физиомед and the quality validation system prompt.
The 6 pattern descriptions must be byte-for-byte identical.

**Saving:** the patterns are ~120 tokens sent to two calls. With one canonical source, any
update automatically propagates to both.

### ✓ Step 8 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -rn "^export const AI_TELL_PATTERNS" src/` — 1 result (generation-criteria.ts)
- [ ] Generation and validation prompts show identical pattern text

---

## Step 9 — Single Source for Brand Voice Description

> **Files:** `client-profile.ts`, `validate-quality.ts`

The brand tone description appears twice in the validate quality system prompt:

- Once in the opening `BRAND CONTEXT` section (~80 tokens)
- Once inside `buildBrandVoiceCheck()` (~80 tokens)

And the generation user prompt builds a third version via `buildBrandVoiceSection()`.

**Export `buildBrandVoiceDescription()` from `client-profile.ts`** and use it in all three
locations. This is Step 3 of the Gen-Val Alignment plan. If already done, confirm and skip.

**Remove the duplicate from the `BRAND CONTEXT` opening block in the quality validator.**
The `BRAND CONTEXT` block should contain only: niche, tone label, register, target audience
(compressed — see Step 14). The full brand voice description with the testimonial belongs
only in `buildBrandVoiceCheck()`.

```typescript
// In validate-quality.ts buildBasePrompt:

// REMOVE the full brand voice description from the opening context block:
function buildBrandContext(ctx?: QualityContext): string {
  if (!ctx?.tone && !ctx?.targetAudience && !ctx?.niche) return ''
  const formality = ctx.languageConfig?.formality ?? 'neutral'
  return `BRAND CONTEXT: This post is for a ${ctx.niche ?? 'general'} business.
Register: ${formality}.`
  // Brand voice detail moves to buildBrandVoiceCheck() only
}
```

**Saving:** ~80 tokens per quality validation call.

### ✓ Step 9 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -rn "^export function buildBrandVoiceDescription" src/` — 1 result
- [ ] Brand tone description appears once in quality validator (inside BRAND CHECKS section)
- [ ] `BRAND CONTEXT` opening block contains niche, register, no duplicate brand voice text

---

## Step 10 — Single Source for Source Fidelity Rules

> **Files:** `source-grounding.ts`, `validation-criteria.ts`

Source fidelity rules exist in two versions with different phrasing — one in the generation
user prompt (via `buildGroundingPrompt`) and one in the validation criteria checklist (via
`buildCriteriaChecklist`). After Step 4 cleaned the real-estate remnant, phrasing still
differs between chains.

**Export `SOURCE_GROUNDING_RULES` constant from `source-grounding.ts`:**

```typescript
export const SOURCE_GROUNDING_RULES =
  `- Use ONLY facts explicitly stated in the source — no inference, no invented details.
- Pick ONE angle, not a summary. If covering more than 2 facts, stop and cut.
- Post structure must come from the POST STRUCTURES list, NOT the source article's structure.` as const
```

Use it in `buildGroundingPrompt` and import it in `buildCriteriaChecklist`:

```typescript
// validation-criteria.ts
import { SOURCE_GROUNDING_RULES } from '@/ai/generation/prompts/source-grounding'

// In buildCriteriaChecklist when hasSource:
sections.push(`[] SOURCE FIDELITY — the generator was told to follow these rules:
${SOURCE_GROUNDING_RULES}`)
```

This is Step 2 of the Gen-Val Alignment plan. If already done, confirm and skip.

### ✓ Step 10 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -rn "^export const SOURCE_GROUNDING_RULES" src/` — 1 result (source-grounding.ts)
- [ ] Generation and validation show identical source fidelity text
- [ ] Validation criteria checklist includes all three rules including "post structure ≠
      source structure"

---

## Step 11 — Fix Validate Language Rules Sent Twice

> **File:** `features/ai/validation/prompts/validate-language.ts`

The language validator system prompt contains the full rule set (7 issue types, register
rules, naturalness test). The user message then appends the same content again via
`buildLanguageValidationRules(languageConfig)`.

The `buildLanguageValidationRules` output belongs in the **system prompt** only. The
**user message** should contain only: the text to validate, the language/formality labels,
and the return format instruction.

```typescript
// In validateLanguage:

const systemText = `${persona}

${rules}            // ← buildLanguageValidationRules output stays here
${instructions}` // ← task description stays here

// User message — text only, no rule repetition:
const message = await callAnthropic({
  systemPrompt: systemText,
  userMessage: `${contentSection}

Language: ${language}
Formality: ${formality}

Return JSON only:
${returnFormat}`,
  maxTokens: 2048,
})
```

**Confirm `buildLanguageValidationRules` is NOT called again inside the user message
construction.** If it appears in `userMessage`, remove it.

```bash
grep -n "buildLanguageValidationRules" src/features/ai/validation/prompts/validate-language.ts
# Expected: 1 result — called once when building systemText
```

**Saving:** ~400 tokens per language validation call (rules sent once not twice).

### ✓ Step 11 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -c "buildLanguageValidationRules" src/.../validate-language.ts` — 1 (not 2)
- [ ] Language validator system prompt contains full rules
- [ ] Language validator user message contains only text, language label, return format
- [ ] Validate a Bulgarian post — corrections still returned correctly

---

## Step 12 — Phase 2 Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Token audit — log usage for one full generation cycle

Run a 2-post single image generation for Физиомед with token logging enabled:

| Call              | Before       | After        | Expected saving                                                                 |
| ----------------- | ------------ | ------------ | ------------------------------------------------------------------------------- |
| Generation        | ~2600 tokens | ~2100 tokens | Register (−100), AI tells (−120), source fidelity (−50)                         |
| Validate quality  | ~1800 tokens | ~1400 tokens | Register (−100), brand voice dup (−80), AI tells (−120), audience (see Phase 3) |
| Validate language | ~1200 tokens | ~800 tokens  | Rules sent once not twice (−400)                                                |

### Content verification

- [ ] Register rules in generation and validation are byte-identical
- [ ] AI tell patterns in generation and validation are byte-identical
- [ ] Brand voice description in generation and validation is byte-identical
- [ ] Source fidelity rules in generation and validation checklist are byte-identical
- [ ] Language validator user message does not contain rule text

---

## Phase 3 — Efficiency Improvements

---

## Step 13 — Remove chosen_opener from Carousel JSON

> **File:** `features/ai/generation/generators/carousel-generator.ts`

Step 5 already removed `chosen_opener` from the JSON format in `buildDirective`. Confirm
it is also removed from `CarouselResult` type if it is no longer used:

```typescript
// types.ts — update CarouselResult:
export interface CarouselResult {
  chosen_structure?: string // kept — threaded to validator in Step 2
  // chosen_opener removed — was never used, wasted ~10 tokens per call
  main_caption: string
  slides: CarouselSlide[]
}
```

```bash
grep -rn "chosen_opener" src/
# Expected: nothing
```

**Saving:** ~10 tokens per carousel generation call (minor, but eliminates dead field).

### ✓ Step 13 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "chosen_opener" src/` — nothing

---

## Step 14 — Compress Target Audience

> **Files:** `client-profile.ts`, `validate-quality.ts`

Full taxonomy (~120 tokens) in both generation and validation, both chains:

```
Target audience: Patients with chronic musculoskeletal disorders and persistent pain conditions
seeking advanced treatment options, Athletes and active individuals requiring sports injury
rehabilitation and performance recovery, Post-surgical patients needing structured rehabilitation
programs, Individuals with spinal conditions (disc hernias, scoliosis) requiring specialized
therapies, Patients who have not responded to conventional physiotherapy treatments,
Health-conscious professionals seeking preventive care and ergonomic solutions
```

The model needs to know _who_ it is writing for emotionally, not a clinical taxonomy.

**Replace in `buildClientProfile` and `buildBrandContext`** with a compressed version built
from the same DB data:

```typescript
// Add to client-profile.ts:
export function buildCompressedAudience(targetAudience: string): string {
  // If audience is short enough already, use as-is
  if (targetAudience.length <= 200) return targetAudience

  // For long taxonomy strings, extract the key groups by splitting on comma/period
  // and taking the first 3-4 meaningful segments
  const segments = targetAudience
    .split(/,(?=[A-Z])|\.\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)

  return segments.join(', ')
}
```

For Физиомед this produces: "Patients with chronic musculoskeletal disorders, Athletes
requiring sports injury rehabilitation, Post-surgical patients, Individuals with spinal
conditions" — ~50 tokens vs ~120 tokens.

**Alternative (preferred):** store a short audience summary in `brand_profiles.audience_summary`
alongside the full taxonomy. Generation and validation use the short summary. Requires a DB
column addition and one migration.

Until the DB column is available, use the extraction approach above.

**Saving:** ~70 tokens × 2 calls × 2 chains = ~280 tokens per session.

### ✓ Step 14 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Target audience section in both prompts is ≤200 characters
- [ ] Quality validator still correctly assesses audience targeting for Физиомед posts

---

## Step 15 — Compress Topics to Avoid

> **File:** `features/ai/generation/prompts/client-profile.ts`

9 items listed, 5 redundant with health rules or brand voice:

| Item                           | Keep?      | Reason                             |
| ------------------------------ | ---------- | ---------------------------------- |
| Unproven medical claims        | **Remove** | Covered by health rules            |
| Diagnosis recommendations      | **Remove** | Covered by health rules            |
| Comparisons with other clinics | **Keep**   | Unique constraint                  |
| Treatments outside scope       | **Remove** | Covered by health rules            |
| Guarantees of outcomes         | **Remove** | Covered by health rules            |
| Patient photos without consent | **Keep**   | Unique constraint                  |
| Fear-mongering                 | **Remove** | Covered by health rules            |
| Overly promotional content     | **Remove** | Covered by brand voice checks      |
| Pricing discussion             | **Keep**   | Unique constraint, platform policy |

**Replace the 9-item list with the 3 unique constraints:**

```typescript
// In buildClientProfile:
const topicsToAvoid = `Topics to avoid: Comparisons with other clinics or practitioners, patient photos or details without explicit consent, pricing discussion.
Health rules below override everything else.`
```

**Saving:** ~60 tokens per generation call.

### ✓ Step 15 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Topics to avoid section: 3 items only
- [ ] Health rules section still present and marked as override
- [ ] Generate a Физиомед post — model does not include pricing or comparisons

---

## Step 16 — Remove Standalone Specificity Requirement Section

> **File:** `features/ai/generation/prompts/client-profile.ts`

This section appears in the generation user prompt:

```
SPECIFICITY REQUIREMENT:
The post must contain at least one detail that could only come from Физиомед (Physiomed Plovdiv)
— not any similar business in the same field.
Generic niche observations any competitor could post will score poorly.
```

The same constraint is enforced by:

- Generation system prompt self-check: "Could this post be written about any business in the
  niche? If yes — add specificity."
- Quality validator `niche_specificity` field

Remove the standalone section. The self-check and validator together are sufficient.

```typescript
// In buildClientProfile — remove this section entirely:
sections.push(`SPECIFICITY REQUIREMENT:
The post must contain at least one detail...`)
```

**Saving:** ~30 tokens per generation call.

### ✓ Step 16 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "SPECIFICITY REQUIREMENT" src/features/ai/` — nothing
- [ ] Generation self-check still includes the specificity instruction
- [ ] Quality validator still scores `niche_specificity`

---

## Step 17 — Compress Bulgarian Naturalness Block to DB-Driven Single Source

> **Files:** `client-profile.ts`, `validate-language.ts`, `research-pipeline.ts`
> (prompt-builder.ts)

The Bulgarian naturalness block appears in multiple places:

```
LANGUAGE RULES — BULGARIAN:
Think in Bulgarian from the start.
Do NOT compose in English and translate...

NATURALNESS TEST:
After writing...
```

This content should live in `language_rules.language_instructions` in the DB for Bulgarian,
not hardcoded in TypeScript. The `buildLanguageValidationRules` function already reads from
`config.languageInstructions` — the mechanism is in place.

**Step 17a — Verify DB content:**

```sql
SELECT language_instructions FROM language_rules WHERE language = 'Bulgarian';
```

If `language_instructions` already contains the naturalness test content, remove the
hardcoded block from each TypeScript file. If it does not, add it to the DB first.

**Step 17b — Remove from TypeScript after DB confirmed:**

In `client-profile.ts`, `buildLanguagePrompt` section — remove the hardcoded naturalness
block if `config.languageInstructions` carries it.

In `validate-language.ts`, `buildLanguageValidationRules` — confirm the hardcoded block
after `formalitySection` is replaced by `config.languageInstructions` content.

In research `prompt-builder.ts` `buildHistoryContext` or `buildDirectiveBlock` — same check.

**This step requires the DB to be populated first.** Do not remove hardcoded content until
the DB row for Bulgarian contains the equivalent. Run validation on a Bulgarian post before
and after to confirm detection is identical.

**Saving:** ~150 tokens per call where the block was duplicated.

### ✓ Step 17 Verification

- [ ] Bulgarian: `language_rules.language_instructions` contains naturalness test content
- [ ] No hardcoded "Think in Bulgarian from the start" block in any TypeScript file
- [ ] `grep -r "Think in Bulgarian" src/features/ai/` — nothing
- [ ] Bulgarian post validation: same issues detected as before

---

## Step 18 — Phase 3 Final Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Full token audit — before vs after all phases

Run a 2-post single image generation + validation for Физиомед with logging:

| Call                       | Before all phases | After all phases | Total saving     |
| -------------------------- | ----------------- | ---------------- | ---------------- |
| Research                   | ~2100 tokens      | ~1800 tokens     | ~300             |
| Generation                 | ~2600 tokens      | ~2000 tokens     | ~600             |
| Validate source            | ~400 tokens       | ~400 tokens      | 0                |
| Validate quality (×2)      | ~1800 tokens      | ~1300 tokens     | ~1000            |
| Validate language (×2)     | ~1200 tokens      | ~750 tokens      | ~900             |
| **Total per 2-post cycle** | **~11900 tokens** | **~8900 tokens** | **~3000 (~25%)** |

### Functional verification — both post types

- [ ] Single image: generate 2 posts → all validation scores correct
- [ ] Carousel: generate 1 carousel → declared structure checked in validator
- [ ] Carousel: cover/CTA slides labelled `[no body text by design]`
- [ ] Carousel: word count check absent, slide body check present
- [ ] Bulgarian post: AI tells detected, language corrections applied
- [ ] Source-grounded post: all 3 source fidelity rules in validation criteria
- [ ] Health client: health rules fire in generation and validation

---

## Complete Change Summary

### Phase 1 — Bugs

| Bug                                             | File                                                             | Fix                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Carousel word count uses single post limit      | `validation-criteria.ts`                                         | `postType` in `QualityContext` → carousel shows slide body check     |
| Carousel declared structure not verified        | `carousel-generator.ts`, `generation-run.ts`, `validate-post.ts` | Thread `chosen_structure` → `declaredStructure` → criteria checklist |
| Empty slide bodies confuse validator            | `content-section.ts`                                             | Label cover/CTA slides `[no body text by design]`                    |
| "based on the listing type" real-estate remnant | `source-grounding.ts`                                            | Remove domain-specific language                                      |
| "Slides 2 to 2" ambiguous range                 | `carousel-generator.ts`                                          | Explicit role per slide number                                       |

### Phase 2 — Redundancy

| Redundancy                                       | Tokens saved           | Fix                                                    |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------ |
| Register rules in 3 prompts per chain            | ~300/cycle             | `formatFormalityRules(lc)` one source, 1 example not 2 |
| AI tell patterns in generation + validation      | ~120/cycle             | `AI_TELL_PATTERNS` in `generation-criteria.ts`         |
| Brand voice described twice in quality validator | ~80/cycle              | `buildBrandVoiceDescription()` called once             |
| Source fidelity rules in different phrasing      | 0 tokens (correctness) | `SOURCE_GROUNDING_RULES` constant                      |
| Language rules sent twice to same call           | ~400/cycle             | Rules in system prompt only                            |

### Phase 3 — Efficiency

| Inefficiency                                | Tokens saved        | Fix                                 |
| ------------------------------------------- | ------------------- | ----------------------------------- |
| `chosen_opener` generated and discarded     | ~10/carousel call   | Removed from JSON format and type   |
| Target audience clinical taxonomy × 2 calls | ~280/session        | Compressed to ~50 tokens            |
| Topics to avoid 5/9 items redundant         | ~60/generation call | Compressed to 3 unique constraints  |
| Specificity requirement in 3 places         | ~30/generation call | Removed standalone section          |
| Bulgarian naturalness block hardcoded       | ~150/affected call  | Moved to DB `language_instructions` |

---

_PostFlow — Prompt Pipeline Fixes_
_Fix bugs before touching redundancy. Verify each phase end-to-end before starting the next._
