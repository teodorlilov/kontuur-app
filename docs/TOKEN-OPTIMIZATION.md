# Token Usage Optimization Plan

> **Implementation document for Claude Code.**
> Run `npx tsc --noEmit` after every step before proceeding.
> **Rule: one optimization per step. Verify cache hits and token counts before moving on.**

---

## Context

Token costs compound across the generation pipeline. Each theme generates one AI call, then
triggers up to three validation calls (quality, language, source grounding). For a 5-theme batch
with source material, this is potentially 20 API calls with significant duplication:

- The client profile block (~1600 tokens) is sent identically for every theme in a batch
- Source text is paid once in generation and again in source grounding validation
- Post history sends up to 600 tokens of old entries that no longer prevent repetition
- Opener descriptions re-teach concepts the static system prompt already covered
- JSON responses waste tokens on the model deciding its output format

Total estimated saving for a typical 5-theme batch with source material: **~15,000–20,000 tokens**
per batch after all optimizations.

---

## Measuring Token Usage

Before and after each step, log the token counts from the API response to confirm the saving:

```typescript
// Add to callAnthropic in content-generator.ts temporarily
console.log('[tokens]', {
  input:          message.usage.input_tokens,
  output:         message.usage.output_tokens,
  cache_creation: message.usage.cache_creation_input_tokens ?? 0,
  cache_read:     message.usage.cache_read_input_tokens ?? 0,
})
```

`cache_read_input_tokens > 0` confirms a cache hit occurred. `cache_creation_input_tokens > 0`
confirms the cache entry was written. Remove the logging after verification.

---

## Build Order

```
── SESSION A: String-Level Optimizations (low risk, no architecture change) ─
Step 1  → Compress opener descriptions
Step 2  → Trim post history with character cap
Step 3  → Cap source text in enrichment and grounding prompt
Step 4  → JSON prefill for carousel and reels
Step 5  → Session A verification

── SESSION B: Cache Client Profile Block (architecture change) ──────────────
Step 6  → Split user message into cached + uncached blocks
Step 7  → Verify cache hits in production
Step 8  → Session B verification

── SESSION C: Batch Quality Validation ──────────────────────────────────────
Step 9  → Extend validateQuality to accept multiple captions
Step 10 → Update collectSinglePosts to use batch validation
Step 11 → Session C verification
```

**Session A has no architecture dependencies — run it first.**
**Session B changes the API call structure — run after Session A is verified.**
**Session C changes the validation pipeline — run as a separate session after B.**

---

## Session A — String-Level Optimizations

---

## Step 1 — Compress Opener Descriptions

> **File:** `features/ai/generation/generation-criteria.ts`

The `formatAllowedOpeners` output is ~600 tokens for a formal client (4 opener types, each with a
multi-sentence description plus a counter-example). The static system prompt already teaches the
model what good openers look like. The per-call section needs to convey the allowed options, not
re-teach the concept.

**Current output per opener (~150 tokens each):**
```
(a) professional_observation: Open with a specific observation from clinical or professional
practice — something the expert notices that clients often miss. Framed as knowledge, not
intimacy. Example cue: "Patients who [specific behaviour] consistently show [specific
outcome]." NOT: "Many people struggle with X" (too generic).
```

**Target output per opener (~35 tokens each):**
```
(a) PROFESSIONAL OBSERVATION
    A specific clinical insight clients typically miss.
    Cue: "Patients who [behaviour] consistently show [outcome]."
```

The compression rules:
- Title in CAPS — scannable
- One sentence of description — what it is, not how to do it
- One example cue — the pattern, not a counter-example
- Remove `NOT:` examples — the banned openers section already covers what to avoid

This change is inside `formatAllowedOpeners`. The opener data in `ALLOWED_OPENER_TYPES_BY_FORMALITY`
stays unchanged — only the formatter changes.

```typescript
export function formatAllowedOpeners(config?: LanguageConfig | null): string {
  const formality = config?.formality ?? 'neutral'
  const openers = config?.openerExamples?.filter((e) => e.formality === formality) ?? []
  if (openers.length === 0) return '   (no opener types defined for this register)'
  return openers
    .map((e, i) => {
      const label = String.fromCharCode(97 + i)
      // Compressed format — title + one-line description + cue only
      return `   (${label}) ${e.id.toUpperCase().replace(/_/g, ' ')}\n` +
             `       ${e.shortDescription ?? e.description.split('.')[0]}.\n` +
             `       Cue: ${e.exampleCue ?? e.content}`
    })
    .join('\n')
}
```

This requires adding `shortDescription` and `exampleCue` fields to the opener data in the database
or in the static constants. If the opener data lives in the DB (`openerExamples`), add these as
optional columns. If hardcoded, add to the constant objects.

**If adding DB columns is too much scope for this step**, add a `compressDescription` helper that
takes the first sentence of `e.description` and the first example from `e.content`:

```typescript
function compressOpenerDescription(description: string): string {
  // Take first sentence only
  return description.split(/[.!?]/)[0]?.trim() ?? description
}

function extractExampleCue(content: string): string {
  // Take up to 80 characters
  return content.length > 80 ? content.slice(0, 80) + '…' : content
}
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Log token counts before and after — input tokens reduced by ~400-450 per call
- [ ] Generate a single post — opener types still present in rendered prompt
- [ ] Post quality unchanged — opener is still chosen correctly

---

## Step 2 — Trim Post History with Character Cap

> **File:** `features/ai/generation/prompts/client-profile.ts`

Post history at `PROMPT_HISTORY_LIMIT = 15` entries sends up to ~600 tokens of topic summaries.
Entries older than the most recent 10 have diminishing value for preventing repetition.
A character cap further limits runaway costs from unusually verbose history entries.

```typescript
// In buildClientProfile or buildUserMessage where postHistory is assembled:

const HISTORY_ENTRY_LIMIT = 10          // max recent entries — was PROMPT_HISTORY_LIMIT
const HISTORY_CHAR_CAP = 400            // hard character cap on the joined string

const historyText = input.client.postHistory
  .slice(0, HISTORY_ENTRY_LIMIT)
  .join(' | ')
  .slice(0, HISTORY_CHAR_CAP)

const historySection = historyText
  ? `Recent topics — do not repeat angles from: ${historyText}`
  : ''
```

The wording change ("do not repeat angles from" vs "do not repeat") is also an improvement — the
model should avoid the *angle*, not refuse the topic entirely. A post about hydration can be written
from a new angle even if a previous post covered hydration.

**Add `HISTORY_ENTRY_LIMIT` and `HISTORY_CHAR_CAP` to `features/ai/constants.ts`** alongside the
existing `PROMPT_HISTORY_LIMIT`. Remove `PROMPT_HISTORY_LIMIT` if it is only used for this purpose.

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Log token counts — input tokens reduced by ~300-475 per call
- [ ] Clients with short history (< 10 entries) — behaviour unchanged
- [ ] Clients with long history — history truncated at 400 chars, not mid-word edge cases

---

## Step 3 — Cap Source Text

> **Files:** `features/ai/generation/generation-run.ts`,
> `features/ai/generation/prompts/source-grounding.ts`

Source text is the largest variable token cost. A 3000-word article is ~4000 tokens — paid once
in generation and again in source grounding validation. For a post that uses 2-3 facts from the
article, sending the full article is wasteful.

### 3a — Cap at enrichment time

In `runGenerationBatch`, when populating `theme.groundingText`, apply the cap:

```typescript
import { capSourceText } from '@/lib/sources/cap-source-text'

// In the enrichment map:
groundingText: capSourceText(theme.sourceFullText || theme.sourceExcerpt),
```

`cap-source-text.ts` already exists in the codebase. Confirm the current cap value. If it is
higher than 1500 tokens (~6000 characters), reduce it:

```typescript
// lib/sources/cap-source-text.ts
const MAX_SOURCE_CHARS = 6000   // ~1500 tokens

export function capSourceText(text: string | undefined): string | undefined {
  if (!text) return undefined
  if (text.length <= MAX_SOURCE_CHARS) return text
  return text.slice(0, MAX_SOURCE_CHARS) + '\n[Source truncated — use only the above]'
}
```

### 3b — Apply the same cap in buildGroundingPrompt

`buildGroundingPrompt` (was `buildSourceGroundingSection`) in `source-grounding.ts` currently
inserts `sourceExcerpt` as-is. Apply the cap here too as a safety net in case the enrichment cap
was bypassed:

```typescript
import { capSourceText } from '@/lib/sources/cap-source-text'

export function buildGroundingPrompt(opts: {
  sourceExcerpt?: string
  sourceUrl?: string | null
  requireSourceGrounding?: boolean
  contentLabel?: string
}): string {
  const { sourceExcerpt, sourceUrl, requireSourceGrounding, contentLabel = 'caption' } = opts
  if (!requireSourceGrounding || !sourceExcerpt) return ''

  const capped = capSourceText(sourceExcerpt) ?? sourceExcerpt

  return `
SOURCE MATERIAL (ground all facts in this):
<source_excerpt>
${capped}
</source_excerpt>
...`
}
```

**Add `MAX_SOURCE_CHARS` to `features/ai/constants.ts`** and import it in `cap-source-text.ts`.

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Log token counts for a call with source material — input tokens reduced by
  `(original_source_length - 6000_chars) / 4` tokens
- [ ] `[Source truncated]` marker appears in rendered prompt when source is long
- [ ] Generated post still cites facts correctly — cap is at a sensible boundary

---

## Step 4 — JSON Prefill for Carousel and Reels

> **Files:** `features/ai/generation/generators/content-generator.ts`,
> `features/ai/generation/generators/carousel-generator.ts`,
> `features/ai/generation/generators/reels-generator.ts`

Carousel and reels expect JSON responses. The model generates `{` as its first character in every
response. Prefilling the assistant turn with `{` tells the model its output format is already
decided — it skips format deliberation and starts generating content immediately.

**Add `prefill()` method to `ContentGenerator`:**

```typescript
// content-generator.ts

/**
 * Optional assistant turn prefill.
 * Default: empty string (no prefill).
 * JSON-returning generators override to return '{'.
 */
protected prefill(): string {
  return ''
}

private async callAnthropic(systemPrompt: string, userMessage: string): Promise<Message> {
  const prefillText = this.prefill()

  const messages: MessageParam[] = [
    { role: 'user', content: userMessage },
  ]
  if (prefillText) {
    messages.push({ role: 'assistant', content: prefillText })
  }

  return anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages,
  })
}
```

**Override in CarouselGenerator:**

```typescript
protected prefill(): string {
  return '{'
}

protected parseResponse(message: Message): CarouselResult {
  // Prepend the prefilled character before parsing
  const rawText = '{' + (message.content[0]?.type === 'text' ? message.content[0].text : '')
  return parseJsonResponse<CarouselResult>(rawText)
}
```

**Override in ReelsGenerator:**

```typescript
protected prefill(): string {
  return '{'
}

protected parseResponse(message: Message): ReelsResult {
  const rawText = '{' + (message.content[0]?.type === 'text' ? message.content[0].text : '')
  return parseJsonResponse<ReelsResult>(rawText)
}
```

The saving here is minor (~5-10 tokens per call). The real benefit is consistency — the model
starts generating content immediately without preamble, which occasionally eliminates the
`"Here is the JSON:"` prefix that breaks `parseJsonResponse`.

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Generate a carousel — response parses correctly, `{` prefix handled
- [ ] Generate a reels — response parses correctly
- [ ] Generate a single post — unaffected (no prefill, no change to parseResponse)
- [ ] No `parseJsonResponse` errors in logs

---

## Step 5 — Session A Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Token count comparison

Run a generation with logging enabled (add the temporary logging from the Context section).
Compare before vs after for a 5-theme batch with source material:

| Metric | Before | After | Target saving |
|---|---|---|---|
| Input tokens per generation call | ~2600 | ~1700 | ~900 |
| Input tokens per batch (5 themes) | ~13,000 | ~8,500 | ~4,500 |
| Source text tokens (per post with source) | up to 4000 | ≤1500 | up to 2500 |
| History tokens per call | up to 600 | ~125 | ~475 |
| Opener tokens per call | ~600 | ~150 | ~450 |

### Functional verification
- [ ] Single post generation — quality unchanged
- [ ] Carousel generation — correct structure
- [ ] Reels generation — correct structure, prefill works
- [ ] Posts with source material — facts still cited correctly
- [ ] Post history still prevents direct repetition

---

## Session B — Cache Client Profile Block

> **Start a fresh session for this.**
> Session A must be fully verified before starting Session B.

---

## Step 6 — Split User Message into Cached + Uncached Blocks

> **File:** `features/ai/generation/generators/content-generator.ts`

The Anthropic API supports `cache_control` on individual content blocks in the messages array, not
just the system prompt. The client profile — openers, structures, client brief, language rules,
brand voice, platform limits — is identical for every theme in a batch. It can be cached.

The theme-specific content — theme directive, source grounding, angle differentiation, today's
date — changes per theme and must not be cached.

**Current `buildUserMessage` output:**

```
[ALLOWED OPENERS]           ← identical per theme
[ALLOWED STRUCTURES]        ← identical per theme
[CLIENT PROFILE]            ← identical per theme
[LANGUAGE RULES]            ← identical per theme
[BRAND VOICE]               ← identical per theme
[PLATFORM LIMITS]           ← identical per theme
[HEALTH RULES if applicable] ← identical per theme
Recent topics: ...          ← identical per theme
[SOURCE GROUNDING]          ← changes per theme
[ANGLE DIFFERENTIATION]     ← changes per theme
Today's date: ...           ← changes (but rarely)
[THEME DIRECTIVE]           ← changes per theme
```

**Split point:** everything above source grounding is the cacheable client context.
Everything from source grounding onward is theme-specific.

The cleanest implementation: `buildUserMessage` returns two strings instead of one. The base class
`callAnthropic` receives both and assembles the multi-block message.

```typescript
// content-generator.ts

/**
 * Builds the cacheable client context portion of the user message.
 * Assembled by buildClientProfile — identical for every theme in a batch.
 * Passed as a cached content block.
 */
protected buildClientContext(input: TInput): string {
  return buildClientProfile({
    client: input.client,
    platform: this.getPlatform(input),
    targetPillar: input.targetPillar,
  })
}

/**
 * Builds the theme-specific portion of the user message.
 * Changes per theme — source, angle diff, date, directive.
 * Never cached.
 */
protected buildThemeContext(input: TInput): string {
  const history = input.client.postHistory.length > 0
    ? `Recent topics — do not repeat angles from: ${
        input.client.postHistory
          .slice(0, HISTORY_ENTRY_LIMIT)
          .join(' | ')
          .slice(0, HISTORY_CHAR_CAP)
      }`
    : ''

  const source = buildGroundingPrompt({
    sourceExcerpt: input.sourceExcerpt,
    sourceUrl: input.sourceUrl,
    requireSourceGrounding: input.requireSourceGrounding,
  })

  const angleDiff = buildAngleVariationPrompt(input.similarPastThemes ?? [])
  const today = `Today's date: ${new Date().toISOString().split('T')[0]}`
  const directive = this.buildDirective(input)

  return [history, source, angleDiff, today, directive]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Kept for compatibility — assembles full message for subclasses that need it.
 * callAnthropic now uses buildClientContext + buildThemeContext directly.
 */
protected buildUserMessage(input: TInput): string {
  return [this.buildClientContext(input), this.buildThemeContext(input)]
    .filter(Boolean)
    .join('\n\n')
}

private async callAnthropic(systemPrompt: string, input: TInput): Promise<Message> {
  const clientContext = this.buildClientContext(input)
  const themeContext = this.buildThemeContext(input)
  const prefillText = this.prefill()

  const messages: MessageParam[] = [
    {
      role: 'user',
      content: [
        // Cached block — client profile, openers, structures, rules
        // Identical for every theme in this client's batch → cache hit from theme 2 onward
        {
          type: 'text' as const,
          text: clientContext,
          cache_control: { type: 'ephemeral' },
        },
        // Uncached block — theme-specific content
        {
          type: 'text' as const,
          text: themeContext,
        },
      ],
    },
  ]

  if (prefillText) {
    messages.push({ role: 'assistant', content: prefillText })
  }

  return anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages,
  })
}

// Update generate() to pass input directly to callAnthropic
async generate(input: TInput): Promise<TOutput> {
  const systemPrompt = this.buildSystemPrompt(input)
  const message = await this.callAnthropic(systemPrompt, input)
  return this.parseResponse(message, input)
}
```

**Why pass `input` to `callAnthropic` instead of pre-built strings:** the split into
`buildClientContext` and `buildThemeContext` happens inside `callAnthropic`. `generate()` no longer
needs to call `buildUserMessage()` first — the two-block assembly is internal to `callAnthropic`.

**Cache effectiveness condition:** the cache hit only fires when the client context block is
byte-for-byte identical between calls. This means:
- Same client (same profile, openers, language rules)
- Same formality, same platform
- Same health niche status

For a batch of themes for the same client, all of these are true. The first theme in the batch
writes the cache entry. Themes 2-5 get cache hits.

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Add temporary token logging (from Context section)
- [ ] Run a 3-theme batch: theme 1 should show `cache_creation_input_tokens > 0`
- [ ] Themes 2 and 3 should show `cache_read_input_tokens > 0` and `cache_creation_input_tokens = 0`
- [ ] `cache_read_input_tokens` value should be approximately the size of `buildClientContext` output
- [ ] Generate a post, carousel, and reels — all produce correct output

---

## Step 7 — Verify Cache Hits in Production

Run a real generation batch for Физиомед (formal, Bulgarian, health client) — the most complex
client profile:

```typescript
// Temporary diagnostic in callAnthropic:
const usage = message.usage
console.log(`[cache] theme input=${usage.input_tokens} ` +
  `creation=${usage.cache_creation_input_tokens ?? 0} ` +
  `read=${usage.cache_read_input_tokens ?? 0}`)
```

Expected output for a 3-theme batch:

```
[cache] theme input=2100 creation=1600 read=0     ← theme 1: cache written
[cache] theme input=650  creation=0    read=1600   ← theme 2: cache hit
[cache] theme input=650  creation=0    read=1600   ← theme 3: cache hit
```

If `cache_read_input_tokens` is 0 for themes 2 and 3, the client context is not byte-identical
between calls. Common causes:
- `new Date()` called inside `buildClientContext` — move date to `buildThemeContext`
- Non-deterministic field ordering in `ClientContext`
- Health rules block includes dynamic content

**Remove the temporary logging after verification.**

### ✓ Step 7 Verification
- [ ] Cache hits confirmed for themes 2+ in a multi-theme batch
- [ ] Token logging removed
- [ ] Full functional test: generate 5-theme batch, all posts correct

---

## Step 8 — Session B Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Expected token saving for 5-theme batch

```
Without cache: 5 × 1600 (client context) = 8000 tokens at full price
With cache:    1 × 1600 (write) + 4 × 1600 × 0.1 (read at 10% cost) = 2240 effective tokens
Saving: 8000 - 2240 = 5760 tokens (~72% reduction for client context)
```

Actual numbers will vary by client profile size. Confirm the saving matches expectations from the
`cache_read_input_tokens` logs.

---

## Session C — Batch Quality Validation

> **Start a fresh session for this.**
> Sessions A and B must be fully verified before starting Session C.

---

## Step 9 — Extend validateQuality for Multiple Captions

> **File:** `features/ai/validation/prompts/validate-quality.ts`

When `count > 1` (or the over-request multiplier produces 3-4 captions), quality validation runs
separately on each caption — paying the quality system prompt and full validation overhead N times.
Batch them in one API call.

Add `validateQualityBatch`:

```typescript
/**
 * Validates multiple captions in a single API call.
 * More efficient than calling validateQuality N times for multi-caption themes.
 * Returns results in the same order as the input captions.
 */
export async function validateQualityBatch(
  captions: string[],
  ctx?: QualityContext
): Promise<QualityResult[]> {
  if (captions.length === 1) {
    // Single caption — use standard validateQuality (no overhead of batch format)
    const result = await validateQuality({ caption: captions[0]! }, ctx)
    return [result]
  }

  const brandCtx = buildBrandContext(ctx)
  const langTells = buildLanguageTells(ctx)
  const base = buildBasePrompt(brandCtx, langTells, ctx)

  // Present each caption as a numbered block
  const contentSection = captions
    .map((c, i) => `[POST ${i + 1}]\n<post>\n${c}\n</post>`)
    .join('\n\n')

  const returnFormat = `{
  "results": [
    {
      "post_index": number,
      ${/* same fields as single validateQuality */}
    }
  ]
}`

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,   // more output for multiple posts
    system: [{ type: 'text', text: base, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `${contentSection}

Evaluate each post independently. Return JSON only with a "results" array,
one entry per post in the same order:
${returnFormat}`,
    }],
  })

  const parsed = parseJsonResponse<{ results: LlmQualityResponse[] }>(message)
  const results = Array.isArray(parsed.results) ? parsed.results : []

  // Map each raw result to QualityResult — same transformation as validateQuality
  return results.map((raw, i) => buildQualityResult(raw, 'single'))
}
```

Extract the result-building logic from `validateQuality` into a shared `buildQualityResult`
function so both `validateQuality` and `validateQualityBatch` use the same transformation:

```typescript
function buildQualityResult(
  parsed: LlmQualityResponse,
  kind: 'single' | 'carousel'
): QualityResult {
  const hook_verdict = safeParseHookVerdict(parsed.hook_verdict)
  const cta_verdict = safeParseCtaVerdict(parsed.cta_verdict)
  const ai_tells = Array.isArray(parsed.ai_tells) ? parsed.ai_tells : []
  const issues = Array.isArray(parsed.issues) ? parsed.issues : []
  // ... same as current validateQuality transformation ...
  const scores = computeQualityScores({ ai_tells, issues, hook_verdict, cta_verdict, ... })
  const result: QualityBase = { ...scores, hook_verdict, cta_verdict, ... }
  return kind === 'carousel' ? { ...result, kind: 'carousel' } : { ...result, kind: 'single' }
}
```

### ✓ Step 9 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `validateQualityBatch(['single caption'], ctx)` returns `[QualityResult]` — same as
  `validateQuality`
- [ ] `validateQualityBatch(['caption1', 'caption2'], ctx)` returns 2 results in correct order
- [ ] Results are structurally identical to individual `validateQuality` calls

---

## Step 10 — Update collectSinglePosts to Use Batch Validation

> **File:** `features/ai/generation/generation-run.ts`

Replace the parallel individual quality validation calls in `collectSinglePosts` with one batch
quality call plus parallel individual language calls:

```typescript
import { validateQualityBatch } from '@/ai/validation/prompts/validate-quality'
import { validateLanguage } from '@/ai/validation/prompts/validate-language'
import { deriveSlopFromQuality } from '@/ai/validation/content-rules/compute-scores'

async function collectSinglePosts(theme: Theme, captions: string[]) {
  void ctx.trackTheme(theme, captions.length)

  const sourceContext = buildGroundingContext(theme)
  const requested = theme.count || 1

  // One quality call for all captions — pays system prompt once
  // N language calls in parallel — language validation is cheap and per-text
  const [qualityResults, ...langResults] = await Promise.all([
    validateQualityBatch(captions, sharedQualityContext).catch(() =>
      captions.map(() => createDefaultQuality('single'))
    ),
    ...captions.map(caption =>
      validateLanguage(
        { text: caption },
        ctx.client.languageConfig,
      ).catch(() => ({
        passes: true,
        language_score: 10,
        issues: [],
        corrected_text: null,
        corrected_slides: null,
      }))
    ),
  ])

  // Source grounding — run once for the first caption (shared source)
  // Only fires when requireSourceGrounding is true
  const groundingResult = sourceContext
    ? await validateSourceGrounding(
        captions[0]!,
        sourceContext.excerpt,
      ).catch(() => null)
    : null

  // Apply over-request quality floor (from Phase 3 Step 16)
  const results = captions.map((caption, i) => {
    const quality = qualityResults[i] ?? createDefaultQuality('single')
    const lang = langResults[i] ?? { passes: true, language_score: 10, issues: [], corrected_text: null }
    const finalCaption = applyTextCorrections(caption, { quality, language: lang, sourceGrounding: groundingResult })
    return {
      validation: { quality, language: lang, slop: deriveSlopFromQuality(quality), sourceGrounding: groundingResult ?? undefined, qualityScore: quality.quality_score_avg },
      caption: finalCaption,
      score: quality.quality_score_avg,
    }
  })

  const qualified = results
    .filter(r => r.score >= QUALITY_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, requested)

  const toKeep = qualified.length > 0
    ? qualified
    : results.sort((a, b) => b.score - a.score).slice(0, requested)

  toKeep.forEach(({ validation, caption }) =>
    collectResult(validation, buildDraftRecord(theme, {
      caption,
      post_type: 'single',
      slides_json: null,
      quality_score_avg: validation.qualityScore,
    }))
  )
}
```

**Note on source grounding with multiple captions:** all captions for a theme come from the same
source material. Running source grounding on each caption independently is redundant — the source
facts either ground the theme or they do not. Run it once on the first caption and apply the
grounding result to all.

### ✓ Step 10 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Log token counts — for a 3-caption theme: quality system prompt paid once not 3 times
- [ ] All 3 captions receive quality results
- [ ] Quality floor still applied correctly
- [ ] Language corrections still applied per-caption

---

## Step 11 — Session C Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Token saving for multi-caption themes

For 3 captions at quality system prompt ~800 tokens:

```
Before: 3 × 800 = 2400 tokens for quality system prompts
After:  1 × 800 = 800 tokens
Saving: 1600 tokens per multi-caption theme
```

### Functional verification
- [ ] Generate 3 captions for a theme — all 3 receive quality scores
- [ ] Quality floor still discards low-scoring posts
- [ ] Language corrections applied to each caption independently
- [ ] Source grounding runs once — result applied to all captions
- [ ] `validateQualityBatch` with 1 caption delegates to `validateQuality` (no batch overhead)

---

## Complete Change Summary

### Session A — String-Level Optimizations

| Optimization | File | Token saving |
|---|---|---|
| Compress opener descriptions | `generation-criteria.ts` | ~450/call |
| Trim post history | `client-profile.ts` | ~475/call |
| Cap source text | `generation-run.ts`, `source-grounding.ts` | up to 2500/post with source |
| JSON prefill | `content-generator.ts`, `carousel-generator.ts`, `reels-generator.ts` | ~5-10/call |

**Total Session A saving per 5-theme batch:** ~5,000-15,000 tokens depending on source text length.

### Session B — Cache Client Profile Block

| Optimization | File | Token saving |
|---|---|---|
| Split user message into cached + uncached blocks | `content-generator.ts` | ~5,760/batch (themes 2-5 at 10% cache read cost) |

**Requires:** client context block must be byte-identical across themes in a batch.
**Confirmed by:** `cache_read_input_tokens > 0` in API response for themes 2+.

### Session C — Batch Quality Validation

| Optimization | File | Token saving |
|---|---|---|
| `validateQualityBatch` | `validate-quality.ts` | ~1,600 per multi-caption theme (3 captions) |
| Single source grounding per theme | `generation-run.ts` | ~300 per theme with source |

**Applies to:** single post themes with `count > 1` or over-request multiplier active.
**No change for:** carousel (always 1 result), reels (always 1 result).

### Total expected saving per typical 5-theme batch with source material

```
Session A:  ~8,000 tokens  (openers + history + source cap)
Session B:  ~5,760 tokens  (client profile cache hits)
Session C:  ~1,600 tokens  (batch quality validation, if multi-caption)
─────────────────────────────────────────────────────
Total:     ~15,360 tokens  per batch
```

At Sonnet 4.5 input pricing, this is roughly $0.05 per batch saved — meaningful at scale across
multiple clients and daily generation runs.

---

*PostFlow — Token Usage Optimization*
*Implement session by session. Verify token counts at end of each session.*