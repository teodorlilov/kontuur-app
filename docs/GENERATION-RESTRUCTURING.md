# Generation Feature — Complete Restructure & Optimization Plan

> **Implementation document for Claude Code.**
> Follow the build order exactly. Run `npx tsc --noEmit` after every individual step before proceeding.
> **Rule: one concern per step. Never combine a move with a logic change in the same step.**

---

## Context

This plan covers three phases:

**Phase 0 — Prompt infrastructure cleanup.** `prompt-sections.ts` mixes three concerns: a 200-line `FORMALITY_GUIDANCE` constant that buries the builders, a validation function (`buildLanguageValidationRules`) that belongs with validation not generation, and the shared prompt builders themselves. Clean this before building on top of it.

**Phase 1 — OOP restructure.** Post, carousel, and reels share an identical pattern (build system prompt → build user message → call API → parse result) duplicated across three files. `generate-reels.ts` additionally bypasses `buildStaticSystemPrompt()` and `buildClientProfile()`, generating with fewer guardrails than post/carousel. The `generate-posts.ts` service lives in `services/` but belongs with the generation feature.

**Phase 2 — Targeted optimizations.** After the restructure is stable, address duplication, correctness issues, and performance inside `generate-posts.ts` and the prompt builders.

---

## OOP Principles Applied

| Principle | Where |
|---|---|
| **Encapsulation** | `WritingContext` carries all language config. `ContentGenerator` hides API call, caching, error handling. `buildLanguageRulesSection` unexported after restructure. |
| **Abstraction** | `ContentGenerator<TInput, TOutput>` abstract class. `generate(input)` is the only public method. Callers never know which type they hold. |
| **Inheritance** | All generators inherit `generate()`, `callApi()`, shared user message sections. Only `buildTypeSpecificMessage()` and `parseResponse()` differ per subclass. |
| **Polymorphism** | `GeneratorFactory.create(postType)` returns `ContentGenerator`. The service calls the same interface on all three types. Adding a new type = one class + one factory case. |

---

## Target Structure

```
features/ai/generation/
├── types.ts                    # All input/output interfaces + BaseGenerateInput
├── writing-context.ts          # WritingContext class (language + formality + brand config)
├── base-generator.ts           # Abstract ContentGenerator — shared infrastructure
├── post-generator.ts           # PostGenerator extends ContentGenerator
├── carousel-generator.ts       # CarouselGenerator extends ContentGenerator
├── reels-generator.ts          # ReelsGenerator extends ContentGenerator (now aligned)
├── generator-factory.ts        # GeneratorFactory.create(postType) → ContentGenerator
├── generate-posts.ts           # Orchestration service (MOVED from services/)
└── prompts/                    # MOVED from features/ai/prompts/generation/
    ├── formality-guidance.ts   # FORMALITY_GUIDANCE constant (extracted from prompt-sections)
    ├── prompt-sections.ts      # Builders only — ~160 lines, no dead fields, no constants
    └── source-grounding.ts     # Unchanged

features/ai/prompts/validation/
├── validate-language.ts        # Updated import path
└── language-validation-rules.ts  # MOVED from prompt-sections.ts

lib/content-rules/
├── generation-criteria.ts      # Unchanged
└── evaluation-criteria.ts      # Unchanged
```

**Deleted after this plan:**
- `features/ai/prompts/generation/` — entire directory
- `features/ai/services/generate-posts.ts` — moved to `generation/`

---

## Build Order

```
── PHASE 0: Prompt Infrastructure Cleanup ──────────────────────────────────
Step 0a → Remove dead fields from FORMALITY_GUIDANCE
Step 0b → Extract FORMALITY_GUIDANCE → formality-guidance.ts
Step 0c → Move buildLanguageValidationRules → language-validation-rules.ts
Step 0d → Move generation prompts → features/ai/generation/prompts/

── PHASE 1: OOP Restructure ────────────────────────────────────────────────
Step 1  → types.ts
Step 2  → writing-context.ts (extended with language config fields)
Step 3  → base-generator.ts (shared infrastructure + shared user message sections)
Step 4  → post-generator.ts
Step 5  → carousel-generator.ts
Step 6  → reels-generator.ts (aligned + reels source section converged)
Step 7  → generator-factory.ts
Step 8  → Move generate-posts.ts
Step 9  → Update prompt-sections.ts (unexport internals, fix SPECIFICITY, consolidate WritingContext)
Step 10 → Update import paths
Step 11 → Delete old files
Step 12 → Phase 1 Verification

── PHASE 2: Optimizations ──────────────────────────────────────────────────
Step 13 → Extract shared helpers in generate-posts.ts
Step 14 → Route handler hardening
Step 15 → Parallelize theme processing
Step 16 → Cache buildStaticSystemPrompt at module level
Step 17 → Phase 2 Verification
```

**Phase 0 must be verified before Phase 1. Phase 1 must be verified before Phase 2.**

---

## Phase 0 — Prompt Infrastructure Cleanup

> All steps are move/delete only — no logic changes, no prompt content changes.

---

## Step 0a — Remove Dead Fields from FORMALITY_GUIDANCE

> **File:** `features/ai/prompts/generation/prompt-sections.ts`

`structureNote` and `brandVoiceNote` are defined with content in all three formality mode objects but are never read by any function anywhere in the codebase. They are 12 lines of maintained template strings that affect nothing.

Remove from the `FormalityGuidance` interface:
```typescript
// DELETE both:
structureNote: string
brandVoiceNote: string
```

Remove the corresponding properties from the `formal`, `casual`, and `neutral` mode objects.

Also verify `selfCheckLine` — if `buildSelfCheckSection()` was removed during prior prompt optimization work, `selfCheckLine` may also be dead. Confirm by checking all callers of `getFormalityGuidance()`. Remove any fields that are read from nowhere.

### ✓ Step 0a Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep "structureNote\|brandVoiceNote" src/` — returns nothing

---

## Step 0b — Extract FORMALITY_GUIDANCE

> **Create:** `features/ai/prompts/generation/formality-guidance.ts`
> **Trim:** `features/ai/prompts/generation/prompt-sections.ts`

The `FORMALITY_GUIDANCE` constant is ~200 lines sitting in the middle of `prompt-sections.ts`. It makes the file unscannable — a developer looking for `buildClientProfile` scrolls past a wall of register examples.

**New file `formality-guidance.ts`:**
```typescript
/**
 * Register rules and examples for each formality mode.
 * Consumed only by buildLanguageRulesSection() in prompt-sections.ts.
 * Separated to keep prompt-sections.ts scannable — builders only, no large constants.
 */
export interface FormalityGuidance {
  registerRules: string
  selfCheckLine: string       // only surviving fields after Step 0a cleanup
  bulgarianExamples: string
  generalExamples: string
}

export const FORMALITY_GUIDANCE: Record<string, FormalityGuidance> = {
  formal:  { ... },   // identical content — no changes
  casual:  { ... },
  neutral: { ... },
}

export function getFormalityGuidance(formality: string): FormalityGuidance {
  return FORMALITY_GUIDANCE[formality] ?? FORMALITY_GUIDANCE['neutral']!
}
```

**Changes to `prompt-sections.ts`:**
- Remove `FormalityGuidance` interface, `FORMALITY_GUIDANCE` constant, `DEFAULT_FORMALITY_GUIDANCE`, `getFormalityGuidance()` function
- Add at top: `import { getFormalityGuidance } from './formality-guidance'`
- Everything else identical

### ✓ Step 0b Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `prompt-sections.ts` does not contain `FORMALITY_GUIDANCE`
- [ ] `formality-guidance.ts` exports the constant, interface, and helper

---

## Step 0c — Move buildLanguageValidationRules

> **Create:** `features/ai/prompts/validation/language-validation-rules.ts`
> **Trim:** `features/ai/prompts/generation/prompt-sections.ts`
> **Update:** `features/ai/prompts/validation/validate-language.ts`

`buildLanguageValidationRules` builds instructions for the language *validator* — a completely different consumer from the generation prompts. It ended up in `prompt-sections.ts` because it shares language knowledge, but its domain is validation not generation.

**New file `language-validation-rules.ts`:**
```typescript
/**
 * Builds language-specific validation rules for the language validator.
 * VALIDATION concern — not generation.
 * Consumer: validate-language.ts
 */
export function buildLanguageValidationRules(
  language: string,
  bannedAnglicisms?: string[],
  bannedCalques?: string[],
  formality?: string
): string { ... }   // identical body — no changes
```

Remove `buildLanguageValidationRules` from `prompt-sections.ts`.

Update `validate-language.ts` import:
```typescript
// Old:
import { buildLanguageValidationRules } from '../generation/prompt-sections'
// New:
import { buildLanguageValidationRules } from './language-validation-rules'
```

### ✓ Step 0c Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `buildLanguageValidationRules` not present in `prompt-sections.ts`
- [ ] `validate-language.ts` imports from `./language-validation-rules`

---

## Step 0d — Move Generation Prompts

> **Move:** `features/ai/prompts/generation/` → `features/ai/generation/prompts/`

```bash
mkdir -p src/features/ai/generation/prompts

git mv src/features/ai/prompts/generation/formality-guidance.ts \
       src/features/ai/generation/prompts/formality-guidance.ts

git mv src/features/ai/prompts/generation/prompt-sections.ts \
       src/features/ai/generation/prompts/prompt-sections.ts

git mv src/features/ai/prompts/generation/source-grounding.ts \
       src/features/ai/generation/prompts/source-grounding.ts

rmdir src/features/ai/prompts/generation/
```

Find all affected files:
```bash
grep -r "features/ai/prompts/generation" src/ --include="*.ts" -l
```

| Old import | New import |
|---|---|
| `@/ai/prompts/generation/prompt-sections` | `@/ai/generation/prompts/prompt-sections` |
| `@/ai/prompts/generation/source-grounding` | `@/ai/generation/prompts/source-grounding` |

Internal relative imports within the moved files (`./formality-guidance`) remain correct automatically.

### ✓ Step 0d Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `features/ai/prompts/generation/` does not exist
- [ ] `features/ai/generation/prompts/` contains exactly: `formality-guidance.ts`, `prompt-sections.ts`, `source-grounding.ts`
- [ ] `grep -r "ai/prompts/generation" src/` — returns nothing

### ✓ Phase 0 Complete Verification
- [ ] `prompt-sections.ts` is ~170 lines — only builder functions, no large constants, no dead fields
- [ ] `formality-guidance.ts` — FORMALITY_GUIDANCE and helpers only
- [ ] `language-validation-rules.ts` — in validation folder, correct domain
- [ ] All tests pass

---

## Phase 1 — OOP Restructure

---

## Step 1 — types.ts

> **File:** `features/ai/generation/types.ts`

All input/output interfaces in one place. Generators import types here — not from each other.

```typescript
import type { WeightedPillar } from '@/lib/clients/content-pillars'

// Shared base — all fields common to every content type
export interface BaseGenerateInput {
  clientName: string
  niche: string
  theme: string
  tone: string
  targetAudience: string
  language: string
  languageFormality: string
  avoidTopics: string
  clientTestimonialVoice: string
  contentPillars: WeightedPillar[]
  targetPillar?: string
  bannedAnglicisms: string[]
  bannedCalques: string[]
  nativeCTAPhrases?: string
  sourceExcerpt?: string
  sourceUrl?: string | null
  requireSourceGrounding?: boolean
  similarPastThemes?: string[]
  isHealthClient?: boolean
}

// Single post
export interface GeneratePostInput extends BaseGenerateInput {
  platform: string
  nativeCTAPhrases: string    // required for post
  postHistory: string[]
  count: number
}

// Carousel
export interface CarouselSlide {
  slide_number: number
  slide_role: 'cover' | 'content' | 'value' | 'cta'
  headline: string
  body: string
  cta_text: string | null
  design_note: string
}

export interface CarouselResult {
  main_caption: string
  slides: CarouselSlide[]
}

export interface GenerateCarouselInput extends BaseGenerateInput {
  slideCount: number
  postHistory: string[]
  carouselSwipeCues: string
}

// Reels
export interface ReelsResult {
  hook: string
  main_points: string[]
  cta: string
  on_screen_text: string[]
  visual_directions: string[]
  estimated_seconds: number
}

export interface GenerateReelsInput extends BaseGenerateInput {
  nativeCTAPhrases: string    // required for reels
}
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] No imports from other generation files — interfaces only

---

## Step 2 — WritingContext Class (extended)

> **File:** `features/ai/generation/writing-context.ts`

Extended to carry all language configuration — language, banned lists, native CTA phrases. These fields currently travel alongside `WritingContext` as separate parallel parameters through every generator and into `buildClientProfile`. They are a natural unit and belong together.

This also eliminates the duplicate `WritingContext` interface in `prompt-sections.ts`.

```typescript
import type { BaseGenerateInput } from './types'

/**
 * Encapsulates all writing parameters — register, brand voice, and language config.
 * Use WritingContext.from(input) in all generators.
 *
 * Extended to carry language config (language, bannedAnglicisms, bannedCalques,
 * nativeCTAPhrases) so buildClientProfile receives one context object instead of
 * parallel separate parameters.
 */
export class WritingContext {
  readonly niche: string
  readonly targetAudience: string
  readonly formality: string
  readonly tone: string
  readonly clientTestimonialVoice: string | undefined
  readonly language: string
  readonly bannedAnglicisms: string[]
  readonly bannedCalques: string[]
  readonly nativeCTAPhrases: string | undefined

  constructor(params: {
    niche: string
    targetAudience: string
    formality: string
    tone: string
    clientTestimonialVoice?: string
    language: string
    bannedAnglicisms: string[]
    bannedCalques: string[]
    nativeCTAPhrases?: string
  }) {
    this.niche = params.niche
    this.targetAudience = params.targetAudience
    this.formality = params.formality ?? 'neutral'  // guard — prevents "undefined" in prompts
    this.tone = params.tone
    this.clientTestimonialVoice = params.clientTestimonialVoice
    this.language = params.language
    this.bannedAnglicisms = params.bannedAnglicisms
    this.bannedCalques = params.bannedCalques
    this.nativeCTAPhrases = params.nativeCTAPhrases
  }

  static from(input: BaseGenerateInput): WritingContext {
    return new WritingContext({
      niche: input.niche,
      targetAudience: input.targetAudience,
      formality: input.languageFormality,
      tone: input.tone,
      clientTestimonialVoice: input.clientTestimonialVoice,
      language: input.language,
      bannedAnglicisms: input.bannedAnglicisms,
      bannedCalques: input.bannedCalques,
      nativeCTAPhrases: input.nativeCTAPhrases,
    })
  }
}
```

**Update `prompt-sections.ts`** — replace the local `WritingContext` interface with a re-export:
```typescript
// Remove the WritingContext interface definition entirely.
// Re-export from the canonical location:
export type { WritingContext } from '../writing-context'
```

One definition. No duplication. All consumers of either file get the same type.

**Update `buildClientProfile`** — remove `language`, `bannedAnglicisms`, `bannedCalques`, `nativeCTAPhrases` from `ClientProfileInput` — they now come from `ctx`:

```typescript
export interface ClientProfileInput {
  ctx: WritingContext     // carries language config — no separate params needed
  platform: string
  clientName: string
  contentPillars: WeightedPillar[]
  targetPillar?: string
  avoidTopics: string
  isHealthClient?: boolean
  // REMOVED: language, bannedAnglicisms, bannedCalques, nativeCTAPhrases
}
```

Inside `buildClientProfile`, the language rules section now reads from `ctx`:
```typescript
sections.push(buildLanguageRulesSection({
  language: ctx.language,
  formality: ctx.formality,
  bannedAnglicisms: ctx.bannedAnglicisms,
  bannedCalques: ctx.bannedCalques,
  nativeCTAPhrases: ctx.nativeCTAPhrases,
}))
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `WritingContext` defined exactly once in the codebase
- [ ] `buildClientProfile` signature has no `language` / banned list / CTA params
- [ ] `WritingContext.from(input).formality` is never `undefined`

---

## Step 3 — Abstract Base Generator

> **File:** `features/ai/generation/base-generator.ts`

Key design decisions:
- Subclasses implement `buildTypeSpecificMessage()` — only what is unique to their type
- The base `buildUserMessage()` wraps it and appends source grounding + angle differentiation — so no subclass can forget to include these
- Angle differentiation was missing from `generate-reels.ts` — it now fires for all generators automatically
- `callApi()` is `private` — subclasses never call it directly

```typescript
import type { Message } from '@anthropic-ai/sdk/resources'
import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from '@/ai/client'
import { buildStaticSystemPrompt } from './prompts/prompt-sections'
import { buildSourceGroundingSection } from './prompts/source-grounding'
import { buildAngleDifferentiationSection } from './prompts/prompt-sections'
import type { BaseGenerateInput } from './types'

export abstract class ContentGenerator<TInput extends BaseGenerateInput, TOutput> {

  /** Single public entry point */
  async generate(input: TInput): Promise<TOutput> {
    const systemPrompt = this.buildSystemPrompt(input)
    const userMessage = this.buildUserMessage(input)
    const message = await this.callApi(systemPrompt, userMessage)
    return this.parseResponse(message, input)
  }

  /**
   * Default: static system prompt, cached at module level (Step 16).
   * Override only when a content type needs different instructions (e.g. ReelsGenerator).
   */
  protected buildSystemPrompt(_input: TInput): string {
    return buildStaticSystemPrompt()
  }

  /**
   * Builds the content-type-specific part of the user message.
   * Subclasses implement this — NOT buildUserMessage.
   */
  protected abstract buildTypeSpecificMessage(input: TInput): string

  /** Parses the raw API response into the typed output */
  protected abstract parseResponse(message: Message, input: TInput): TOutput

  /**
   * Assembles the complete user message.
   * Source grounding and angle differentiation are added here — subclasses cannot omit them.
   * This is why subclasses implement buildTypeSpecificMessage, not buildUserMessage.
   */
  protected buildUserMessage(input: TInput): string {
    const typeSpecific = this.buildTypeSpecificMessage(input)
    const sourceSection = buildSourceGroundingSection({
      sourceExcerpt: input.sourceExcerpt,
      sourceUrl: input.sourceUrl,
      requireSourceGrounding: input.requireSourceGrounding,
    })
    const angleDiff = buildAngleDifferentiationSection(input.similarPastThemes ?? [])

    return `${typeSpecific}
${sourceSection}
${angleDiff}
Today's date: ${new Date().toISOString().split('T')[0]}`
  }

  /** Private — subclasses call generate(), not this */
  private async callApi(systemPrompt: string, userMessage: string): Promise<Message> {
    return anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    })
  }
}
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `callApi` is `private`
- [ ] `buildTypeSpecificMessage` is `abstract`
- [ ] `buildUserMessage` is `protected` with concrete implementation in base

---

## Step 4 — PostGenerator

> **File:** `features/ai/generation/post-generator.ts`

Implements only what is unique to posts. Source grounding and angle differentiation handled by base.

```typescript
import type { Message } from '@anthropic-ai/sdk/resources'
import { stripPlanningPrefix } from '@/ai/utils'
import { buildClientProfile } from './prompts/prompt-sections'
import { PROMPT_HISTORY_LIMIT } from '@/ai/constants'
import { WritingContext } from './writing-context'
import { ContentGenerator } from './base-generator'
import type { GeneratePostInput } from './types'

export class PostGenerator extends ContentGenerator<GeneratePostInput, string[]> {

  protected buildTypeSpecificMessage(input: GeneratePostInput): string {
    const ctx = WritingContext.from(input)

    return `${buildClientProfile({
      ctx,
      platform: input.platform,
      clientName: input.clientName,
      contentPillars: input.contentPillars,
      targetPillar: input.targetPillar,
      avoidTopics: input.avoidTopics,
      isHealthClient: input.isHealthClient,
    })}

Recent topics already covered — do not repeat: ${input.postHistory.slice(0, PROMPT_HISTORY_LIMIT).join(' | ')}

PLANNING STEP — complete before writing:
Review the ALLOWED OPENERS and ALLOWED STRUCTURES above.
For each post, declare your choices on one line: [STRUCTURE: name | OPENER: type]
Then write the post immediately after. Do not write anything before the declaration.

Write ${input.count} post(s) for theme '${input.theme}'.
Each must feel distinct — use different structures and opener types.
Separate multiple posts with ---.`
  }

  protected parseResponse(message: Message, _input: GeneratePostInput): string[] {
    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    return text
      .split('---')
      .map(p => p.trim())
      .filter(Boolean)
      .map(stripPlanningPrefix)
  }
}
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `buildTypeSpecificMessage` contains no source grounding or angle differentiation
- [ ] No direct `anthropic.messages.create` call

---

## Step 5 — CarouselGenerator

> **File:** `features/ai/generation/carousel-generator.ts`

```typescript
import type { Message } from '@anthropic-ai/sdk/resources'
import { parseJsonResponse } from '@/ai/utils'
import { buildClientProfile } from './prompts/prompt-sections'
import { PROMPT_HISTORY_LIMIT } from '@/ai/constants'
import { WritingContext } from './writing-context'
import { ContentGenerator } from './base-generator'
import type { GenerateCarouselInput, CarouselResult } from './types'

export class CarouselGenerator extends ContentGenerator<GenerateCarouselInput, CarouselResult> {

  protected buildTypeSpecificMessage(input: GenerateCarouselInput): string {
    const ctx = WritingContext.from(input)

    return `${buildClientProfile({
      ctx,
      platform: 'Instagram',
      clientName: input.clientName,
      contentPillars: input.contentPillars,
      targetPillar: input.targetPillar,
      avoidTopics: input.avoidTopics,
      isHealthClient: input.isHealthClient,
    })}

${this.buildCarouselRules(input)}

Recent topics already covered — do not repeat: ${input.postHistory.slice(0, PROMPT_HISTORY_LIMIT).join(' | ')}

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

  protected parseResponse(message: Message, _input: GenerateCarouselInput): CarouselResult {
    return parseJsonResponse<CarouselResult>(message)
  }

  /** Carousel-specific slide rules — private, not part of public contract */
  private buildCarouselRules(input: GenerateCarouselInput): string {
    return `CAROUSEL-SPECIFIC RULES:
SLIDE STRUCTURE:
- Slide 1 (Cover): Bold hook headline only. Opens a loop the reader must swipe to resolve. Add approved swipe cue. No body text.
- Slides 2 to ${input.slideCount - 2}: One distinct idea per slide. Headline + 2-3 sentence body. Self-contained.
- Slide ${input.slideCount - 1}: Value/payoff slide. Emotional or informational peak.
- Slide ${input.slideCount} (Last): CTA only. Low-pressure. Include button text suggestion.

SLIDE HEADLINE RULES:
Every headline must contain a specific number, named tension, or counterintuitive claim.
NEVER use topic labels or generic positives.
WRONG: "Хидратация" | RIGHT: "Кожата ви задържа вода 40% по-малко след зимата"

SLIDE BODY RULES:
Body text must add NEW information beyond the headline. Never explain the headline — extend it.
Minimum 2 sentences per content slide.
Each slide covers a DISTINCT idea — check all prior slides before writing the next.

SWIPE CUES — use ONLY these approved phrases, never invent new ones:
${input.carouselSwipeCues}

REGISTER PER SLIDE: Apply the same register rules to every slide individually.

MAIN CAPTION: max 3 lines, teases carousel, ends with an approved swipe cue, 1-3 niche hashtags at end.`
  }
}
```

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `buildCarouselRules` is `private`
- [ ] No source grounding or angle differentiation in `buildTypeSpecificMessage`

---

## Step 6 — ReelsGenerator (aligned)

> **File:** `features/ai/generation/reels-generator.ts`

Three fixes relative to the old `generate-reels.ts`:
1. Now uses `buildClientProfile()` — gives reels proper language rules, brand voice, register constraints it previously lacked
2. `buildReelsSourceSection` (custom inline function) removed — source grounding handled by base class
3. Angle differentiation now fires automatically — it was missing from reels entirely

ReelsGenerator overrides `buildSystemPrompt()` because script writing needs different instructions from social post writing — this is the correct use of overriding.

```typescript
import type { Message } from '@anthropic-ai/sdk/resources'
import { parseJsonResponse } from '@/ai/utils'
import { buildClientProfile, buildBannedPhrasesSection } from './prompts/prompt-sections'
import { WritingContext } from './writing-context'
import { ContentGenerator } from './base-generator'
import type { GenerateReelsInput, ReelsResult } from './types'

export class ReelsGenerator extends ContentGenerator<GenerateReelsInput, ReelsResult> {

  /**
   * Reels needs a script-writing system prompt.
   * Inherits callApi() and the complete generate() flow — only the system instructions differ.
   */
  protected buildSystemPrompt(input: GenerateReelsInput): string {
    const formality = input.languageFormality ?? 'neutral'
    return `Write an Instagram Reels script (15-60 seconds when spoken aloud).

SCRIPT STRUCTURE:
- Hook (0-3 sec): One sentence. Instant curiosity or specific problem. No slow intros.
- Main content (3-45 sec): 3-5 short punchy points as spoken word. One per line.
- CTA (last 5 sec): One low-pressure action.

REGISTER: All sections must maintain ${formality} register.
A formal hook can still be punchy and specific without being casual.

ALSO PROVIDE:
- On-screen text suggestions per section
- Visual direction per section (simple talking head directions)
- Estimated speaking time in seconds

${buildBannedPhrasesSection()}`
  }

  protected buildTypeSpecificMessage(input: GenerateReelsInput): string {
    const ctx = WritingContext.from(input)

    return `${buildClientProfile({
      ctx,
      platform: 'Instagram',
      clientName: input.clientName,
      contentPillars: input.contentPillars,
      targetPillar: input.targetPillar,
      avoidTopics: input.avoidTopics,
      isHealthClient: input.isHealthClient,
    })}

Theme: ${input.theme}

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

  protected parseResponse(message: Message, _input: GenerateReelsInput): ReelsResult {
    return parseJsonResponse<ReelsResult>(message)
  }
}
```

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `ReelsGenerator` overrides `buildSystemPrompt` only — not `buildUserMessage`
- [ ] Uses `buildClientProfile()` — language rules, brand voice, register now present
- [ ] No `buildReelsSourceSection` — removed
- [ ] Angle differentiation fires (from base class)

---

## Step 7 — Generator Factory

> **File:** `features/ai/generation/generator-factory.ts`

The `default: never` exhaustive check means TypeScript errors at compile time if `PostType` grows without a factory case.

```typescript
import { PostGenerator } from './post-generator'
import { CarouselGenerator } from './carousel-generator'
import { ReelsGenerator } from './reels-generator'
import type { ContentGenerator } from './base-generator'
import type { BaseGenerateInput } from './types'

export type PostType = 'single' | 'carousel' | 'reels'

export class GeneratorFactory {
  /**
   * To add a new content type:
   * 1. Create a new subclass of ContentGenerator
   * 2. Add a case here
   * Zero changes needed anywhere else.
   */
  static create(postType: PostType): ContentGenerator<BaseGenerateInput, unknown> {
    switch (postType) {
      case 'single':    return new PostGenerator()
      case 'carousel':  return new CarouselGenerator()
      case 'reels':     return new ReelsGenerator()
      default: {
        const exhaustive: never = postType
        throw new Error(`Unknown post type: ${exhaustive}`)
      }
    }
  }
}
```

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `default: never` present — adding to `PostType` without a case causes compile error

---

## Step 8 — Move generate-posts.ts

> **Move:** `features/ai/services/generate-posts.ts` → `features/ai/generation/generate-posts.ts`

```bash
git mv src/features/ai/services/generate-posts.ts \
       src/features/ai/generation/generate-posts.ts
```

**Update `app/api/ai/generate/route.ts`:**
```typescript
// Old:
import { generatePosts } from '@/ai/services/generate-posts'
// New:
import { generatePosts } from '@/ai/generation/generate-posts'
```

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "services/generate-posts" src/` — returns nothing

---

## Step 9 — Update prompt-sections.ts

> **File:** `features/ai/generation/prompts/prompt-sections.ts`

Three targeted fixes now that `WritingContext` is a class and generators are in place.

### Fix 1 — Replace WritingContext interface with re-export

```typescript
// Remove the local WritingContext interface definition.
// Replace with:
export type { WritingContext } from '../writing-context'
```

### Fix 2 — Trim ClientProfileInput and update buildClientProfile

Remove the now-redundant fields from `ClientProfileInput`:
```typescript
export interface ClientProfileInput {
  ctx: WritingContext   // carries language, banned lists, CTA phrases
  platform: string
  clientName: string
  contentPillars: WeightedPillar[]
  targetPillar?: string
  avoidTopics: string
  isHealthClient?: boolean
  // REMOVED: language, bannedAnglicisms, bannedCalques, nativeCTAPhrases
}
```

Update `buildLanguageRulesSection` call inside `buildClientProfile` to read from `ctx`.

### Fix 3 — Fix SPECIFICITY REQUIREMENT grammar

Current (broken — full niche string makes a grammatically broken sentence):
```typescript
`The post must contain at least one detail that could only come from this specific
${ctx.niche} business — not any similar business in the same field.`
```

Replace with `clientName`:
```typescript
`The post must contain at least one detail that could only come from ${input.clientName} — not any similar business in the same field.`
```

### Fix 4 — Unexport internal functions

`buildLanguageRulesSection` and `buildBannedPhrasesSection` are implementation details of `buildClientProfile`. After the restructure, the old `generate-reels.ts` was their only external caller — now gone.

Confirm no external callers remain:
```bash
grep -r "buildLanguageRulesSection\|buildBannedPhrasesSection" src/ \
  --include="*.ts" | grep -v "prompt-sections.ts"
```

If no results: remove `export` from both functions.

### ✓ Step 9 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `WritingContext` defined exactly once in the codebase (writing-context.ts)
- [ ] `ClientProfileInput` has no `language` / banned list params
- [ ] `SPECIFICITY REQUIREMENT` uses `clientName`
- [ ] `buildLanguageRulesSection` unexported (if confirmed no external callers)

---

## Step 10 — Update Import Paths

Find all remaining stale imports:
```bash
grep -r "ai/services/generate-posts\|ai/prompts/generation\|prompts/generation/generate" \
  src/ --include="*.ts" -l
```

| Old import | New import |
|---|---|
| `@/ai/services/generate-posts` | `@/ai/generation/generate-posts` |
| `@/ai/prompts/generation/prompt-sections` | `@/ai/generation/prompts/prompt-sections` |
| `@/ai/prompts/generation/source-grounding` | `@/ai/generation/prompts/source-grounding` |
| `CarouselSlide`, `CarouselResult` | `@/ai/generation/types` |
| `ReelsResult` | `@/ai/generation/types` |
| `GeneratePostInput` | `@/ai/generation/types` |
| `Theme`, `GeneratedPostEntry`, `GeneratePostsContext` | `@/ai/generation/generate-posts` |

Also update `types/api.ts` if it re-exports any of these.

### ✓ Step 10 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "ai/services/generate-posts" src/` — nothing
- [ ] `grep -r "ai/prompts/generation" src/` — nothing

---

## Step 11 — Delete Old Files

Only after Step 10 passes `tsc`.

```bash
rm src/features/ai/prompts/generation/generate-post.ts
rm src/features/ai/prompts/generation/generate-carousel.ts
rm src/features/ai/prompts/generation/generate-reels.ts
rm src/features/ai/services/generate-posts.ts
rmdir src/features/ai/prompts/generation/ 2>/dev/null || true
rmdir src/features/ai/services/ 2>/dev/null || true
```

### ✓ Step 11 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `features/ai/prompts/generation/` does not exist
- [ ] `features/ai/services/generate-posts.ts` does not exist

---

## Step 12 — Phase 1 Final Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Structure audit
```bash
ls src/features/ai/generation/
# types.ts  writing-context.ts  base-generator.ts  post-generator.ts
# carousel-generator.ts  reels-generator.ts  generator-factory.ts
# generate-posts.ts  prompts/

ls src/features/ai/generation/prompts/
# formality-guidance.ts  prompt-sections.ts  source-grounding.ts
```

### Import audit
```bash
grep -r "ai/services/generate-posts" src/       # nothing
grep -r "ai/prompts/generation" src/             # nothing
grep -r "WritingContext" src/ | grep "interface" # exactly 1 result (the re-export line)
```

### Functional verification
- [ ] Single post — returns `string[]`, planning prefix stripped
- [ ] Carousel — returns `CarouselResult` with correct slide count
- [ ] Reels — returns `ReelsResult`, now receives language rules (check rendered prompt)
- [ ] Reels — angle differentiation now present (check rendered prompt)

### Exhaustive check
- [ ] Add `'stories'` to `PostType` — TypeScript must error at factory `default: never`
- [ ] Remove the addition after confirming

---

## Phase 2 — Optimizations

> **Start a fresh Claude Code session for Phase 2.**
> Phase 1 must be fully verified first.
> All changes unless noted are inside `features/ai/generation/generate-posts.ts`.

---

## Step 13 — Extract Shared Helpers

Four pieces of duplicated logic across `processCarouselResult`, `processReelsResult`, `processSingleResult`.

### 13a — sharedQualityContext (built 3× → built once)

The `qualityContext` object is identical in all three process functions (~5 lines × 3). Build once at the top of `generatePosts`:

```typescript
const sharedQualityContext = {
  tone: ctx.tone || undefined,
  targetAudience: ctx.targetAudience || undefined,
  niche: ctx.clientNiche || undefined,
  clientTestimonialVoice: ctx.clientTestimonialVoice || undefined,
  isHealthClient: ctx.isHealthNiche ?? undefined,
}
```

Replace all three inline `qualityContext: { ... }` blocks with `qualityContext: sharedQualityContext`.

### 13b — applyCorrections helper (duplicated 3×)

**Before extracting: confirm intended priority.** Currently language correction overwrites source grounding correction — language wins if both are present. If source grounding should win, swap the order. Document the decision.

```typescript
function applyCorrections(
  original: string,
  validation: {
    sourceGrounding?: { corrected_text?: string | null }
    language: { corrected_text?: string | null }
  }
): string {
  // Priority: source grounding applied first, language correction wins.
  // To make source grounding win: swap the two conditions.
  if (validation.sourceGrounding?.corrected_text) return validation.sourceGrounding.corrected_text
  if (validation.language.corrected_text) return validation.language.corrected_text
  return original
}
```

Replace all three caption correction blocks with `applyCorrections(original, validation)`.

### 13c — buildPostEntry helper (14 shared fields built 3×)

Only three fields differ between types: `post_type`, `slides_json`, `carousel_quality_json`.

```typescript
function buildPostEntry(
  theme: ThemeWithMeta,
  overrides: {
    caption: string
    post_type: 'single' | 'carousel' | 'reels'
    slides_json: unknown
    carousel_quality_json?: unknown
    quality_score_avg: number    // required — no silent zero default
  }
): Record<string, unknown> {
  return {
    id: randomUUID(),
    client_id: ctx.clientId,
    platform: ctx.platform,
    status: 'draft',
    priority: theme.isPriority ?? false,
    topic_summary: theme.description,
    source_url: theme.sourceUrl ?? null,
    source_title: theme.sourceTitle ?? null,
    source_type: theme.sourceType ?? null,
    source_excerpt: theme.sourceExcerpt ?? null,
    pillar: theme.pillar ?? null,
    created_at: new Date().toISOString(),  // per-post — fixes same-timestamp issue
    carousel_quality_json: null,
    ...overrides,
  }
}
```

`quality_score_avg` is required in overrides — not defaulted to 0. TypeScript prevents a caller from omitting it.

`created_at` is per-post. The old single `now` constant meant all posts in a batch got the same timestamp — the review queue could not order them within a batch.

Remove the `now` constant from the top of `generatePosts`.

### 13d — Fix double getGroundingText call

```typescript
// Before:
sourceExcerpt: getGroundingText(theme),
requireSourceGrounding: ctx.requireSourceGrounding || !!getGroundingText(theme),

// After:
const groundingText = getGroundingText(theme)
sourceExcerpt: groundingText,
requireSourceGrounding: ctx.requireSourceGrounding || !!groundingText,
```

### 13e — trackTheme fire-and-forget

`trackTheme` is a Supabase insert whose return value is never used. Currently awaited, blocking post processing.

```typescript
// Before:
await ctx.trackTheme(theme, captions.length)
// After:
void ctx.trackTheme(theme, captions.length)
```

Change in all three process functions.

### 13f — Carousel slide count warning

```typescript
// In processCarouselResult, after receiving carouselResult:
if (carouselResult.slides.length !== ctx.slideCount) {
  console.warn(
    `[generate] carousel for "${theme.description}" returned ` +
    `${carouselResult.slides.length} slides, expected ${ctx.slideCount}`
  )
}
```

Warning not error — a short carousel is better than a failed generation.

### ✓ Step 13 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `sharedQualityContext` appears once, used in all three process functions
- [ ] `applyCorrections` appears once, called in all three process functions
- [ ] `buildPostEntry` appears once, called in all three process functions
- [ ] `quality_score_avg` required in overrides — no `0` default
- [ ] `trackTheme` called with `void` — not awaited
- [ ] `now` constant removed
- [ ] End-to-end generation — result identical to pre-Phase 2

---

## Step 14 — Route Handler Hardening

> **File:** `app/api/ai/generate/route.ts`

### 14a — Guard for empty theme list

```typescript
if ((!body.themes?.length) && (!body.priorityPosts?.length)) {
  return NextResponse.json(
    { error: 'At least one theme or priority post is required' },
    { status: 400 }
  )
}
```

### 14b — Move formality default to constants

**Before this change: confirm whether `'formal'` is the correct default.** The current code defaults all clients without a stored formality to formal register. Document the decision.

```typescript
// Add to features/ai/constants.ts:
export const DEFAULT_LANGUAGE_FORMALITY = 'formal' as const  // or 'neutral' — confirm first

// Route:
import { DEFAULT_LANGUAGE_FORMALITY } from '@/ai/constants'
formality: profile?.language_formality ?? DEFAULT_LANGUAGE_FORMALITY,
```

### 14c — Replace unsafe type assertions with runtime guards

In `generate-posts.ts`, add type guards:

```typescript
function isCarouselResult(r: unknown): r is CarouselResult {
  return typeof r === 'object' && r !== null && 'main_caption' in r && 'slides' in r
}

function isReelsResult(r: unknown): r is ReelsResult {
  return typeof r === 'object' && r !== null && 'hook' in r && 'main_points' in r
}
```

Replace `result as CarouselResult`, `result as ReelsResult`, `result as string[]`:

```typescript
if (ctx.postType === 'carousel' && isCarouselResult(result)) {
  await processCarouselResult(theme, result)
} else if (ctx.postType === 'reels' && isReelsResult(result)) {
  await processReelsResult(theme, result)
} else if (Array.isArray(result)) {
  await processSingleResult(theme, result)
} else {
  console.error(`[generate] unexpected result shape for theme "${theme.description}"`)
}
```

### ✓ Step 14 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Empty themes returns 400
- [ ] `DEFAULT_LANGUAGE_FORMALITY` constant used in route
- [ ] No `as CarouselResult` / `as ReelsResult` / `as string[]` casts

---

## Step 15 — Parallelize Theme Processing

> **Highest-impact optimization.** 5-theme batch: ~40s sequential → ~16s with `MAX_CONCURRENT_AI_CALLS = 3`.

```typescript
import { MAX_CONCURRENT_AI_CALLS } from '@/ai/constants'

// Extract processTheme for readable batch loop and named stack traces
async function processTheme(theme: ThemeWithMeta): Promise<void> {
  const input = buildGeneratorInput(ctx, theme)
  const result = await generator.generate(input)

  if (ctx.postType === 'carousel' && isCarouselResult(result)) {
    await processCarouselResult(theme, result)
  } else if (ctx.postType === 'reels' && isReelsResult(result)) {
    await processReelsResult(theme, result)
  } else if (Array.isArray(result)) {
    await processSingleResult(theme, result)
  } else {
    console.error(`[generate] unexpected result shape for theme "${theme.description}"`)
  }
}

// Batched parallel — respects MAX_CONCURRENT_AI_CALLS rate limit
for (let i = 0; i < allThemes.length; i += MAX_CONCURRENT_AI_CALLS) {
  const batch = allThemes.slice(i, i + MAX_CONCURRENT_AI_CALLS)
  const results = await Promise.allSettled(batch.map(theme => processTheme(theme)))

  results.forEach((result, idx) => {
    if (result.status === 'rejected') {
      console.error(
        `[generate] failed for theme "${batch[idx]?.description}":`,
        result.reason
      )
    }
  })
}
```

**Why `Promise.allSettled`:** one failing theme must not abort others.
**Why batching:** unbounded concurrency hits API rate limits. `MAX_CONCURRENT_AI_CALLS` already exists for this purpose.

### ✓ Step 15 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] 1 theme — identical behaviour to before
- [ ] 3 themes — all fire concurrently (check log timestamps)
- [ ] 5 themes — fires as batch of 3, then batch of 2
- [ ] One failing theme does not prevent others

---

## Step 16 — Cache buildStaticSystemPrompt at Module Level

> **File:** `features/ai/generation/prompts/prompt-sections.ts`

`buildStaticSystemPrompt()` concatenates constants via format helpers. For a 5-theme parallel batch it runs 5 times producing identical output. Cache at module level.

```typescript
let _cachedStaticPrompt: string | null = null

export function buildStaticSystemPrompt(): string {
  if (!_cachedStaticPrompt) {
    _cachedStaticPrompt = `You are a senior social media copywriter...
${formatBannedOpeners()}
...
${formatAiTellPatterns()}
...`
  }
  return _cachedStaticPrompt
}
```

Zero changes in generators — they call `buildStaticSystemPrompt()` via the base class.

Note: the Anthropic API also caches the system prompt server-side via `cache_control`. This module-level cache eliminates the string computation cost on the client side — a free win.

### ✓ Step 16 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Multiple calls to `buildStaticSystemPrompt()` return the same string reference

---

## Step 17 — Phase 2 Final Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Code quality checks
- [ ] No inline `qualityContext` objects — only `sharedQualityContext`
- [ ] Caption correction logic once — in `applyCorrections`
- [ ] Post construction once — in `buildPostEntry`
- [ ] `quality_score_avg` required in overrides — no `0` default anywhere
- [ ] `trackTheme` called with `void` in all three process functions
- [ ] No unsafe `as` type casts
- [ ] `now` constant gone — each post has distinct `created_at`
- [ ] `DEFAULT_LANGUAGE_FORMALITY` used in route
- [ ] `buildStaticSystemPrompt` has module-level cache

### Performance check
- [ ] 5-theme batch completes in ~⌈5 / MAX_CONCURRENT_AI_CALLS⌉ × single-theme time

---

## Complete Change Summary

### Phase 0

| Concern | Before | After |
|---|---|---|
| Dead fields | `structureNote`, `brandVoiceNote` in FORMALITY_GUIDANCE — never read | Removed |
| `FORMALITY_GUIDANCE` constant | 200-line block mid-file | Extracted to `formality-guidance.ts` |
| `buildLanguageValidationRules` | Generation file (wrong domain) | `validation/language-validation-rules.ts` |
| Generation prompt location | `features/ai/prompts/generation/` | `features/ai/generation/prompts/` |

### Phase 1

| Concern | Before | After |
|---|---|---|
| `WritingContext` definition | Interface in `prompt-sections.ts` | Class in `writing-context.ts`, re-exported from prompt-sections |
| Language config travel | Separate params alongside WritingContext | Encapsulated in WritingContext |
| `buildClientProfile` params | 9 params | 6 params — language config from ctx |
| Generation branching | `await generatePost/generateCarousel/generateReels` | `GeneratorFactory.create(postType)` |
| Reels alignment | Own system prompt, no `buildClientProfile`, no angle diff | Overrides system prompt, uses `buildClientProfile`, angle diff from base |
| Angle differentiation | Post + carousel only | All three — base class handles it |
| Reels source grounding | Custom `buildReelsSourceSection` inline | Shared `buildSourceGroundingSection` from base |
| `generate-posts.ts` location | `features/ai/services/` | `features/ai/generation/` |
| `SPECIFICITY REQUIREMENT` | Full niche string (broken grammar) | `clientName` |
| `buildLanguageRulesSection` export | Exported (implied public) | Unexported (internal detail) |

### Phase 2

| Concern | Before | After |
|---|---|---|
| Theme processing | Sequential ~40s/5 themes | Batched parallel ~16s/5 themes |
| `qualityContext` | Built inline 3× | `sharedQualityContext` built once |
| Caption correction | Inline 3×, priority ambiguous | `applyCorrections()` — priority documented |
| Post construction | 14 fields built 3× | `buildPostEntry()` — diff fields only |
| `quality_score_avg` | Silent `0` default | Required field — TypeScript enforces |
| `trackTheme` | Awaited (blocks processing) | Fire-and-forget |
| `created_at` | Single timestamp for whole batch | Per-post timestamp |
| Type assertions | Unsafe `as CarouselResult` etc. | Runtime type guards |
| Empty theme request | Silent empty response | 400 with error message |
| Formality default | Magic string in route | `DEFAULT_LANGUAGE_FORMALITY` constant |
| `buildStaticSystemPrompt` | Re-computed per call | Cached at module level |
| Carousel slide count | No validation | Warning logged on mismatch |

---

*PostFlow — Generation Feature Restructure & Optimization*
*Implement phase by phase. `npx tsc --noEmit` after every step.*