# Client Settings — Tabbed Redesign Plan

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after each step.
> Do not modify files not listed here. Do not skip steps.
> All existing data fetching, server actions, and form submission logic unchanged.
> Only visual presentation and layout change.

---

## Context

The current client settings page is a single long scrolling form. This plan
replaces it with a tabbed layout: left sidebar navigation with five tabs,
right content panel showing only the active tab. No scrolling anywhere.

The left sidebar also shows a persistent status card (queue freshness, pending
count, sources, published count) visible regardless of which tab is active.

---

## Tab Structure

| Tab | Content |
|---|---|
| Basic info | name, niche, website, email, language, formality, posts to generate, health toggle |
| Brand profile | tone, audience, content pillars, topics to avoid, testimonial voice, language requirements |
| Schedule | active platform, default post type, autonomous schedule (count, day, time) |
| Connected accounts | Instagram connect, Facebook connect |
| Content insights | read-only stats, top pillars, rewrite rate, source usage |

---

## Key Behaviours

- Clicking a nav item shows only that tab's panel, hides all others
- Save / Cancel in the topbar save the currently active tab's form data
- Content insights tab is read-only — Save button hidden or disabled on that tab
- Status card in left sidebar is always visible, not part of any tab

---

## Files Modified

| File | Change |
|---|---|
| `src/app/(dashboard)/clients/[id]/settings/page.tsx` | UPDATE — add tab state, restructure layout |
| `src/components/clients/settings/settings-layout.tsx` | CREATE — left nav + right panel shell |
| `src/components/clients/settings/settings-status-card.tsx` | CREATE — persistent status card |
| `src/components/clients/settings/tab-basic-info.tsx` | CREATE — basic info tab |
| `src/components/clients/settings/tab-brand-profile.tsx` | CREATE — brand profile tab |
| `src/components/clients/settings/tab-schedule.tsx` | CREATE — schedule tab |
| `src/components/clients/settings/tab-connected-accounts.tsx` | CREATE — accounts tab |
| `src/components/clients/settings/tab-insights.tsx` | CREATE — insights read-only tab |

> **Find actual paths first:**
> ```bash
> find src -name "*.tsx" | xargs grep -l "Brand tone\|brand_tone\|content_pillars" | head -10
> find src -name "*.tsx" | xargs grep -l "Save changes\|handleSave\|client.*settings" | head -10
> ```

---

## Step 1 — Create `SettingsStatusCard`

> **File:** `src/components/clients/settings/settings-status-card.tsx`

Read-only card shown in the left sidebar on all tabs.

```typescript
interface SettingsStatusCardProps {
  lastGeneratedAt:  Date | null
  pendingCount:     number
  activeSourceCount: number
  publishedCount:   number
  sourcesHref:      string   // link to /clients/[id]/sources
}
```

```tsx
<div style={{
  background:    '#fff',
  border:        '0.5px solid rgba(44,62,80,0.10)',
  borderRadius:  '11px',
  padding:       '13px',
  marginBottom:  '14px',
}}>
  <div style={{ fontSize: '9px', fontWeight: 500, color: '#8A8070',
    letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>
    Client status
  </div>

  {/* Queue freshness */}
  <StatusRow label="Queue">
    {lastGeneratedAt
      ? <span style={{ color: '#5A8A4A' }}>Refreshed {timeAgo(lastGeneratedAt)}</span>
      : <span style={{ color: '#C07B55' }}>Not yet refreshed</span>
    }
  </StatusRow>

  {/* Pending */}
  <StatusRow label="Pending">
    {pendingCount > 0
      ? <span style={{ color: '#C07B55' }}>{pendingCount} posts</span>
      : <span style={{ color: '#5A8A4A' }}>All clear</span>
    }
  </StatusRow>

  {/* Sources */}
  <StatusRow label="Sources">
    <a href={sourcesHref} style={{ fontSize: '11px', color: '#C07B55',
      textDecoration: 'none' }}>
      {activeSourceCount} active →
    </a>
  </StatusRow>

  {/* Published */}
  <StatusRow label="Published">
    <span style={{ fontSize: '11px', fontWeight: 500, color: '#1A2630' }}>
      {publishedCount} posts
    </span>
  </StatusRow>
</div>
```

`StatusRow` helper:
```typescript
function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', marginBottom: '6px' }}>
      <span style={{ fontSize: '11px', color: '#8A8070' }}>{label}</span>
      {children}
    </div>
  )
}
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Status rows render with correct values
- [ ] "Refreshed X ago" is green when recent, terracotta when null
- [ ] "Pending" is terracotta when count > 0, green when 0
- [ ] Sources link navigates to sources page

---

## Step 2 — Create `SettingsLayout`

> **File:** `src/components/clients/settings/settings-layout.tsx`

The outer shell: left nav sidebar + right content panel. Manages active tab state.

```typescript
export type SettingsTab =
  | 'basic'
  | 'brand'
  | 'schedule'
  | 'accounts'
  | 'insights'

interface SettingsLayoutProps {
  activeTab:    SettingsTab
  onTabChange:  (tab: SettingsTab) => void
  statusProps:  SettingsStatusCardProps
  isInsightsTab: boolean   // hides Save button on insights tab
  onSave:       () => void
  onCancel:     () => void
  clientName:   string
  clientHref:   string     // back link to /clients
  children:     React.ReactNode
}
```

### Topbar
```tsx
<div style={{ display: 'flex', alignItems: 'center',
  justifyContent: 'space-between', padding: '20px 28px 0', marginBottom: '20px' }}>

  {/* Left: back + client chip */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
    <a href={clientHref} style={{ display: 'flex', alignItems: 'center',
      gap: '6px', fontSize: '12px', color: '#8A8070', textDecoration: 'none' }}>
      ← Clients
    </a>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px',
      padding: '5px 11px', background: '#fff',
      border: '0.5px solid rgba(44,62,80,0.12)', borderRadius: '7px' }}>
      <ClientAvatar name={clientName} size={22} />
      <span style={{ fontSize: '12px', fontWeight: 500, color: '#1A2630' }}>
        {clientName}
      </span>
    </div>
  </div>

  {/* Right: cancel + save */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <button onClick={onCancel} style={{ padding: '7px 12px', background: 'none',
      border: '0.5px solid rgba(44,62,80,0.14)', borderRadius: '7px',
      fontSize: '12px', color: '#8A8070', cursor: 'pointer', fontFamily: 'inherit' }}>
      Cancel
    </button>
    {!isInsightsTab && (
      <button onClick={onSave} style={{ padding: '7px 16px', background: '#1A2630',
        color: '#ECE8E1', border: 'none', borderRadius: '7px',
        fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
        Save changes
      </button>
    )}
  </div>
</div>
```

### Body: left nav + right panel
```tsx
<div style={{ display: 'flex', gap: '16px', padding: '0 28px 32px', flex: 1 }}>

  {/* Left nav — 220px fixed */}
  <div style={{ width: '220px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
    <SettingsStatusCard {...statusProps} />

    <div style={{ fontSize: '9px', fontWeight: 500, color: '#8A8070',
      letterSpacing: '2px', textTransform: 'uppercase',
      marginBottom: '5px', padding: '0 8px' }}>
      Settings
    </div>

    {NAV_ITEMS.map(item => (
      <NavTab
        key={item.id}
        item={item}
        active={activeTab === item.id}
        onClick={() => onTabChange(item.id as SettingsTab)}
      />
    ))}
  </div>

  {/* Right panel — white card, fills remaining width */}
  <div style={{ flex: 1, background: '#fff',
    border: '0.5px solid rgba(44,62,80,0.10)',
    borderRadius: '12px', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', minWidth: 0 }}>
    {children}
  </div>
</div>
```

### `NAV_ITEMS` constant
```typescript
const NAV_ITEMS = [
  { id: 'basic',    label: 'Basic info',          icon: 'user'    },
  { id: 'brand',    label: 'Brand profile',        icon: 'edit'    },
  { id: 'schedule', label: 'Schedule',             icon: 'calendar'},
  { id: 'accounts', label: 'Connected accounts',   icon: 'link'    },
  { id: 'insights', label: 'Content insights',     icon: 'bar-chart'},
]
```

### `NavTab` sub-component
```tsx
<div
  onClick={onClick}
  style={{
    display:       'flex',
    alignItems:    'center',
    gap:           '9px',
    padding:       '9px 10px',
    borderRadius:  '8px',
    cursor:        'pointer',
    position:      'relative',
    background:    active ? '#fff' : 'transparent',
    border:        active ? '0.5px solid rgba(44,62,80,0.10)' : '0.5px solid transparent',
    marginBottom:  '2px',
    transition:    'background 0.15s',
  }}
>
  {/* Active indicator — left terracotta bar */}
  {active && (
    <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%',
      width: '2.5px', background: '#C07B55', borderRadius: '0 2px 2px 0' }}/>
  )}
  <NavIcon id={item.icon} active={active} />
  <span style={{ fontSize: '13px', fontWeight: active ? 500 : 400,
    color: active ? '#1A2630' : '#8A8070', flex: 1 }}>
    {item.label}
  </span>
</div>
```

Hover (non-active): `background: rgba(44,62,80,0.05)`

### Panel header pattern (reused by all tab components)
```tsx
// Each tab renders this at the top of its content
function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ padding: '18px 22px 14px',
      borderBottom: '0.5px solid rgba(44,62,80,0.07)', flexShrink: 0 }}>
      <div style={{ fontFamily: 'var(--font-display, Georgia, serif)',
        fontSize: '20px', fontWeight: 400, color: '#1A2630', marginBottom: '2px' }}>
        {title}
      </div>
      <div style={{ fontSize: '12px', color: '#8A8070' }}>{subtitle}</div>
    </div>
  )
}
```

Export `PanelHeader` from the layout file for reuse by all tab components.

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Topbar renders with client chip and save/cancel
- [ ] Left nav renders all 5 items
- [ ] Active tab has white background, left terracotta bar
- [ ] Clicking a nav item calls `onTabChange`
- [ ] Save button hidden when `isInsightsTab` is true
- [ ] Right panel shell renders (empty — content added per tab)

---

## Step 3 — Create `TabBasicInfo`

> **File:** `src/components/clients/settings/tab-basic-info.tsx`

```typescript
interface TabBasicInfoProps {
  // Mirror existing form field values and onChange handlers exactly
  // Do not rename or restructure — just wrap in the new layout
  name:               string
  niche:              string
  websiteUrl:         string
  contactEmail:       string
  primaryLanguage:    string
  languageFormality:  string
  postsToGenerate:    number
  secondaryLanguage:  string
  isHealthClient:     boolean
  onChange:           (field: string, value: string | boolean | number) => void
}
```

### Layout — 2-column grid
```tsx
<>
  <PanelHeader title="Basic info" subtitle="Client identity, language, and contact details" />
  <div style={{ padding: '20px 22px', overflowY: 'auto' }}>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
      marginBottom: '18px' }}>
      <Field label="Client name">
        <input value={name} onChange={e => onChange('name', e.target.value)} />
      </Field>
      <Field label="Niche">
        <input value={niche} onChange={e => onChange('niche', e.target.value)} />
      </Field>
      <Field label="Website URL">
        <input value={websiteUrl} onChange={e => onChange('websiteUrl', e.target.value)}
          placeholder="https://example.com" />
      </Field>
      <Field label="Contact email">
        <input value={contactEmail} onChange={e => onChange('contactEmail', e.target.value)}
          placeholder="client@example.com" />
      </Field>
      <Field label="Primary language">
        <select value={primaryLanguage} onChange={e => onChange('primaryLanguage', e.target.value)}>
          <option>Bulgarian</option>
          <option>English</option>
          <option>Romanian</option>
        </select>
      </Field>
      <Field label="Language formality">
        <select value={languageFormality} onChange={e => onChange('languageFormality', e.target.value)}>
          <option>Formal</option>
          <option>Casual</option>
          <option>Neutral</option>
        </select>
      </Field>
      <Field label="Posts to generate">
        <select value={postsToGenerate} onChange={e => onChange('postsToGenerate', Number(e.target.value))}>
          {[1,2,3,4,5,6,7].map(n => <option key={n}>{n}</option>)}
        </select>
      </Field>
      <Field label="Secondary language (optional)">
        <input value={secondaryLanguage}
          onChange={e => onChange('secondaryLanguage', e.target.value)}
          placeholder="e.g. English" />
      </Field>
    </div>

    {/* Health toggle */}
    <div style={{ borderTop: '0.5px solid rgba(44,62,80,0.07)', paddingTop: '14px' }}>
      <ToggleRow
        label="Health-related client"
        sublabel="Applies medical content guidelines and disclaimer rules"
        value={isHealthClient}
        onChange={v => onChange('isHealthClient', v)}
      />
    </div>
  </div>
</>
```

### Shared `Field` component (extract to shared file)
> **File:** `src/components/clients/settings/form-field.tsx`

```typescript
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '10px', fontWeight: 500, color: '#4A5060',
        letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        {label}
      </label>
      {/* Clone children and inject shared input styles */}
      {children}
    </div>
  )
}
```

Input styles (apply to all inputs, selects, textareas):
```
padding: 9px 11px
border: 0.5px solid rgba(44,62,80,0.16)
border-radius: 7px
font-size: 13px
font-family: inherit
color: #1A2630
background: #fff
outline: none
width: 100%
focus: border-color #2C3E50
```

### Shared `ToggleRow` component (extract to shared file)
```typescript
function ToggleRow({ label, sublabel, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '8px 0' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A2630', marginBottom: '2px' }}>
          {label}
        </div>
        <div style={{ fontSize: '11px', color: '#8A8070' }}>{sublabel}</div>
      </div>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: '32px', height: '17px', borderRadius: '9px',
          background: value ? '#1A2630' : 'rgba(44,62,80,0.18)',
          flexShrink: 0, cursor: 'pointer', position: 'relative',
          transition: 'background 0.2s',
        }}
      >
        <div style={{
          position: 'absolute', width: '13px', height: '13px',
          borderRadius: '50%', background: '#fff',
          top: '2px', left: value ? '17px' : '2px',
          transition: 'left 0.2s',
        }}/>
      </div>
    </div>
  )
}
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] 8 fields render in 2-column grid
- [ ] All inputs are controlled (value + onChange wired)
- [ ] Health toggle flips on click
- [ ] No scrollbar on this tab at 700px height

---

## Step 4 — Create `TabBrandProfile`

> **File:** `src/components/clients/settings/tab-brand-profile.tsx`

```typescript
interface TabBrandProfileProps {
  brandTone:          string
  targetAudience:     string
  topicsToAvoid:      string
  testimonialVoice:   string
  languageRequirements: string
  pillars:            { id: string; name: string; weight: number }[]
  onChange:           (field: string, value: unknown) => void
  onPillarChange:     (id: string, field: 'name' | 'weight', value: string | number) => void
  onPillarAdd:        () => void
  onPillarDelete:     (id: string) => void
}
```

### Layout
```tsx
<>
  <PanelHeader title="Brand profile"
    subtitle="Tone, audience, content pillars and language rules" />
  <div style={{ padding: '20px 22px', overflowY: 'auto' }}>

    {/* 2-column: tone + audience */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
      gap: '12px', marginBottom: '12px' }}>
      <Field label="Brand tone">
        <textarea rows={3} value={brandTone}
          onChange={e => onChange('brandTone', e.target.value)} />
      </Field>
      <Field label="Target audience">
        <textarea rows={3} value={targetAudience}
          onChange={e => onChange('targetAudience', e.target.value)} />
      </Field>
    </div>

    {/* Full width fields */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px',
      marginBottom: '18px' }}>
      <Field label="Topics to avoid">
        <textarea rows={2} value={topicsToAvoid}
          onChange={e => onChange('topicsToAvoid', e.target.value)} />
      </Field>
      <Field label="Client testimonial voice">
        <input value={testimonialVoice}
          onChange={e => onChange('testimonialVoice', e.target.value)} />
      </Field>
      <Field label="Language requirements">
        <input value={languageRequirements}
          onChange={e => onChange('languageRequirements', e.target.value)}
          placeholder="e.g. Always use 'програма' not 'план'" />
      </Field>
    </div>

    {/* Content pillars */}
    <div style={{ borderTop: '0.5px solid rgba(44,62,80,0.08)', paddingTop: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, color: '#4A5060',
        letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
        Content pillars
      </div>

      {pillars.map((pillar, index) => (
        <PillarRow
          key={pillar.id}
          pillar={pillar}
          colorIndex={index}
          onChange={(field, value) => onPillarChange(pillar.id, field, value)}
          onDelete={() => onPillarDelete(pillar.id)}
        />
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginTop: '6px' }}>
        <button onClick={onPillarAdd}
          style={{ fontSize: '11px', color: '#C07B55', background: 'none',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add pillar
        </button>
        <span style={{ fontSize: '12px', fontWeight: 500,
          color: totalWeight === 100 ? '#5A8A4A' : '#C07B55' }}>
          Total: {totalWeight}%
        </span>
      </div>
    </div>
  </div>
</>
```

### `PillarRow` sub-component
```typescript
const PILLAR_COLORS = ['#C07B55', '#185FA5', '#3B6D11', '#854F0B']

function PillarRow({ pillar, colorIndex, onChange, onDelete }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
      <div style={{ width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0,
        background: PILLAR_COLORS[colorIndex % PILLAR_COLORS.length] }}/>
      <input
        value={pillar.name}
        onChange={e => onChange('name', e.target.value)}
        style={{ flex: 1, padding: '7px 10px',
          border: '0.5px solid rgba(44,62,80,0.14)',
          borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit',
          color: '#1A2630', background: '#fff', outline: 'none' }}
      />
      <input
        value={pillar.weight}
        onChange={e => onChange('weight', Number(e.target.value))}
        type="number" min={0} max={100}
        style={{ width: '52px', padding: '7px 8px', textAlign: 'center',
          border: '0.5px solid rgba(44,62,80,0.14)',
          borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit',
          color: '#1A2630', background: '#fff', outline: 'none' }}
      />
      <span style={{ fontSize: '12px', color: '#8A8070' }}>%</span>
      <button onClick={onDelete}
        style={{ width: '16px', height: '16px', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#C4BAB0', padding: 0 }}>
        ✕
      </button>
    </div>
  )
}
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] All text fields are controlled
- [ ] Pillar rows render with colour dots matching index
- [ ] Pillar name and weight inputs update on change
- [ ] Delete button removes the pillar row
- [ ] Add pillar appends a new empty row
- [ ] Total weight shows correct sum, red if ≠ 100

---

## Step 5 — Create `TabSchedule`

> **File:** `src/components/clients/settings/tab-schedule.tsx`

```typescript
interface TabScheduleProps {
  activePlatform:    string
  defaultPostType:   string
  postsPerWeek:      number
  generateOnDay:     string
  generateAtTime:    string
  onChange:          (field: string, value: string | number) => void
}
```

```tsx
<>
  <PanelHeader title="Schedule"
    subtitle="Platform, post type, and autonomous generation settings" />
  <div style={{ padding: '20px 22px' }}>

    {/* Platform selector */}
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, color: '#4A5060',
        letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
        Active platform
      </div>
      <PlatformSelector
        value={activePlatform}
        onChange={v => onChange('activePlatform', v)}
      />
    </div>

    {/* Default post type */}
    <div style={{ marginBottom: '20px' }}>
      <Field label="Default post type">
        <select value={defaultPostType}
          onChange={e => onChange('defaultPostType', e.target.value)}
          style={{ width: '220px' }}>
          <option>Single image</option>
          <option>Carousel</option>
          <option>Reel script</option>
        </select>
      </Field>
    </div>

    <div style={{ borderTop: '0.5px solid rgba(44,62,80,0.08)',
      paddingTop: '18px', marginTop: '4px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, color: '#4A5060',
        letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px' }}>
        Autonomous schedule
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <Field label="Posts per week">
          <select value={postsPerWeek}
            onChange={e => onChange('postsPerWeek', Number(e.target.value))}>
            {[1,2,3,4,5,6,7].map(n => <option key={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Generate on">
          <select value={generateOnDay}
            onChange={e => onChange('generateOnDay', e.target.value)}>
            {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
              .map(d => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="At time">
          <input type="time" value={generateAtTime}
            onChange={e => onChange('generateAtTime', e.target.value)} />
        </Field>
      </div>
    </div>
  </div>
</>
```

### `PlatformSelector` sub-component
```typescript
const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'X / Twitter', 'TikTok']

function PlatformSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
      {PLATFORMS.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            padding:      '7px 14px',
            borderRadius: '20px',
            fontSize:     '12px',
            fontWeight:   500,
            cursor:       'pointer',
            border:       p === value
              ? '1.5px solid #1A2630'
              : '1.5px solid rgba(44,62,80,0.14)',
            background:   p === value ? '#1A2630' : '#fff',
            color:        p === value ? '#ECE8E1' : '#8A8070',
            fontFamily:   'inherit',
            transition:   'all 0.15s',
          }}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
```

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Platform pills are mutually exclusive — clicking selects, deselects others
- [ ] Default post type select is controlled
- [ ] Schedule grid: posts per week, day, time all controlled
- [ ] Tab fits on screen without scrolling

---

## Step 6 — Create `TabConnectedAccounts`

> **File:** `src/components/clients/settings/tab-connected-accounts.tsx`

```typescript
interface TabConnectedAccountsProps {
  instagramConnected:  boolean
  facebookConnected:   boolean
  onConnectInstagram:  () => void
  onConnectFacebook:   () => void
  onDisconnect:        (platform: 'instagram' | 'facebook') => void
}
```

```tsx
<>
  <PanelHeader title="Connected accounts"
    subtitle="Link social accounts for publishing and analytics" />
  <div style={{ padding: '20px 22px' }}>

    <ConnectAccountBtn
      icon={<InstagramIcon />}
      label="Instagram"
      description="Schedule posts and view Instagram insights"
      connected={instagramConnected}
      onConnect={onConnectInstagram}
      onDisconnect={() => onDisconnect('instagram')}
    />

    <ConnectAccountBtn
      icon={<FacebookIcon />}
      label="Facebook Page"
      description="Required for Instagram Business API access"
      connected={facebookConnected}
      onConnect={onConnectFacebook}
      onDisconnect={() => onDisconnect('facebook')}
    />

    <div style={{ fontSize: '11px', color: '#8A8070', lineHeight: 1.65,
      padding: '12px 14px', background: '#F9F6F2', borderRadius: '8px',
      marginTop: '4px' }}>
      Connected accounts enable real-time analytics on the Analytics page
      and allow Kontuur to publish approved posts directly to Instagram.
    </div>
  </div>
</>
```

### `ConnectAccountBtn` sub-component
```tsx
function ConnectAccountBtn({ icon, label, description, connected, onConnect, onDisconnect }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 14px', marginBottom: '10px',
      background: connected ? 'rgba(122,154,106,0.06)' : '#F9F6F2',
      border: connected
        ? '0.5px solid rgba(122,154,106,0.25)'
        : '0.5px solid rgba(44,62,80,0.12)',
      borderRadius: '10px' }}>

      <div style={{ width: '32px', height: '32px', borderRadius: '8px',
        background: 'rgba(44,62,80,0.08)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1A2630',
          marginBottom: '2px' }}>
          {connected ? `${label} connected` : `Connect ${label}`}
        </div>
        <div style={{ fontSize: '11px', color: '#8A8070' }}>{description}</div>
      </div>

      {connected ? (
        <button onClick={onDisconnect}
          style={{ fontSize: '11px', color: '#C07B55', background: 'none',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          Disconnect
        </button>
      ) : (
        <button onClick={onConnect}
          style={{ fontSize: '12px', fontWeight: 500, padding: '6px 14px',
            background: '#1A2630', color: '#ECE8E1', border: 'none',
            borderRadius: '7px', cursor: 'pointer', fontFamily: 'inherit' }}>
          Connect
        </button>
      )}
    </div>
  )
}
```

Keep existing connect/disconnect OAuth logic — only the button presentation changes.

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Disconnected state: grey background, Connect button
- [ ] Connected state: green-tinted background, Disconnect link
- [ ] Connect/Disconnect buttons call existing OAuth handlers

---

## Step 7 — Create `TabInsights`

> **File:** `src/components/clients/settings/tab-insights.tsx`

Read-only. No onChange handlers. No save.

```typescript
interface TabInsightsProps {
  avgQualityScore:    number
  publishedCount:     number
  rewrittenCount:     number
  topApprovedPillars: string[]
  mostRewrittenPillars: string[]
  activeSourceCount:  number
  lastResearchSources: number  // how many sources fetched on last run
}
```

```tsx
<>
  <PanelHeader title="Content insights"
    subtitle="Performance patterns from approved and published posts" />
  <div style={{ padding: '20px 22px' }}>

    {/* Stat tiles */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
      gap: '10px', marginBottom: '20px' }}>
      <InsightTile value={avgQualityScore.toFixed(1)} label="Avg quality score"
        showBar barValue={avgQualityScore / 10} />
      <InsightTile value={publishedCount} label="Posts published" />
      <InsightTile value={rewrittenCount} label="Posts rewritten" />
    </div>

    {/* Pillar lists */}
    <InsightSection label="Top approved pillars">
      {topApprovedPillars.length > 0
        ? topApprovedPillars.map((p, i) => (
            <InsightPill key={p} label={p} colorIndex={i} />
          ))
        : <EmptyInsight text="No data yet" />
      }
    </InsightSection>

    <InsightSection label="Most rewritten pillars">
      {mostRewrittenPillars.length > 0
        ? mostRewrittenPillars.map((p, i) => (
            <InsightPill key={p} label={p} colorIndex={i} />
          ))
        : <EmptyInsight text="No rewrites recorded" />
      }
    </InsightSection>

    <InsightSection label="Source usage">
      <p style={{ fontSize: '12px', color: '#8A8070', lineHeight: 1.7 }}>
        <strong style={{ color: '#1A2630', fontWeight: 500 }}>
          {activeSourceCount} active sources
        </strong>
        {' '}configured. Last research run fetched content from{' '}
        {lastResearchSources} of {activeSourceCount} sources.
      </p>
    </InsightSection>
  </div>
</>
```

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] All values render correctly
- [ ] No inputs — fully read-only
- [ ] Empty states show when arrays are empty

---

## Step 8 — Wire up in the settings page

> **File:** `src/app/(dashboard)/clients/[id]/settings/page.tsx`

Keep all existing data fetching and server actions. Add tab state and
assemble the new layout.

### Add tab state
```typescript
'use client'  // add if not already a client component

const [activeTab, setActiveTab] = useState<SettingsTab>('basic')
```

If the page is currently a server component: extract a `ClientSettingsClient`
client component that receives the fetched data as props and owns the tab state.

### Assemble layout
```tsx
<SettingsLayout
  activeTab={activeTab}
  onTabChange={setActiveTab}
  isInsightsTab={activeTab === 'insights'}
  onSave={handleSave}
  onCancel={handleCancel}
  clientName={client.name}
  clientHref="/clients"
  statusProps={{
    lastGeneratedAt:   brandProfile.last_generated_at ?? null,
    pendingCount:      pendingCount,
    activeSourceCount: activeSourceCount,
    publishedCount:    publishedCount,
    sourcesHref:       `/clients/${client.id}/sources`,
  }}
>
  {activeTab === 'basic' && (
    <TabBasicInfo {...basicProps} onChange={handleFieldChange} />
  )}
  {activeTab === 'brand' && (
    <TabBrandProfile {...brandProps}
      onChange={handleFieldChange}
      onPillarChange={handlePillarChange}
      onPillarAdd={handlePillarAdd}
      onPillarDelete={handlePillarDelete}
    />
  )}
  {activeTab === 'schedule' && (
    <TabSchedule {...scheduleProps} onChange={handleFieldChange} />
  )}
  {activeTab === 'accounts' && (
    <TabConnectedAccounts {...accountsProps}
      onConnectInstagram={handleConnectInstagram}
      onConnectFacebook={handleConnectFacebook}
      onDisconnect={handleDisconnect}
    />
  )}
  {activeTab === 'insights' && (
    <TabInsights {...insightsProps} />
  )}
</SettingsLayout>
```

### Save only the active tab's data
```typescript
async function handleSave() {
  switch (activeTab) {
    case 'basic':
      await saveBasicInfo(basicFormState)
      break
    case 'brand':
      await saveBrandProfile(brandFormState)
      break
    case 'schedule':
      await saveSchedule(scheduleFormState)
      break
    // accounts tab saves via connect/disconnect handlers — no batch save needed
    // insights tab is read-only — save button not shown
  }
}
```

Keep existing save functions unchanged — only calling pattern changes.

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npm run build` — no errors
- [ ] Clicking nav items switches tab content — only active tab visible
- [ ] Status card always visible regardless of active tab
- [ ] Save button hidden on Insights tab
- [ ] Saving on each tab calls correct existing save function
- [ ] Back link returns to /clients
- [ ] Client chip shows correct name

---

## Step 9 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Visual checks
- [ ] Left nav: 5 tabs, active state has white background + terracotta left bar
- [ ] Status card shows live data from API
- [ ] Basic info: 2-column grid, 8 fields, health toggle
- [ ] Brand profile: 2-col top fields, full-width bottom fields, pillar rows with dots
- [ ] Schedule: platform pills (single select), post type, 3-col schedule grid
- [ ] Connected accounts: two platform cards with connect/disconnect states
- [ ] Insights: 3 stat tiles, pillar lists with coloured dots
- [ ] No tab has a scrollbar at 700px viewport height

### Functional checks
- [ ] All fields save correctly when Save is clicked
- [ ] Pillar add / delete / edit works
- [ ] Platform pill selection is mutually exclusive
- [ ] Health toggle flips and saves
- [ ] Connect Instagram / Facebook calls existing OAuth flow
- [ ] Disconnect works
- [ ] Insights data reflects real values from API

### Consistency checks
- [ ] Input and select styles match across all tabs
- [ ] Button styles match the dashboard and clients pages
- [ ] Topbar matches the clients page topbar pattern

---

## What is NOT changed

| File | Why |
|---|---|
| All server actions and API routes | Logic unchanged |
| OAuth connect flow | Only button presentation changes |
| Brand profile data schema | No DB changes |
| `/clients/[id]/sources` page | Separate page, not in scope |
| Any other settings sub-pages | Not in scope |

---

## Implementation order for Claude Code

```
Step 1 → settings-status-card.tsx    (isolated, no dependencies)
Step 2 → settings-layout.tsx         (shell — verify nav switching works)
         ↑ test with placeholder content in each panel before building tabs
Step 3 → tab-basic-info.tsx          (simplest tab — verify Field + ToggleRow components)
Step 4 → tab-brand-profile.tsx       (most complex — pillars need careful wiring)
Step 5 → tab-schedule.tsx            (PlatformSelector + schedule grid)
Step 6 → tab-connected-accounts.tsx  (keep existing OAuth handlers)
Step 7 → tab-insights.tsx            (read-only, simplest)
Step 8 → settings/page.tsx           (assemble — keep all data fetching unchanged)
Step 9 → end-to-end verification
```

---

*Kontuur — Client Settings Tabbed Redesign Plan*
*Single long form → 5 focused tabs. No scrolling on any tab.*
*All existing save logic, server actions, and OAuth flows unchanged.*