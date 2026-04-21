# Clients Page Redesign — Implementation Plan

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after each step.
> Do not modify files not listed here. Do not skip steps.
> All existing data fetching, routing, and actions remain unchanged.
> Only visual presentation changes.

---

## Context

The current clients page is a plain table with columns: NAME, NICHE, POSTS/WEEK,
LANGUAGE, PENDING. This plan replaces it with a card grid where each client card
shows status, stats, content pillars, and contextual actions.

---

## Design Direction

- Card grid (3 columns) replaces the table
- Each card has a unique coloured top bar, avatar with initials, stat tiles,
  pillar tags, and footer actions
- Setup-incomplete clients show a CTA banner instead of stats
- Pending posts badge floats top-right when count > 0
- "Add client" appears as a dashed card at the end of the grid
- Search input and filter button in the toolbar

## Design Tokens (inherit from NAV_DASHBOARD_REDESIGN_PLAN)
```
--slate:        #1A2630
--warm-bg:      #F4EFE6
--warm-white:   #F9F6F2
--terracotta:   #C07B55
--muted:        #8A8070
--border-light: rgba(44,62,80,0.10)
--border-row:   rgba(44,62,80,0.07)

Client avatar gradient pairs (assigned by index):
  0: #2C5F4A → #1A3D2E  (deep green)
  1: #8A3A5A → #5A2040  (deep rose)
  2: #5A4A2A → #3A2A10  (deep amber)
  3: #2C3E5F → #1A2A4A  (deep blue)
  (repeat with modulo for more clients)

Client top bar gradients:
  active 0:  #C07B55 → #8B5A3A
  active 1:  #2C5F8A → #1A3D5A
  active 2:  #5A8A4A → #3A6A2A
  setup:     #C07B55 → #E8A87C
```

---

## Files Modified

| File | Change |
|---|---|
| `src/app/(dashboard)/clients/page.tsx` | UPDATE — replace table with card grid |
| `src/components/clients/client-card.tsx` | CREATE — individual client card |
| `src/components/clients/add-client-card.tsx` | CREATE — dashed add card |
| `src/components/clients/clients-toolbar.tsx` | CREATE — search + filter + add button |

> **Find actual paths first:**
> ```bash
> find src -name "*.tsx" | xargs grep -l "NICHE\|clients\|Add client" | head -10
> ```

---

## Step 1 — Create `ClientCard` component

> **File:** `src/components/clients/client-card.tsx`

### Props interface
```typescript
interface ClientCardProps {
  id:           string
  name:         string
  niche:        string
  location?:    string
  status:       'active' | 'setup' | 'paused'
  postsPerWeek: number
  publishedCount: number
  reachTotal?:  number         // from analytics, optional
  pendingCount: number
  pillars:      { name: string; color: string }[]
  lastGeneratedAt?: Date | null
  colorIndex:   number         // 0-3, determines avatar + top bar colour
  href:         string         // link to client detail
  onGenerate:   () => void
  onSources:    () => void
  onCompleteSetup?: () => void  // setup clients only
}
```

### Avatar initials helper
```typescript
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
```

### Avatar gradient pairs
```typescript
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #2C5F4A, #1A3D2E)',
  'linear-gradient(135deg, #8A3A5A, #5A2040)',
  'linear-gradient(135deg, #5A4A2A, #3A2A10)',
  'linear-gradient(135deg, #2C3E5F, #1A2A4A)',
]

const TOP_BAR_GRADIENTS = [
  'linear-gradient(90deg, #C07B55, #8B5A3A)',
  'linear-gradient(90deg, #2C5F8A, #1A3D5A)',
  'linear-gradient(90deg, #5A8A4A, #3A6A2A)',
  'linear-gradient(90deg, #8A5A2A, #5A3A10)',
]
```

### Card structure
```tsx
<div style={{
  background:    '#fff',
  border:        status === 'setup'
                   ? '0.5px solid rgba(192,123,85,0.30)'
                   : '0.5px solid rgba(44,62,80,0.10)',
  borderRadius:  '14px',
  overflow:      'hidden',
  cursor:        'pointer',
  position:      'relative',
  transition:    'border-color 0.15s, box-shadow 0.15s',
}}>

  {/* Coloured top bar — 3px height */}
  <div style={{ height: '3px',
    background: status === 'setup'
      ? 'linear-gradient(90deg, #C07B55, #E8A87C)'
      : TOP_BAR_GRADIENTS[colorIndex % TOP_BAR_GRADIENTS.length]
  }}/>

  {/* Pending badge — absolute top-right, only when pendingCount > 0 */}
  {pendingCount > 0 && (
    <div style={{
      position: 'absolute', top: '14px', right: '14px',
      fontSize: '10px', fontWeight: 500,
      background: 'rgba(192,123,85,0.15)', color: '#C07B55',
      padding: '3px 8px', borderRadius: '5px',
      display: 'flex', alignItems: 'center', gap: '4px',
    }}>
      [warning icon 9px] {pendingCount} pending
    </div>
  )}

  {/* Card header */}
  <div style={{ padding: '18px 18px 14px',
    borderBottom: '0.5px solid rgba(44,62,80,0.07)' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>

      {/* Avatar */}
      <div style={{
        width: '40px', height: '40px', borderRadius: '10px',
        background: AVATAR_GRADIENTS[colorIndex % AVATAR_GRADIENTS.length],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '14px', fontWeight: 500, color: '#fff', flexShrink: 0,
      }}>
        {getInitials(name)}
      </div>

      {/* Name + niche */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 500,
          color: '#1A2630', marginBottom: '3px', lineHeight: 1.2 }}>
          {name}
        </div>
        <div style={{ fontSize: '12px', color: '#8A8070' }}>
          {niche}{location ? ` · ${location}` : ''}
        </div>
      </div>

      {/* Status pill */}
      <div style={{ flexShrink: 0 }}>
        <StatusPill status={status} />
      </div>
    </div>
  </div>

  {/* Card body */}
  <div style={{ padding: '14px 18px' }}>

    {/* Setup-incomplete CTA — shown instead of stats */}
    {status === 'setup' ? (
      <div
        onClick={onCompleteSetup}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 12px', background: 'rgba(192,123,85,0.07)',
          borderRadius: '8px', marginBottom: '14px', cursor: 'pointer',
        }}
      >
        [info icon 14px #C07B55]
        <div>
          <div style={{ fontSize: '12px', color: '#A05A35', fontWeight: 500 }}>
            Setup incomplete
          </div>
          <div style={{ fontSize: '10px', color: '#C07B55', marginTop: '1px' }}>
            Configure sources to start generating
          </div>
        </div>
        [chevron right 12px #C07B55 margin-left:auto]
      </div>
    ) : (
      /* Stats tiles — 3 columns */
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: '8px', marginBottom: '14px',
      }}>
        <StatTile value={postsPerWeek} label="Posts/wk" />
        <StatTile value={publishedCount} label="Published" />
        <StatTile value={reachTotal ? formatReach(reachTotal) : '—'} label="Reach" />
      </div>
    )}

    {/* Pillar tags */}
    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
      {pillars.slice(0, 4).map((p, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
          background: 'rgba(44,62,80,0.06)', color: '#4A5060',
        }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%',
            background: p.color, flexShrink: 0 }}/>
          {p.name}
        </span>
      ))}
    </div>
  </div>

  {/* Card footer */}
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 18px 14px',
  }}>
    <span style={{ fontSize: '11px', color: status === 'setup' ? '#C07B55' : '#8A8070' }}>
      {status === 'setup'
        ? 'No posts generated yet'
        : lastGeneratedAt
          ? `Generated ${timeAgo(lastGeneratedAt)}`
          : 'Never generated'}
    </span>

    <div style={{ display: 'flex', gap: '6px' }}>
      {status === 'setup' ? (
        <button onClick={onCompleteSetup} style={{
          fontSize: '11px', fontWeight: 500, padding: '5px 12px',
          borderRadius: '6px', cursor: 'pointer', border: 'none',
          background: '#C07B55', color: '#ECE8E1',
        }}>
          Complete setup
        </button>
      ) : (
        <>
          <button onClick={onSources} style={{
            fontSize: '11px', fontWeight: 500, padding: '5px 12px',
            borderRadius: '6px', cursor: 'pointer', border: 'none',
            background: 'rgba(44,62,80,0.07)', color: '#4A5060',
          }}>
            Sources
          </button>
          <button onClick={onGenerate} style={{
            fontSize: '11px', fontWeight: 500, padding: '5px 12px',
            borderRadius: '6px', cursor: 'pointer', border: 'none',
            background: '#1A2630', color: '#ECE8E1',
          }}>
            Generate
          </button>
        </>
      )}
    </div>
  </div>
</div>
```

### `StatusPill` sub-component (inline or extract)
```typescript
const STATUS_STYLES = {
  active: { bg: 'rgba(122,154,106,0.12)', color: '#5A8A4A', dot: '#5A8A4A', label: 'Active' },
  setup:  { bg: 'rgba(192,123,85,0.12)',  color: '#A05A35', dot: '#C07B55', label: 'Setup'  },
  paused: { bg: 'rgba(44,62,80,0.08)',    color: '#6A7080', dot: '#8A9090', label: 'Paused' },
}
```

### `StatTile` sub-component (inline or extract)
```typescript
// value: number | string, label: string
<div style={{
  textAlign: 'center', padding: '8px 6px',
  background: '#F9F6F2', borderRadius: '7px',
}}>
  <div style={{
    fontFamily: 'var(--font-display, Georgia, serif)',
    fontSize: '16px', fontWeight: 500, color: '#1A2630', lineHeight: 1,
  }}>
    {value}
  </div>
  <div style={{
    fontSize: '9px', color: '#8A8070', letterSpacing: '0.5px',
    textTransform: 'uppercase', marginTop: '3px',
  }}>
    {label}
  </div>
</div>
```

### `formatReach` helper
```typescript
function formatReach(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}
```

### `timeAgo` helper (reuse if already exists in project)
```typescript
function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime()
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${d}d ago`
}
```

### Hover state
Apply via onMouseEnter/onMouseLeave:
```typescript
onMouseEnter: borderColor → rgba(44,62,80,0.22), boxShadow → 0 2px 12px rgba(44,62,80,0.07)
onMouseLeave: revert to default
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Active card renders: top bar, avatar, stats, pillar tags, footer buttons
- [ ] Setup card renders: amber top bar, setup CTA banner, no stats, "Complete setup" button
- [ ] Pending badge visible when pendingCount > 0, hidden when 0
- [ ] Hover shows subtle shadow and darker border
- [ ] "Generate" button calls `onGenerate`
- [ ] "Sources" button calls `onSources`
- [ ] "Complete setup" calls `onCompleteSetup`

---

## Step 2 — Create `AddClientCard` component

> **File:** `src/components/clients/add-client-card.tsx`

```typescript
interface AddClientCardProps {
  onClick: () => void
}
```

```tsx
<button onClick={onClick} style={{
  background:    '#fff',
  border:        '0.5px dashed rgba(44,62,80,0.18)',
  borderRadius:  '14px',
  display:       'flex',
  flexDirection: 'column',
  alignItems:    'center',
  justifyContent:'center',
  gap:           '12px',
  padding:       '40px 20px',
  cursor:        'pointer',
  minHeight:     '220px',
  width:         '100%',
  transition:    'border-color 0.15s, background 0.15s',
  fontFamily:    'inherit',
}}>
  <div style={{ width: '40px', height: '40px', borderRadius: '10px',
    background: 'rgba(44,62,80,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    [plus icon 18px stroke #8A8070 stroke-width 1.5]
  </div>
  <div>
    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A2630',
      textAlign: 'center', marginBottom: '4px' }}>
      Add a new client
    </div>
    <div style={{ fontSize: '11px', color: '#8A8070', textAlign: 'center' }}>
      Start the onboarding interview
    </div>
  </div>
</button>
```

Hover state: `border-color: #C07B55; background: #FDFAF7`

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Card renders dashed border, centred content
- [ ] Hover shows terracotta border
- [ ] Clicking calls `onClick`

---

## Step 3 — Create `ClientsToolbar` component

> **File:** `src/components/clients/clients-toolbar.tsx`

```typescript
interface ClientsToolbarProps {
  clientCount: number
  searchValue: string
  onSearchChange: (value: string) => void
  onAddClient: () => void
}
```

```tsx
<div style={{ display: 'flex', alignItems: 'center',
  justifyContent: 'space-between', marginBottom: '20px' }}>

  {/* Left: count + search + filter */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    <span style={{ fontSize: '13px', color: '#8A8070' }}>
      {clientCount} {clientCount === 1 ? 'client' : 'clients'}
    </span>

    {/* Search input */}
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      [search icon 13px absolute left:10px color:#8A8070 pointer-events:none]
      <input
        value={searchValue}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Search clients..."
        style={{
          padding: '8px 12px 8px 32px',
          border: '0.5px solid rgba(44,62,80,0.14)',
          borderRadius: '8px', fontSize: '13px',
          fontFamily: 'inherit', background: '#fff',
          color: '#1A2630', outline: 'none', width: '220px',
        }}
      />
    </div>

    {/* Filter button */}
    <button style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '8px 12px', border: '0.5px solid rgba(44,62,80,0.14)',
      borderRadius: '8px', fontSize: '12px', color: '#8A8070',
      background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
    }}>
      [filter icon 12px] Filter
    </button>
  </div>

  {/* Right: Add client button */}
  <button onClick={onAddClient} style={{
    display: 'flex', alignItems: 'center', gap: '7px',
    padding: '9px 16px', background: '#1A2630', color: '#ECE8E1',
    border: 'none', borderRadius: '8px', fontSize: '13px',
    fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'background 0.15s',
  }}>
    [plus icon 13px stroke:#ECE8E1] Add client
  </button>
</div>
```

Add button hover: `background: #C07B55`

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Search input updates on type
- [ ] "Add client" button calls `onAddClient`
- [ ] Client count label correct (singular/plural)

---

## Step 4 — Rebuild the clients page

> **File:** `src/app/(dashboard)/clients/page.tsx`

Keep all existing data fetching unchanged. Replace the table JSX with the card grid.

### Data mapping

The existing data returns a list of clients. Map each to the `ClientCard` props.
The following mappings may need adjustment based on your actual data shape:

```typescript
// Derive pillar colours from index — same PILLAR_COLORS from pillar-sources.ts
const PILLAR_COLORS = ['#C07B55', '#185FA5', '#3B6D11', '#854F0B']

// Map client to card props
const cardProps = clients.map((client, index) => ({
  id:             client.id,
  name:           client.name,
  niche:          client.brand_profiles?.niche ?? '—',
  location:       client.brand_profiles?.location ?? undefined,
  status:         deriveStatus(client),   // see below
  postsPerWeek:   client.brand_profiles?.posts_per_week ?? 0,
  publishedCount: client.published_count ?? 0,
  reachTotal:     client.reach_total ?? undefined,
  pendingCount:   client.pending_count ?? 0,
  pillars:        (client.brand_profiles?.content_pillars ?? []).map((p, i) => ({
                    name: p.pillar,
                    color: PILLAR_COLORS[i % PILLAR_COLORS.length],
                  })),
  lastGeneratedAt: client.last_generated_at
                     ? new Date(client.last_generated_at) : null,
  colorIndex:     index,
  href:           `/clients/${client.id}`,
}))
```

### `deriveStatus` helper
```typescript
function deriveStatus(client: ClientWithProfile): 'active' | 'setup' | 'paused' {
  // A client is "setup" if they have no active sources
  // Adjust condition based on your actual data shape
  if (!client.brand_profiles?.content_pillars?.length) return 'setup'
  if (!client.is_active) return 'paused'
  return 'active'
}
```

### Search filter (client-side)
```typescript
'use client'
const [search, setSearch] = useState('')
const filtered = cardProps.filter(c =>
  c.name.toLowerCase().includes(search.toLowerCase()) ||
  c.niche.toLowerCase().includes(search.toLowerCase())
)
```

Note: if the page is currently a server component, this requires adding
`'use client'` OR lifting search state to a client wrapper component that
receives the data as props. Check the current component type and choose
the approach that requires fewer changes.

### Page JSX
```tsx
<div style={{ padding: '0 32px 40px', background: '#F4EFE6', minHeight: '100vh' }}>

  {/* Topbar — reuse the same topbar pattern from the dashboard */}
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '24px 0 0', marginBottom: '28px' }}>
    <h1 style={{ fontFamily: 'var(--font-display, Georgia, serif)',
      fontSize: '28px', fontWeight: 400, color: '#1A2630' }}>
      Clients
    </h1>
    {/* Topbar right (date + notif) — same as dashboard */}
  </div>

  <ClientsToolbar
    clientCount={filtered.length}
    searchValue={search}
    onSearchChange={setSearch}
    onAddClient={() => router.push('/clients/new')}
  />

  {/* Card grid */}
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
    {filtered.map((props, index) => (
      <ClientCard
        key={props.id}
        {...props}
        onGenerate={() => router.push(`/generate?client=${props.id}`)}
        onSources={() => router.push(`/clients/${props.id}/sources`)}
        onCompleteSetup={() => router.push(`/clients/${props.id}/onboarding`)}
      />
    ))}
    <AddClientCard onClick={() => router.push('/clients/new')} />
  </div>

  {/* Empty state — only when search returns nothing */}
  {filtered.length === 0 && search && (
    <div style={{ textAlign: 'center', padding: '60px 0',
      fontSize: '14px', color: '#8A8070' }}>
      No clients match "{search}"
    </div>
  )}
</div>
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npm run build` — no errors
- [ ] Page renders with card grid instead of table
- [ ] Each client has correct name, niche, stats, pillar tags
- [ ] Setup client shows amber top bar and CTA banner
- [ ] Pending badge shows on clients with pending > 0
- [ ] Add client card appears at the end of the grid
- [ ] Search filters the client list
- [ ] "Generate" navigates to generate page with client pre-selected
- [ ] "Sources" navigates to client sources page
- [ ] "Complete setup" navigates to onboarding page
- [ ] "Add client" (both toolbar and card) navigates to new client page

---

## Step 5 — Responsive behaviour

The 3-column grid should collapse gracefully on narrow viewports.

If using Tailwind:
```
className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[14px]"
```

If using inline styles, add a `<style>` tag or media query:
```css
@media (max-width: 900px) {
  .client-card-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .client-card-grid { grid-template-columns: 1fr; }
}
```

### ✓ Step 5 Verification
- [ ] At 1280px+: 3 columns
- [ ] At 900–1280px: 2 columns
- [ ] Below 900px: 1 column
- [ ] Cards do not overflow at any width

---

## Step 6 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Visual checks
- [ ] Card grid replaces table completely — no table elements remain
- [ ] Each client card has coloured top bar, avatar with initials, status pill
- [ ] Active clients show 3 stat tiles in Playfair Display numbers
- [ ] Pillar tags with coloured dots appear on every card
- [ ] Setup client: amber top bar, orange "Setup" pill, setup CTA, "Complete setup" button
- [ ] Pending badge floats top-right when pendingCount > 0
- [ ] Add client card at end of grid with dashed border
- [ ] Hover states: cards lift with subtle shadow, add card gets terracotta border

### Functional checks
- [ ] All navigation from card buttons still works
- [ ] Search filters without page reload
- [ ] "Add client" from both toolbar and card navigate to onboarding
- [ ] Clicking a card body navigates to client detail (if that was existing behaviour)

### Consistency check with dashboard
- [ ] Page title in same Playfair Display style as dashboard
- [ ] Topbar matches dashboard topbar
- [ ] Background colour (#F4EFE6) consistent
- [ ] Button styles match (slate primary, muted secondary)

---

## What is NOT changed

| File | Why |
|---|---|
| Client data fetching | Queries unchanged |
| `/clients/new` onboarding flow | Separate page, not in scope |
| `/clients/[id]` detail page | Next redesign phase |
| `/clients/[id]/sources` page | Already redesigned separately |
| Auth and middleware | Not in scope |

---

## Implementation order for Claude Code

```
Step 1 → client-card.tsx          (main component — build and verify in isolation)
         ↑ test with hardcoded props before wiring data
Step 2 → add-client-card.tsx      (simple, quick)
Step 3 → clients-toolbar.tsx      (search + button)
Step 4 → clients/page.tsx         (assemble — keep all data fetching unchanged)
Step 5 → responsive grid          (CSS only)
Step 6 → end-to-end verification
```

---

*Kontuur — Clients Page Redesign Plan*
*Table → card grid. All data fetching and routing unchanged.*
*Three states: active (stats + actions), setup (CTA banner), paused.*