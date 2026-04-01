# Research Pipeline OOP Restructure

## Context

The research pipeline code is scattered across `services/research/` and `prompts/research/`, mixing interfaces, prompt text, and logic in unmaintainable files. Restructure into an OOP hierarchy under `src/features/ai/research/` following encapsulation, abstraction, inheritance, and polymorphism.

Additionally, `OVER_REQUEST_MULTIPLIER` inflates the requested count (1→2), distorting pillar allocation. Remove it entirely.

---

## Target Structure

```
src/features/ai/research/
├── sources/
│   ├── research-source.ts        # Abstract base class
│   ├── rss-source.ts             # RssResearchSource extends ResearchSource
│   ├── website-source.ts         # WebsiteResearchSource extends ResearchSource
│   ├── file-source.ts            # FileResearchSource extends ResearchSource
│   └── source-factory.ts         # SourceFactory.create(row) → correct subclass
├── prompts/
│   ├── prompt-builder.ts         # ResearchPromptBuilder class
│   └── system-prompt.ts          # buildResearchSystemPrompt() pure function
├── deduplicator.ts               # Deduplicator class (algorithmic + LLM strategies)
├── pipeline.ts                   # ResearchPipeline class + performResearch() wrapper
└── types.ts                      # All shared interfaces
```

---

## Step 1: Create `types.ts`

All shared interfaces in one file:

- `ResearchTopic` — from [research-topics.ts:6-16](src/features/ai/prompts/research/research-topics.ts#L6-L16)
- `WebsiteExcerpt` — from [research-topics.ts:18-22](src/features/ai/prompts/research/research-topics.ts#L18-L22)
- `FileExcerpt` — from [research-topics.ts:24-27](src/features/ai/prompts/research/research-topics.ts#L24-L27)
- `SourceContext` — from [research-topics.ts:29-33](src/features/ai/prompts/research/research-topics.ts#L29-L33)
- `ClientSourceRow` — from [research-sources.ts:7-14](src/features/ai/services/research/research-sources.ts#L7-L14)
- `ResearchContext` — from [research.ts:13-20](src/features/ai/services/research/research.ts#L13-L20)
- `SourceFetchResult` — new: `{ status: 'ok' | 'error'; error: string | null }`
- `FullTextMaps` — new: `{ sourceFullTextMap: Map<string, string>; fileFullTextMap: Map<string, string> }`

Re-exports: `RssItem` from `@/lib/sources/fetch-rss`, `WeightedPillar` from `@/lib/clients/content-pillars`.

## Step 2: Create abstract `ResearchSource`

**File:** `sources/research-source.ts`

```typescript
abstract class ResearchSource {
  readonly id: string
  readonly type: string
  readonly label: string
  readonly url: string
  readonly config: Record<string, unknown>
  protected readonly extractedText: string | null

  constructor(row: ClientSourceRow) { /* assign fields */ }

  abstract fetch(): Promise<SourceFetchResult>
  abstract getCappedContent(budget: number): string
  abstract getFullTextEntries(cap: number): Map<string, string>

  // Concrete: fire-and-forget DB status update (shared by all subclasses)
  reportStatus(supabase: SupabaseClient, result: SourceFetchResult): void
}
```

## Step 3: Create concrete source subclasses

**`sources/rss-source.ts`** — `RssResearchSource extends ResearchSource`
- `fetch()`: calls `fetchRssSource(url, maxItems)` from `@/lib/sources/fetch-rss`, stores items privately
- `getItems(): RssItem[]` — exposes raw items for pipeline aggregation
- `getFullTextEntries(cap)`: keyed by `item.link`, value = `title\ndescription`

**`sources/website-source.ts`** — `WebsiteResearchSource extends ResearchSource`
- `fetch()`: calls `fetchWebsiteWithSubpages(url, config)` from `@/lib/sources/fetch-website`, stores excerpts with `focusInstructions`
- `getRawExcerpts(): WebsiteExcerpt[]` — exposes raw excerpts for pipeline budgeting
- `getCappedExcerpts(budget): WebsiteExcerpt[]` — returns budgeted excerpts for SourceContext
- `getFullTextEntries(cap)`: keyed by excerpt URL

**`sources/file-source.ts`** — `FileResearchSource extends ResearchSource`
- `fetch()`: no-op (reads from `extractedText` set in constructor)
- `hasContent(): boolean`
- `getCappedExcerpt(budget): FileExcerpt | null`
- `getFullTextEntries(cap)`: keyed by label

## Step 4: Create `SourceFactory`

**File:** `sources/source-factory.ts`

```typescript
class SourceFactory {
  static create(row: ClientSourceRow): ResearchSource | null  // switch on row.type
  static createAll(rows: ClientSourceRow[]): ResearchSource[]  // filter nulls
}
```

## Step 5: Create `Deduplicator`

**File:** `deduplicator.ts`

Encapsulates language configs, stop words, and both dedup strategies.

```typescript
class Deduplicator {
  constructor(language?: string)  // resolves LanguageConfig once

  // Static — used by generate-posts.ts without instantiation
  static ngramSimilarity(a: string, b: string, language?: string): number

  // Instance — used by pipeline
  hasConflict(theme: string, history: string[]): boolean
  filterConflicts<T extends { suggested_theme: string }>(topics: T[], history: string[]): T[]
  async filterWithLLM<T extends { suggested_theme: string }>(topics: T[], history: string[], language: string): Promise<T[]>

  // Private: extractWords, generateNgrams, jaccardSimilarity, resolveConfig, dedupThemesWithLLM
}
```

Key: `ngramSimilarity` is **static** so `generate-posts.ts` calls `Deduplicator.ngramSimilarity(a, b, lang)`.

## Step 6: Create prompt files

**`prompts/system-prompt.ts`** — pure function:
```typescript
export function buildResearchSystemPrompt(language: string): string
```
Contains the quality rules, script mixing rules, clickbait patterns. Separated for caching and testability.

**`prompts/prompt-builder.ts`** — `ResearchPromptBuilder` class:
```typescript
class ResearchPromptBuilder {
  constructor(opts: { niche, language, contentPillars, postHistory })

  async generateTopics(count: number, sourceContext?: SourceContext): Promise<ResearchTopic[]>
  updateHistory(history: string[]): void  // for retry loop

  // Private: buildUserPrompt, buildPillarsContext, buildHistoryContext,
  //          buildSourceGroundedPrompt, buildTrendFallbackPrompt, hasSourceContent
}
```

Console.log statements preserved in `generateTopics()`.

## Step 7: Create `ResearchPipeline`

**File:** `pipeline.ts`

```typescript
class ResearchPipeline {
  constructor(ctx: ResearchContext)

  async execute(): Promise<ResearchTopic[]>

  // Private:
  // loadClientData() — DB queries (pillars, history, themes, sources)
  // fetchAllSources(sources) — Promise.allSettled + reportStatus
  // buildSourceContext(sources, strategy) — polymorphic aggregation + budgeting
  // buildFullTextMaps(sources) — iterates source.getFullTextEntries()
  // attachSourceFullText(topics, maps) — matches topics to source text
}

// Convenience wrapper for route handler
export async function performResearch(ctx: ResearchContext): Promise<ResearchTopic[]> {
  return new ResearchPipeline(ctx).execute()
}
```

Pipeline flow:
1. `loadClientData()` — parallel Supabase queries
2. `SourceFactory.createAll(sources)` — polymorphic creation
3. `fetchAllSources()` — parallel fetch via `source.fetch()`
4. `buildSourceContext()` — aggregate RSS items (cap MAX_RSS_ITEMS), budget website/file excerpts
5. `builder.generateTopics(count, sourceContext)` — **exact count, no multiplier**
6. `attachSourceFullText()`
7. `dedup.filterConflicts()` + `dedup.filterWithLLM()`
8. Retry loop: `builder.updateHistory()` + re-generate deficit
9. Return `slice(0, requestedCount)`

Budget constants move here: `RSS_BUDGET=4000`, `WEB_BUDGET=8000`, `FILE_BUDGET=6000`, `SOURCE_FULL_TEXT_CAP=4000`.

## Step 8: Update consumers

| File | Old import | New import |
|------|-----------|------------|
| [route.ts](src/app/api/ai/research/route.ts) | `performResearch` from `services/research/research` | `performResearch` from `@/ai/research/pipeline` |
| [generate-posts.ts](src/features/ai/services/generate-posts.ts) | `ngramSimilarity` from `services/research/dedup` | `Deduplicator` from `@/ai/research/deduplicator` → `Deduplicator.ngramSimilarity(...)` |

## Step 9: Update tests

**Dedup tests** ([dedup.test.ts](src/features/ai/services/research/__tests__/dedup.test.ts)):
- Move to `src/features/ai/research/__tests__/deduplicator.test.ts`
- `ngramSimilarity(a, b, lang)` → `Deduplicator.ngramSimilarity(a, b, lang)`
- `hasConflict(theme, history, lang)` → `new Deduplicator(lang).hasConflict(theme, history)`

**Prompt tests** ([research-topics.test.ts](src/features/ai/prompts/__tests__/research-topics.test.ts)):
- Move to `src/features/ai/research/__tests__/prompt-builder.test.ts`
- `researchTopics(niche, lang, pillars, history, count, ctx)` → `new ResearchPromptBuilder({niche, lang, pillars, history}).generateTopics(count, ctx)`
- `SourceContext` import from `@/ai/research/types`

## Step 10: Remove `OVER_REQUEST_MULTIPLIER`

- Delete from [constants.ts](src/features/ai/constants.ts) (line 6)
- Not imported in new pipeline — exact count always used

## Step 11: Delete old files

| File | Replaced by |
|------|-------------|
| `src/features/ai/services/research/research.ts` | `research/pipeline.ts` |
| `src/features/ai/services/research/research-sources.ts` | `research/sources/*.ts` |
| `src/features/ai/services/research/dedup.ts` | `research/deduplicator.ts` |
| `src/features/ai/services/research/__tests__/dedup.test.ts` | `research/__tests__/deduplicator.test.ts` |
| `src/features/ai/prompts/research/research-topics.ts` | `research/prompts/prompt-builder.ts` + `system-prompt.ts` + `types.ts` |
| `src/features/ai/prompts/__tests__/research-topics.test.ts` | `research/__tests__/prompt-builder.test.ts` |

**Files that stay unchanged:**
- `src/features/ai/prompts/research/source-grounding.ts` — used by generation prompts
- `src/features/ai/prompts/research/analyze-url.ts` — separate feature
- `src/features/ai/prompts/research/suggest-sources.ts` — separate feature
- `src/lib/sources/` — low-level HTTP fetching stays
- `src/lib/clients/content-pillars.ts` — stays

---

## Verification

1. `npx tsc --noEmit` — no type errors
2. `npx vitest run src/features/ai/research/__tests__/deduplicator.test.ts` — all dedup tests pass
3. `npx vitest run src/features/ai/research/__tests__/prompt-builder.test.ts` — all prompt tests pass
4. `npx vitest run` — full suite green
5. Manual: trigger research with `posts_per_week=1` and 2+ pillars → exactly 1 topic from highest-weight pillar
