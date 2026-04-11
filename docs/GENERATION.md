# Generation Flow — Refactoring & Optimization Plan

> **Implementation document for Claude Code.**
> Run `npx tsc --noEmit` after every step before proceeding.
> **Rule: one concern per step.**

---

## Context

The generation flow covers `base-generator.ts`, `post-generator.ts`, `carousel-generator.ts`,
`reels-generator.ts`, `generator-factory.ts`, `generate-posts.ts`, and the prompt builders in
`prompt-sections.ts` and `source-grounding.ts`.

Three categories of work:

**Refactoring** — removes repetition without changing behaviour. Every generator imports and calls
the same three prompt builders. These belong in the base class. Each generator file should describe
only what is unique to that content type.

**Optimizations** — changes behaviour to improve quality or performance. Parallel caption
validation, correct reels validation, over-request pattern.

**Naming & structure** — renames files, folders, functions, and types so the codebase reads
clearly without opening files. A new developer should be able to infer what each piece does from
its name alone.

---

## What Is Duplicated Right Now

Every generator (`post-generator.ts`, `carousel-generator.ts`, `reels-generator.ts`) imports and
calls identically:

```typescript
import { buildSourceGroundingSection } from '@/ai/generation/prompts/source-grounding'
import {
  buildClientProfile,
  buildAngleDifferentiationSection,
} from '@/ai/generation/prompts/prompt-sections'

// In buildUserMessage:
buildClientProfile({ client, platform, targetPillar })
buildSourceGroundingSection({ sourceExcerpt, sourceUrl, requireSourceGrounding })
buildAngleDifferentiationSection(
  input.similarPastThemes ?? []
)`Today's date: ${new Date().toISOString().split('T')[0]}`
```

In `generate-posts.ts`, the three `process*Result` functions each build an identical `validatePost`
call differing only in `caption`, `slides`, and `label`.

`GenerateReelsInput` is an empty interface — a TypeScript anti-pattern.

---

## What Is Slow Right Now

1. **Single post captions validated sequentially** — if `count: 3`, three validation calls run one
   after another. They are independent and should be parallel.

2. **Reels validated as a social post** — the flat script string is passed to `validatePost` which
   checks hook quality, CTA verdict, sentence variety, word count. None of these metrics apply to a
   spoken script. The result is meaningless scores for reels.

3. **No quality floor** — posts scoring 3/10 enter the review queue with no distinction from posts
   scoring 8/10. The agency reviews everything.

---

## Build Order

```
── PHASE 1: Base Class Refactor ────────────────────────────────────────────
Step 1  → Introduce buildTypeSpecificMessage (abstract) in base-generator.ts
Step 2  → Move shared prompt assembly into base buildUserMessage
Step 3  → Add getplatform() hook to base class
Step 4  → Strip post-generator.ts to buildTypeSpecificMessage + parseResponse
Step 5  → Strip carousel-generator.ts to buildTypeSpecificMessage + parseResponse
Step 6  → Strip reels-generator.ts to buildTypeSpecificMessage + parseResponse
Step 7  → Remove GenerateReelsInput empty interface
Step 8  → Phase 1 verification

── PHASE 2: generate-posts.ts Cleanup ──────────────────────────────────────
Step 9  → Extract runValidation helper
Step 10 → Refactor processCarouselResult to use runValidation
Step 11 → Refactor processReelsResult to use runValidation
Step 12 → Refactor processSingleResult to use runValidation
Step 13 → Phase 2 verification

── PHASE 3: Flow Optimizations ─────────────────────────────────────────────
Step 14 → Parallelize caption validation in processSingleResult
Step 15 → Fix reels validation (language-only, skip quality)
Step 16 → Add over-request + quality floor for single posts
Step 17 → Phase 3 verification

── PHASE 4: Naming & Structure ─────────────────────────────────────────────
Step 18 → Rename files and create generators/ subfolder
Step 19 → Rename functions in generation-run.ts
Step 20 → Rename functions in content-generator.ts and prompt builders
Step 21 → Rename types
Step 22 → Phase 4 verification

── PHASE 5: Type Simplification ────────────────────────────────────────────
Step 23 → Define DraftPost — type the post record
Step 24 → Collapse generator input hierarchy to one GenerationInput
Step 25 → Flatten GenerationRunContext — keep optional slideCount
Step 26 → Merge Theme and EnrichedTheme — one type with optional enrichment fields
Step 27 → Audit and collapse QualityResult discriminated union
Step 28 → Remove chosen_structure/chosen_opener from CarouselResult and prompt
Step 29 → Import PostType from canonical location
Step 30 → Phase 5 verification
```

**Phases run in order. Each phase must be verified before starting the next.**
Phase 4 runs last before Phase 5 — rename on top of clean code, simplify on top of renamed code.

---

## Phase 1 — Base Class Refactor

---

## Step 1 — Introduce buildTypeSpecificMessage

> **File:** `features/ai/generation/base-generator.ts`

Rename the abstract method from `buildUserMessage` to `buildTypeSpecificMessage`. The base class
will own `buildUserMessage` as a concrete method that wraps the subclass implementation.

This is the structural change that makes Steps 4-6 possible.

```typescript
// Before — subclasses implement buildUserMessage directly
protected abstract buildUserMessage(input: TInput): string

// After — subclasses implement only what is unique to their type
protected abstract buildTypeSpecificMessage(input: TInput): string
```

### ✓ Step 1 Verification

- [ ] `npx tsc --noEmit` — TypeScript errors expected here (subclasses no longer implement the
      right method name). These are fixed in Steps 4-6.
- [ ] `buildTypeSpecificMessage` is abstract in `ContentGenerator`
- [ ] `buildUserMessage` is no longer abstract

---

## Step 2 — Move Shared Prompt Assembly into Base buildUserMessage

> **File:** `features/ai/generation/base-generator.ts`

Add imports for the shared builders. Implement `buildUserMessage` as a concrete method that
assembles the shared wrapper and appends the subclass-specific directive.

```typescript
import { buildStaticSystemPrompt, buildClientProfile, buildAngleDifferentiationSection }
  from '@/ai/generation/prompts/prompt-sections'
import { buildSourceGroundingSection } from '@/ai/generation/prompts/source-grounding'
import { PROMPT_HISTORY_LIMIT } from '@/utils/constants'

// Concrete — never overridden by subclasses
protected buildUserMessage(input: TInput): string {
  const profile = buildClientProfile({
    client: input.client,
    platform: this.getplatform(input),
    targetPillar: input.targetPillar,
  })

  const history = input.client.postHistory.length > 0
    ? `Recent topics already covered — do not repeat: ${
        input.client.postHistory.slice(0, PROMPT_HISTORY_LIMIT).join(' | ')
      }`
    : ''

  const source = buildSourceGroundingSection({
    sourceExcerpt: input.sourceExcerpt,
    sourceUrl: input.sourceUrl,
    requireSourceGrounding: input.requireSourceGrounding,
  })

  const angleDiff = buildAngleDifferentiationSection(input.similarPastThemes ?? [])
  const today = `Today's date: ${new Date().toISOString().split('T')[0]}`
  const directive = this.buildTypeSpecificMessage(input)

  return [profile, history, source, angleDiff, today, directive]
    .filter(Boolean)
    .join('\n\n')
}
```

### ✓ Step 2 Verification

- [ ] `npx tsc --noEmit` — still errors from Steps 4-6 not done yet, but no new errors
- [ ] `buildUserMessage` in base class imports from `prompt-sections` and `source-grounding`
- [ ] `buildUserMessage` calls `this.buildTypeSpecificMessage(input)` as its last section

---

## Step 3 — Add getplatform() Hook

> **File:** `features/ai/generation/base-generator.ts`

Post uses `input.platform`. Carousel and Reels always use `'Instagram'`. Encode this as an
overridable method rather than hardcoding it in each subclass.

```typescript
/**
 * Platform passed to buildClientProfile.
 * PostGenerator reads from input.platform.
 * CarouselGenerator and ReelsGenerator override to return 'Instagram'.
 */
protected getplatform(input: TInput): string {
  return (input as { platform?: string }).platform ?? 'Instagram'
}
```

### ✓ Step 3 Verification

- [ ] `npx tsc --noEmit` — no new errors introduced
- [ ] `getplatform` is `protected` — subclasses can override

---

## Step 4 — Strip post-generator.ts

> **File:** `features/ai/generation/post-generator.ts`

Remove all imports that are now handled by the base class. Rename `buildUserMessage` to
`buildTypeSpecificMessage`. Remove the client profile, source grounding, angle differentiation, and
today's date — these are now assembled by the base.

**After:**

```typescript
import type { Message } from '@anthropic-ai/sdk/resources'
import { stripPlanningPrefix } from '@/utils/ai'
import { ContentGenerator } from './base-generator'
import type { GeneratePostInput } from './types'

export class PostGenerator extends ContentGenerator<GeneratePostInput, string[]> {
  protected buildTypeSpecificMessage(input: GeneratePostInput): string {
    return `PLANNING STEP — complete before writing:
Review the ALLOWED OPENERS and ALLOWED STRUCTURES above.
For each post, declare your choices on one line: [STRUCTURE: name | OPENER: type]
Then write the post immediately after. Do not write anything before the declaration.

Write ${input.count} post(s) for theme '${input.theme}'.
Each must feel distinct — use different structures and opener types.
Separate multiple posts with ---.`
  }

  protected parseResponse(message: Message): string[] {
    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    return text
      .split('---')
      .map((p) => p.trim())
      .filter(Boolean)
      .map(stripPlanningPrefix)
  }
}
```

### ✓ Step 4 Verification

- [ ] `npx tsc --noEmit` — no errors for this file
- [ ] No imports of `buildClientProfile`, `buildSourceGroundingSection`,
      `buildAngleDifferentiationSection`
- [ ] `buildTypeSpecificMessage` contains only the planning step + theme directive
- [ ] File is under 25 lines

---

## Step 5 — Strip carousel-generator.ts

> **File:** `features/ai/generation/carousel-generator.ts`

Same as Step 4. Remove shared builder imports and the repeated wrapping. Move `buildCarouselRules`
content inline into `buildTypeSpecificMessage` — it is only called once and does not need to be a
separate private method.

Override `getplatform` to return `'Instagram'` explicitly:

```typescript
protected getplatform(_input: GenerateCarouselInput): string {
  return 'Instagram'
}
```

**After:**

```typescript
import type { Message } from '@anthropic-ai/sdk/resources'
import { parseJsonResponse } from '@/utils/ai'
import { ContentGenerator } from './base-generator'
import type { GenerateCarouselInput, CarouselResult } from './types'

export class CarouselGenerator extends ContentGenerator<GenerateCarouselInput, CarouselResult> {
  protected getplatform(): string {
    return 'Instagram'
  }

  protected buildTypeSpecificMessage(input: GenerateCarouselInput): string {
    const swipeCues = input.client.languageConfig.carouselSwipeCues

    return `CAROUSEL-SPECIFIC RULES:
SLIDE STRUCTURE:
- Slide 1 (Cover): Bold hook headline only. Opens a loop the reader must swipe to resolve. Add approved swipe cue. No body text.
- Slides 2 to ${input.slideCount - 2}: One distinct idea per slide. Headline + 2-3 sentence body. Self-contained.
- Slide ${input.slideCount - 1}: Value/payoff slide. Emotional or informational peak.
- Slide ${input.slideCount} (Last): CTA only. Low-pressure. Include button text suggestion.

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
You MUST return exactly ${input.slideCount} slides in the JSON array.

First choose your structure and opener for the main caption, then write.
FOR EACH SLIDE: provide a design note (1-2 sentences) for Canva.

Return JSON only:
{
  "chosen_structure": string,
  "chosen_opener": string,
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

  protected parseResponse(message: Message): CarouselResult {
    return parseJsonResponse<CarouselResult>(message)
  }
}
```

### ✓ Step 5 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] No imports of `buildClientProfile`, `buildSourceGroundingSection`,
      `buildAngleDifferentiationSection`
- [ ] `buildCarouselRules` private method removed — content is inline
- [ ] `getplatform` overridden to return `'Instagram'`
- [ ] File is under 60 lines

---

## Step 6 — Strip reels-generator.ts

> **File:** `features/ai/generation/reels-generator.ts`

Same pattern. `buildUserMessage` → `buildTypeSpecificMessage`. Remove shared imports. Keep
`buildSystemPrompt` override — that is legitimately unique to reels (script-writing instructions,
not post-writing instructions).

```typescript
import type { Message } from '@anthropic-ai/sdk/resources'
import { parseJsonResponse } from '@/utils/ai'
import { ContentGenerator } from './base-generator'
import type { BaseGenerateInput, ReelsResult } from './types'

export class ReelsGenerator extends ContentGenerator<BaseGenerateInput, ReelsResult> {
  protected getplatform(): string {
    return 'Instagram'
  }

  protected buildSystemPrompt(input: BaseGenerateInput): string {
    return `Write an Instagram Reels script (15-60 seconds when spoken aloud).

SCRIPT STRUCTURE:
- Hook (0-3 sec): One sentence. Instant curiosity or specific problem. No slow intros.
- Main content (3-45 sec): 3-5 short punchy points as spoken word. One per line.
- CTA (last 5 sec): One low-pressure action.

REGISTER: All sections must maintain ${input.client.languageConfig.formality} register.
A formal hook can still be punchy and specific without being casual.

ALSO PROVIDE on-screen text, visual direction, and estimated speaking time.`
  }

  protected buildTypeSpecificMessage(input: BaseGenerateInput): string {
    return `Theme: ${input.theme}

Return JSON only:
{
  "hook": string,
  "main_points": string[],
  "cta": string,
  "on_screen_text": string[],
  "visual_directions": string[],
  "estimated_seconds": number
}`
  }

  protected parseResponse(message: Message): ReelsResult {
    return parseJsonResponse<ReelsResult>(message)
  }
}
```

### ✓ Step 6 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `ReelsGenerator` accepts `BaseGenerateInput` not `GenerateReelsInput`
- [ ] No imports of shared prompt builders
- [ ] File is under 40 lines

---

## Step 7 — Remove GenerateReelsInput

> **File:** `features/ai/generation/types.ts`

`GenerateReelsInput` is an empty interface that extends `BaseGenerateInput` with no additional
fields. Remove it. `ReelsGenerator` already uses `BaseGenerateInput` directly after Step 6.

```typescript
// REMOVE:
export interface GenerateReelsInput extends BaseGenerateInput {}
```

Update `generator-factory.ts` if it references `GenerateReelsInput` in type annotations.
Update `buildGeneratorInput` in `generate-posts.ts` if it casts to `GenerateReelsInput`.

### ✓ Step 7 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "GenerateReelsInput" src/` — returns nothing

---

## Step 8 — Phase 1 Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Line count audit

```bash
wc -l src/features/ai/generation/post-generator.ts      # target: <25
wc -l src/features/ai/generation/carousel-generator.ts  # target: <60
wc -l src/features/ai/generation/reels-generator.ts     # target: <40
```

### Import audit — shared builders now only in base class

```bash
grep -r "buildClientProfile" src/features/ai/generation/ | grep -v "base-generator\|prompt-sections"
# Expected: nothing — only base-generator.ts should call buildClientProfile

grep -r "buildSourceGroundingSection" src/features/ai/generation/ | grep -v "base-generator\|source-grounding"
# Expected: nothing

grep -r "buildAngleDifferentiationSection" src/features/ai/generation/ | grep -v "base-generator\|prompt-sections"
# Expected: nothing
```

### Functional verification

- [ ] Generate a single post — correct output, planning prefix stripped
- [ ] Generate a carousel — correct slide count, JSON parsed
- [ ] Generate a reels — correct JSON structure, script-writing system prompt used
- [ ] All three receive client profile, source grounding, angle differentiation (check rendered
      prompt by logging `userMessage` in base class temporarily)

---

## Phase 2 — generate-posts.ts Cleanup

---

## Step 9 — Extract runValidation Helper

> **File:** `features/ai/generation/generate-posts.ts`

The three process functions each build a `validatePost` call that differs only in `caption`,
`slides`, and `label`. Extract the shared wrapper:

```typescript
// Add inside generatePosts(), alongside the other inner functions:

async function runValidation(
  caption: string,
  theme: ThemeWithMeta,
  opts: { slides?: CarouselSlide[]; label: string }
): Promise<PostValidationResult> {
  return validatePost({
    caption,
    slides: opts.slides,
    languageConfig: ctx.client.languageConfig,
    label: opts.label,
    platform: ctx.platform,
    sourceContext: buildSourceContext(theme),
    qualityContext: sharedQualityContext,
  })
}
```

Do not change the three process functions yet — that is Steps 10-12.

### ✓ Step 9 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `runValidation` is a function inside `generatePosts` scope
- [ ] Three process functions unchanged — still call `validatePost` directly

---

## Step 10 — Refactor processCarouselResult

> **File:** `features/ai/generation/generate-posts.ts`

Replace the inline `validatePost` call with `runValidation`. Inline the slide count warning at the
top:

```typescript
async function processCarouselResult(theme: ThemeWithMeta, result: CarouselResult) {
  if (result.slides.length !== ctx.slideCount) {
    console.warn(
      `[generate] carousel "${theme.description}": got ${result.slides.length} slides, expected ${ctx.slideCount}`
    )
  }

  const validation = await runValidation(result.main_caption, theme, {
    slides: result.slides,
    label: 'carousel',
  })

  void ctx.trackTheme(theme, 1)
  pushEntry(
    validation,
    buildPostEntry(theme, {
      caption: applyTextCorrections(result.main_caption, validation),
      post_type: 'carousel',
      slides_json: applySlideCorrections(result.slides, validation.language.corrected_slides),
      carousel_quality_json: validation.quality,
      quality_score_avg: validation.qualityScore,
    })
  )
}
```

### ✓ Step 10 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `processCarouselResult` does not call `validatePost` directly — uses `runValidation`
- [ ] Slide count warning is present

---

## Step 11 — Refactor processReelsResult

> **File:** `features/ai/generation/generate-posts.ts`

```typescript
async function processReelsResult(theme: ThemeWithMeta, result: ReelsResult) {
  const scriptText = [result.hook, ...result.main_points, result.cta].join('\n')

  const validation = await runValidation(scriptText, theme, { label: 'reels' })

  void ctx.trackTheme(theme, 1)
  pushEntry(
    validation,
    buildPostEntry(theme, {
      caption: applyTextCorrections(scriptText, validation),
      post_type: 'reels',
      slides_json: result,
      quality_score_avg: validation.qualityScore,
    })
  )
}
```

Note: reels quality validation fix (language-only) is in Phase 3 Step 15. This step just uses the
shared `runValidation` helper — no behaviour change yet.

### ✓ Step 11 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Script assembled with `join('\n')` not string interpolation

---

## Step 12 — Refactor processSingleResult

> **File:** `features/ai/generation/generate-posts.ts`

```typescript
async function processSingleResult(theme: ThemeWithMeta, captions: string[]) {
  void ctx.trackTheme(theme, captions.length)

  for (const caption of captions) {
    const validation = await runValidation(caption, theme, { label: 'single' })
    pushEntry(
      validation,
      buildPostEntry(theme, {
        caption: applyTextCorrections(caption, validation),
        post_type: 'single',
        slides_json: null,
        quality_score_avg: validation.qualityScore,
      })
    )
  }
}
```

Note: parallelizing this loop is Phase 3 Step 14 — keep sequential here, one change at a time.

### ✓ Step 12 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `processSingleResult` uses `runValidation`
- [ ] All three process functions no longer call `validatePost` directly

---

## Step 13 — Phase 2 Verification

```bash
npx tsc --noEmit
npx vitest run
```

```bash
# validatePost should only be called from runValidation
grep -r "validatePost(" src/features/ai/generation/generate-posts.ts
# Expected: exactly 1 result — inside runValidation
```

- [ ] Generate a single post end-to-end — result identical to pre-Phase 2
- [ ] Generate a carousel — slides correct, corrections applied
- [ ] Generate a reels — script assembled correctly

---

## Phase 3 — Flow Optimizations

---

## Step 14 — Parallelize Caption Validation

> **File:** `features/ai/generation/generate-posts.ts`

Single posts with `count > 1` currently validate captions sequentially. Each validation is
independent. Parallelize with `Promise.all`:

```typescript
async function processSingleResult(theme: ThemeWithMeta, captions: string[]) {
  void ctx.trackTheme(theme, captions.length)

  await Promise.all(
    captions.map(async (caption) => {
      const validation = await runValidation(caption, theme, { label: 'single' })
      pushEntry(
        validation,
        buildPostEntry(theme, {
          caption: applyTextCorrections(caption, validation),
          post_type: 'single',
          slides_json: null,
          quality_score_avg: validation.qualityScore,
        })
      )
    })
  )
}
```

**Impact:** For 3 captions at 4 seconds each: 12s → 4s.

**Note on `generatedPosts.push` (inside `pushEntry`):** `Promise.all` runs concurrently — multiple
pushes may interleave. The order of posts in `generatedPosts` is non-deterministic for
multi-caption themes. This is acceptable — the review queue is not ordered by generation sequence.
If order matters, collect results and push after `Promise.all` resolves:

```typescript
const entries = await Promise.all(
  captions.map(async (caption) => {
    const validation = await runValidation(caption, theme, { label: 'single' })
    return { validation, caption: applyTextCorrections(caption, validation) }
  })
)
entries.forEach(({ validation, caption }) =>
  pushEntry(
    validation,
    buildPostEntry(theme, {
      caption,
      post_type: 'single',
      slides_json: null,
      quality_score_avg: validation.qualityScore,
    })
  )
)
```

Use the second pattern if output order within a theme matters.

### ✓ Step 14 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Generate 3 captions for a single theme — all 3 validated concurrently (check log timestamps)
- [ ] All 3 posts appear in output

---

## Step 15 — Fix Reels Validation

> **File:** `features/ai/generation/generate-posts.ts`

The quality validator was designed for social posts — it checks hook verdict, CTA verdict, sentence
variety, and word count against post-specific rules. A spoken script violates most of these by
design (very short sentences, no formal CTA structure, no hashtag target). Passing it to
`validatePost` produces scores that measure the wrong thing.

Run language validation only for reels. Quality scores are set to defaults:

```typescript
import { validateLanguage } from '@/ai/validation/prompts/validate-language'
import { createDefaultQuality } from '@/ai/validation/content-rules/compute-scores'
import { deriveSlopFromQuality } from '@/ai/validation/content-rules/compute-scores'

async function processReelsResult(theme: ThemeWithMeta, result: ReelsResult) {
  const scriptText = [result.hook, ...result.main_points, result.cta].join('\n')

  // Language validation is meaningful for reels — checks anglicisms, calques, formality
  // Quality validation is not — post-specific metrics do not apply to spoken scripts
  const langResult = await validateLanguage({ text: scriptText }, ctx.client.languageConfig).catch(
    () => ({
      passes: true,
      language_score: 10,
      issues: [],
      corrected_text: null,
      corrected_slides: null,
    })
  )

  const defaultQuality = createDefaultQuality('single')
  const slop = deriveSlopFromQuality(defaultQuality)

  void ctx.trackTheme(theme, 1)

  generatedPosts.push({
    post: buildPostEntry(theme, {
      caption: langResult.corrected_text ?? scriptText,
      post_type: 'reels',
      slides_json: result,
      quality_score_avg: 0, // intentional — not meaningful for reels
    }),
    quality: defaultQuality,
    language: langResult,
    slop,
  })
}
```

The `quality_score_avg: 0` for reels is intentional and should be surfaced in the UI as "N/A" rather
than a score. Add a note in the database row or a separate `validation_skipped` flag if the UI needs
to distinguish this case.

### ✓ Step 15 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Generate a reels — `quality_score_avg` is 0 in the database row
- [ ] Language corrections still applied (corrected_text used if present)
- [ ] No `validatePost` call in `processReelsResult`

---

## Step 16 — Over-Request + Quality Floor for Single Posts

> **Files:** `features/ai/generation/generate-posts.ts`, `features/ai/constants.ts`

Currently, if 3 posts are requested, exactly 3 are generated and all 3 enter the review queue
regardless of quality. Add an over-request multiplier and a quality floor so the agency only sees
posts that meet a minimum standard.

**Add to `features/ai/constants.ts`:**

```typescript
/**
 * Generate this many extra posts per requested count.
 * 1.5 = request 50% more than needed, keep the best ones.
 * Only applies to single posts — carousel and reels generate exactly one result.
 */
export const OVER_REQUEST_MULTIPLIER = 1.5

/**
 * Minimum quality_score_avg for a post to enter the review queue.
 * Posts below this score are discarded before the agency sees them.
 * Set to 0 to disable filtering.
 */
export const QUALITY_FLOOR = 5
```

**In `buildGeneratorInput` in `generate-posts.ts`:**

```typescript
import { OVER_REQUEST_MULTIPLIER, QUALITY_FLOOR } from '@/features/ai/constants'

// For single posts only — over-request to ensure enough quality posts
if (c.postType === 'single') {
  return {
    ...base,
    platform: c.platform,
    count: Math.ceil((theme.count || 1) * OVER_REQUEST_MULTIPLIER),
  }
}
```

**In `processSingleResult` — apply quality floor after validation:**

```typescript
async function processSingleResult(theme: ThemeWithMeta, captions: string[]) {
  void ctx.trackTheme(theme, captions.length)

  const requested = theme.count || 1

  const results = await Promise.all(
    captions.map(async (caption) => {
      const validation = await runValidation(caption, theme, { label: 'single' })
      return {
        validation,
        caption: applyTextCorrections(caption, validation),
        score: validation.qualityScore,
      }
    })
  )

  // Sort by score descending, filter by floor, keep only as many as originally requested
  const qualified = results
    .filter((r) => r.score >= QUALITY_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, requested)

  // Fall back to best available if all fail the floor
  const toKeep =
    qualified.length > 0 ? qualified : results.sort((a, b) => b.score - a.score).slice(0, requested)

  toKeep.forEach(({ validation, caption }) =>
    pushEntry(
      validation,
      buildPostEntry(theme, {
        caption,
        post_type: 'single',
        slides_json: null,
        quality_score_avg: validation.qualityScore,
      })
    )
  )
}
```

**Why the fallback:** if all generated posts score below the floor (possible for weak themes with
poor source material), returning nothing is worse than returning the best available. The fallback
ensures the agency always gets at least one post per theme.

### ✓ Step 16 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `OVER_REQUEST_MULTIPLIER` and `QUALITY_FLOOR` exported from constants
- [ ] For `count: 2`, generator receives `count: 3` (ceil(2 × 1.5))
- [ ] Posts below `QUALITY_FLOOR` do not appear in output when higher-scoring posts exist
- [ ] If all posts are below `QUALITY_FLOOR`, the best available are returned (no empty result)
- [ ] Carousel and reels are unaffected — no over-request logic for those types

---

## Step 17 — Phase 3 Final Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Performance check

- [ ] Generate 3 captions for a single theme — faster than sequential (check log timestamps)
- [ ] Total generation time for 5-theme batch is reduced

### Quality floor check

- [ ] Set `QUALITY_FLOOR = 9` temporarily — confirm most posts are filtered and fallback kicks in
- [ ] Restore `QUALITY_FLOOR = 5`

### Reels check

- [ ] Generate a reels post — `quality_score_avg` is 0
- [ ] Language corrections present if any anglicisms detected
- [ ] No quality validation errors in logs for reels

### Functional end-to-end

- [ ] Single post generation — correct output
- [ ] Carousel generation — slide count correct, corrections applied
- [ ] Reels generation — script assembled, language-only validation
- [ ] Multi-theme batch — batched parallel processing still working

---

## Phase 4 — Naming & Structure

> **Start a fresh Claude Code session for Phase 4.**
> Phases 1-3 must be fully verified first.
> **Rule: pure renames only — no logic changes. `git mv` for file moves, search-and-replace for
> function and type renames. `npx tsc --noEmit` after every individual step.**

---

## Step 18 — Rename Files and Create generators/ Subfolder

### 18a — Create generators/ subfolder and move the class hierarchy

The four generator classes and the factory are a natural group. Moving them into a subfolder makes
the pattern visible at the directory level — a new developer adding a content type opens
`generators/` and sees the pattern immediately.

```bash
mkdir -p src/features/ai/generation/generators

git mv src/features/ai/generation/base-generator.ts \
       src/features/ai/generation/generators/content-generator.ts

git mv src/features/ai/generation/post-generator.ts \
       src/features/ai/generation/generators/post-generator.ts

git mv src/features/ai/generation/carousel-generator.ts \
       src/features/ai/generation/generators/carousel-generator.ts

git mv src/features/ai/generation/reels-generator.ts \
       src/features/ai/generation/generators/reels-generator.ts

git mv src/features/ai/generation/generator-factory.ts \
       src/features/ai/generation/generators/generator-factory.ts
```

Update all imports that referenced the old paths:

```bash
grep -r "ai/generation/base-generator\|ai/generation/post-generator\|ai/generation/carousel-generator\|ai/generation/reels-generator\|ai/generation/generator-factory" \
  src/ --include="*.ts" -l
```

Also update internal relative imports inside the moved files — they now import from `./` siblings
within `generators/` instead of `../`:

```typescript
// In post-generator.ts, carousel-generator.ts, reels-generator.ts, generator-factory.ts:
// Old: import { ContentGenerator } from '../base-generator'   (before rename)
// New: import { ContentGenerator } from './content-generator'
```

### 18b — Rename generate-posts.ts → generation-run.ts

`generate-posts.ts` misleads — it orchestrates generation for all content types (single, carousel,
reels), not just posts. `generation-run.ts` names what it does: it runs a generation batch.

```bash
git mv src/features/ai/generation/generate-posts.ts \
       src/features/ai/generation/generation-run.ts
```

Find and update all consumers:

```bash
grep -r "ai/generation/generate-posts" src/ --include="*.ts" -l
```

Expected consumers: the API route handler at `app/api/ai/generate/route.ts`.

### 18c — Rename prompt-sections.ts → client-profile.ts

`prompt-sections.ts` describes the implementation (it builds sections). `client-profile.ts`
describes the purpose (it assembles the client profile the model reads).

```bash
git mv src/features/ai/generation/prompts/prompt-sections.ts \
       src/features/ai/generation/prompts/client-profile.ts
```

Find and update all consumers:

```bash
grep -r "prompts/prompt-sections" src/ --include="*.ts" -l
```

Expected consumers: `generators/content-generator.ts` (after Step 18a rename).

### ✓ Step 18 Verification

```bash
npx tsc --noEmit   # no errors
```

```bash
# Old paths should return nothing
grep -r "ai/generation/base-generator" src/       # nothing
grep -r "ai/generation/generate-posts" src/       # nothing
grep -r "prompts/prompt-sections" src/            # nothing

# New paths should resolve
ls src/features/ai/generation/generators/
# content-generator.ts  post-generator.ts  carousel-generator.ts
# reels-generator.ts  generator-factory.ts

ls src/features/ai/generation/
# generation-run.ts  generation-criteria.ts  types.ts  generators/  prompts/

ls src/features/ai/generation/prompts/
# client-profile.ts  formality-guidance.ts  source-grounding.ts
```

---

## Step 19 — Rename Functions in generation-run.ts

> **File:** `src/features/ai/generation/generation-run.ts`

Search-and-replace each function name. Do one rename at a time, verify tsc passes, then do the
next. The table shows all names that change and why.

| Old name                | New name                | Reason                                                             |
| ----------------------- | ----------------------- | ------------------------------------------------------------------ |
| `generatePosts`         | `runGenerationBatch`    | the exported function runs a batch, not just posts                 |
| `processTheme`          | `generateForTheme`      | "process" is vague — it generates content for a theme              |
| `buildGeneratorInput`   | `buildThemeInput`       | builds input from a theme, not a generic generator input           |
| `buildSourceContext`    | `buildGroundingContext` | matches "source grounding" naming used everywhere                  |
| `buildPostEntry`        | `buildDraftRecord`      | it builds a database record for a draft post                       |
| `pushEntry`             | `collectResult`         | "push" is an implementation detail, "collect" describes the intent |
| `runValidation`         | `validateContent`       | what it does — validates content                                   |
| `processCarouselResult` | `collectCarousel`       | parallel to collectResult, consistent pattern                      |
| `processReelsResult`    | `collectReels`          | consistent                                                         |
| `processSingleResult`   | `collectSinglePosts`    | plural because it handles multiple captions                        |

After renaming `generatePosts` → `runGenerationBatch`, update the import in the API route:

```typescript
// app/api/ai/generate/route.ts
// Old:
import { generatePosts } from '@/ai/generation/generate-posts'
// New:
import { runGenerationBatch } from '@/ai/generation/generation-run'
```

### ✓ Step 19 Verification

```bash
npx tsc --noEmit
```

```bash
# Old function names should return nothing
grep -r "generatePosts\|processTheme\|buildGeneratorInput\|buildSourceContext\|buildPostEntry\|pushEntry\|runValidation\|processCarouselResult\|processReelsResult\|processSingleResult" \
  src/features/ai/generation/ --include="*.ts"
# Expected: nothing
```

- [ ] API route imports `runGenerationBatch`
- [ ] Generate a single post end-to-end — output identical to before

---

## Step 20 — Rename Functions in content-generator.ts and Prompt Builders

### 20a — content-generator.ts (was base-generator.ts)

| Old name                   | New name         | Reason                                                             |
| -------------------------- | ---------------- | ------------------------------------------------------------------ |
| `buildTypeSpecificMessage` | `buildDirective` | it builds the model's content-type directive — shorter and precise |
| `getplatform`              | `getPlatform`    | capitalise P — consistent with TypeScript conventions              |
| `callApi`                  | `callAnthropic`  | specific — there is only one API being called                      |

Update all subclass overrides (`post-generator.ts`, `carousel-generator.ts`, `reels-generator.ts`)
to use the new method names. Find them with:

```bash
grep -r "buildTypeSpecificMessage\|getplatform\|callApi" src/features/ai/generation/ --include="*.ts"
```

### 20b — client-profile.ts (was prompt-sections.ts)

| Old name                           | New name                    | Reason                                                                              |
| ---------------------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| `buildAngleDifferentiationSection` | `buildAngleVariationPrompt` | "prompt" consistent with other builders, "variation" clearer than "differentiation" |
| `buildLanguageRulesSection`        | `buildLanguagePrompt`       | consistent pattern                                                                  |
| `buildBrandVoiceSection`           | `buildBrandVoicePrompt`     | consistent pattern                                                                  |

### 20c — source-grounding.ts

| Old name                      | New name               | Reason                                         |
| ----------------------------- | ---------------------- | ---------------------------------------------- |
| `buildSourceGroundingSection` | `buildGroundingPrompt` | consistent with other prompt builders, shorter |

Update all call sites for all renamed functions:

```bash
grep -r "buildAngleDifferentiationSection\|buildLanguageRulesSection\|buildBrandVoiceSection\|buildSourceGroundingSection" \
  src/ --include="*.ts" -l
```

### ✓ Step 20 Verification

```bash
npx tsc --noEmit
```

```bash
grep -r "buildAngleDifferentiationSection\|buildLanguageRulesSection\|buildBrandVoiceSection\|buildSourceGroundingSection" src/
# Expected: nothing

grep -r "buildTypeSpecificMessage\|getplatform\b\|\.callApi" src/features/ai/generation/
# Expected: nothing
```

---

## Step 21 — Rename Types

> **Files:** `features/ai/generation/types.ts` and all consumers.

| Old name                | New name               | Reason                                                          |
| ----------------------- | ---------------------- | --------------------------------------------------------------- |
| `GeneratePostsContext`  | `GenerationRunContext` | context for a full generation run across all content types      |
| `ThemeWithMeta`         | `EnrichedTheme`        | "with meta" is vague — "enriched" signals it has been augmented |
| `BaseGenerateInput`     | `GenerationInput`      | "Base" is an OOP term that leaks implementation detail          |
| `GeneratedPostEntry`    | `GenerationResult`     | one result from the generation pipeline                         |
| `GeneratePostInput`     | `SinglePostInput`      | matches `CarouselInput`, `ReelsInput` for consistency           |
| `GenerateCarouselInput` | `CarouselInput`        | removes redundant "Generate" prefix                             |

**Do not rename:**

- `CarouselResult` — matches what the LLM returns
- `ReelsResult` — matches what the LLM returns
- `CarouselSlide` — domain term, widely understood
- `Theme` — short, clear, used as-is

Find all consumers for each renamed type:

```bash
grep -r "GeneratePostsContext\|ThemeWithMeta\|BaseGenerateInput\|GeneratedPostEntry\|GeneratePostInput\|GenerateCarouselInput" \
  src/ --include="*.ts" -l
```

Update `types.ts` first, then update all consumers. TypeScript errors will show every missed
reference.

### ✓ Step 21 Verification

```bash
npx tsc --noEmit
```

```bash
grep -r "GeneratePostsContext\|ThemeWithMeta\|BaseGenerateInput\|GeneratedPostEntry\|GeneratePostInput\|GenerateCarouselInput" \
  src/ --include="*.ts"
# Expected: nothing — old names fully replaced
```

---

## Step 22 — Phase 4 Final Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Structure audit

```bash
ls src/features/ai/generation/
# generation-run.ts  generation-criteria.ts  types.ts  generators/  prompts/

ls src/features/ai/generation/generators/
# content-generator.ts  post-generator.ts  carousel-generator.ts
# reels-generator.ts  generator-factory.ts

ls src/features/ai/generation/prompts/
# client-profile.ts  formality-guidance.ts  source-grounding.ts
```

### Name audit — old names should be gone

```bash
# File names
grep -r "base-generator\|generate-posts\|prompt-sections" src/   # nothing

# Function names
grep -r "generatePosts\b\|processTheme\b\|buildPostEntry\b\|pushEntry\b\|runValidation\b" src/   # nothing
grep -r "buildAngleDifferentiationSection\|buildSourceGroundingSection" src/   # nothing
grep -r "buildTypeSpecificMessage\|getplatform\b" src/   # nothing

# Type names
grep -r "GeneratePostsContext\|ThemeWithMeta\|BaseGenerateInput\|GeneratedPostEntry" src/   # nothing
grep -r "GeneratePostInput\b\|GenerateCarouselInput\b" src/   # nothing
```

### Functional verification

- [ ] Generate a single post — output identical to pre-Phase 4
- [ ] Generate a carousel — output identical
- [ ] Generate a reels — output identical
- [ ] API route calls `runGenerationBatch` (check route file)
- [ ] `GenerationRunContext` used in route handler (check type annotations)

---

## Phase 5 — Type Simplification

> **Start a fresh Claude Code session for Phase 5.**
> Phase 4 must be fully verified first.
> All changes are in `features/ai/generation/types.ts` and their consumers.
> **Rule: change one type per step. `npx tsc --noEmit` after each.**

The goal is fewer types carrying the same information. Types that exist primarily to satisfy the
type checker — not to communicate intent — add cognitive load without adding safety.

---

## Step 23 — Define DraftPost

> **File:** `features/ai/generation/types.ts`

`GenerationResult.post` is currently `Record<string, unknown>` — untyped. `buildDraftRecord`
constructs ~14 fields and TypeScript cannot catch a missing `client_id`, a wrong `status` value,
or a misspelled field at compile time.

Add `DraftPost` and update `GenerationResult`:

```typescript
export interface DraftPost {
  id: string
  client_id: string
  platform: string
  post_type: 'single' | 'carousel' | 'reels'
  caption: string
  status: 'draft'
  priority: boolean
  topic_summary: string
  slides_json: unknown // JSONB — typed at point of use, not here
  carousel_quality_json: unknown
  quality_score_avg: number
  source_url: string | null
  source_title: string | null
  source_type: 'rss' | 'website' | 'file' | null
  source_excerpt: string | null
  pillar: string | null
  created_at: string
}

export interface GenerationResult {
  post: DraftPost // was Record<string, unknown>
  quality: QualityResult
  language: LanguageValidationResult
  slop: SlopDetection
  sourceGrounding?: SourceGroundingResult
}
```

Update `buildDraftRecord` in `generation-run.ts` to return `DraftPost`:

```typescript
function buildDraftRecord(
  theme: Theme,
  overrides: {
    caption: string
    post_type: 'single' | 'carousel' | 'reels'
    slides_json: unknown
    carousel_quality_json?: unknown
    quality_score_avg: number
  }
): DraftPost {
  return {
    id: randomUUID(),
    client_id: ctx.client.id,
    platform: ctx.platform,
    status: 'draft',
    priority: theme.isPriority ?? false,
    topic_summary: theme.description,
    source_url: theme.sourceUrl ?? null,
    source_title: theme.sourceTitle ?? null,
    source_type: theme.sourceType ?? null,
    source_excerpt: theme.sourceExcerpt ?? null,
    pillar: theme.pillar ?? null,
    carousel_quality_json: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}
```

**Why `slides_json: unknown`:** the database column is JSONB. TypeScript's union
`CarouselSlide[] | ReelsResult | null` only holds at construction time — after a DB round-trip the
type is `Json` or `unknown` anyway. Keep the construction-time type simple and let consumers cast
when they need the specific shape.

### ✓ Step 23 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `buildDraftRecord` return type is `DraftPost`
- [ ] `GenerationResult.post` is `DraftPost`
- [ ] `grep -r "Record<string, unknown>" src/features/ai/generation/` — nothing

---

## Step 24 — Collapse Generator Input Hierarchy

> **File:** `features/ai/generation/types.ts`

The current hierarchy has three types for three extra fields:

```typescript
// Three types, three extra fields total
interface GenerationInput    { client, theme, targetPillar, groundingText, ... }
interface SinglePostInput extends GenerationInput { platform, count }
interface CarouselInput   extends GenerationInput { slideCount }
// ReelsInput removed in Phase 1 — used GenerationInput directly
```

The generators are already type-safe by class — `PostGenerator` only ever receives `SinglePostInput`,
`CarouselGenerator` only ever receives `CarouselInput`. The input type hierarchy enforces what the
class hierarchy already enforces. The extra interfaces add friction without adding safety.

**Collapse to one interface with optional fields:**

```typescript
export interface GenerationInput {
  client: ClientContext
  theme: string
  targetPillar?: string
  groundingText?: string
  sourceUrl?: string | null
  requireSourceGrounding?: boolean
  similarPastThemes?: string[]
  // Post-type-specific — present only when the generator needs them
  platform?: string // single posts
  count?: number // single posts
  slideCount?: number // carousel
}
```

**Update `buildThemeInput` in `generation-run.ts`** — add runtime guards for required fields that
TypeScript can no longer enforce at the call site:

```typescript
function buildThemeInput(c: GenerationRunContext, theme: Theme): GenerationInput {
  const base: GenerationInput = {
    client: c.client,
    theme: theme.description,
    targetPillar: theme.pillar,
    groundingText: theme.groundingText,
    sourceUrl: theme.sourceUrl,
    requireSourceGrounding: c.requireSourceGrounding || !!theme.groundingText,
    similarPastThemes: theme.similarPastThemes,
  }

  if (c.postType === 'single') {
    if (!c.platform) throw new Error('[buildThemeInput] platform required for single posts')
    return { ...base, platform: c.platform, count: theme.count || 1 }
  }
  if (c.postType === 'carousel') {
    return { ...base, slideCount: c.slideCount }
  }
  return base // reels
}
```

**Update `GeneratorFactory.create`** — the factory still maps post type to generator class. The
type parameter on `ContentGenerator` becomes `GenerationInput` everywhere:

```typescript
static create(postType: PostType): ContentGenerator<GenerationInput, unknown>
```

**Update generator class declarations:**

```typescript
// Was: class PostGenerator extends ContentGenerator<SinglePostInput, string[]>
class PostGenerator extends ContentGenerator<GenerationInput, string[]>

// Was: class CarouselGenerator extends ContentGenerator<CarouselInput, CarouselResult>
class CarouselGenerator extends ContentGenerator<GenerationInput, CarouselResult>

// Was: class ReelsGenerator extends ContentGenerator<GenerationInput, ReelsResult>
class ReelsGenerator extends ContentGenerator<GenerationInput, ReelsResult>   // unchanged
```

Inside each generator's `buildDirective`, access fields directly — they are present when the
generator is invoked correctly:

```typescript
// PostGenerator.buildDirective — reads optional fields confidently
protected buildDirective(input: GenerationInput): string {
  return `Write ${input.count ?? 1} post(s) for theme '${input.theme}'...`
}

// CarouselGenerator.buildDirective
protected buildDirective(input: GenerationInput): string {
  return `You MUST return exactly ${input.slideCount} slides...`
}
```

**Remove `SinglePostInput` and `CarouselInput` from `types.ts`** — they are no longer referenced.

### ✓ Step 24 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `SinglePostInput`, `CarouselInput` not in codebase
- [ ] `grep -r "SinglePostInput\|CarouselInput" src/` — nothing
- [ ] Generate a single post, carousel, and reels — all work correctly

---

## Step 25 — Flatten GenerationRunContext

> **File:** `features/ai/generation/types.ts`

The Phase 5 proposal from the previous analysis suggested a discriminated union. After review, it
adds three interfaces for one field used in one place. Keep the flat interface, make `slideCount`
optional:

```typescript
export interface GenerationRunContext {
  client: ClientContext
  platform: string
  postType: PostType
  slideCount?: number // optional — only meaningful for carousel
  requireSourceGrounding: boolean
  themes: Theme[]
  priorityPosts: PriorityPost[]
  trackTheme: (theme: Theme, postCount: number) => Promise<void>
}
```

In `collectCarousel`, use a safe fallback if `slideCount` is somehow absent:

```typescript
async function collectCarousel(theme: Theme, result: CarouselResult) {
  const expectedSlides = ctx.slideCount ?? result.slides.length
  if (result.slides.length !== expectedSlides) {
    console.warn(
      `[generate] carousel "${theme.description}": got ${result.slides.length} slides, expected ${expectedSlides}`
    )
  }
  // ...
}
```

The route handler passes `slideCount` when `postType === 'carousel'` — this is already enforced
by the UI that sends the request. No discriminated union needed for one optional field.

### ✓ Step 25 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `GenerationRunContext` is a single flat interface
- [ ] `slideCount` is optional
- [ ] Carousel generation still warns on slide count mismatch

---

## Step 26 — Merge Theme and EnrichedTheme

> **File:** `features/ai/generation/types.ts`

After Phase 4's naming, `EnrichedTheme` extends `Theme` with enrichment fields. The distinction
exists because themes arrive from the API as `Theme[]` and are enriched before processing. But
having two types means a conversion that TypeScript tracks but the runtime does not care about.

**Merge into one `Theme` with optional enrichment fields:**

```typescript
export interface Theme {
  // From API input
  description: string
  count: number
  pillar?: string
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceType?: 'rss' | 'website' | 'file'
  sourceExcerpt?: string
  sourceFullText?: string
  // Set for priority posts
  isPriority?: boolean
  brief?: string
  targetDate?: string
  // Populated during enrichment — undefined before runGenerationBatch enriches themes
  similarPastThemes?: string[]
  groundingText?: string // resolved from sourceFullText ?? sourceExcerpt
}
```

**Update `runGenerationBatch` in `generation-run.ts`** — the enrichment step maps `Theme[]` to
`Theme[]`, populating the optional enrichment fields. No type conversion needed:

```typescript
const allThemes: Theme[] = [
  ...(ctx.priorityPosts ?? []).map((pp) => ({
    description: pp.title,
    count: 1,
    isPriority: true as const,
    brief: pp.brief,
    targetDate: pp.targetDate,
  })),
  ...(ctx.themes ?? []),
].map((theme) => ({
  ...theme,
  groundingText: theme.sourceFullText || theme.sourceExcerpt || undefined,
  similarPastThemes: ctx.client.postHistory
    .filter(
      (topic) =>
        Deduplicator.ngramSimilarity(theme.description, topic, ctx.client.languageConfig.language) >
        ANGLE_SIMILARITY_THRESHOLD
    )
    .slice(0, 3),
}))
```

**Remove `EnrichedTheme` from `types.ts`** — all references now use `Theme`.

**Update `GenerationRunContext.trackTheme`** — was `(theme: EnrichedTheme, ...)`, now `(theme: Theme, ...)`.

### ✓ Step 26 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `EnrichedTheme` not in codebase
- [ ] `grep -r "EnrichedTheme" src/` — nothing
- [ ] `theme.groundingText` and `theme.similarPastThemes` used correctly in `buildThemeInput`

---

## Step 27 — Audit and Collapse QualityResult Discriminated Union

> **File:** `features/ai/validation/types/scoring.ts`

`QualityResult` is a discriminated union where both variants have identical fields:

```typescript
interface SingleQualityResult extends QualityBase {
  kind: 'single'
}
interface CarouselQualityResult extends QualityBase {
  kind: 'carousel'
}
type QualityResult = SingleQualityResult | CarouselQualityResult
```

Before changing anything, audit whether `kind` is ever narrowed anywhere:

```bash
grep -r "quality\.kind\|\.kind === 'carousel'\|\.kind === 'single'\|QualityResult\b" \
  src/ --include="*.ts"
```

**If `kind` is narrowed in application code:** keep the union. The discriminant is doing real work.

**If `kind` is never narrowed (only set and stored):** collapse to one type:

```typescript
export interface QualityResult extends QualityBase {
  kind: 'single' | 'carousel' // kept for potential UI display use
}
```

Update `createDefaultQuality` in `compute-scores.ts`:

```typescript
export function createDefaultQuality(kind: 'single' | 'carousel'): QualityResult {
  return { ...defaultBase, kind }
}
```

Remove `SingleQualityResult` and `CarouselQualityResult` if they are no longer needed as distinct
types.

**If the grep shows `kind` used for display only (e.g. in a UI component):** keep the field,
remove the union — use the flat interface with `kind: 'single' | 'carousel'`.

### ✓ Step 27 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] Decision documented in a comment in `scoring.ts`: either "kept because narrowed at X" or
      "collapsed — kind used for display only"
- [ ] `SingleQualityResult` and `CarouselQualityResult` removed if union collapsed

---

## Step 28 — Remove chosen_structure/chosen_opener from CarouselResult

> **Files:** `features/ai/generation/types.ts`,
> `features/ai/generation/generators/carousel-generator.ts`

The carousel prompt asks the model to return `chosen_structure` and `chosen_opener` in the JSON
response, but `CarouselResult` does not include them — `parseJsonResponse` silently drops them.
Either store them or stop asking for them.

**Remove from the prompt (recommended):**

In `carousel-generator.ts` `buildDirective`, remove these two lines from the JSON format:

```typescript
// Remove:
"chosen_structure": string,
"chosen_opener": string,
```

The model still chooses a structure and opener — it just does not need to declare the choice in
the output. This is consistent with how `PostGenerator` handles it: the planning step is stripped
from the output in `parseResponse`, not stored.

`CarouselResult` stays as-is — no `chosen_structure` or `chosen_opener` fields needed.

**Why not store them:** they are debugging information, not application data. If you want to audit
which structures the model picks, add temporary logging in `collectCarousel` rather than storing
it permanently in every carousel record.

### ✓ Step 28 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `CarouselResult` has no `chosen_structure` or `chosen_opener` fields
- [ ] The carousel prompt JSON format does not include those keys
- [ ] Generate a carousel — `parseJsonResponse` returns the correct shape

---

## Step 29 — Import PostType from Canonical Location

> **Files:** `features/ai/generation/types.ts`,
> `features/ai/generation/generators/generator-factory.ts`

`PostType` is defined as an inline union in `GenerationRunContext` and separately as
`export type PostType` in `types/api.ts`. Two definitions of the same thing.

```typescript
// In types.ts — remove the inline union, import instead:
import type { PostType } from '@/types/api'

export interface GenerationRunContext {
  postType: PostType // imported canonical type
  // ...
}
```

Confirm `types/api.ts` is the right canonical location. If `PostType` is not exported from there,
check `types/index.ts`. The point is one definition, imported everywhere.

```bash
grep -r "PostType" src/ --include="*.ts"
# Expected: one definition, multiple imports
```

### ✓ Step 29 Verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `PostType` defined exactly once
- [ ] `grep -rn "^export type PostType\|^type PostType" src/` — exactly 1 result

---

## Step 30 — Phase 5 Final Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Type audit

```bash
# Removed types — should not appear as definitions
grep -rn "^export interface SinglePostInput\|^export interface CarouselInput" src/   # nothing
grep -rn "^export interface EnrichedTheme" src/   # nothing
grep -rn "^export interface SingleQualityResult\|^export interface CarouselQualityResult" src/
# nothing if union was collapsed in Step 27

# Canonical definitions — should appear exactly once
grep -rn "^export interface DraftPost" src/           # 1 result — types.ts
grep -rn "^export interface GenerationInput" src/     # 1 result — types.ts
grep -rn "^export interface GenerationRunContext" src/ # 1 result — types.ts
grep -rn "^export interface Theme\b" src/              # 1 result — types.ts
grep -rn "^export type PostType" src/                  # 1 result — types/api.ts

# Record<string, unknown> should be gone from generation
grep -r "Record<string, unknown>" src/features/ai/generation/   # nothing
```

### Functional verification

- [ ] Generate a single post — `GenerationResult.post` is typed as `DraftPost`
- [ ] Generate a carousel — correct slide count, `buildDraftRecord` receives typed overrides
- [ ] Generate a reels — language-only validation, `quality_score_avg: 0`
- [ ] Route handler constructs `GenerationRunContext` without TypeScript errors
- [ ] `trackTheme` receives `Theme` not `EnrichedTheme`

---

## Complete Change Summary

### Phase 1 — Base Class Refactor

| Concern                    | Before                                        | After                                |
| -------------------------- | --------------------------------------------- | ------------------------------------ |
| Shared prompt builders     | Imported and called in all 3 generators       | Base class only                      |
| `buildUserMessage`         | Each generator implements fully               | Base class concrete method           |
| `buildTypeSpecificMessage` | Did not exist                                 | Abstract — each generator implements |
| `getplatform()`            | Hardcoded `'Instagram'` in carousel/reels     | Overridable hook                     |
| `GenerateReelsInput`       | Empty interface extending `BaseGenerateInput` | Removed                              |
| `post-generator.ts`        | ~48 lines                                     | ~22 lines                            |
| `carousel-generator.ts`    | ~90 lines                                     | ~57 lines                            |
| `reels-generator.ts`       | ~67 lines                                     | ~37 lines                            |

### Phase 2 — generate-posts.ts Cleanup

| Concern             | Before                                   | After                           |
| ------------------- | ---------------------------------------- | ------------------------------- |
| `validatePost` call | Repeated in all 3 process functions      | `validateContent` helper — once |
| Process functions   | Mix of validation setup + business logic | Business logic only             |

### Phase 3 — Flow Optimizations

| Concern            | Before                             | After                                 |
| ------------------ | ---------------------------------- | ------------------------------------- |
| Caption validation | Sequential — 3 captions × 4s = 12s | Parallel — 4s                         |
| Reels validation   | Post metrics on a script           | Language-only — correct metrics       |
| Quality floor      | All posts enter review queue       | Posts below `QUALITY_FLOOR` discarded |
| Over-request       | Exact count generated              | 1.5× generated, best kept             |

### Phase 4 — Naming & Structure

| Concern              | Before                   | After                                       |
| -------------------- | ------------------------ | ------------------------------------------- |
| Generator files      | Flat in `generation/`    | Grouped in `generation/generators/`         |
| `base-generator.ts`  | Generic name             | `content-generator.ts` — matches class name |
| `generate-posts.ts`  | Implies posts only       | `generation-run.ts` — all content types     |
| `prompt-sections.ts` | Implementation detail    | `client-profile.ts` — describes purpose     |
| All function names   | Mixed intent/impl naming | Intent-based — see rename table             |
| All type names       | Prefixed with "Generate" | Concise — see rename table                  |

### Phase 5 — Type Simplification

| Concern                   | Before                                   | After                                                |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `GenerationResult.post`   | `Record<string, unknown>`                | `DraftPost` — fully typed                            |
| `slides_json` type        | `CarouselSlide[] \| ReelsResult \| null` | `unknown` — matches DB reality                       |
| Generator input types     | 3-level hierarchy for 3 extra fields     | `GenerationInput` flat — one type                    |
| `GenerationRunContext`    | Inline union for `postType`              | `PostType` imported from canonical source            |
| `slideCount`              | Would need discriminated union           | Optional field — simpler, same safety                |
| `Theme` / `EnrichedTheme` | Two types, implicit conversion           | One `Theme` with optional enrichment fields          |
| `QualityResult`           | Discriminated union (if `kind` unused)   | Flat interface with `kind` field                     |
| `chosen_structure/opener` | Requested by prompt, silently dropped    | Removed from prompt — never wasted tokens            |
| `PostType`                | Defined in two places                    | One definition in `types/api.ts`, imported elsewhere |

---

_PostFlow — Generation Flow Refactoring & Optimization_
_Implement phase by phase. `npx tsc --noEmit` after every step._
