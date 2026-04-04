# Generation–Validation Sync & Refactor Plan

> **Implementation document for Claude Code.**
> Run `npx tsc --noEmit` after every step.
> **Rule: one concern per step. Never mix a criteria change with a code structure change.**

---

## What This Plan Covers

The generation and validation systems were built independently and have drifted. This plan fixes
them in four phases:

- **Phase 1 — Single source of truth.** Every rule the generator shows the model, the validator
  checks against the same definition. One import, not two copies.
- **Phase 2 — Language-driven rules.** AI tells, language checks, and register patterns derived
  from `languageConfig` — not hardcoded per-language `if` blocks.
- **Phase 3 — Thread declared structure.** The `[STRUCTURE: name]` declaration is extracted
  before stripping and passed to the validator so it checks the actual declared structure.
- **Phase 4 — Code reduction.** Duplicate type definitions, repeated content block builders,
  and redundant format functions collapsed into shared helpers.

---

## Current State: What Is Out of Sync

| What generator tells model | What validator checks | Gap |
|---|---|---|
| Full structure descriptions (what each means, CTA rules) | Structure names only | Validator cannot enforce structure-specific rules |
| `[STRUCTURE: MYTH-BREAKER]` declared in planning step | Infers structure from post body | MYTH-BREAKER with CTA passes validation |
| Brand voice: "This brand sounds X. Clients say Y." | Same data, different function, different format | Can drift silently |
| Source rules: "Pick ONE angle. Post structure ≠ source structure." | "Focus on 1-2 angles" | Third rule not checked |
| AI tell patterns (6 patterns) | Same 6 patterns — but defined in validation-criteria.ts | Generation team edits wrong file |
| Language-specific patterns from `languageConfig.languageInstructions` | Hardcoded Bulgarian checks in TypeScript | New languages require code changes |

---

## What Is Duplicated Right Now

| Duplicate | Locations | Fix |
|---|---|---|
| `AI_TELL_PATTERNS` and `formatAiTellPatterns()` | `validation-criteria.ts` (defined), `generation-criteria.ts` (used) | Move to `generation-criteria.ts`, re-export from validation |
| `QualityResult` type | `validate-quality.ts` + `scoring.ts` | `scoring.ts` canonical only |
| `LanguageValidationResult` type | `validate-language.ts` + `scoring.ts` | `scoring.ts` canonical only |
| `SourceGroundingResult` type | `validate-source-grounding.ts` + `scoring.ts` | `scoring.ts` canonical only |
| `LanguageIssueType` | `validate-language.ts`, `scoring.ts`, `compute-scores.ts` | `scoring.ts` canonical only |
| `QualityContext` | Inside `validate-quality.ts` | Move to `scoring.ts` |
| Carousel content block builder | `validate-quality.ts`, `validate-language.ts`, `validate-source-grounding.ts` | `buildContentSection()` shared helper |
| Brand voice description | `buildBrandVoiceSection()` (generation) + `buildBrandVoiceCheck()` (validation) | One `buildBrandVoiceDescription()` |
| Bulgarian-specific AI tells | Hardcoded in `buildLanguageTells()` | Move to DB `language_rules.language_instructions` |
| `new Date().toISOString().split('T')[0]` | Both prompt files | `todayDateString()` helper |
| Source full text cap constant | 4 files | One constant in `fetch-limits.ts` |

---

## Target File Structure

```
features/ai/
├── generation/
│   ├── generation-criteria.ts     ← AI_TELL_PATTERNS, STRUCTURE_DESCRIPTIONS,
│   │                                 SOURCE_GROUNDING_RULES, formatters
│   ├── generation-run.ts
│   ├── types.ts
│   ├── generators/
│   │   ├── content-generator.ts
│   │   ├── post-generator.ts      ← parseResponse returns ParsedPost[]
│   │   ├── carousel-generator.ts
│   │   ├── reels-generator.ts
│   │   └── generator-factory.ts
│   └── prompts/
│       ├── client-profile.ts      ← buildBrandVoiceDescription() exported
│       ├── formality-guidance.ts
│       └── source-grounding.ts    ← SOURCE_GROUNDING_RULES exported
│
└── validation/
    ├── validate-post.ts
    ├── correction-utils.ts
    ├── types/
    │   └── scoring.ts             ← ALL shared types. QualityContext here.
    ├── content-rules/
    │   ├── compute-scores.ts      ← imports LanguageIssueType from scoring.ts
    │   ├── validation-criteria.ts ← imports from generation-criteria.ts
    │   └── text-analysis.ts
    └── prompts/
        ├── validate-quality.ts
        ├── validate-language.ts
        ├── validate-source-grounding.ts
        ├── language-validation-rules.ts
        └── shared/
            └── content-section.ts ← NEW — shared carousel/single block builder
```

---

## Build Order

```
── PHASE 1: Single Source of Truth ─────────────────────────────────────────
Step 1  → Move AI_TELL_PATTERNS to generation-criteria.ts
Step 2  → Export SOURCE_GROUNDING_RULES from source-grounding.ts
Step 3  → Export buildBrandVoiceDescription() for shared use
Step 4  → Show full structure descriptions in validation criteria checklist
Step 5  → Confirm health rules single source
Step 6  → Phase 1 verification

── PHASE 2: Language-Driven Rules ──────────────────────────────────────────
Step 7  → Make AI tell patterns language-aware
Step 8  → Rewrite buildLanguageTells() to be fully DB-driven
Step 9  → Confirm buildLanguageValidationRules() has no hardcoded language checks
Step 10 → Phase 2 verification

── PHASE 3: Thread Declared Structure ──────────────────────────────────────
Step 11 → Extract declared structure in parseResponse (post-generator.ts)
Step 12 → Thread declaredStructure through generation-run.ts
Step 13 → Add declaredStructure to QualityContext and criteria checklist
Step 14 → Phase 3 verification

── PHASE 4: Code Reduction ─────────────────────────────────────────────────
Step 15 → Consolidate all types into scoring.ts
Step 16 → Extract shared content section builder
Step 17 → Remove opener_follows_rules throughout
Step 18 → Extract todayDateString() and other shared helpers
Step 19 → Phase 4 verification
```

---

## Phase 1 — Single Source of Truth

---

## Step 1 — Move AI_TELL_PATTERNS to generation-criteria.ts

> **Files:** `generation-criteria.ts`, `validation-criteria.ts`

AI tell patterns define what makes text sound AI-generated. They are a **generation rule** — the
generator tells the model "never do these things". The validator checks them. They belong in
`generation-criteria.ts`.

**Add to `generation-criteria.ts`:**

```typescript
/**
 * AI tell patterns — the 6 structural signals that mark AI-generated text.
 * Used by BOTH the generation system prompt and the validation quality checker.
 * Single source: change here, both prompts update automatically.
 */
export const AI_TELL_PATTERNS: readonly string[] = [
  'Syntactic Monotony: 3+ sentences in a row with similar word counts — no punchy/detailed contrast.',
  'Adjective Stacking: 3+ descriptors for a single noun ("innovative, powerful, expert care").',
  'Corporate Prefacing: Unearned authority triggers ("At [Company], we..." / "As experts in...").',
  'Low Information Density: Opening sentences with zero niche-specific nouns or data points.',
  'Academic Transitions: "Furthermore," "Moreover," or "Additionally" between social media ideas.',
  'Passive Translation: Over-reliance on "is/are/was" + "of/for" instead of active idiomatic verbs.',
] as const

export function formatAiTellPatterns(languagePatterns?: string[]): string {
  const base = AI_TELL_PATTERNS.map(p => `- ${p}`).join('\n')
  if (!languagePatterns?.length) return base
  return `${base}\n\nLanguage-specific patterns to also check:\n${languagePatterns.map(p => `- ${p}`).join('\n')}`
}
```

The `languagePatterns` parameter is used in Phase 2 for language-specific AI tells from the DB.

**In `validation-criteria.ts` — remove local definition, re-export:**

```typescript
// Remove AI_TELL_PATTERNS and formatAiTellPatterns definitions entirely.
// Re-export so existing consumers work without changes:
export { AI_TELL_PATTERNS, formatAiTellPatterns } from '@/ai/generation/generation-criteria'
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -rn "^export const AI_TELL_PATTERNS" src/` — 1 result (`generation-criteria.ts`)
- [ ] Generation system prompt and validation prompt both reference the same 6 patterns

---

## Step 2 — Export SOURCE_GROUNDING_RULES from source-grounding.ts

> **File:** `features/ai/generation/prompts/source-grounding.ts`

The generator gives the model three source rules. The validator currently only checks two.
Export the rules text so both use the same string.

**Add to `source-grounding.ts`:**

```typescript
/**
 * Source grounding rules shown to the generator.
 * Exported so the validation criteria checklist uses the same text.
 * What the generator was told to follow — the validator must check.
 */
export const SOURCE_GROUNDING_RULES = `- Use ONLY facts explicitly stated in the source — no inference, no invented details.
- Pick ONE angle, not a summary. If covering more than 2 facts, stop and cut.
- Post structure must come from the POST STRUCTURES list, NOT the source article's structure.` as const
```

Use it inside `buildGroundingPrompt`:

```typescript
export function buildGroundingPrompt(opts: { sourceExcerpt?: string; sourceUrl?: string | null; requireSourceGrounding?: boolean }): string {
  if (!opts.requireSourceGrounding || !opts.sourceExcerpt) return ''
  const capped = capSourceText(opts.sourceExcerpt) ?? opts.sourceExcerpt
  const urlLine = opts.sourceUrl ? `\nSource: ${opts.sourceUrl}` : ''
  return `SOURCE MATERIAL (ground all facts in this):
<source_excerpt>
${capped}
</source_excerpt>${urlLine}

${SOURCE_GROUNDING_RULES}`
}
```

**Update `buildCriteriaChecklist` in `validation-criteria.ts`:**

```typescript
import { SOURCE_GROUNDING_RULES } from '@/ai/generation/prompts/source-grounding'

// When hasSource:
sections.push(`[] SOURCE FIDELITY — the generator was told to follow these rules:
${SOURCE_GROUNDING_RULES}`)
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -rn "^export const SOURCE_GROUNDING_RULES" src/` — 1 result (`source-grounding.ts`)
- [ ] Validation criteria checklist includes all three source rules including the structure one

---

## Step 3 — Export buildBrandVoiceDescription() for Shared Use

> **Files:** `client-profile.ts`, `validate-quality.ts`

Generation and validation both describe the brand voice to the model. Two functions, same data,
different formatting — they can drift silently.

**Add to `client-profile.ts` as exported function:**

```typescript
/**
 * Formats brand voice for use in both generation and validation prompts.
 * Single function: both prompts show the model the same brand description.
 */
export function buildBrandVoiceDescription(opts: {
  tone: string
  testimonialVoice?: string
  formality?: string
}): string {
  const lines = [`This brand sounds: ${opts.tone}.`]
  if (opts.testimonialVoice) {
    lines.push(`Clients describe it as: '${opts.testimonialVoice}'.`)
    lines.push(`These two descriptions define one emotional identity.`)
  }
  if (opts.formality) {
    lines.push(`Evaluate within the ${opts.formality} register. Emotion can be warm even when register is formal.`)
  }
  return lines.join('\n')
}
```

**Update `buildBrandVoiceSection` in `client-profile.ts`** to use it:

```typescript
export function buildBrandVoiceSection(client: ClientContext): string {
  return `BRAND VOICE:\n${buildBrandVoiceDescription({
    tone: client.tone,
    testimonialVoice: client.clientTestimonialVoice,
    formality: client.languageConfig.formality,
  })}\nIf the post could be written about any business, it has failed this test.`
}
```

**Update `buildBrandVoiceCheck` in `validate-quality.ts`:**

```typescript
import { buildBrandVoiceDescription } from '@/ai/generation/prompts/client-profile'

function buildBrandVoiceCheck(ctx?: QualityContext): string {
  return `BRAND CHECKS:
- brand_voice_match: Does the post feel right for this brand?
  ${buildBrandVoiceDescription({
    tone: ctx?.tone ?? 'professional',
    testimonialVoice: ctx?.clientTestimonialVoice,
    formality: ctx?.languageConfig?.formality,
  })}
  Flag only when the post clearly drifts from the brand's voice.
- audience_targeting: Does the post speak to the specific audience, or any audience equally?
- niche_specificity: Does it contain at least one detail only this specific business could produce?`
}
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -rn "^export function buildBrandVoiceDescription" src/` — 1 result (`client-profile.ts`)
- [ ] Brand voice description in generation prompt and validation prompt is byte-identical for same client

---

## Step 4 — Show Full Structure Descriptions in Validation Criteria Checklist

> **File:** `validation-criteria.ts` — `buildCriteriaChecklist`

The validator currently sees structure names only. It cannot enforce structure-specific rules
(MYTH-BREAKER forbids CTA, CONFESSION expects no CTA, etc.). Show the same full descriptions
the generator showed.

**Current:**
```typescript
`[] STRUCTURE: Must NOT be predictable problem→solution→CTA.
   Allowed structures: ${formatStructures()}`
```

**After:**
```typescript
import { formatStructureDescriptions, CTA_EXEMPT_STRUCTURES } from '@/ai/generation/generation-criteria'

// In buildCriteriaChecklist:
sections.push(`[] STRUCTURE: Must NOT be predictable problem→solution→CTA.
   Each structure has specific rules the post must follow:
${formatStructureDescriptions()}`)

// When declaredStructure is present (added in Phase 3):
if (ctx.declaredStructure) {
  const isCtaExempt = CTA_EXEMPT_STRUCTURES.includes(ctx.declaredStructure)
  sections.push(`[] DECLARED STRUCTURE: Generator chose "${ctx.declaredStructure}".
   Verify the post follows this structure's definition above.
   ${isCtaExempt ? 'This structure forbids CTAs — flag any CTA present.' : ''}`)
}
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Validation criteria checklist shows MYTH-BREAKER's "No CTA needed" in the description
- [ ] Generate a MYTH-BREAKER post with a CTA — validator now has the information to flag it

---

## Step 5 — Confirm Health Rules Single Source

> **Files:** `generation-criteria.ts`, `validation-criteria.ts`

```bash
# Audit before making any change:
grep -rn "Educational content only\|No promised outcomes\|formatHealthRules" src/
```

Expected: `formatHealthRules()` defined once in `generation-criteria.ts`, imported into
`validation-criteria.ts`. If any health rules text exists directly in `validation-criteria.ts`,
remove it and use the import.

### ✓ Step 5 Verification
- [ ] `grep -rn "^export function formatHealthRules" src/` — 1 result (`generation-criteria.ts`)
- [ ] No health rules text duplicated in `validation-criteria.ts`

---

## Step 6 — Phase 1 Verification

```bash
npx tsc --noEmit
npx vitest run
```

```bash
# Each should show exactly 1 definition:
grep -rn "^export const AI_TELL_PATTERNS" src/        # generation-criteria.ts
grep -rn "^export const SOURCE_GROUNDING_RULES" src/  # source-grounding.ts
grep -rn "^export function buildBrandVoiceDescription" src/  # client-profile.ts
grep -rn "^export function formatHealthRules" src/    # generation-criteria.ts
```

- [ ] Generate a Физиомед post — quality and language scores unchanged
- [ ] Validation criteria checklist shows full structure descriptions

---

## Phase 2 — Language-Driven Rules

---

## Step 7 — Make AI Tell Patterns Language-Aware

> **Files:** `generation-criteria.ts`, `client-profile.ts` (generation system prompt),
> `validate-quality.ts`

The 6 AI tell patterns are universal — they apply to all languages. But each language has
additional AI-generated text patterns. Bulgarian has calques, mixed Cyrillic/Latin scripts,
bureaucratic phrasing. These should come from the DB, not from code.

`languageConfig.languageInstructions` (from `language_rules` DB table) already stores
language-specific writing instructions. Extract AI-tell-specific patterns from it and pass
to `formatAiTellPatterns`.

**In the generation system prompt (`client-profile.ts` or `content-generator.ts`):**

```typescript
// When building the system prompt, extract language-specific AI tells:
const langAiTells = extractLanguageAiTells(lc.languageInstructions)

// System prompt section:
`AI-generated text does these things — never do them:
${formatAiTellPatterns(langAiTells)}`
```

**Add `extractLanguageAiTells` to `generation-criteria.ts`:**

```typescript
/**
 * Extracts AI tell patterns from language instructions.
 * Language instructions may contain a section marked for AI tell detection.
 * If no AI-tell section found, returns empty array — base patterns still apply.
 *
 * DB convention: language_rules.language_instructions may contain lines prefixed
 * with "AI TELL:" to mark them as generation-time patterns.
 * Example DB entry for Bulgarian:
 *   "AI TELL: Bureaucratic phrasing ('Уважаеми клиенти, бихме искали да Ви информираме')"
 *   "AI TELL: Mixed formal/informal address within same sentence"
 */
export function extractLanguageAiTells(languageInstructions?: string): string[] {
  if (!languageInstructions) return []
  return languageInstructions
    .split('\n')
    .filter(line => line.trim().startsWith('AI TELL:'))
    .map(line => line.replace(/^AI TELL:\s*/, '').trim())
    .filter(Boolean)
}
```

**Same pattern in `validate-quality.ts` `buildLanguageTells`** — already reads from
`lc.languageInstructions`. After Step 8 (below) it will be fully DB-driven.

**DB update required:** add `AI TELL:` prefixed lines to `language_rules.language_instructions`
for each language. For Bulgarian:

```
AI TELL: Bureaucratic phrasing (Уважаеми клиенти, бихме искали да Ви информираме)
AI TELL: Mixed Вие/ти address within the same post
AI TELL: Calque constructions following English word order
```

This is a **manual DB update**, not a code change. The code reads whatever is in the DB.

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `extractLanguageAiTells('')` returns `[]`
- [ ] `extractLanguageAiTells('AI TELL: Mixed address\nOther instruction')` returns `['Mixed address']`
- [ ] Bulgarian generation system prompt includes Bulgarian-specific AI tells (after DB update)

---

## Step 8 — Rewrite buildLanguageTells() to be Fully DB-Driven

> **File:** `features/ai/validation/prompts/validate-quality.ts`

`buildLanguageTells` currently has hardcoded language-specific checks:

```typescript
// CURRENT — remove all of this:
if (language === 'Bulgarian') {
  tells += `\n- Mixed Вие/ти address...`
  tells += `\n- "в днешния свят"...`
}
```

These must be in the DB, not in TypeScript. Code that checks `language === 'Bulgarian'` means
adding a new language requires a code change and a deploy.

**Replace entirely:**

```typescript
function buildLanguageTells(ctx?: QualityContext): string {
  const lc = ctx?.languageConfig
  if (!lc) return ''

  // Universal translation/register base
  const base = `${lc.language}-specific AI patterns to also check:
- Literal calques from English that no native ${lc.language} speaker would write
- Unnatural word order following English syntax
- Register violation: ${
    lc.formality === 'formal' ? 'informal address in a formal-register post' :
    lc.formality === 'casual' ? 'formal address in a casual-register post' :
    'extreme formality or casualness when neutral register is required'
  }`

  // Language-specific AI tells from DB (set up via extractLanguageAiTells convention)
  const dbTells = extractLanguageAiTells(lc.languageInstructions)
  const dbTellsSection = dbTells.length > 0
    ? `\n${dbTells.map(t => `- ${t}`).join('\n')}`
    : ''

  // Per-client language notes from DB
  const clientNotes = lc.languageNotes
    ? `\n${lc.languageNotes}`
    : ''

  return `${base}${dbTellsSection}${clientNotes}`
}
```

Import `extractLanguageAiTells` from `generation-criteria.ts` — same function generation uses.
Same extraction logic means generation and validation check the same language-specific patterns.

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep "language === " src/ai/validation/prompts/validate-quality.ts` — nothing
- [ ] Bulgarian validation: mixed address still detected (via DB, not code)
- [ ] Adding a new language requires only a DB entry, no code change

---

## Step 9 — Confirm buildLanguageValidationRules() Has No Hardcoded Language Checks

> **File:** `features/ai/validation/prompts/language-validation-rules.ts`

```bash
grep -n "language === \|=== 'Bulgarian'\|=== 'English'" \
  src/ai/validation/prompts/language-validation-rules.ts
```

If any language-name conditionals exist, replace with DB-driven equivalents using the same
pattern as Step 8.

The 7 issue types in `buildLanguageValidationRules` (anglicism, calque, grammar, etc.) are
universal — they stay. Only the examples and patterns inside them should be language-specific
from DB.

### ✓ Step 9 Verification
- [ ] No `language ===` conditionals in `language-validation-rules.ts`
- [ ] Language-specific check examples come from `config.languageInstructions`

---

## Step 10 — Phase 2 Verification

```bash
npx tsc --noEmit
npx vitest run
```

```bash
# No hardcoded language checks in validation
grep -r "language === " src/ai/validation/   # nothing
grep -r "'Bulgarian'\|'English'\|'Spanish'" src/ai/validation/   # nothing
```

- [ ] Bulgarian post: AI tells still detected post DB update
- [ ] English post: validation works correctly
- [ ] New language (e.g. Romanian): works with only a DB entry, no code change

---

## Phase 3 — Thread Declared Structure

---

## Step 11 — Extract Declared Structure in parseResponse

> **File:** `features/ai/generation/generators/post-generator.ts`

The model declares `[STRUCTURE: MYTH-BREAKER]` before the post body. Currently stripped and
discarded. Extract it first.

**Add to `post-generator.ts`:**

```typescript
export interface ParsedPost {
  caption: string
  declaredStructure: string | null
}

/**
 * Extracts the [STRUCTURE: name] declaration from the planning step.
 * Returns the structure name and the clean caption without the declaration line.
 */
function parsePostDeclaration(text: string): ParsedPost {
  // Match [STRUCTURE: MYTH-BREAKER] or [STRUCTURE: MYTH-BREAKER | OPENER: type] (legacy)
  const match = text.match(/^\[STRUCTURE:\s*([^\]|]+?)(?:\s*\|[^\]]*)?\]\s*/i)
  return {
    declaredStructure: match ? match[1].trim() : null,
    caption: match ? text.slice(match[0].length).trim() : text.trim(),
  }
}

protected parseResponse(message: Message): ParsedPost[] {
  const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
  return text
    .split('---')
    .map(p => p.trim())
    .filter(Boolean)
    .map(parsePostDeclaration)
}
```

The return type changes from `string[]` to `ParsedPost[]`. Update the `ContentGenerator` generic
accordingly — `PostGenerator` now extends `ContentGenerator<GenerationInput, ParsedPost[]>`.

### ✓ Step 11 Verification
- [ ] `npx tsc --noEmit` — no errors (expect errors in generation-run.ts — fixed in Step 12)
- [ ] `parsePostDeclaration('[STRUCTURE: MYTH-BREAKER]\n\nPost body')` returns
  `{ declaredStructure: 'MYTH-BREAKER', caption: 'Post body' }`
- [ ] `parsePostDeclaration('No declaration here')` returns
  `{ declaredStructure: null, caption: 'No declaration here' }`

---

## Step 12 — Thread declaredStructure Through generation-run.ts

> **File:** `features/ai/generation/generation-run.ts`

Update `collectSinglePosts` to receive `ParsedPost[]` instead of `string[]`:

```typescript
import type { ParsedPost } from './generators/post-generator'

async function collectSinglePosts(theme: Theme, posts: ParsedPost[]) {
  void ctx.trackTheme(theme, posts.length)
  const requested = theme.count || 1

  const results = await Promise.all(
    posts.map(async ({ caption, declaredStructure }) => {
      const validation = await validateContent(caption, theme, {
        label: 'single',
        declaredStructure: declaredStructure ?? undefined,
      })
      return { caption: applyTextCorrections(caption, validation), validation, declaredStructure }
    })
  )

  // Quality floor — keep best N
  const toKeep = results
    .filter(r => r.validation.qualityScore >= QUALITY_FLOOR)
    .sort((a, b) => b.validation.qualityScore - a.validation.qualityScore)
    .slice(0, requested)

  const fallback = toKeep.length > 0
    ? toKeep
    : results.sort((a, b) => b.validation.qualityScore - a.validation.qualityScore).slice(0, requested)

  fallback.forEach(({ caption, validation, declaredStructure }) =>
    collectResult(validation, buildDraftRecord(theme, {
      caption,
      post_type: 'single',
      slides_json: null,
      quality_score_avg: validation.qualityScore,
      declared_structure: declaredStructure,   // store for debugging/analytics
    }))
  )
}
```

**Update `validateContent` helper** to accept and forward `declaredStructure`:

```typescript
async function validateContent(
  caption: string,
  theme: Theme,
  opts: { label: string; slides?: CarouselSlide[]; declaredStructure?: string }
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
      declaredStructure: opts.declaredStructure,   // ADD
    },
  })
}
```

### ✓ Step 12 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `GenerationResult` includes `declaredStructure` in the post record
- [ ] `QualityContext` includes `declaredStructure` — add field if missing

---

## Step 13 — Add declaredStructure to QualityContext and Criteria Checklist

> **Files:** `scoring.ts`, `validation-criteria.ts`, `validate-quality.ts`

**Add to `QualityContext` in `scoring.ts`:**

```typescript
export interface QualityContext {
  tone?: string
  targetAudience?: string
  niche?: string
  platform?: string
  clientTestimonialVoice?: string
  sourceExcerpt?: string
  targetPillar?: string
  isHealthClient?: boolean
  languageConfig?: LanguageConfig
  theme?: string
  declaredStructure?: string   // ADD — structure the generator declared
}
```

**Update `buildCriteriaChecklist` in `validation-criteria.ts`:**

```typescript
export function buildCriteriaChecklist(ctx: {
  platform?: string
  hasSource?: boolean
  isHealthClient?: boolean
  languageConfig?: LanguageConfig
  theme?: string
  declaredStructure?: string   // ADD
}): string {
  // ...existing sections...

  // Structure section — full descriptions (from Step 4)
  const structureSection = [`[] STRUCTURE: Must NOT be predictable problem→solution→CTA.
   Each structure below has specific rules the post must follow:
${formatStructureDescriptions()}`]

  // If we know the declared structure, add a specific compliance check
  if (ctx.declaredStructure) {
    const isCtaExempt = CTA_EXEMPT_STRUCTURES.includes(ctx.declaredStructure)
    structureSection.push(`[] DECLARED STRUCTURE: The generator declared "${ctx.declaredStructure}".
   Verify the post actually follows this structure's definition above.${
     isCtaExempt ? '\n   This structure explicitly forbids CTAs — a CTA present is a violation.' : ''
   }`)
  }

  sections.push(structureSection.join('\n'))
}
```

**Thread `declaredStructure` from `QualityContext` into `buildCriteriaChecklist` call
in `validate-quality.ts`:**

```typescript
const criteriaChecklist = buildCriteriaChecklist({
  platform: ctx?.platform,
  hasSource: !!ctx?.sourceExcerpt,
  isHealthClient: ctx?.isHealthClient,
  languageConfig: ctx?.languageConfig,
  theme: ctx?.theme,
  declaredStructure: ctx?.declaredStructure,   // ADD
})
```

### ✓ Step 13 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Generate a MYTH-BREAKER post — `declared_structure: 'MYTH-BREAKER'` in DB record
- [ ] Generate a MYTH-BREAKER post WITH a CTA — validation criteria checklist includes
  "This structure explicitly forbids CTAs"
- [ ] Generate a post with no planning declaration — `declaredStructure: null`,
  no "DECLARED STRUCTURE" section in checklist

---

## Step 14 — Phase 3 Verification

```bash
npx tsc --noEmit
npx vitest run
```

### Structure alignment test

| Scenario | Expected result |
|---|---|
| MYTH-BREAKER, no CTA | `cta_verdict: missing`, score 10 (exempt) |
| MYTH-BREAKER, has CTA | Criteria checklist flags it, `cta_score` penalised |
| CONFESSION, no CTA | `cta_verdict: missing`, score 10 (exempt) |
| OBSERVATION, no CTA | `cta_verdict: missing`, score 1 (not exempt, missing CTA) |
| STORY-FIRST, well-formed | `structure_is_predictable: false` |
| No declaration in output | `declaredStructure: null`, no structure compliance check |

- [ ] All 5 scenarios produce expected results
- [ ] `declared_structure` written to database for all generated posts

---

## Phase 4 — Code Reduction

---

## Step 15 — Consolidate All Types into scoring.ts

> **File:** `features/ai/validation/types/scoring.ts`

Remove duplicate type definitions from individual validator files. Import from `scoring.ts`
everywhere.

**Types to consolidate (remove from source files, canonical in `scoring.ts`):**

| Type | Currently also in | Action |
|---|---|---|
| `QualityResult` | `validate-quality.ts` | Remove from validate-quality.ts |
| `SingleQualityResult` | `validate-quality.ts` | Remove |
| `CarouselQualityResult` | `validate-quality.ts` | Remove |
| `QualityBase` | `validate-quality.ts` | Remove |
| `QualityContext` | `validate-quality.ts` | Move to scoring.ts |
| `QualityIssue` | `validate-quality.ts` | Remove — use `{ type: string; description: string }` inline |
| `LanguageValidationResult` | `validate-language.ts` | Remove |
| `LanguageIssue` | `validate-language.ts` | Remove |
| `SourceGroundingResult` | `validate-source-grounding.ts` | Remove |
| `SourceGroundingIssue` | `validate-source-grounding.ts` | Remove |
| `LanguageIssueType` | `validate-language.ts`, `compute-scores.ts` | Remove from both |
| `HookVerdict`, `CtaVerdict` | `types/api.ts` or `validate-quality.ts` | Canonical in `scoring.ts` |
| `SlopDetection` | `types/api.ts` | Canonical in `scoring.ts`, re-export from api.ts |

**Keep in each validator file:**

- `LlmQualityResponse` — internal parsing shape, never exported
- `LlmLanguageResponse` — internal parsing shape, never exported
- `LlmGroundingResponse` — internal parsing shape, never exported

```bash
# After this step:
grep -rn "^export interface QualityResult\|^export type QualityResult" src/
# 1 result — scoring.ts

grep -rn "^export type LanguageIssueType" src/
# 1 result — scoring.ts
```

### ✓ Step 15 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] All types defined exactly once — in `scoring.ts`

---

## Step 16 — Extract Shared Content Section Builder

> **New file:** `features/ai/validation/prompts/shared/content-section.ts`

The carousel-vs-single content block is identically duplicated in all three validator files:

```typescript
// Appears 3× with minor tag name variations:
if (isCarousel) {
  const slidesText = slides.map((s, i) => `[SLIDE ${i+1}]\nHeadline: ${s.headline}\nBody: ${s.body}`).join('\n\n')
  contentSection = `\n[CAPTION]\n<caption_tag>\n${caption}\n</caption_tag>\n<slides_tag>\n${slidesText}\n</slides_tag>`
} else {
  contentSection = `\n<caption_tag>\n${caption}\n</caption_tag>`
}
```

**Extract to shared helper:**

```typescript
// features/ai/validation/prompts/shared/content-section.ts

export interface ContentSectionOpts {
  captionTag: string
  slidesTag?: string
  introText?: string
}

export function buildContentSection(
  text: string,
  slides: Array<{ headline: string; body: string }> | undefined,
  opts: ContentSectionOpts,
): string {
  const isCarousel = !!slides?.length

  if (!isCarousel) {
    return `\n<${opts.captionTag}>\n${text}\n</${opts.captionTag}>`
  }

  const slidesText = slides!
    .map((s, i) => `[SLIDE ${i + 1}]\nHeadline: ${s.headline}\nBody: ${s.body}`)
    .join('\n\n')

  const intro = opts.introText ? `\n${opts.introText}` : ''
  const slidesSection = opts.slidesTag
    ? `\n<${opts.slidesTag}>\n${slidesText}\n</${opts.slidesTag}>`
    : ''

  return `${intro}\n[CAPTION]\n<${opts.captionTag}>\n${text}\n</${opts.captionTag}>${slidesSection}`
}
```

**Replace in each validator:**

```typescript
// validate-quality.ts:
const contentSection = buildContentSection(input.caption, input.slides, {
  captionTag: 'caption_to_rate',
  slidesTag: 'slides_to_rate',
  introText: 'Evaluate the carousel as a whole (caption + all slides together).',
})

// validate-language.ts:
const contentSection = buildContentSection(input.text, input.slides, {
  captionTag: 'caption_to_validate',
  slidesTag: 'slides_to_validate',
})

// validate-source-grounding.ts:
const contentSection = buildContentSection(generatedText, slides, {
  captionTag: 'caption_to_check',
  slidesTag: 'slides_to_check',
})
```

### ✓ Step 16 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] No inline carousel/single branching in any validator file
- [ ] Rendered content blocks byte-identical to before

---

## Step 17 — Remove opener_follows_rules Throughout

> **Files:** `scoring.ts`, `compute-scores.ts`, `validate-quality.ts`, `validate-post.ts`,
> `validation-criteria.ts`

Per the prompt simplification plan: `opener_follows_rules` is removed. The banned opener list is
removed. `hook_verdict` already covers opener quality.

```typescript
// Remove from QualityBase in scoring.ts:
opener_follows_rules: boolean
opener_violation: string | null

// Remove from CriteriaDetections in compute-scores.ts:
opener_follows_rules: boolean

// Remove from computeCriteriaScore in compute-scores.ts:
if (!d.opener_follows_rules) penalty += CRITERIA_PENALTIES.OPENER_VIOLATION

// Remove from LlmQualityResponse in validate-quality.ts:
opener_follows_rules: boolean
opener_violation: string | null

// Remove from result construction in validate-quality.ts:
opener_follows_rules: parsed.opener_follows_rules ?? true,
opener_violation: parsed.opener_violation ?? null,

// Remove from LLM return format JSON in validate-quality.ts:
"opener_follows_rules": boolean,
"opener_violation": string | null,

// Remove from criteriaDetections in validate-post.ts:
opener_follows_rules: quality.opener_follows_rules,

// Remove from buildCriteriaChecklist in validation-criteria.ts:
// Any [] OPENER: section referencing banned/allowed opener lists
```

```bash
grep -r "opener_follows_rules\|opener_violation\|OPENER_VIOLATION\|formatBannedOpeners\|formatAllowedOpeners" src/
# Expected: nothing after this step
```

### ✓ Step 17 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "opener_follows_rules" src/` — nothing
- [ ] `grep -r "formatBannedOpeners\|formatAllowedOpeners" src/` — nothing
- [ ] Validation pipeline produces `criteria_score` without opener penalty

---

## Step 18 — Extract Shared Helpers

> **New file:** `features/ai/utils/prompt-helpers.ts`

Three small patterns repeated across generation and research prompts:

```typescript
// features/ai/utils/prompt-helpers.ts

import { POST_HISTORY_LIMIT, POST_HISTORY_CHAR_CAP } from '@/features/ai/constants'

/** Returns today's date as YYYY-MM-DD. Used in prompts. */
export function todayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

/** Formats post history for prompt inclusion. Applies entry limit and char cap. */
export function formatHistory(
  history: string[],
  opts?: { limit?: number; charCap?: number; format?: 'pipe' | 'bullets' }
): string {
  const limit = opts?.limit ?? POST_HISTORY_LIMIT
  const cap = opts?.charCap ?? POST_HISTORY_CHAR_CAP
  const format = opts?.format ?? 'pipe'
  if (history.length === 0) return ''
  const entries = history.slice(0, limit)
  const joined = format === 'bullets'
    ? entries.map(t => `- ${t}`).join('\n')
    : entries.join(' | ')
  return joined.slice(0, cap)
}

/**
 * Wraps content in a labelled section tag for prompt clarity.
 * Returns '' when content is blank — callers can .filter(Boolean).
 */
export function buildPromptSection(title: string, tag: string, content: string): string {
  if (!content.trim()) return ''
  return `${title}:\n<${tag}>\n${content.trim()}\n</${tag}>`
}
```

Replace all inline occurrences:

```bash
# Find all inline date formatting:
grep -rn "toISOString.*split.*T" src/ai/
# Replace each with: todayDateString()

# Find inline history joining:
grep -rn "postHistory.*join\|postHistory.*slice" src/ai/
# Replace each with: formatHistory(...)
```

### ✓ Step 18 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "toISOString().split" src/ai/` — nothing (all use `todayDateString()`)
- [ ] Both research and generation use `formatHistory()` with the same limit constants

---

## Step 19 — Phase 4 Final Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Reduction audit

```bash
# Count lines before vs after (compare to git baseline)
wc -l src/ai/validation/prompts/validate-quality.ts
wc -l src/ai/validation/prompts/validate-language.ts
wc -l src/ai/validation/prompts/validate-source-grounding.ts
```

Target: each validator file reduced by 30-40 lines from removed duplicate types and content
section builders.

```bash
# Shared helpers used correctly
grep -rn "buildContentSection" src/ai/validation/   # 3 results (one per validator)
grep -rn "buildBrandVoiceDescription" src/ai/       # 2 results (generation + validation)
grep -rn "SOURCE_GROUNDING_RULES" src/ai/           # 2 results (source-grounding + criteria)
grep -rn "todayDateString" src/ai/                  # 2+ results (both prompt builders)
grep -rn "formatHistory" src/ai/                    # 2 results (generation + research)
```

### Full end-to-end test

Run generation + validation for Физиомед (formal, Bulgarian, health client, with source):

- [ ] MYTH-BREAKER post generated — `declared_structure: 'MYTH-BREAKER'` in result
- [ ] MYTH-BREAKER post with CTA — validation flags it
- [ ] Bulgarian AI tells still detected — from DB, not code
- [ ] Source grounding runs — all three rules checked including "structure ≠ source structure"
- [ ] Language corrections applied — corrected_text in result
- [ ] Brand voice check in validator matches generation brand voice section exactly

---

## Complete Change Summary

### Phase 1 — Single Source of Truth

| Concern | Before | After |
|---|---|---|
| `AI_TELL_PATTERNS` location | `validation-criteria.ts` | `generation-criteria.ts` — re-exported from validation |
| Source grounding rules | Different text in generation and validation | `SOURCE_GROUNDING_RULES` constant in `source-grounding.ts` |
| Brand voice description | Two functions, same data | `buildBrandVoiceDescription()` — one function, two callers |
| Structure descriptions in validator | Names only | Full descriptions via `formatStructureDescriptions()` |
| Health rules | Confirmed single source | `formatHealthRules()` in `generation-criteria.ts` |

### Phase 2 — Language-Driven Rules

| Concern | Before | After |
|---|---|---|
| Bulgarian AI tells | Hardcoded `if (language === 'Bulgarian')` blocks | DB `language_instructions` with `AI TELL:` prefix |
| Language tell extraction | None — all hardcoded | `extractLanguageAiTells(languageInstructions)` |
| Adding new language | Requires code change + deploy | Requires only DB entry |
| Formality register patterns | Per-language if blocks | Derived from `lc.formality` value |

### Phase 3 — Thread Declared Structure

| Concern | Before | After |
|---|---|---|
| Planning declaration | Stripped and discarded | Extracted into `ParsedPost.declaredStructure` |
| Validator knowledge of structure | Inferred from post body | Explicitly passed as `QualityContext.declaredStructure` |
| MYTH-BREAKER CTA check | Validator guesses | Validator knows: "this structure forbids CTAs" |
| Structure compliance check | Generic "not predictable" | Specific to declared structure definition |

### Phase 4 — Code Reduction

| Concern | Before | After |
|---|---|---|
| `QualityResult` and related types | In `validate-quality.ts` + `scoring.ts` | `scoring.ts` only |
| `LanguageValidationResult` | In `validate-language.ts` + `scoring.ts` | `scoring.ts` only |
| `SourceGroundingResult` | In `validate-source-grounding.ts` + `scoring.ts` | `scoring.ts` only |
| `QualityContext` | Inside `validate-quality.ts` | `scoring.ts` |
| Carousel content block | 3 identical implementations | `buildContentSection()` shared helper |
| `opener_follows_rules` | Types, scoring, criteria, prompt | Fully removed |
| Date formatting | `new Date().toISOString().split('T')[0]` × N | `todayDateString()` |
| History formatting | Different format per flow | `formatHistory()` shared helper |

---

*PostFlow — Generation–Validation Sync*
*Implement phase by phase. Verify end-to-end after each phase.*