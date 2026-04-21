# Pillar Source Mapping Stepper — Implementation Plan

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after each step.
> Do not modify files not listed here. Do not skip steps.

---

## Context

When a client's onboarding is confirmed ("Confirm and save client"), a stepper dialog
opens that walks the user through mapping each content pillar to one or more source
types, then configuring each selected source type.

This replaces the existing RSS-only dialog that currently opens after onboarding.

### Two-phase flow

**Phase 1 — Pillar mapping (one step per pillar, max 4)**
For each pillar the user selects which source types it uses:
Web search (Tavily), Website scraper, RSS feeds, Documents.
Multiple sources per pillar allowed. At least one required per pillar.

**Phase 2 — Source configuration (one section per selected source type)**
Source types are configured once regardless of how many pillars use them.
Steps appear only for source types selected in Phase 1:
- Website scraper → 4 sub-steps (URL entry + scan, sitemap select, page select, confirm)
- RSS feeds → suggested feeds + manual add
- Documents → file upload
- Web search → no configuration needed, skipped automatically

**Final step — Review summary + save**

### Dynamic step generation

After Phase 1, the stepper computes which configuration steps to show:

```typescript
const needsWebsite  = pillars.some(p => p.sources.includes('website'))
const needsRss      = pillars.some(p => p.sources.includes('rss'))
const needsDocs     = pillars.some(p => p.sources.includes('documents'))
// web search needs no configuration — always skip
```

Configuration steps shown only if the corresponding source type was selected.

---

## Complete step sequence

```
Step 1..N  — Pillar mapping (N = pillar count, max 4)
  [if website selected]:
    Step W1  — Enter website URL + scan
    Step W2  — Select sitemap XML
    Step W3  — Select pages
    Step W4  — Confirm page selection
  [if RSS selected]:
    Step R1  — Add/select RSS feeds
  [if documents selected]:
    Step D1  — Upload documents
Step FINAL — Review summary
Step DONE  — Success confirmation
```

---

## DB Schema Changes

### New column: `content_pillar_sources`

Add to `brand_profiles` table:

```sql
ALTER TABLE brand_profiles
ADD COLUMN content_pillar_sources jsonb DEFAULT NULL;
```

Shape:
```typescript
type PillarSourceMapping = {
  pillar: string
  sources: ('web_search' | 'website' | 'rss' | 'documents')[]
}[]
// stored as brand_profiles.content_pillar_sources
```

No changes to existing `client_sources` table — website pages, RSS feeds, and documents
continue to be stored there as they are today.

---

## Files Modified

| File | Change |
|---|---|
| `src/components/clients/pillar-source-stepper.tsx` | CREATE — main stepper component |
| `src/components/clients/stepper-steps/pillar-map-step.tsx` | CREATE — pillar source selection step |
| `src/components/clients/stepper-steps/website-url-step.tsx` | CREATE — URL entry + scan |
| `src/components/clients/stepper-steps/website-sitemap-step.tsx` | CREATE — sitemap selection |
| `src/components/clients/stepper-steps/website-pages-step.tsx` | CREATE — page selection |
| `src/components/clients/stepper-steps/website-confirm-step.tsx` | CREATE — confirm scraper |
| `src/components/clients/stepper-steps/rss-step.tsx` | CREATE — RSS configuration |
| `src/components/clients/stepper-steps/documents-step.tsx` | CREATE — document upload |
| `src/components/clients/stepper-steps/review-step.tsx` | CREATE — summary + save |
| `src/app/(dashboard)/clients/[id]/onboarding/page.tsx` | UPDATE — trigger stepper after save |
| `src/app/api/clients/[id]/pillar-sources/route.ts` | CREATE — save mapping to DB |
| `supabase/migrations/` | CREATE — add content_pillar_sources column |

---

## Step 1 — DB migration

> **File:** `supabase/migrations/[timestamp]_add_pillar_sources.sql`

```sql
ALTER TABLE brand_profiles
ADD COLUMN IF NOT EXISTS content_pillar_sources jsonb DEFAULT NULL;

COMMENT ON COLUMN brand_profiles.content_pillar_sources IS
'Maps each content pillar to its configured source types. Shape: [{pillar, sources[]}]';
```

Run: `supabase db push` or apply via Supabase dashboard.

### ✓ Step 1 Verification
- [ ] Column exists on `brand_profiles`
- [ ] Existing rows unaffected (column is nullable)

---

## Step 2 — Types

> **File:** `src/types/pillar-sources.ts` (new file)

```typescript
export type SourceType = 'web_search' | 'website' | 'rss' | 'documents'

export interface PillarSourceMapping {
  pillar: string
  weight: number
  sources: SourceType[]
}

export interface StepperState {
  pillars: PillarSourceMapping[]
  // Website scraper config
  websiteUrl: string
  selectedSitemapUrl: string | null
  selectedPages: string[]
  // RSS config — IDs of selected sources from suggestions + any manually added
  selectedRssFeeds: { label: string; url: string }[]
  // Documents — IDs of uploaded documents
  uploadedDocumentIds: string[]
  // Sources skipped during configuration — mapped to pillars but not yet configured
  // Pillars using skipped sources fall back to web search until configured later
  skippedSources: SourceType[]
}

export type StepperPhase =
  | { type: 'pillar'; index: number }
  | { type: 'website-url' }
  | { type: 'website-sitemap' }
  | { type: 'website-pages' }
  | { type: 'website-confirm' }
  | { type: 'rss' }
  | { type: 'documents' }
  | { type: 'review' }
  | { type: 'done' }
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Types exported correctly

---

## Step 3 — API route to save mapping

> **File:** `src/app/api/clients/[id]/pillar-sources/route.ts`

```typescript
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const { mapping }: { mapping: PillarSourceMapping[] } = await request.json()

  // Verify ownership
  const owned = await verifyClientOwnership(
    auth.supabase, params.id, auth.agencyId
  )
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Save mapping to brand_profiles
  const { error } = await auth.supabase
    .from('brand_profiles')
    .update({ content_pillar_sources: mapping })
    .eq('client_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] POST to `/api/clients/[id]/pillar-sources` with valid mapping saves to DB
- [ ] Wrong client ID returns 404

---

## Step 4 — Pillar map step component

> **File:** `src/components/clients/stepper-steps/pillar-map-step.tsx`

Renders the 2×2 source card grid for one pillar. Handles multi-select toggle.

```typescript
interface PillarMapStepProps {
  pillar: PillarSourceMapping
  onChange: (sources: SourceType[]) => void
  onNext: () => void
  onBack: () => void
  isFirst: boolean
  pillarIndex: number
  totalPillars: number
}
```

Source cards:
```typescript
const SOURCE_CARDS: { type: SourceType; label: string; description: string; badge: string }[] = [
  { type: 'web_search', label: 'Web search',      description: 'Live Tavily queries for industry news',  badge: 'Live'     },
  { type: 'website',    label: 'Website scraper',  description: 'Client site pages and service info',     badge: 'Scraped'  },
  { type: 'rss',        label: 'RSS feeds',        description: 'Industry blogs auto-synced',             badge: 'Auto-synced' },
  { type: 'documents',  label: 'Documents',        description: 'Uploaded PDFs and brochures',            badge: 'Uploaded' },
]
```

"Next" button disabled when `pillar.sources.length === 0`.
Last pillar shows "Configure sources →" instead of "Next pillar →".

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Cards toggle selection on click
- [ ] Next button disabled with zero selections
- [ ] Warning note visible always

---

## Step 5 — Website URL step

> **File:** `src/components/clients/stepper-steps/website-url-step.tsx`

Three UI states: idle, scanning, result (success / error).

```typescript
interface WebsiteUrlStepProps {
  clientId: string
  initialUrl?: string         // pre-populate from client.website_url if available
  onScanned: (url: string, sitemaps: SitemapResult[]) => void
  onBack: () => void
}

interface SitemapResult {
  name: string   // e.g. "post-sitemap.xml"
  url: string    // full URL
}
```

Scan calls the existing sitemap detection API:
```typescript
const res = await fetch(`/api/clients/${clientId}/detect-sitemaps`, {
  method: 'POST',
  body: JSON.stringify({ url })
})
```

If no sitemap found: show error state, allow manual URL entry fallback.
"Browse sitemaps" button disabled until scan succeeds.

**Skip behaviour:** Footer includes "Skip for now" secondary action.
When skipped: push `'website'` to `state.skippedSources`, advance to next step.
No `client_sources` record is created.

```typescript
// Footer layout for all configuration steps
<div className="df">
  <button className="bbk" onClick={onBack}>← Back</button>
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
    <button
      style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
      onClick={onSkip}
    >
      Skip for now
    </button>
    <button className="bnx" onClick={onNext} disabled={!canProceed}>
      Browse sitemaps →
    </button>
  </div>
</div>
```

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Scanning state shows spinner
- [ ] Success state enables next button
- [ ] Error state shows fallback message
- [ ] Pre-populates URL from client data if available
- [ ] "Skip for now" adds `'website'` to `skippedSources` and advances
- [ ] No `client_sources` record created when skipped

---

## Step 6 — Website sitemap step

> **File:** `src/components/clients/stepper-steps/website-sitemap-step.tsx`

```typescript
interface WebsiteSitemapStepProps {
  sitemaps: SitemapResult[]
  selectedSitemap: string | null
  onSelect: (url: string) => void
  onNext: () => void
  onBack: () => void
}
```

Clicking a row sets it as selected (highlighted border).
"Browse pages" button disabled until one is selected.

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Only one sitemap selectable at a time
- [ ] Next disabled until selection made

---

## Step 7 — Website pages step

> **File:** `src/components/clients/stepper-steps/website-pages-step.tsx`

Fetches pages from the selected sitemap URL. Filter input, select all / deselect all.

```typescript
interface WebsitePagesStepProps {
  sitemapUrl: string
  clientId: string
  selectedPages: string[]
  onChange: (pages: string[]) => void
  onNext: () => void
  onBack: () => void
}
```

Fetch pages on mount:
```typescript
useEffect(() => {
  fetch(`/api/clients/${clientId}/sitemap-pages`, {
    method: 'POST',
    body: JSON.stringify({ sitemapUrl })
  })
  .then(r => r.json())
  .then(data => setPages(data.pages))
}, [sitemapUrl])
```

Filter input filters `pages` array client-side — no re-fetch.
"Confirm selection" disabled when zero pages selected.

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Pages load from sitemap URL
- [ ] Filter works client-side
- [ ] Select all / deselect all work
- [ ] Count label updates correctly

---

## Step 8 — Website confirm step

> **File:** `src/components/clients/stepper-steps/website-confirm-step.tsx`

Read-only summary of selected pages. Shows count and list.
On "Save selection", creates/updates the website source in `client_sources`:

```typescript
await fetch(`/api/clients/${clientId}/sources`, {
  method: 'POST',
  body: JSON.stringify({
    type: 'website',
    url: websiteUrl,
    config: { pages: selectedPages, sitemapUrl: selectedSitemapUrl }
  })
})
```

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Selected pages listed correctly
- [ ] Website source saved to `client_sources` on confirm

---

## Step 9 — RSS step

> **File:** `src/components/clients/stepper-steps/rss-step.tsx`

Reuses existing RSS suggestion logic. Shows AI-suggested feeds with reachability status.
User selects which to activate. Manual add form at bottom.

```typescript
interface RssStepProps {
  clientId: string
  niche: string
  onSave: (feeds: { label: string; url: string }[]) => void
  onBack: () => void
}
```

On mount: fetch suggested feeds from existing `/api/clients/[id]/suggest-sources`.
Each suggested feed has a checkbox. Unreachable feeds shown with error badge but still selectable.
Manual add calls existing `+ Add RSS feed` logic.

On "Next": save all checked feeds as `client_sources` records.

**Skip behaviour:** Footer includes "Skip for now" secondary action.
When skipped: push `'rss'` to `state.skippedSources`, advance to next step.
No `client_sources` record is created for RSS.

```typescript
interface RssStepProps {
  clientId: string
  niche: string
  onSave: (feeds: { label: string; url: string }[]) => void
  onSkip: () => void   // ← add this
  onBack: () => void
}
```

### ✓ Step 9 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Suggested feeds load correctly
- [ ] Reachability status shown per feed
- [ ] Manual add works
- [ ] Selected feeds saved to `client_sources` on Next
- [ ] "Skip for now" adds `'rss'` to `skippedSources` and advances
- [ ] No `client_sources` record created when skipped

---

## Step 10 — Documents step

> **File:** `src/components/clients/stepper-steps/documents-step.tsx`

Reuses existing document upload logic from the current Research Sources page.
Drop zone + file list. Files uploaded to existing endpoint.

```typescript
interface DocumentsStepProps {
  clientId: string
  onNext: () => void
  onSkip: () => void   // ← add this
  onBack: () => void
}
```

**Skip behaviour:** Footer includes "Skip for now" secondary action.
When skipped: push `'documents'` to `state.skippedSources`, advance to next step.
No documents are saved. The drop zone is never required.

Note: "Next" without uploading anything is also allowed (documents are optional).
The difference between Next and Skip is intent — Skip is explicit, Next with no uploads
is silent. Both result in no documents saved. Either way `'documents'` is added to
`skippedSources` only if the user actively clicked Skip, not if they just clicked Next
without uploading.

### ✓ Step 10 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] File upload works using existing endpoint
- [ ] Uploaded files listed with name and size
- [ ] Delete works
- [ ] "Skip for now" adds `'documents'` to `skippedSources` and advances
- [ ] Clicking Next with no uploads advances without adding to `skippedSources`
- [ ] No `client_sources` record created when skipped

---

## Step 11 — Review step

> **File:** `src/components/clients/stepper-steps/review-step.tsx`

Two summary cards:
1. Pillar → source mapping table
2. Configured sources (website page count, RSS feed count, document count, web search status)

When `state.skippedSources.length > 0`, show a warning notice below the cards:

```typescript
{state.skippedSources.length > 0 && (
  <div style={{
    display: 'flex',
    gap: '8px',
    background: 'rgba(186,117,23,0.07)',
    borderLeft: '2px solid #C07B55',
    padding: '10px 12px',
    borderRadius: '0 6px 6px 0',
    marginTop: '10px',
  }}>
    {/* warning icon */}
    <div>
      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '2px' }}>
        {state.skippedSources.length} source{state.skippedSources.length > 1 ? 's' : ''} not yet configured
      </div>
      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
        {state.skippedSources.map(s => SOURCE_LABELS[s]).join(', ')} — configure from
        client settings any time. Pillars using these sources will fall back to
        web search until configured.
      </div>
    </div>
  </div>
)}
```

In the second summary card, skipped sources show a "Not configured" badge instead of
a count:

```typescript
// In configured sources card:
{needsWebsite && (
  <div className="sr2">
    <span>Website scraper</span>
    {state.skippedSources.includes('website')
      ? <span style={{ fontSize: '12px', color: '#C07B55' }}>Not configured</span>
      : <span>{state.selectedPages.length} pages · {state.selectedSitemapUrl}</span>
    }
  </div>
)}
```

On "Save mapping": POST to `/api/clients/[id]/pillar-sources` with the full mapping array.
The pillar mapping is saved including skipped source types — `client_sources` simply has
no corresponding record for them yet. The research pipeline handles this gracefully by
falling back to web search when a mapped source has no active `client_sources` record.

```typescript
interface ReviewStepProps {
  state: StepperState
  clientId: string
  onSave: () => Promise<void>
  onBack: () => void
}
```

### ✓ Step 11 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Summary shows correct pillar-to-source mapping
- [ ] Source counts correct for configured sources
- [ ] Skipped sources show "Not configured" badge in summary card
- [ ] Warning notice appears when any source was skipped
- [ ] Warning lists skipped source names in plain language
- [ ] No warning shown when all sources configured
- [ ] Save POSTs mapping to API and transitions to done state

---

## Step 12 — Main stepper orchestrator

> **File:** `src/components/clients/pillar-source-stepper.tsx`

Manages all state and step sequencing. Computes which configuration steps to show
based on Phase 1 selections.

```typescript
interface PillarSourceStepperProps {
  clientId: string
  pillars: { pillar: string; weight: number }[]  // from brand_profiles
  onComplete: () => void
  onDismiss: () => void
}
```

Initial state includes empty `skippedSources`:

```typescript
const [state, setState] = useState<StepperState>({
  pillars: props.pillars.map(p => ({ ...p, sources: [] })),
  websiteUrl: '',
  selectedSitemapUrl: null,
  selectedPages: [],
  selectedRssFeeds: [],
  uploadedDocumentIds: [],
  skippedSources: [],   // ← initialised empty
})
```

Skip handler — used by website, RSS, and documents steps:

```typescript
function handleSkip(sourceType: SourceType) {
  setState(prev => ({
    ...prev,
    skippedSources: prev.skippedSources.includes(sourceType)
      ? prev.skippedSources
      : [...prev.skippedSources, sourceType],
  }))
  advanceToNextStep()
}
```

Step sequence computation — unchanged, skipped sources do not affect which steps
appear (steps still appear for all selected source types):

```typescript
function buildStepSequence(state: StepperState): StepperPhase[] {
  const phases: StepperPhase[] = state.pillars.map((_, i) => ({
    type: 'pillar', index: i
  }))

  const needsWebsite = state.pillars.some(p => p.sources.includes('website'))
  const needsRss     = state.pillars.some(p => p.sources.includes('rss'))
  const needsDocs    = state.pillars.some(p => p.sources.includes('documents'))

  if (needsWebsite) {
    phases.push(
      { type: 'website-url' },
      { type: 'website-sitemap' },
      { type: 'website-pages' },
      { type: 'website-confirm' },
    )
  }
  if (needsRss)  phases.push({ type: 'rss' })
  if (needsDocs) phases.push({ type: 'documents' })

  phases.push({ type: 'review' })
  phases.push({ type: 'done' })

  return phases
}
```

Step sequence is recomputed whenever Phase 1 selections change.
Back navigation uses the sequence array to find the previous step.

### ✓ Step 12 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Stepper skips website steps when no pillar selected website
- [ ] Stepper skips RSS step when no pillar selected RSS
- [ ] Stepper skips documents step when no pillar selected documents
- [ ] Back navigation works correctly across all step types
- [ ] Progress dots reflect current position in sequence
- [ ] `skippedSources` initialised as empty array
- [ ] `handleSkip` adds source type without duplicates
- [ ] Skipping website advances past all 4 website sub-steps to next section

---

## Step 13 — Trigger stepper from onboarding

> **File:** `src/app/(dashboard)/clients/[id]/onboarding/page.tsx`
> (or wherever "Confirm and save client" currently triggers)

After the existing `confirm-and-save` action succeeds, open `PillarSourceStepper`
instead of the existing RSS dialog.

```typescript
// Replace: open RSS dialog
// With:
const [showStepper, setShowStepper] = useState(false)

// After save succeeds:
setShowStepper(true)

// In JSX:
{showStepper && (
  <PillarSourceStepper
    clientId={clientId}
    pillars={brandProfile.contentPillars}
    onComplete={() => {
      setShowStepper(false)
      router.push(`/clients/${clientId}`)
    }}
    onDismiss={() => setShowStepper(false)}
  />
)}
```

### ✓ Step 13 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Old RSS dialog no longer appears after onboarding save
- [ ] Stepper opens correctly with pillars from brand profile
- [ ] Completing stepper navigates to client page
- [ ] Dismissing stepper closes without saving

---

## Step 14 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Full flow test
1. Complete client onboarding → click "Confirm and save client"
2. Stepper opens at Pillar 1
3. Select different source combinations per pillar
4. Verify only relevant configuration steps appear
5. Complete website URL scan → sitemap selection → page selection → confirm
6. Complete RSS feed selection
7. Upload a document
8. Review summary shows correct mapping
9. Save → success screen → navigate to client dashboard
10. Verify `brand_profiles.content_pillar_sources` saved correctly in DB

### Edge cases
- [ ] Client with 1 pillar: single pillar step, then configuration
- [ ] Client with 4 pillars: all four steps shown
- [ ] All pillars select web search only: website/RSS/docs steps all skipped
- [ ] Website scan fails: error state shown, user can try again or skip
- [ ] No sitemap found: fallback to manual URL entry
- [ ] Zero documents uploaded: skip allowed, documents step completes
- [ ] Dismiss mid-flow: no partial data saved, DB unchanged
- [ ] Skip website: `skippedSources` includes `'website'`, all 4 website sub-steps bypassed, review shows "Not configured" for website
- [ ] Skip RSS: `skippedSources` includes `'rss'`, review shows "Not configured" for RSS feeds
- [ ] Skip all three configurable sources: review shows warning listing all three, save still succeeds
- [ ] Skip then back: going back from a later step to a skipped step re-shows the step normally; `skippedSources` keeps the entry until the user completes the step properly

---

## What is NOT changed

| File | Why |
|---|---|
| `client_sources` table | Existing structure reused unchanged |
| Website scraper fetch logic | Existing `fetchWebsiteWithSubpages` reused |
| RSS fetch logic | Existing `fetchRssSource` reused |
| Document upload endpoint | Existing upload route reused |
| Research pipeline | Reads from `client_sources` — unaffected |
| Research prompt builder | `content_pillar_sources` consumed here in follow-up |

---

## Follow-up (separate plan)

Once the mapping is saved, the research pipeline should use
`content_pillar_sources` to filter which sources are fetched per pillar.
This is a separate plan — the data model is set up here, the pipeline
change comes next.

---

## Implementation order for Claude Code

```
Step 1  → DB migration
Step 2  → types.ts
Step 3  → API route /pillar-sources
Step 4  → pillar-map-step.tsx
Step 5  → website-url-step.tsx
Step 6  → website-sitemap-step.tsx
Step 7  → website-pages-step.tsx
Step 8  → website-confirm-step.tsx
Step 9  → rss-step.tsx
Step 10 → documents-step.tsx
Step 11 → review-step.tsx
Step 12 → pillar-source-stepper.tsx (orchestrator — depends on all steps)
Step 13 → onboarding page (wire stepper in)
Step 14 → end-to-end verification
```

---

*Kontuur — Pillar Source Mapping Stepper Plan*
*Replaces the existing RSS-only dialog with a full source mapping flow.*
*Web search (Tavily) requires no configuration — always available, never a setup step.*