# Pipeline Redesign Plan — Unified Research + Generation

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after every step.
> Do not modify files not listed in each step. Do not delete the old API routes until
> Step 7 verification passes cleanly.

---

## What Changes and Why

**Current flow (two-phase, user waits twice):**
```
Step 1: Client & Platform
Step 2: Priority Posts
Step 3: Weekly Themes  ← research HTTP request happens here (~20-30s)
Step 4: Post Type
Step 5: Generated Posts ← generation HTTP request happens here (~20-30s)
```

**New flow (one-phase, user waits once):**
```
Step 1: Client & Platform
Step 2: Priority Posts
Step 3: Post Type        ← user configures everything up front
Step 4: Generated Posts  ← unified request: research → generate → stream posts
```

The user configures everything first, clicks Generate once, and sees posts appear
as they complete. Research phase messages appear while the backend fetches sources
and runs the LLM. Post skeletons fill in one by one as generation completes.

---

## LLM Call Reduction

| Current | New | Saving |
|---|---|---|
| 1× Sonnet (research topics) | 1× Haiku (research topics) | ~5-12s, cheaper |
| 1× Sonnet per post (generate) | 1× Sonnet per post (generate) | unchanged |
| 1× Haiku per post (quality) | removed — self-scored by Sonnet | ~3-6s per post |
| 1× Haiku per post (language) | 1× Haiku per post (language) | unchanged |

For 3 posts: 7 LLM calls → 5 LLM calls. Total expected latency: ~35-50s → ~15-25s.

---

## Files Modified

| File | Change |
|---|---|
| `src/ai/research/research-orchestrator.ts` | Parallelize 3 DB queries; make `reportStatus` fire-and-forget |
| `src/ai/research/generators/topic-generator.ts` | Switch to `LIGHT_MODEL`; remove `console.log` |
| `src/ai/generation/generators/post-generator.ts` | Remove `console.log` |
| `src/ai/generation/generators/carousel-generator.ts` | Remove `console.log` |
| `src/ai/validation/validate-post.ts` | Remove `validateQuality` call from `validatePost` |
| `src/app/api/ai/generate-stream/route.ts` | NEW — unified endpoint |
| `src/features/generate/components/generate-wizard.tsx` | Remove step 3, renumber steps, call unified endpoint |

Old routes (`/api/ai/research`, `/api/ai/generate`) are left in place until
Step 7 passes, then removed in Step 8.

---

## Step 1 — Quick wins: DB parallelism + fire-and-forget status

> **File:** `src/ai/research/research-orchestrator.ts`

### 1a — Parallelize `loadClientData`

Replace the sequential `fetchClientSources` followed by `Promise.all` with a
single `Promise.all` across all three queries:

```ts
// Before
const sources = await fetchClientSources(this.ctx.supabase, this.ctx.clientId)
const [themeHistory, usedUrls] = await Promise.all([
  fetchThemeDescriptions(this.ctx.supabase, this.ctx.clientId),
  fetchUsedSourceUrls(this.ctx.supabase, this.ctx.clientId),
])

// After
const [sources, themeHistory, usedUrls] = await Promise.all([
  fetchClientSources(this.ctx.supabase, this.ctx.clientId),
  fetchThemeDescriptions(this.ctx.supabase, this.ctx.clientId),
  fetchUsedSourceUrls(this.ctx.supabase, this.ctx.clientId),
])
```

Apply only to the preloaded path (the `if (this.ctx.preloadedClientData)` branch).
The Promise.all structure for the empty-clientId fallbacks stays the same shape,
just also pull `sources` into the same call.

### 1b — Make `reportStatus` fire-and-forget

In `fetchAllSources`, the `await source.reportStatus(...)` call currently blocks
the pipeline after each source fetch. Status writes are non-critical — change to
fire-and-forget:

```ts
// Before
await Promise.allSettled(
  networkSources.map(async (source) => {
    const result = await source.fetch(limits)
    await source.reportStatus(this.ctx.supabase, result)
  })
)

// After
await Promise.allSettled(
  networkSources.map(async (source) => {
    const result = await source.fetch(limits)
    void source.reportStatus(this.ctx.supabase, result).catch(() => {})
  })
)
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] No change to function signatures or exports

---

## Step 2 — Remove console.log from generators

> **Files:** `src/ai/research/generators/topic-generator.ts`,
> `src/ai/generation/generators/post-generator.ts`,
> `src/ai/generation/generators/carousel-generator.ts`

Remove every `console.log(...)` statement. Do not change any other code in these files.

**topic-generator.ts** — remove the two console.log lines that print system and user prompts
(note: they use `/n` typo instead of `\n`; still remove them either way).

**post-generator.ts** — remove the console.log printing full prompts on every call.

**carousel-generator.ts** — remove the console.log printing full prompts on every call.

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "console.log" src/ai --include="*.ts"` — no output

---

## Step 3 — Switch research from Sonnet to Haiku

> **File:** `src/ai/research/generators/topic-generator.ts`

Find the `callAnthropic` call that uses `DEFAULT_MODEL` (Sonnet) and change it to
`LIGHT_MODEL` (Haiku). Import `LIGHT_MODEL` from `@/utils/ai-client` if not already
imported.

```ts
// Before
model: DEFAULT_MODEL,

// After
model: LIGHT_MODEL,
```

Do not change `maxTokens`, the output schema, or any other parameter.

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Research still returns valid JSON topics (test manually or via existing tests)

---

## Step 4 — Remove validateQuality from validatePost

> **File:** `src/ai/validation/validate-post.ts`

Read the file first. The `validatePost` function currently calls both `validateQuality`
and `validateLanguage` in a `Promise.all`. Remove the `validateQuality` call and its
result from the destructuring. Keep `validateLanguage` — it catches register violations
that the generation prompt does not enforce.

The returned object from `validatePost` should no longer include `quality` (or return
it as `undefined`). Check what callers do with the `quality` field and ensure removing
it does not cause TypeScript errors.

**Do not delete** the `validateQuality` function itself — another caller may use it.
Only remove the call from `validatePost`.

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `grep -r "validateQuality" src/` — confirm it is no longer called inside `validatePost`

---

## Step 5 — New unified API endpoint

> **File:** `src/app/api/ai/generate-stream/route.ts` (NEW)

Create a new API route that combines the research and generation pipelines into one
HTTP request. It accepts the same inputs as the generate endpoint minus `themes`
(themes come from internal research), and streams NDJSON with three event types:

```ts
type GenerateStreamEvent =
  | { type: 'phase'; message: string }         // research phase messages
  | { type: 'total'; count: number }           // emitted after research, before generation
  | { type: 'result'; data: GenerationResult } // one per completed post
```

**Request body:**
```ts
{
  clientId: string
  platform: string
  postType: 'single' | 'carousel'
  slideCount: number
  priorityPosts: PriorityPost[]
  targetPostCount: number
  preloadedClientData?: ClientData
}
```

**Pipeline sequence inside the route handler:**

1. Auth + rate-limit check (same pattern as existing routes)
2. Fetch `clientData` (via `fetchClientById` or preloaded path)
3. Run `ResearchPipeline.execute()` with `onPhase` streaming phase events and
   `onTopic` collecting topics into an array. Wait for research to complete.
4. Emit `{ type: 'total', count: topics.length + priorityPosts.length }`
5. Run `GenerationPipeline.execute()` with topics from step 3. Stream each result
   via `onResult` as `{ type: 'result', data }`.
6. Close stream.

Copy the auth middleware pattern from `src/app/api/ai/generate/route.ts`.
Copy the `generation_runs` DB insert from the same file — it tracks run history.
Set `maxDuration = 300` (Vercel timeout).

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `curl` or manual test: endpoint returns NDJSON with phase + total + result events
- [ ] Existing generate and research endpoints still compile and respond (untouched)

---

## Step 6 — Update the wizard UI

> **File:** `src/features/generate/components/generate-wizard.tsx`

### 6a — Remove step 3 state and handlers

Delete these state variables (they belong to the old step 3):
- `themes`, `setThemes`
- `isResearching`, `setIsResearching`
- `hasAutoResearched`, `setHasAutoResearched`
- `researchPhase`, `setResearchPhase`
- `researchError`, `setResearchError`
- `researchAbortRef`

Delete these functions:
- `handleResearch()`
- `handleThemeChange()`
- `handleThemeRemove()`

Remove unused imports: `ThemeRow`, `ThemeRowSkeleton`, `ThemeWithSource`,
`ResearchStreamEvent`, `readNDJSONStream` (if no longer used — check).

### 6b — Update STEP_LABELS

```ts
// Before (5 steps)
const STEP_LABELS = [
  'Client & Platform',
  'Priority Posts',
  'Weekly Themes',
  'Post Type',
  'Generated Posts',
]

// After (4 steps)
const STEP_LABELS = [
  'Client & Platform',
  'Priority Posts',
  'Post Type',
  'Generated Posts',
]
```

### 6c — Renumber step JSX

- Old step 4 (Post Type) → new step 3: change `currentStep === 4` to `currentStep === 3`
- Old step 5 (Generated Posts) → new step 4: change `currentStep === 5` to `currentStep === 4`

### 6d — Add research phase display to step 4 (Generated Posts)

Add a `researchPhase` state string and a `total` state number to the generated posts state:
```ts
const [researchPhase, setResearchPhase] = useState('')
const [streamTotal, setStreamTotal] = useState(0)  // already exists, stays
```

At the top of the generated posts step, before the progress bar, show the research phase
while `isGenerating && generatedPosts.length === 0`:

```tsx
{isGenerating && generatedPosts.length === 0 && (
  <p className="text-sm text-gray-500 animate-pulse">
    {researchPhase || 'Starting research...'}
  </p>
)}
```

The progress bar (`streamTotal > 0 && generatedPosts.length > 0`) stays unchanged.
The PostCardSkeleton array stays unchanged.

### 6e — Update startGeneration to call unified endpoint

Replace the `/api/ai/generate` call with `/api/ai/generate-stream`. Remove the
`themes` field from the request body — themes come from research internally.
Add `targetPostCount` to the body.

Handle the three new event types in the stream reader:
```ts
await readNDJSONStream<UnifiedStreamEvent>(res, (event) => {
  if (event.type === 'phase') {
    setResearchPhase(event.message)
  } else if (event.type === 'total') {
    setStreamTotal(event.count)
    setResearchPhase('')
  } else if (event.type === 'result') {
    setGeneratedPosts((prev) => [...prev, event.data as unknown as GeneratedPost])
  }
})
```

Remove the `validThemes` check that used to guard generation — the server now
handles theme discovery. Keep the `priorityPosts.length === 0` guard only if
you want to prevent generating with zero content; otherwise remove it.

### 6f — Update "Generate more" flow

The "Generate more" button currently resets to step 3. Change it to reset to step 3
(Post Type in the new numbering) so the user can change post type before re-running:

```ts
// Before
setCurrentStep(3)

// After
setCurrentStep(3)  // same number, now points to Post Type
setHasAutoResearched(false)  // remove this line (state no longer exists)
```

Also update the two `setCurrentStep(3)` calls in error paths inside `startGeneration`
— they should remain step 3 (Post Type) so the user can retry.

### 6g — Update `canNext`

```ts
// Before
if (currentStep === 3)
  return themes.some((t) => t.selected && t.description.trim()) || priorityPosts.length > 0

// After — remove this condition entirely (step 3 is now Post Type, always passable)
```

The `canNext` function now only gates step 1 on `!!clientId`. All other steps pass.

### 6h — Remove the auto-research useEffect

Delete the `useEffect` that triggered `handleResearch()` on entering step 3:
```ts
// Delete this entire effect
useEffect(() => {
  if (currentStep === 3 && !hasAutoResearched && ...) {
    ...
  }
}, [currentStep, brandProfileLoading])
```

The generation `useEffect` (step 5 → step 4) updates to `currentStep === 4`:
```ts
useEffect(() => {
  if (currentStep === 4 && generatedPosts.length === 0 && !isGenerating) {
    void startGeneration()
  }
}, [currentStep])
```

### 6i — Add UnifiedStreamEvent type

Add the new event type to the file or import it from where it is defined:
```ts
type UnifiedStreamEvent =
  | { type: 'phase'; message: string }
  | { type: 'total'; count: number }
  | { type: 'result'; data: GenerationResult }
```

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Wizard renders 4 steps in the progress bar
- [ ] Step 1 (Client & Platform) — unchanged
- [ ] Step 2 (Priority Posts) — unchanged
- [ ] Step 3 (Post Type) — previously step 4, works identically
- [ ] Step 4 (Generated Posts) — shows research phase messages before first post appears
- [ ] Progress bar fills as posts complete
- [ ] "Generate more" resets to step 3 (Post Type)

---

## Step 7 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

**Functional checks:**
- [ ] Full generation run completes without error (3 posts target)
- [ ] Research phase messages appear: "Loading brand profile...", "Fetching sources...",
      "Generating theme ideas..."
- [ ] Posts appear one by one after research completes
- [ ] Priority posts generate first with red badge
- [ ] Approve, Discard, Regenerate all work
- [ ] "Generate more" → returns to Post Type step → generate again works
- [ ] Mobile layout: 4-step progress bar renders correctly

**Performance check:**
- [ ] Total time from clicking Generate to first post appearing: < 30s
- [ ] Total time from clicking Generate to all posts appearing (3 posts): < 45s

**Regression checks:**
- [ ] Old `/api/ai/research` route still responds (used elsewhere? check with grep)
- [ ] Old `/api/ai/generate` route still responds (used by PostCard regenerate? check)

---

## Step 8 — Remove old routes (after Step 7 passes)

Check whether old routes are still called from anywhere:
```bash
grep -r "/api/ai/research" src/ --include="*.ts" --include="*.tsx"
grep -r "/api/ai/generate" src/ --include="*.ts" --include="*.tsx"
```

If `PostCard` regeneration calls `/api/ai/generate` directly, update it to use the
new endpoint or keep the old route alive. Only delete routes that have zero callers.

---

## What Is NOT Changed

| Attribute / File | Why |
|---|---|
| `PostCard` component | Handles approve/discard/regenerate — separate from wizard |
| `src/app/api/ai/generate/route.ts` | Keep until Step 8 confirms no callers |
| `src/app/api/ai/research/route.ts` | Keep until Step 8 confirms no callers |
| `validateQuality` function body | May be called elsewhere; only remove the call from `validatePost` |
| Priority post generation logic | Unchanged — priority posts pass through as before |
| All client-side form logic in step 1 and 2 | Untouched |
| `PostTypeSelector` component | Untouched |

---

## Implementation Order

```
Step 1 → Parallelize DB queries + fire-and-forget reportStatus   (backend, < 10 lines)
Step 2 → Remove console.log from 3 generator files               (cleanup)
Step 3 → Switch research to Haiku                                 (1 line change)
Step 4 → Remove validateQuality from validatePost                 (backend)
Step 5 → Create unified /api/ai/generate-stream endpoint          (new file)
Step 6 → Update wizard UI                                         (wizard.tsx)
Step 7 → End-to-end verification
Step 8 → Remove old routes if unused
```

---

*Pipeline Redesign Plan — Kontuur*
*Removes the theme review step and merges research + generation into one request.*
*All form logic, approval flow, and post storage unchanged.*
