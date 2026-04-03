# Research Flow — Refactoring Plan

> **Implementation document for Claude Code.**
> Run `npx tsc --noEmit` after every step before proceeding.
> **Rule: one concern per step.**

---

## Context

The research flow spans eleven files across source fetching, topic generation, deduplication, and
orchestration. The code is structurally sound — the OOP source hierarchy and pipeline pattern are
correct. The problems are smaller: constants defined in three places, a redundant field in
`ResearchPromptBuilder`, a wrapper type that wraps nothing, repetitive section builders, a class
that should be plain functions, and a 100-line method that does five different things.

Four categories of work:

**Deduplication** — `SOURCE_FULL_TEXT_CAP` defined in three files. `this.language` stored
redundantly alongside `this.languageConfig.language`. Date formatting repeated in two prompts.
Three source section builders follow an identical pattern.

**Simplification** — `FetchOptions` wraps `FetchLimits` with no additional fields. `SourceFactory`
is a class with only static methods. `system-prompt.ts` is a single function that belongs in
`prompt-builder.ts`. `FullTextMaps` uses two separate Maps with no structural reason for the split.

**Structure** — `loadClientData` is ~100 lines doing five distinct things. The retry loop in
`execute()` duplicates the initial generation call. `ResearchPromptBuilder` has a mutable field
updated between runs — the pattern is correct but can be made clearer.

**Naming** — `ResearchContext` vs `GenerationRunContext` are inconsistent. `FetchOptions` implies
configuration but just forwards `FetchLimits`. `SourceFullTextMap` more clearly describes
`FullTextMaps`.

---

## What Is Redundant Right Now

| Issue | Where | Fix |
|---|---|---|
| `SOURCE_FULL_TEXT_CAP = 4000` | `research-pipeline.ts`, `rss-source.ts`, `file-source.ts`, `website-source.ts` | One constant in `fetch-limits.ts` |
| `this.language = opts.languageConfig.language` | `prompt-builder.ts` | Remove — use `this.languageConfig.language` |
| `new Date().toISOString().split('T')[0]` | Both prompt methods | `todayDate()` helper |
| Three source section builders with identical pattern | `prompt-builder.ts` | `buildSourceSection()` helper |
| `FetchOptions { limits?: FetchLimits }` | `types.ts`, all source files | Remove — pass `FetchLimits` directly |
| Retry loop duplicates initial generation call | `research-pipeline.ts` | Extract `generateAndFilter()` |
| `SourceFactory` class with only static methods | `source-factory.ts` | Plain exported functions |
| `system-prompt.ts` single function | Separate file | Merge into `prompt-builder.ts` |

---

## Target Structure

```
features/ai/research/
├── research-pipeline.ts        # Orchestration (was research-pipeline.ts — unchanged)
├── deduplicator.ts             # Unchanged — already clean
├── fetch-limits.ts             # Add SOURCE_FULL_TEXT_CAP export here
├── types.ts                    # Remove FetchOptions, rename FullTextMaps → SourceFullTextIndex,
│                               # rename ResearchContext → ResearchRunContext
│
├── sources/
│   ├── research-source.ts      # Update fetch() signature: FetchLimits? not FetchOptions?
│   ├── rss-source.ts           # Import SOURCE_FULL_TEXT_CAP, remove local constant
│   ├── website-source.ts       # Same
│   ├── file-source.ts          # Same
│   └── source-factory.ts       # Convert class to plain functions
│
└── prompts/
    └── prompt-builder.ts       # Merge system-prompt.ts in here
                                # Remove redundant this.language field
                                # Extract buildSourceSection(), todayDate()
```

---

## Build Order

```
── PHASE 1: Constant and Redundancy Cleanup ────────────────────────────────
Step 1  → Extract SOURCE_FULL_TEXT_CAP to fetch-limits.ts
Step 2  → Remove this.language from ResearchPromptBuilder
Step 3  → Extract todayDate() helper
Step 4  → Extract buildSourceSection() helper in prompt-builder.ts
Step 5  → Merge system-prompt.ts into prompt-builder.ts
Step 6  → Phase 1 verification

── PHASE 2: Type Simplification ────────────────────────────────────────────
Step 7  → Remove FetchOptions — pass FetchLimits directly
Step 8  → Rename FullTextMaps → SourceFullTextIndex, simplify to one Map
Step 9  → Rename ResearchContext → ResearchRunContext
Step 10 → Phase 2 verification

── PHASE 3: Structure Improvements ─────────────────────────────────────────
Step 11 → Convert SourceFactory class to plain functions
Step 12 → Split loadClientData into focused private methods
Step 13 → Extract generateAndFilter to collapse retry loop duplication
Step 14 → Phase 3 verification
```

---

## Phase 1 — Constant and Redundancy Cleanup

---

## Step 1 — Extract SOURCE_FULL_TEXT_CAP

> **Files:** `fetch-limits.ts`, `rss-source.ts`, `file-source.ts`, `website-source.ts`,
> `research-pipeline.ts`

`SOURCE_FULL_TEXT_CAP = 4000` is defined as a local constant in four files. It controls how much
of a source's full text is attached to topics for downstream grounding. One definition, imported
everywhere.

**In `fetch-limits.ts` — add export:**

```typescript
/**
 * Maximum characters of source full text attached to a topic for downstream grounding.
 * Shared by all source types — change here to affect all.
 */
export const SOURCE_FULL_TEXT_CAP = 4000
```

**In `rss-source.ts`, `file-source.ts`, `website-source.ts`:**

```typescript
// Remove:
const SOURCE_FULL_TEXT_CAP = 4000

// Add import:
import { SOURCE_FULL_TEXT_CAP } from '../fetch-limits'
```

**In `research-pipeline.ts`:**

```typescript
// Remove:
const SOURCE_FULL_TEXT_CAP = 4000

// Add to existing fetch-limits import:
import { computeFetchLimits, SOURCE_FULL_TEXT_CAP } from './fetch-limits'
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "SOURCE_FULL_TEXT_CAP = 4000" src/` — exactly 1 result (fetch-limits.ts)
- [ ] All source files import from fetch-limits

---

## Step 2 — Remove Redundant this.language Field

> **File:** `features/ai/research/prompts/prompt-builder.ts`

`ResearchPromptBuilder` stores both `this.language` and `this.languageConfig` where
`this.language = opts.languageConfig.language`. Wherever `this.language` is used, it reads the
same value as `this.languageConfig.language`.

Remove the field and all references:

```typescript
// Before:
private niche: string
private language: string       // ← redundant
private languageConfig: LanguageConfig
private contentPillars: WeightedPillar[]
private postHistory: string[]

constructor(opts: { niche: string; languageConfig: LanguageConfig; contentPillars: WeightedPillar[]; postHistory: string[] }) {
  this.niche = opts.niche
  this.language = opts.languageConfig.language    // ← remove
  this.languageConfig = opts.languageConfig
  this.contentPillars = opts.contentPillars
  this.postHistory = opts.postHistory
}

// After:
private niche: string
private languageConfig: LanguageConfig
private contentPillars: WeightedPillar[]
private postHistory: string[]

constructor(opts: { niche: string; languageConfig: LanguageConfig; contentPillars: WeightedPillar[]; postHistory: string[] }) {
  this.niche = opts.niche
  this.languageConfig = opts.languageConfig
  this.contentPillars = opts.contentPillars
  this.postHistory = opts.postHistory
}
```

Replace all `this.language` usages in the file with `this.languageConfig.language`.

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep "this\.language\b" src/features/ai/research/prompts/prompt-builder.ts` — nothing

---

## Step 3 — Extract todayDate() Helper

> **File:** `features/ai/research/prompts/prompt-builder.ts`

`new Date().toISOString().split('T')[0]` appears in both `buildSourceGroundedPrompt` and
`buildTrendFallbackPrompt`. Extract to a file-local helper:

```typescript
/** Returns today's date as YYYY-MM-DD for use in prompts. */
function todayDate(): string {
  return new Date().toISOString().split('T')[0]
}
```

Replace both occurrences:

```typescript
// Before:
`Today's date: ${new Date().toISOString().split('T')[0]}`

// After:
`Today's date: ${todayDate()}`
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep "toISOString" src/features/ai/research/prompts/prompt-builder.ts` — nothing
- [ ] `todayDate()` called in both prompt methods

---

## Step 4 — Extract buildSourceSection() Helper

> **File:** `features/ai/research/prompts/prompt-builder.ts`

`buildSourceGroundedPrompt` builds three nearly identical section strings:

```typescript
// All three follow the exact same pattern:
const rssSection = sourceContext.rssItems.length > 0
  ? `RSS FEED CONTENT (recent articles and items):\n<rss_content>\n${...}\n</rss_content>`
  : ''

const webSection = sourceContext.websiteExcerpts.length > 0
  ? `WEBSITE CONTENT:\n<website_content>\n${...}\n</website_content>`
  : ''

const fileSection = sourceContext.fileExcerpts.length > 0
  ? `UPLOADED DOCUMENTS (client reference material):\n<document_content>\n${...}\n</document_content>`
  : ''
```

Extract a shared builder:

```typescript
/**
 * Wraps content in a labelled XML-style section for prompt clarity.
 * Returns empty string when content is absent — sections with no content are omitted.
 */
function buildSourceSection(title: string, tag: string, content: string): string {
  if (!content.trim()) return ''
  return `${title}:\n<${tag}>\n${content}\n</${tag}>`
}
```

Then each section becomes one line:

```typescript
const rssSection = buildSourceSection(
  'RSS FEED CONTENT (recent articles and items)',
  'rss_content',
  sourceContext.rssItems
    .map(item => `- ${item.title}: ${item.description}${item.link ? ` (${item.link})` : ''}`)
    .join('\n')
)

const webSection = buildSourceSection(
  'WEBSITE CONTENT',
  'website_content',
  sourceContext.websiteExcerpts
    .map(w => `[Source URL: ${w.url}]${w.focusInstructions ? `\n[AI FOCUS: ${w.focusInstructions}]` : ''}\n${w.text}`)
    .join('\n\n---\n\n')
)

const fileSection = buildSourceSection(
  'UPLOADED DOCUMENTS (client reference material)',
  'document_content',
  sourceContext.fileExcerpts
    .map(f => `[Document: "${f.label}"]\n${f.text}`)
    .join('\n\n---\n\n')
)
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `buildSourceSection` appears once as a definition, called three times
- [ ] Rendered prompts are byte-for-byte identical to before (no content change)

---

## Step 5 — Merge system-prompt.ts into prompt-builder.ts

> **Delete:** `features/ai/research/prompts/system-prompt.ts`
> **Update:** `features/ai/research/prompts/prompt-builder.ts`

`system-prompt.ts` contains one exported function: `buildResearchSystemPrompt`. It is only ever
called from `prompt-builder.ts`. A file with one function consumed by one caller is not a
separation of concerns — it is file sprawl.

Move `buildResearchSystemPrompt` into `prompt-builder.ts` and delete `system-prompt.ts`.

Since the function is no longer exported from a separate file, make it a private method of
`ResearchPromptBuilder` or a module-level function in `prompt-builder.ts`. Module-level function
is cleaner — it is not specific to the class:

```typescript
// In prompt-builder.ts — add before the class:

/**
 * Builds the static system prompt for research topic generation.
 * Language-aware but client-agnostic — safe to cache.
 */
function buildResearchSystemPrompt(config: LanguageConfig): string {
  const { language } = config
  const sections: string[] = [
    `You are a social media strategist identifying specific, high-quality post themes.
...`
  ]
  // non-Latin script check
  // languageInstructions
  return sections.join('\n')
}
```

Update `generateTopics` in the class to call the module-level function directly (no import needed
since it is in the same file).

Remove the import of `buildResearchSystemPrompt` at the top of `prompt-builder.ts`.

```bash
# After deletion — confirm nothing still imports from system-prompt
grep -r "system-prompt" src/ --include="*.ts"   # nothing
```

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `system-prompt.ts` file does not exist
- [ ] `grep -r "system-prompt" src/` — nothing
- [ ] Research topics still generate with correct system prompt content

---

## Step 6 — Phase 1 Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

- [ ] `grep -r "SOURCE_FULL_TEXT_CAP = 4000" src/` — 1 result (fetch-limits.ts only)
- [ ] `grep "this\.language\b" src/features/ai/research/` — nothing
- [ ] `grep "toISOString" src/features/ai/research/prompts/prompt-builder.ts` — nothing
- [ ] `system-prompt.ts` does not exist
- [ ] Research pipeline end-to-end — topics generated correctly

---

## Phase 2 — Type Simplification

---

## Step 7 — Remove FetchOptions

> **Files:** `types.ts`, `research-source.ts`, `rss-source.ts`, `website-source.ts`,
> `file-source.ts`, `research-pipeline.ts`

`FetchOptions` is a single-field wrapper:

```typescript
export interface FetchOptions {
  limits?: FetchLimits
}
```

Every caller passes `{ limits: computedLimits }`. Every receiver destructures
`options?.limits?.someField`. This wrapper adds a layer of indirection with no benefit.

**Remove `FetchOptions` from `types.ts`.**

**Update `ResearchSource.fetch()` signature:**

```typescript
// Before:
abstract fetch(options?: FetchOptions): Promise<SourceFetchResult>

// After:
abstract fetch(limits?: FetchLimits): Promise<SourceFetchResult>
```

**Update all subclass implementations:**

```typescript
// RssResearchSource:
async fetch(limits?: FetchLimits): Promise<SourceFetchResult> {
  const configMax = (this.config?.max_items as number | undefined) ?? 4
  const maxItems = Math.min(configMax, limits?.rssItemsPerSource ?? configMax)
  // ...
}

// WebsiteResearchSource:
async fetch(limits?: FetchLimits): Promise<SourceFetchResult> {
  const maxPages = limits?.websiteMaxPages
  // ...
}

// FileResearchSource:
async fetch(_limits?: FetchLimits): Promise<SourceFetchResult> {
  return { status: this.extractedText ? 'ok' : 'error', error: null }
}
```

**Update `research-pipeline.ts` `fetchAllSources`:**

```typescript
// Before:
await source.fetch({ limits })

// After:
await source.fetch(limits)
```

And the file source loop:

```typescript
// Before:
await file.fetch()

// After:
await file.fetch()   // unchanged — no limits needed for files
```

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "FetchOptions" src/` — nothing
- [ ] All `fetch()` calls pass `FetchLimits` directly or nothing

---

## Step 8 — Rename FullTextMaps → SourceFullTextIndex

> **File:** `types.ts`, `research-pipeline.ts`

`FullTextMaps` uses two Maps with no structural reason for the split beyond source type:

```typescript
export interface FullTextMaps {
  sourceFullTextMap: Map<string, string>   // keyed by URL (RSS, website)
  fileFullTextMap: Map<string, string>     // keyed by label (file)
}
```

The keys do not overlap — URLs and file labels are different namespaces. But maintaining two Maps
means every consumer (`attachSourceFullText`, `buildFullTextMaps`) has to handle both. A single
Map with a source-type-prefixed key is simpler:

```typescript
// Option A — one flat Map (simpler consumers):
export type SourceFullTextIndex = Map<string, string>
// Keys: URLs for RSS/website, "file:{label}" for files

// Option B — rename only, keep structure (safer rename):
export interface SourceFullTextIndex {
  byUrl: Map<string, string>      // RSS items and website pages keyed by URL
  byLabel: Map<string, string>    // File sources keyed by label
}
```

**Option B is the lower-risk change** — rename only, no structural change. Reserve Option A for a
later cleanup pass if the consumer code is still complex.

**In `types.ts`:**

```typescript
// Remove:
export interface FullTextMaps { ... }

// Add:
export interface SourceFullTextIndex {
  byUrl: Map<string, string>
  byLabel: Map<string, string>
}
```

**Update `research-pipeline.ts`** — rename all usages:

```typescript
// buildFullTextMaps → buildSourceFullTextIndex
private buildSourceFullTextIndex(sources: ResearchSource[]): SourceFullTextIndex {
  const byUrl = new Map<string, string>()
  const byLabel = new Map<string, string>()

  for (const source of sources) {
    const entries = source.getFullTextEntries(SOURCE_FULL_TEXT_CAP)
    const targetMap = source instanceof FileResearchSource ? byLabel : byUrl
    for (const [key, value] of entries) {
      targetMap.set(key, value)
    }
  }

  return { byUrl, byLabel }
}

// attachSourceFullText — update field names:
private attachSourceFullText(topics: ResearchTopic[], index: SourceFullTextIndex): void {
  for (const topic of topics) {
    if (topic.source_url && index.byUrl.has(topic.source_url)) {
      topic.source_full_text = index.byUrl.get(topic.source_url)
    } else if (topic.source_type === 'file' && topic.source_title) {
      topic.source_full_text = index.byLabel.get(topic.source_title)
    }
  }
}
```

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "FullTextMaps" src/` — nothing
- [ ] `grep -r "SourceFullTextIndex" src/` — used in `types.ts` and `research-pipeline.ts` only

---

## Step 9 — Rename ResearchContext → ResearchRunContext

> **Files:** `types.ts`, `research-pipeline.ts`, any API route that constructs the context

`GenerationRunContext` established the pattern for context objects in this codebase. `ResearchContext`
should follow the same convention for consistency.

**In `types.ts`:**

```typescript
// Remove:
export interface ResearchContext { ... }

// Add:
export interface ResearchRunContext { ... }   // identical fields
```

Find all consumers:

```bash
grep -r "ResearchContext" src/ --include="*.ts" -l
```

Update each one. Expected files: `research-pipeline.ts`, the research API route handler.

### ✓ Step 9 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "ResearchContext\b" src/` — nothing (old name gone)
- [ ] `grep -r "ResearchRunContext" src/` — used in types.ts, pipeline, and route

---

## Step 10 — Phase 2 Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

```bash
grep -r "FetchOptions" src/          # nothing
grep -r "FullTextMaps" src/          # nothing
grep -r "ResearchContext\b" src/     # nothing — only ResearchRunContext remains
```

- [ ] Research pipeline end-to-end — topics generated correctly with source grounding

---

## Phase 3 — Structure Improvements

---

## Step 11 — Convert SourceFactory to Plain Functions

> **File:** `features/ai/research/sources/source-factory.ts`

`SourceFactory` is a class with only static methods. In TypeScript, a class with only static
methods is a namespace in disguise — plain exported functions are simpler, more treeshakeable, and
avoid the false impression that `SourceFactory` has instance behaviour.

**Before:**

```typescript
export class SourceFactory {
  static create(row: ClientSourceRow): ResearchSource | null { ... }
  static createAll(rows: ClientSourceRow[]): ResearchSource[] { ... }
}
```

**After:**

```typescript
/** Create a ResearchSource from a DB row. Returns null for unknown types. */
export function createSource(row: ClientSourceRow): ResearchSource | null {
  switch (row.type) {
    case 'rss':     return new RssResearchSource(row)
    case 'website': return new WebsiteResearchSource(row)
    case 'file':    return new FileResearchSource(row)
    default:        return null
  }
}

/** Create sources from all DB rows, filtering out unknown types. */
export function createAllSources(rows: ClientSourceRow[]): ResearchSource[] {
  return rows.map(createSource).filter((s): s is ResearchSource => s !== null)
}
```

**Update `research-pipeline.ts`:**

```typescript
// Remove:
import { SourceFactory } from './sources/source-factory'

// Add:
import { createAllSources } from './sources/source-factory'

// In execute():
// Before:
const sourceObjects = SourceFactory.createAll(clientData.sources)

// After:
const sourceObjects = createAllSources(clientData.sources)
```

### ✓ Step 11 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "SourceFactory" src/` — nothing
- [ ] `grep -r "createAllSources\|createSource" src/` — used in pipeline and factory file only

---

## Step 12 — Split loadClientData

> **File:** `features/ai/research/research-pipeline.ts`

`loadClientData` is ~100 lines doing five distinct things: ownership check, parallel DB queries,
profile + language config construction, history aggregation, and source filtering. Extract each
concern into a focused private method.

```typescript
private async loadClientData(): Promise<ClientData> {
  const defaultLanguageConfig = this.buildDefaultLanguageConfig()

  if (!this.ctx.clientId) {
    return { contentPillars: [], history: [], sources: [], strategy: DEFAULT_STRATEGY, languageConfig: defaultLanguageConfig }
  }

  const owns = await this.verifyClientOwnership()
  if (!owns) {
    return { contentPillars: [], history: [], sources: [], strategy: DEFAULT_STRATEGY, languageConfig: defaultLanguageConfig }
  }

  const [profile, history, sources] = await Promise.all([
    this.fetchClientProfile(),
    this.fetchClientHistory(),
    this.fetchClientSources(),
  ])

  const languageConfig = this.buildLanguageConfig(profile, defaultLanguageConfig)
  const strategy = profile.sourceStrategy ?? DEFAULT_STRATEGY
  const filteredSources = this.filterSourcesByStrategy(sources, strategy)

  return {
    contentPillars: profile.contentPillars,
    history,
    sources: filteredSources,
    strategy,
    languageConfig,
  }
}
```

**Extract the five private methods:**

```typescript
/** Returns the fallback LanguageConfig when no DB data is available. */
private buildDefaultLanguageConfig(): LanguageConfig {
  return {
    language: this.ctx.language || 'English',
    formality: 'neutral',
    nativeCTAPhrases: '',
    carouselSwipeCues: '',
    formalityRules: null,
    languageInstructions: '',
    openerExamples: [],
    languageNotes: '',
  }
}

/** Verify the client belongs to this agency. */
private async verifyClientOwnership(): Promise<boolean> {
  const { data } = await this.ctx.supabase
    .from('clients')
    .select('id')
    .eq('id', this.ctx.clientId!)
    .eq('agency_id', this.ctx.agencyId)
    .single()
  return !!data
}

/** Fetch brand profile, language rules. */
private async fetchClientProfile(): Promise<RawClientProfile> {
  const [profileResult, langRulesResult] = await Promise.all([
    this.ctx.supabase
      .from('brand_profiles')
      .select('content_pillars, source_strategy, language_formality, language_notes')
      .eq('client_id', this.ctx.clientId!)
      .single(),
    this.ctx.supabase
      .from('language_rules')
      .select('native_cta_phrases, formality_rules, language_instructions, opener_examples')
      .eq('language', this.ctx.language || 'English')
      .single(),
  ])
  return { profile: profileResult.data, langRules: langRulesResult.data }
}

/** Fetch post history + recently generated theme descriptions. */
private async fetchClientHistory(): Promise<string[]> {
  const [historyResult, themesResult] = await Promise.all([
    this.ctx.supabase
      .from('post_history')
      .select('topic_summary')
      .eq('client_id', this.ctx.clientId!)
      .order('created_at', { ascending: false })
      .limit(30),
    this.ctx.supabase
      .from('generation_runs')
      .select('generation_themes(theme_description)')
      .eq('client_id', this.ctx.clientId!)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const postTopics = (historyResult.data ?? [])
    .map(h => h.topic_summary)
    .filter((s): s is string => s !== null)

  const themeDescriptions: string[] = []
  const runsData = themesResult.data ?? []
  for (const run of runsData) {
    for (const theme of run.generation_themes) {
      if (theme.theme_description) themeDescriptions.push(theme.theme_description)
    }
  }

  return [...postTopics, ...themeDescriptions]
}

/** Fetch active client sources. */
private async fetchClientSources(): Promise<ClientSourceRow[]> {
  const { data } = await this.ctx.supabase
    .from('client_sources')
    .select('id, type, label, url, config, extracted_text')
    .eq('client_id', this.ctx.clientId!)
    .eq('is_active', true)
  return (data as ClientSourceRow[] | null) ?? []
}

/** Filter sources by the client's source strategy. */
private filterSourcesByStrategy(
  sources: ClientSourceRow[],
  strategy: SourceStrategy
): ClientSourceRow[] {
  return sources.filter(s => {
    if (s.type === 'rss'     && !strategy.rss)     return false
    if (s.type === 'website' && !strategy.website) return false
    if (s.type === 'file'    && !strategy.file)    return false
    return true
  })
}

/** Build LanguageConfig from raw DB data. */
private buildLanguageConfig(raw: RawClientProfile, defaults: LanguageConfig): LanguageConfig {
  const { profile, langRules } = raw
  return {
    language: this.ctx.language || 'English',
    formality: profile?.language_formality ?? 'neutral',
    nativeCTAPhrases: toCTAPhrases(langRules?.native_cta_phrases),
    carouselSwipeCues: toCarouselSwipeCues(langRules?.native_cta_phrases),
    formalityRules: toFormalityRulesData(langRules?.formality_rules),
    languageInstructions: langRules?.language_instructions ?? '',
    openerExamples: toOpenerExamples(langRules?.opener_examples),
    languageNotes: profile?.language_notes ?? '',
  }
}
```

**Add `RawClientProfile` as an internal type** (not exported — internal to the pipeline):

```typescript
interface RawClientProfile {
  profile: { content_pillars: string | null; source_strategy: SourceStrategy | null; language_formality: string | null; language_notes: string | null } | null
  langRules: { native_cta_phrases: Json | null; formality_rules: Json | null; language_instructions: string | null; opener_examples: Json | null } | null
}
```

**Also extract `ClientData`** as an internal type if it is not already in `types.ts`:

```typescript
interface ClientData {
  contentPillars: WeightedPillar[]
  history: string[]
  sources: ClientSourceRow[]
  strategy: SourceStrategy
  languageConfig: LanguageConfig
}
```

### ✓ Step 12 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `loadClientData` body is ≤25 lines — just orchestration, no inline logic
- [ ] Each private method has one clear responsibility
- [ ] Research pipeline end-to-end — same output as before

---

## Step 13 — Extract generateAndFilter

> **File:** `features/ai/research/research-pipeline.ts`

The initial generation call and the retry loop perform identical operations: call
`builder.generateTopics()`, attach full text, run dedup. The retry just uses different count and
extended history.

Extract the repeated sequence:

```typescript
/**
 * Generate topics, attach source full text, then run algorithmic dedup.
 * Used by both the initial run and the retry loop.
 */
private async generateAndFilter(
  count: number,
  builder: ResearchPromptBuilder,
  sourceContext: SourceContext | undefined,
  history: string[],
  fullTextIndex: SourceFullTextIndex,
  dedup: Deduplicator,
): Promise<ResearchTopic[]> {
  const topics = await builder.generateTopics(count, sourceContext)
  this.attachSourceFullText(topics, fullTextIndex)
  return dedup.filterConflicts(topics, history)
}
```

**`execute()` after extraction:**

```typescript
async execute(): Promise<ResearchTopic[]> {
  const clientData = await this.loadClientData()
  const limits = computeFetchLimits(this.ctx.count)

  const sourceObjects = createAllSources(clientData.sources)
  await this.fetchAllSources(sourceObjects, limits)

  const sourceContext = this.buildSourceContext(sourceObjects, clientData.strategy, limits)
  const fullTextIndex = this.buildSourceFullTextIndex(sourceObjects)

  const builder = new ResearchPromptBuilder({
    niche: this.ctx.niche,
    languageConfig: clientData.languageConfig,
    contentPillars: clientData.contentPillars,
    postHistory: clientData.history,
  })

  const dedup = new Deduplicator(this.ctx.language)

  // Initial generation
  let filtered = await this.generateAndFilter(
    this.ctx.count, builder, sourceContext, clientData.history, fullTextIndex, dedup
  )

  // Optional LLM dedup pass
  filtered = await dedup.filterWithLLM(filtered, clientData.history, this.ctx.language || 'English')

  // Retry loop — request deficit only
  for (let retry = 0; retry < MAX_RESEARCH_RETRIES && filtered.length < this.ctx.count; retry++) {
    const extendedHistory = [...clientData.history, ...filtered.map(t => t.suggested_theme)]
    const deficit = this.ctx.count - filtered.length

    builder.updateHistory(extendedHistory)
    const retryTopics = await this.generateAndFilter(
      deficit, builder, sourceContext, extendedHistory, fullTextIndex, dedup
    )
    filtered.push(...retryTopics)
  }

  if (filtered.length < this.ctx.count) {
    console.warn(`[research] Only ${filtered.length}/${this.ctx.count} themes survived dedup after retry`)
  }

  return filtered.slice(0, this.ctx.count)
}
```

The LLM dedup pass is deliberately excluded from `generateAndFilter` — it is expensive and only
runs once, not on every retry.

### ✓ Step 13 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `execute()` body is ≤40 lines — orchestration only, no inline logic
- [ ] `generateAndFilter` called twice: initial run and inside retry loop
- [ ] Retry still produces additional topics when initial count is insufficient

---

## Step 14 — Phase 3 Final Verification

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

### Structure audit
```bash
# SourceFactory class gone
grep -r "class SourceFactory" src/   # nothing

# loadClientData body should be short
wc -l src/features/ai/research/research-pipeline.ts

# All methods should exist
grep -n "private.*loadClientData\|private.*verifyClientOwnership\|private.*fetchClientProfile\|private.*fetchClientHistory\|private.*fetchClientSources\|private.*filterSourcesByStrategy\|private.*buildLanguageConfig\|private.*generateAndFilter" \
  src/features/ai/research/research-pipeline.ts
```

### Functional verification
- [ ] Research run with RSS sources — topics grounded in RSS content
- [ ] Research run with website sources — topics grounded in website content
- [ ] Research run with no sources — trend fallback activates
- [ ] Retry loop fires when dedup eliminates too many topics
- [ ] `performResearch` convenience function still works

---

## Complete Change Summary

### Phase 1 — Constant and Redundancy Cleanup

| Concern | Before | After |
|---|---|---|
| `SOURCE_FULL_TEXT_CAP = 4000` | Defined in 4 files | Defined once in `fetch-limits.ts`, imported |
| `this.language` | Redundant field in `ResearchPromptBuilder` | Removed — use `this.languageConfig.language` |
| Date formatting | `new Date().toISOString().split('T')[0]` duplicated | `todayDate()` helper |
| Source section builders | Three identical conditional patterns | `buildSourceSection(title, tag, content)` |
| `system-prompt.ts` | Separate file for one function | Merged into `prompt-builder.ts` |

### Phase 2 — Type Simplification

| Concern | Before | After |
|---|---|---|
| `FetchOptions` | Wrapper interface with one field `limits?: FetchLimits` | Removed — pass `FetchLimits` directly |
| `FullTextMaps` | Two Maps, generic name | `SourceFullTextIndex` with `byUrl` and `byLabel` |
| `ResearchContext` | Inconsistent with `GenerationRunContext` convention | `ResearchRunContext` |

### Phase 3 — Structure Improvements

| Concern | Before | After |
|---|---|---|
| `SourceFactory` | Class with only static methods | Plain exported functions `createSource`, `createAllSources` |
| `loadClientData` | ~100 lines, five concerns inline | ≤25 lines — delegates to 6 focused private methods |
| Initial generation + retry | Duplicated `generateTopics` + `attachSourceFullText` + `filterConflicts` | `generateAndFilter()` called in both places |
| `execute()` | Mixed orchestration and inline logic | Pure orchestration — all logic in named methods |

---

*PostFlow — Research Flow Refactoring*
*Implement phase by phase. `npx tsc --noEmit` after every step.*