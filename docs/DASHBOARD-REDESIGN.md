# Navigation & Dashboard Redesign — Implementation Plan

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after each step.
> Do not modify files not listed here. Do not skip steps.
> After each step, confirm the page renders without console errors before proceeding.

---

## Context

The current dashboard is a blank page with zero-state metric cards and an empty
client list. This plan redesigns the sidebar navigation and dashboard to match
the approved mockup — a content-dense, information-rich layout that is useful
from first load.

No existing functionality changes. Only visual presentation and layout.

---

## Design Tokens

These must be used consistently across all components. Add to your global CSS
or Tailwind config before writing any component code.

```
--slate:          #1A2630   sidebar background, primary text, buttons
--slate-mid:      #2C3E50   hover states
--warm-bg:        #F4EFE6   page background
--warm-white:     #F9F6F2   card hover background
--cream:          #ECE8E1   text on dark
--terracotta:     #C07B55   primary accent, active nav, metric m1
--muted:          #8A8070   secondary text, labels
--border-light:   rgba(44,62,80,0.10)   card borders
--border-subtle:  rgba(44,62,80,0.07)   row dividers

Metric accent colours (top borders only):
--accent-m1:  #C07B55   Active clients
--accent-m2:  #2C5F8A   Pending review
--accent-m3:  #5A8A4A   Scheduled this week
--accent-m4:  #8A5A2A   Published this month

Status colours:
--status-ok:    #7A9A6A
--status-warn:  #C07B55
```

## Typography

- Display / headings: Playfair Display, weight 400 (already in project)
- Body / UI: DM Sans or Geist Sans (already in project)
- Page title: Playfair Display 28px weight 400
- Card titles: DM Sans 13px weight 500
- Labels: DM Sans 10px weight 500 uppercase letter-spacing 1.5px
- Metric values: Playfair Display 36px weight 400

---

## Files Modified

| File | Change |
|---|---|
| `src/components/layout/sidebar.tsx` | UPDATE — full sidebar redesign |
| `src/components/layout/dashboard-layout.tsx` | UPDATE — topbar redesign |
| `src/app/(dashboard)/dashboard/page.tsx` | UPDATE — full dashboard redesign |
| `src/components/dashboard/metric-card.tsx` | CREATE — reusable metric card |
| `src/components/dashboard/client-row.tsx` | CREATE — client row component |
| `src/components/dashboard/post-preview-row.tsx` | CREATE — pending post row |
| `src/components/dashboard/briefing-item.tsx` | CREATE — briefing bullet item |
| `src/components/dashboard/quick-action-btn.tsx` | CREATE — quick action button |

> **Find actual file paths first:**
> ```bash
> find src -name "*.tsx" | xargs grep -l "Dashboard\|sidebar\|Sidebar" | head -10
> find src -name "*.tsx" | xargs grep -l "Weekly Intelligence\|ACTIVE CLIENTS" | head -5
> ```

---

## Step 1 — Redesign the sidebar

> **File:** wherever the sidebar/nav component lives

### Logo mark (keep existing, tighten spacing)
```tsx
<div style={{
  borderLeft:   '1.5px solid #C07B55',
  borderRight:  '1.5px solid #C07B55',
  borderTop:    '0.5px solid rgba(236,232,225,0.18)',
  borderBottom: '0.5px solid rgba(236,232,225,0.18)',
  padding:      '11px 16px',
  display:      'inline-block',
  marginBottom: '32px',
}}>
  <div style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: '18px',
    fontWeight: 400, color: '#ECE8E1', letterSpacing: '4px' }}>KONTUUR</div>
  <div style={{ fontSize: '7px', color: '#C07B55', letterSpacing: '6px', marginTop: '4px' }}>
    SOCIAL INTELLIGENCE
  </div>
</div>
```

### Section label above nav items
```tsx
<div style={{ fontSize: '9px', fontWeight: 500, color: 'rgba(236,232,225,0.30)',
  letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: '8px',
  padding: '0 4px' }}>
  Workspace
</div>
```

### Nav items — inactive state
```tsx
// Wrapper
padding: 9px 12px
borderRadius: 7px
display: flex, alignItems: center, gap: 10px
cursor: pointer
transition: background 0.15s
hover → background: rgba(236,232,225,0.07)

// Icon
width: 15px, height: 15px
color: rgba(236,232,225,0.38)

// Label
fontSize: 13px
color: rgba(236,232,225,0.55)
fontWeight: 400
```

### Nav items — active state
```tsx
background: rgba(192,123,85,0.15)
icon color: #C07B55
label color: #ECE8E1, fontWeight: 500
```

### Review queue badge
```tsx
<span style={{ fontSize: '10px', fontWeight: 500, background: 'rgba(192,123,85,0.25)',
  color: '#C07B55', padding: '2px 6px', borderRadius: '4px', lineHeight: 1.4 }}>
  {pendingCount}
</span>
```
Only shown when `pendingCount > 0`. Read from the same data source already
used by the existing pending count display.

### Sidebar bottom — settings + agency chip
Replace the current settings link with a two-item bottom section:

```tsx
// Settings row
<div style={{ display: 'flex', alignItems: 'center', gap: '8px',
  padding: '8px 12px', borderRadius: '7px', cursor: 'pointer',
  marginBottom: '6px' }}
  onMouseEnter/Leave for hover: background rgba(236,232,225,0.06)>
  [settings icon 14px rgba(236,232,225,0.30)]
  <span style={{ fontSize: '12px', color: 'rgba(236,232,225,0.38)' }}>Settings</span>
</div>

// Agency chip
<div style={{ display: 'flex', alignItems: 'center', gap: '10px',
  padding: '10px 12px', borderRadius: '8px',
  background: 'rgba(236,232,225,0.06)',
  border: '0.5px solid rgba(236,232,225,0.10)' }}>
  // Avatar circle — initials from agency name
  <div style={{ width: '28px', height: '28px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #C07B55, #8B5A3A)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: 500, color: '#fff' }}>
    {initials}
  </div>
  <div>
    <div style={{ fontSize: '12px', color: 'rgba(236,232,225,0.70)', fontWeight: 500 }}>
      {agencyName}
    </div>
    <div style={{ fontSize: '10px', color: 'rgba(236,232,225,0.30)' }}>
      Agency workspace
    </div>
  </div>
</div>
```

### Sidebar background rings (decorative, position: absolute)
```tsx
<svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }}
  viewBox="0 0 220 700" fill="none">
  <ellipse cx="200" cy="350" rx="180" ry="180"
    stroke="rgba(236,232,225,0.025)" strokeWidth="50"/>
  <ellipse cx="200" cy="350" rx="120" ry="120"
    stroke="rgba(192,123,85,0.035)" strokeWidth="30"/>
</svg>
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Logo mark renders with terracotta side borders
- [ ] Active nav item has terracotta tint background, icon is terracotta
- [ ] Inactive items are muted, hover shows subtle highlight
- [ ] Review queue badge shows pending count, hidden when zero
- [ ] Agency chip visible at bottom with initials avatar
- [ ] Decorative rings visible but subtle
- [ ] All existing nav links still navigate correctly

---

## Step 2 — Redesign the topbar

> **File:** dashboard layout or wherever the top bar renders

```tsx
// Topbar layout
display: flex
alignItems: center
justifyContent: space-between
padding: 24px 32px 0

// Page title
fontFamily: var(--font-display, Georgia, serif)
fontSize: 28px
fontWeight: 400
color: #1A2630
// (the title text itself comes from existing page metadata — do not hardcode)

// Right side: date chip + notification bell
// Date chip
<span style={{ fontSize: '11px', color: '#8A8070', background: '#fff',
  border: '0.5px solid rgba(44,62,80,0.10)', padding: '6px 12px',
  borderRadius: '7px', letterSpacing: '0.3px' }}>
  {formattedDate}   // e.g. "Mon, 21 April 2026"
</span>

// Notification bell button
<div style={{ width: '34px', height: '34px', borderRadius: '8px',
  background: '#fff', border: '0.5px solid rgba(44,62,80,0.12)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', position: 'relative' }}>
  [bell icon 15px stroke #1A2630]
  // Red dot if notifications exist — keep existing notification logic
  {hasNotifications && (
    <div style={{ width: '7px', height: '7px', borderRadius: '50%',
      background: '#C07B55', position: 'absolute', top: '7px', right: '7px',
      border: '1.5px solid #fff' }}/>
  )}
</div>
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Page title renders in Playfair Display
- [ ] Date chip shows today's date
- [ ] Notification bell retains existing notification logic
- [ ] Topbar visible on all dashboard pages (not just the dashboard page)

---

## Step 3 — Create `MetricCard` component

> **File:** `src/components/dashboard/metric-card.tsx`

```typescript
interface MetricCardProps {
  label:       string
  value:       number | string
  delta?:      string           // e.g. "+1 this month"
  deltaType?:  'positive' | 'negative' | 'neutral'
  accentColor: string           // top border colour
}
```

```tsx
<div style={{
  background:    '#fff',
  border:        '0.5px solid rgba(44,62,80,0.10)',
  borderRadius:  '12px',
  padding:       '18px 20px',
  position:      'relative',
  overflow:      'hidden',
}}>
  // Coloured top border
  <div style={{ position: 'absolute', top: 0, left: 0, right: 0,
    height: '2px', background: accentColor }}/>

  <div style={{ fontSize: '10px', fontWeight: 500, color: '#8A8070',
    letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
    {label}
  </div>

  <div style={{ fontFamily: 'var(--font-display, Georgia, serif)',
    fontSize: '36px', fontWeight: 400, color: '#1A2630',
    lineHeight: 1, marginBottom: '6px' }}>
    {value}
  </div>

  {delta && (
    <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px',
      color: deltaType === 'positive' ? '#7A9A6A'
           : deltaType === 'negative' ? '#C07B55'
           : '#8A8070' }}>
      {deltaType === 'positive' && [up arrow icon 10px]}
      {deltaType === 'negative' && [warning icon 10px]}
      {delta}
    </div>
  )}
</div>
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Component renders with correct top border colour
- [ ] Positive delta is sage green, negative is terracotta, neutral is muted
- [ ] Value renders in Playfair Display

---

## Step 4 — Create `ClientRow` component

> **File:** `src/components/dashboard/client-row.tsx`

```typescript
interface ClientRowProps {
  name:         string
  niche:        string
  location?:    string
  status:       'active' | 'setup' | 'paused'
  pendingCount: number
  href:         string
}
```

```tsx
<a href={href} style={{ display: 'flex', alignItems: 'center', gap: '12px',
  padding: '10px 0', borderBottom: '0.5px solid rgba(44,62,80,0.06)',
  textDecoration: 'none' }}>

  // Initials avatar
  <div style={{ width: '32px', height: '32px', borderRadius: '8px',
    background: 'linear-gradient(135deg,rgba(44,62,80,0.12),rgba(44,62,80,0.06))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '12px', fontWeight: 500, color: '#2C3E50', flexShrink: 0 }}>
    {initials(name)}
  </div>

  // Name + niche
  <div style={{ flex: 1 }}>
    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A2630' }}>{name}</div>
    <div style={{ fontSize: '11px', color: '#8A8070', marginTop: '1px' }}>
      {niche}{location ? ` · ${location}` : ''}
    </div>
  </div>

  // Status indicator
  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
    <div style={{ width: '6px', height: '6px', borderRadius: '50%',
      background: status === 'active' ? '#7A9A6A' : '#C07B55' }}/>
    <span style={{ fontSize: '11px',
      color: status === 'active' ? '#7A9A6A' : '#C07B55' }}>
      {status === 'active' ? 'Active' : status === 'setup' ? 'Setup' : 'Paused'}
    </span>
  </div>

  // Pending count badge (only if > 0)
  {pendingCount > 0 && (
    <span style={{ fontSize: '11px', fontWeight: 500,
      background: 'rgba(192,123,85,0.12)', color: '#C07B55',
      padding: '2px 7px', borderRadius: '4px' }}>
      {pendingCount}
    </span>
  )}
  {pendingCount === 0 && (
    <span style={{ fontSize: '11px', color: '#8A8070' }}>—</span>
  )}
</a>
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Initials computed correctly from name string
- [ ] Active status is sage green, setup/paused is terracotta
- [ ] Pending count badge hidden when zero, shows "—" instead
- [ ] Row is a link — clicking navigates to client

---

## Step 5 — Create `PostPreviewRow` component

> **File:** `src/components/dashboard/post-preview-row.tsx`

```typescript
interface PostPreviewRowProps {
  platform:   'instagram' | 'facebook' | 'linkedin' | 'tiktok'
  caption:    string
  clientName: string
  pillar:     string
  createdAt:  Date
  onApprove:  () => void
}
```

```tsx
<div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px',
  padding: '10px 0', borderBottom: '0.5px solid rgba(44,62,80,0.06)' }}>

  // Platform badge
  <div style={{ width: '28px', height: '28px', borderRadius: '6px',
    background: platform === 'instagram' ? 'rgba(192,123,85,0.10)' : 'rgba(44,94,138,0.10)',
    color:      platform === 'instagram' ? '#C07B55' : '#2C5F8A',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '10px', fontWeight: 500, flexShrink: 0 }}>
    {platform === 'instagram' ? 'IG' : platform === 'facebook' ? 'FB'
     : platform === 'linkedin' ? 'LI' : 'TK'}
  </div>

  // Caption + meta
  <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ fontSize: '12px', color: '#1A2630', lineHeight: 1.4,
      display: '-webkit-box', WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
      {caption}
    </div>
    <div style={{ fontSize: '10px', color: '#8A8070', marginTop: '3px' }}>
      {clientName} · {pillar} · {timeAgo(createdAt)}
    </div>
  </div>

  // Approve button
  <button onClick={onApprove}
    style={{ fontSize: '10px', fontWeight: 500, color: '#7A9A6A',
      background: 'rgba(122,154,106,0.10)', border: 'none',
      borderRadius: '4px', padding: '3px 8px', cursor: 'pointer',
      whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px' }}>
    Approve
  </button>
</div>
```

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Caption truncated to 2 lines
- [ ] Platform badge colour matches platform
- [ ] Approve button calls `onApprove` — keep existing approval logic

---

## Step 6 — Create `BriefingItem` component

> **File:** `src/components/dashboard/briefing-item.tsx`

```typescript
type BriefingTag = 'algorithm' | 'trend' | 'action'

interface BriefingItemProps {
  tag:  BriefingTag
  text: string
}

const TAG_STYLES: Record<BriefingTag, { label: string; bg: string; color: string }> = {
  algorithm: { label: 'Algorithm', bg: 'rgba(44,94,138,0.10)',  color: '#2C5F8A' },
  trend:     { label: 'Trend',     bg: 'rgba(122,154,106,0.10)', color: '#4A7A3A' },
  action:    { label: 'Action',    bg: 'rgba(192,123,85,0.10)',  color: '#A05A35' },
}
```

```tsx
<div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
  <div style={{ width: '5px', height: '5px', borderRadius: '50%',
    background: '#C07B55', flexShrink: 0, marginTop: '6px' }}/>
  <div style={{ fontSize: '12px', color: '#5A5050', lineHeight: 1.75 }}>
    <span style={{ display: 'inline-block', fontSize: '10px', fontWeight: 500,
      padding: '2px 7px', borderRadius: '4px', marginRight: '4px',
      background: TAG_STYLES[tag].bg, color: TAG_STYLES[tag].color }}>
      {TAG_STYLES[tag].label}
    </span>
    {text}
  </div>
</div>
```

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Three tag types render with distinct colours
- [ ] Terracotta bullet dot on left

---

## Step 7 — Create `QuickActionBtn` component

> **File:** `src/components/dashboard/quick-action-btn.tsx`

```typescript
interface QuickActionBtnProps {
  label:      string
  sublabel:   string
  iconColor:  string
  iconBg:     string
  icon:       React.ReactNode
  onClick:    () => void
}
```

```tsx
<button onClick={onClick} style={{
  display: 'flex', alignItems: 'center', gap: '9px',
  padding: '11px 13px', borderRadius: '8px',
  border: '0.5px solid rgba(44,62,80,0.12)',
  background: '#F9F6F2', cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
  textAlign: 'left', width: '100%',
}}>
  <div style={{ width: '28px', height: '28px', borderRadius: '6px',
    background: iconBg, display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0 }}>
    {icon}
  </div>
  <div>
    <div style={{ fontSize: '12px', fontWeight: 500, color: '#1A2630' }}>{label}</div>
    <div style={{ fontSize: '10px', color: '#8A8070', marginTop: '1px' }}>{sublabel}</div>
  </div>
</button>
```

Hover state: `border-color: #C07B55; background: #fff`
Use onMouseEnter/onMouseLeave for hover or Tailwind group-hover.

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Hover shows terracotta border and white background
- [ ] Clicking calls `onClick`

---

## Step 8 — Rebuild the dashboard page

> **File:** `src/app/(dashboard)/dashboard/page.tsx`

Using the new components from Steps 3–7, rebuild the page layout.
All existing data fetching stays unchanged — only the JSX presentation changes.

### Layout structure
```tsx
<div style={{ padding: '20px 32px 32px' }}>

  {/* Metric cards — 4 column grid */}
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
    gap: '12px', marginBottom: '24px' }}>
    <MetricCard label="Active clients"       value={activeClients}
      delta="+1 this month"    deltaType="positive" accentColor="#C07B55" />
    <MetricCard label="Pending review"       value={pendingCount}
      delta={pendingCount > 0 ? "Needs attention" : "All clear"}
      deltaType={pendingCount > 0 ? "negative" : "positive"} accentColor="#2C5F8A" />
    <MetricCard label="Scheduled this week"  value={scheduledCount}
      delta="On track" deltaType="neutral" accentColor="#5A8A4A" />
    <MetricCard label="Published this month" value={publishedCount}
      delta={monthDelta} deltaType="positive" accentColor="#8A5A2A" />
  </div>

  {/* Row 2 — Clients + Pending review */}
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: '16px', marginBottom: '16px' }}>

    {/* Clients card */}
    <SectionCard title="Clients" action="View all" actionHref="/clients">
      {clients.slice(0, 4).map(c => <ClientRow key={c.id} {...c} />)}
      {clients.length === 0 && <EmptyState message="No clients yet"
        actionLabel="Add your first client" actionHref="/clients/new" />}
    </SectionCard>

    {/* Pending review card */}
    <SectionCard title="Pending review" action="Open queue" actionHref="/review">
      {pendingPosts.slice(0, 3).map(p => (
        <PostPreviewRow key={p.id} {...p} onApprove={() => handleApprove(p.id)} />
      ))}
      {pendingPosts.length === 0 && <EmptyState message="No posts pending review" />}
    </SectionCard>
  </div>

  {/* Row 3 — Briefing + Quick actions */}
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: '16px' }}>

    {/* Weekly briefing card */}
    <SectionCard title="Weekly intelligence briefing" action="Refresh"
      onActionClick={handleRefreshBriefing}>
      {briefingItems.map((item, i) => <BriefingItem key={i} {...item} />)}
      {briefingItems.length === 0 && (
        <p style={{ fontSize: '13px', color: '#8A8070', fontStyle: 'italic' }}>
          Your briefing will appear here — generated every Monday.
        </p>
      )}
    </SectionCard>

    {/* Quick actions card */}
    <SectionCard title="Quick actions">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <QuickActionBtn label="Generate posts" sublabel="Pick client + platform"
          iconBg="rgba(192,123,85,0.10)" iconColor="#C07B55"
          icon={<EditIcon />} onClick={() => router.push('/generate')} />
        <QuickActionBtn label="Add client" sublabel="Start onboarding"
          iconBg="rgba(44,94,138,0.10)" iconColor="#2C5F8A"
          icon={<UsersIcon />} onClick={() => router.push('/clients/new')} />
        <QuickActionBtn label="Review queue" sublabel={`${pendingCount} posts waiting`}
          iconBg="rgba(122,154,106,0.10)" iconColor="#4A7A3A"
          icon={<CheckIcon />} onClick={() => router.push('/review')} />
        <QuickActionBtn label="Analytics" sublabel="View performance"
          iconBg="rgba(138,90,42,0.10)" iconColor="#8A5A2A"
          icon={<BarChartIcon />} onClick={() => router.push('/analytics')} />
      </div>
    </SectionCard>
  </div>
</div>
```

### SectionCard wrapper (inline or extract to component)
```tsx
function SectionCard({ title, action, actionHref, onActionClick, children }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(44,62,80,0.10)',
      borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', borderBottom: '0.5px solid rgba(44,62,80,0.07)' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A2630' }}>{title}</span>
        {action && (
          <a href={actionHref} onClick={onActionClick}
            style={{ fontSize: '11px', color: '#C07B55', fontWeight: 500,
              textDecoration: 'none', cursor: 'pointer' }}>
            {action} →
          </a>
        )}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}
```

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Four metric cards render in a row with coloured top borders
- [ ] Metric values render in Playfair Display
- [ ] Clients section shows client rows with status dots and pending counts
- [ ] Pending review section shows post previews with approve buttons
- [ ] Weekly briefing renders (empty state message if no briefing yet)
- [ ] Quick actions 2×2 grid renders, all four buttons navigate correctly
- [ ] Empty states show when data is absent — no blank sections

---

## Step 9 — Fix the purple accent in Generate posts

> **File:** wherever the generate posts progress bar and button are styled

The current purple (`#6366f1` or similar) clashes with the Kontuur palette.
Find and replace:

```bash
grep -r "6366f1\|purple\|indigo\|violet" src/app --include="*.tsx" --include="*.css"
```

Replace progress bar colour with `#2C3E50` (slate).
Replace primary button with the existing slate button style from the design system.

This is a one-line change per occurrence — do not restructure the page.

### ✓ Step 9 Verification
- [ ] Generate posts progress bar is slate, not purple
- [ ] Primary button matches the rest of the app

---

## Step 10 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Visual checks
- [ ] Sidebar: logo mark correct, active state terracotta, agency chip at bottom
- [ ] Dashboard: 4 metric cards with coloured top borders, values in Playfair Display
- [ ] Clients section: avatars, status dots, pending counts
- [ ] Pending review: post previews with platform badges, truncated captions
- [ ] Briefing: tagged items with coloured badges
- [ ] Quick actions: 2×2 grid, hover shows terracotta border

### Functional checks
- [ ] All nav links still navigate to the correct pages
- [ ] Approve button in pending review still triggers existing approval action
- [ ] Quick action buttons navigate to correct routes
- [ ] Notification bell retains existing notification logic
- [ ] Review queue badge in sidebar shows live count

### Responsive / edge cases
- [ ] Dashboard with zero clients shows empty state with "Add your first client" link
- [ ] Dashboard with zero pending posts shows "All clear" message
- [ ] Dashboard with no briefing shows italic placeholder text
- [ ] Metric cards show 0 correctly (not blank)

---

## What is NOT changed

| File / Feature | Why |
|---|---|
| All data fetching and server actions | Logic unchanged |
| Auth and middleware | Not in scope |
| Review queue page | Next redesign phase |
| Clients list page | Next redesign phase |
| Generate posts wizard | Only the purple accent fixed |
| Analytics page | Later phase |
| Calendar page | Later phase |

---

## Implementation order for Claude Code

```
Step 1 → sidebar.tsx                     (most visible, sets the tone)
         ↑ verify in browser before continuing
Step 2 → topbar / dashboard-layout.tsx   (quick, depends on nothing)
Step 3 → metric-card.tsx                 (isolated component)
Step 4 → client-row.tsx                  (isolated component)
Step 5 → post-preview-row.tsx            (isolated component)
Step 6 → briefing-item.tsx               (isolated component)
Step 7 → quick-action-btn.tsx            (isolated component)
         ↑ verify all components compile before touching the page
Step 8 → dashboard/page.tsx              (assemble components)
Step 9 → generate posts purple fix       (one-line changes)
Step 10 → end-to-end verification
```

---

*Kontuur — Navigation & Dashboard Redesign Plan*
*Visual presentation only. All data fetching, actions, and routing unchanged.*
*Components are isolated — build and verify each before assembling the page.*