# Generate Posts Flow Redesign — Implementation Plan

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after each step.
> Do not modify files not listed here. Do not skip steps.
> All existing generation logic, API calls, and state management unchanged.
> Only visual presentation and layout change.

---

## Context

The current generate posts flow uses a single-column layout with a purple
progress bar and basic form elements. This plan redesigns it as a 5-step
wizard with a dark slate left sidebar (consistent with onboarding), and
a three-panel results view: post list (left) · post detail (middle) ·
quality + source (right).

---

## The Five Steps

```
Step 1 — Client & platform    client selector + platform pills
Step 2 — Priority posts       optional campaign briefs (skippable)
Step 3 — Post type            single image vs carousel, slide count
Step 4 — Generating           4-stage progress with skeleton card
Step 5 — Results              three-panel review layout
```

---

## Design Tokens (inherit from design system)

```
--slate:        #1A2630
--terra:        #C07B55   terra-light: rgba(192,123,85,0.10)
--warm:         #F4EFE6
--cream:        #ECE8E1
--muted:        #8A8070
--sage:         #5A8A4A   sage-light: rgba(90,138,74,0.10)
--blue:         #2C5F8A   blue-light: rgba(44,94,138,0.10)
--border:       rgba(44,62,80,0.10)
--border2:      rgba(44,62,80,0.07)

Step indicator states:
  done:   background --sage, text #fff, label --sage
  active: background --slate, text --cream, label --slate
  idle:   background rgba(44,62,80,0.08), text --muted, label --muted

Generate button (step 3): background --terra (signals AI action, not navigation)
All other primary buttons:  background --slate
```

---

## Files Modified

| File | Change |
|---|---|
| `src/app/(dashboard)/generate/page.tsx` | UPDATE — add step state, render wizard shell |
| `src/components/generate/generate-shell.tsx` | CREATE — topbar with step indicators + progress line |
| `src/components/generate/wizard-layout.tsx` | CREATE — dark sidebar + main area layout |
| `src/components/generate/wizard-sidebar.tsx` | CREATE — left dark sidebar with run context |
| `src/components/generate/step-client.tsx` | CREATE — step 1 |
| `src/components/generate/step-priority.tsx` | CREATE — step 2 |
| `src/components/generate/step-type.tsx` | CREATE — step 3 |
| `src/components/generate/step-loading.tsx` | CREATE — step 4 |
| `src/components/generate/results/results-shell.tsx` | CREATE — three-panel results wrapper |
| `src/components/generate/results/post-list.tsx` | CREATE — left panel |
| `src/components/generate/results/post-detail.tsx` | CREATE — middle panel |
| `src/components/generate/results/quality-panel.tsx` | CREATE — right panel |

> **Find actual paths first:**
> ```bash
> find src -name "*.tsx" | xargs grep -l "Generate posts\|generatePosts\|post.*type\|carousel\|single.*image" | head -10
> find src -name "*.tsx" | xargs grep -l "priority.*post\|PriorityPost" | head -5
> find src -name "*.tsx" | xargs grep -l "quality.*score\|qualityScore\|QualityScore" | head -5
> ```

---

## Step 1 — Create `GenerateShell`

> **File:** `src/components/generate/generate-shell.tsx`

Topbar with numbered step indicators, terracotta progress line, and Cancel button.

```typescript
export type GenerateStep = 'client' | 'priority' | 'type' | 'loading' | 'results'

const STEPS: { id: GenerateStep; label: string }[] = [
  { id: 'client',   label: 'Client'   },
  { id: 'priority', label: 'Priority' },
  { id: 'type',     label: 'Post type'},
  { id: 'loading',  label: 'Generating'},
  { id: 'results',  label: 'Results'  },
]

interface GenerateShellProps {
  currentStep: GenerateStep
  onCancel:    () => void
  children:    React.ReactNode
}
```

### Topbar layout
```tsx
<div style={{ height: '52px', background: '#fff',
  borderBottom: '0.5px solid rgba(44,62,80,0.10)',
  display: 'flex', alignItems: 'center',
  padding: '0 0 0 24px', flexShrink: 0,
  boxShadow: '0 1px 0 rgba(44,62,80,0.06)' }}>

  {/* Logo wordmark */}
  <div style={{ fontFamily: 'var(--font-display, Georgia, serif)',
    fontSize: '14px', letterSpacing: '3.5px', color: '#1A2630',
    paddingRight: '20px', borderRight: '0.5px solid rgba(44,62,80,0.12)',
    marginRight: '20px', flexShrink: 0 }}>
    KONTUUR
  </div>

  {/* Breadcrumb */}
  <div style={{ fontSize: '12px', color: '#8A8070', marginRight: '24px' }}>
    <span style={{ color: '#1A2630', fontWeight: 500 }}>Generate posts</span>
  </div>

  {/* Step indicators */}
  <div style={{ display: 'flex', alignItems: 'center' }}>
    {STEPS.map((step, i) => {
      const currentIndex = STEPS.findIndex(s => s.id === currentStep)
      const isDone   = i < currentIndex
      const isActive = i === currentIndex
      return (
        <React.Fragment key={step.id}>
          {i > 0 && (
            <div style={{ width: '24px', height: '1px',
              background: isDone ? 'rgba(90,138,74,0.4)' : 'rgba(44,62,80,0.15)' }}/>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
            <div style={{
              width: '20px', height: '20px', borderRadius: '50%',
              fontSize: '10px', fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isDone   ? '#5A8A4A'
                        : isActive ? '#1A2630'
                        : 'rgba(44,62,80,0.08)',
              color: isDone || isActive ? '#ECE8E1' : '#8A8070',
              transition: 'all 0.2s',
            }}>
              {isDone ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 500, padding: '0 8px',
              color: isDone   ? '#5A8A4A'
                   : isActive ? '#1A2630'
                   : '#8A8070',
              transition: 'color 0.2s' }}>
              {step.label}
            </div>
          </div>
        </React.Fragment>
      )
    })}
  </div>

  {/* Cancel */}
  <div style={{ marginLeft: 'auto', paddingRight: '20px' }}>
    <button onClick={onCancel}
      style={{ fontSize: '12px', color: '#8A8070', background: 'none',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        padding: '6px 10px', borderRadius: '6px' }}>
      Cancel
    </button>
  </div>
</div>
```

### Progress line (below topbar)
```tsx
<div style={{ height: '2px', background: 'rgba(44,62,80,0.06)', flexShrink: 0 }}>
  <div style={{
    height: '100%', background: '#C07B55',
    width: `${((STEPS.findIndex(s => s.id === currentStep) + 1) / STEPS.length) * 100}%`,
    transition: 'width 0.5s cubic-bezier(.4,0,.2,1)',
  }}/>
</div>
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Topbar renders with correct KONTUUR wordmark
- [ ] Step indicators: done = green with ✓, active = slate, idle = muted grey
- [ ] Progress line advances with step
- [ ] Cancel calls `onCancel`

---

## Step 2 — Create `WizardSidebar`

> **File:** `src/components/generate/wizard-sidebar.tsx`

Dark slate left sidebar showing run context. Updates as the user progresses.

```typescript
interface WizardSidebarProps {
  items: {
    label:  string
    status: 'done' | 'active' | 'idle'
  }[]
  footerNote: string
}
```

```tsx
<div style={{
  width: '240px', flexShrink: 0,
  background: '#1A2630',
  padding: '28px 24px',
  display: 'flex', flexDirection: 'column',
  position: 'relative', overflow: 'hidden',
}}>

  {/* Decorative rings */}
  <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
    width: '100%', height: '100%' }} viewBox="0 0 240 640" fill="none">
    <ellipse cx="220" cy="320" rx="190" ry="190"
      stroke="rgba(236,232,225,0.025)" strokeWidth="55"/>
    <ellipse cx="220" cy="320" rx="120" ry="120"
      stroke="rgba(192,123,85,0.04)" strokeWidth="35"/>
  </svg>

  <div style={{ position: 'relative', zIndex: 2,
    display: 'flex', flexDirection: 'column', height: '100%' }}>

    {/* Logo */}
    <div style={{ fontFamily: 'var(--font-display, Georgia, serif)',
      fontSize: '15px', letterSpacing: '3px',
      color: '#ECE8E1', marginBottom: '2px' }}>
      KONTUUR
    </div>
    <div style={{ fontSize: '7px', color: '#C07B55',
      letterSpacing: '5px', marginBottom: '28px' }}>
      SOCIAL INTELLIGENCE
    </div>

    {/* Section label */}
    <div style={{ fontSize: '9px', fontWeight: 500,
      color: 'rgba(236,232,225,0.35)', letterSpacing: '2px',
      textTransform: 'uppercase', marginBottom: '10px' }}>
      About this run
    </div>

    {/* Context items */}
    {items.map((item, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '9px',
        padding: '8px 0',
        borderBottom: '0.5px solid rgba(236,232,225,0.07)' }}>
        <div style={{ width: '7px', height: '7px', borderRadius: '50%',
          flexShrink: 0,
          background: item.status === 'done'   ? '#5A8A4A'
                    : item.status === 'active' ? '#C07B55'
                    : 'rgba(236,232,225,0.20)' }}/>
        <span style={{ fontSize: '12px',
          fontWeight: item.status === 'active' ? 500 : 400,
          color: item.status === 'done'   ? 'rgba(236,232,225,0.70)'
               : item.status === 'active' ? '#ECE8E1'
               : 'rgba(236,232,225,0.35)' }}>
          {item.label}
        </span>
      </div>
    ))}

    {/* Footer note */}
    <div style={{ marginTop: 'auto',
      fontSize: '11px', color: 'rgba(236,232,225,0.25)',
      lineHeight: 1.65, paddingTop: '20px' }}>
      {footerNote}
    </div>
  </div>
</div>
```

### Sidebar content per step

```typescript
// Step 1 — Client
items = [
  { label: 'Client & platform', status: 'active' },
  { label: 'Priority posts',    status: 'idle'   },
  { label: 'Post type',         status: 'idle'   },
  { label: 'Generate',          status: 'idle'   },
]
footerNote = 'Select a client and platform to begin. Brand profile, sources, and content pillars load automatically.'

// Step 2 — Priority (client selected)
items = [
  { label: `${clientName} · ${platform}`, status: 'done'   },
  { label: 'Priority posts',              status: 'active' },
  { label: 'Post type',                   status: 'idle'   },
  { label: 'Generate',                    status: 'idle'   },
]
footerNote = 'Priority posts generate first and appear with a priority badge in the review queue. Skip for regular content runs.'

// Step 3 — Post type
items = [
  { label: `${clientName} · ${platform}`,               status: 'done'   },
  { label: hasPriorityPosts ? `${count} priority post${count > 1 ? 's' : ''}` : 'No priority posts', status: 'done' },
  { label: 'Post type',                                  status: 'active' },
  { label: 'Generate',                                   status: 'idle'   },
]
footerNote = 'Carousels consistently outperform single images for medical and professional service content.'
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Done items: green dot, muted text
- [ ] Active item: terracotta dot, white text, weight 500
- [ ] Idle items: translucent dot, very muted text
- [ ] Context items update correctly based on step
- [ ] Decorative rings visible but subtle

---

## Step 3 — Create `WizardLayout`

> **File:** `src/components/generate/wizard-layout.tsx`

Wrapper composing sidebar + scrollable main area.

```typescript
interface WizardLayoutProps {
  sidebar:  React.ReactNode   // <WizardSidebar />
  children: React.ReactNode   // step form content
  centerContent?: boolean     // true for steps 1 and 3, false for step 2
}
```

```tsx
<div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
  {sidebar}
  <div style={{
    flex: 1, overflowY: 'auto',
    padding: centerContent ? '32px' : '28px 32px',
    display: 'flex',
    alignItems: centerContent ? 'center' : 'flex-start',
    justifyContent: 'center',
  }}>
    {children}
  </div>
</div>
```

The white wizard card (wcard) rendered inside:
```tsx
<div style={{
  background:    '#fff',
  border:        '0.5px solid rgba(44,62,80,0.10)',
  borderRadius:  '16px',
  padding:       '32px',
  width:         '100%',
  maxWidth:      maxWidth ?? '500px',  // step 2 uses 540px
  boxShadow:     '0 2px 16px rgba(44,62,80,0.06)',
}}>
  {children}
</div>
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Card centred vertically on steps 1 and 3
- [ ] Card aligned to top on step 2 (long form)

---

## Step 4 — Create `StepClient` (Step 1)

> **File:** `src/components/generate/step-client.tsx`

```typescript
interface StepClientProps {
  clients:         { id: string; name: string }[]
  selectedClient:  string
  selectedPlatform: string
  onClientChange:  (id: string) => void
  onPlatformChange:(p: string) => void
  onNext:          () => void
}

const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'X / Twitter', 'TikTok']
```

### Layout
```tsx
<>
  <h2 style={{ fontFamily: 'var(--font-display, Georgia, serif)',
    fontSize: '22px', fontWeight: 400, color: '#1A2630', marginBottom: '4px' }}>
    Client & platform
  </h2>
  <p style={{ fontSize: '13px', color: '#8A8070',
    marginBottom: '24px', lineHeight: 1.55 }}>
    Choose which client and platform to generate for
  </p>

  {/* Client selector */}
  <div style={{ marginBottom: '20px' }}>
    <FieldLabel>Client</FieldLabel>
    <select value={selectedClient} onChange={e => onClientChange(e.target.value)}
      style={SELECT_STYLE}>
      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  </div>

  <hr style={{ border: 'none', borderTop: '0.5px solid rgba(44,62,80,0.08)',
    margin: '0 0 20px' }}/>

  {/* Platform pills */}
  <div>
    <FieldLabel>Platform</FieldLabel>
    <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
      {PLATFORMS.map(p => (
        <PlatformPill
          key={p}
          label={p}
          selected={selectedPlatform === p}
          onClick={() => onPlatformChange(p)}
        />
      ))}
    </div>
  </div>

  {/* Actions */}
  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
    <PrimaryButton onClick={onNext}>
      Next <ChevronRight />
    </PrimaryButton>
  </div>
</>
```

### `PlatformPill` sub-component
```typescript
function PlatformPill({ label, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:      '8px 16px',
      borderRadius: '22px',
      fontSize:     '12px',
      fontWeight:   500,
      cursor:       'pointer',
      border:       selected
        ? '1.5px solid #1A2630'
        : '1.5px solid rgba(44,62,80,0.14)',
      background:   selected ? '#1A2630' : '#fff',
      color:        selected ? '#ECE8E1' : '#8A8070',
      fontFamily:   'inherit',
      transition:   'all 0.15s',
    }}>
      {label}
    </button>
  )
}
```

### Shared button + input styles (extract to `generate-form-elements.tsx`)
```typescript
const SELECT_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 13px',
  border: '0.5px solid rgba(44,62,80,0.18)',
  borderRadius: '8px', fontSize: '13px',
  fontFamily: 'inherit', color: '#1A2630',
  background: '#fff', outline: 'none', cursor: 'pointer',
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 13px',
  border: '0.5px solid rgba(44,62,80,0.18)',
  borderRadius: '8px', fontSize: '13px',
  fontFamily: 'inherit', color: '#1A2630',
  background: '#fff', outline: 'none',
}

const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  resize: 'none', lineHeight: 1.55, minHeight: '72px',
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: '10px', fontWeight: 500, color: '#4A5060',
    letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '7px' }}>
    {children}
  </div>
}

// Slate primary button
function PrimaryButton({ children, onClick, variant = 'slate' }) {
  const bg = variant === 'terra' ? '#C07B55' : '#1A2630'
  return (
    <button onClick={onClick} style={{ padding: '11px 26px', background: bg,
      color: '#ECE8E1', border: 'none', borderRadius: '9px',
      fontSize: '13px', fontWeight: 500, cursor: 'pointer',
      fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '7px',
      transition: 'background 0.15s' }}>
      {children}
    </button>
  )
}
```

Note: the Generate button on Step 3 uses `variant="terra"` — terracotta background signals AI action, not mere navigation.

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Client dropdown populated from existing clients data
- [ ] Platform pills are mutually exclusive, only one selectable at a time
- [ ] Next button only enabled when client and platform are both selected

---

## Step 5 — Create `StepPriority` (Step 2)

> **File:** `src/components/generate/step-priority.tsx`

```typescript
interface PriorityPost {
  title:      string
  brief:      string
  platform:   string
  targetDate: string
}

interface StepPriorityProps {
  posts:         PriorityPost[]
  onAddPost:     () => void
  onRemovePost:  (index: number) => void
  onUpdatePost:  (index: number, field: keyof PriorityPost, value: string) => void
  onBack:        () => void
  onSkip:        () => void
  onNext:        () => void
}
```

### Layout — top-aligned, wider card (max-width 540px)
```tsx
<>
  <h2 style={CARD_TITLE_STYLE}>Priority posts</h2>
  <p style={CARD_SUB_STYLE}>
    Optional — specific campaigns or announcements that generate first
  </p>

  {posts.map((post, i) => (
    <PriorityPostCard
      key={i}
      index={i}
      post={post}
      onUpdate={(field, value) => onUpdatePost(i, field, value)}
      onRemove={() => onRemovePost(i)}
    />
  ))}

  <button onClick={onAddPost} style={{ fontSize: '12px', color: '#C07B55',
    background: 'none', border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontWeight: 500,
    display: 'flex', alignItems: 'center', gap: '5px' }}>
    <PlusIcon /> Add another priority post
  </button>

  <div style={{ display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', marginTop: '24px' }}>
    <BackButton onClick={onBack} />
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <button onClick={onSkip} style={{ fontSize: '12px', color: '#8A8070',
        background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit' }}>
        Skip for now
      </button>
      <PrimaryButton onClick={onNext}>Next <ChevronRight /></PrimaryButton>
    </div>
  </div>
</>
```

### `PriorityPostCard` sub-component
```tsx
function PriorityPostCard({ index, post, onUpdate, onRemove }) {
  return (
    <div style={{ border: '0.5px solid rgba(44,62,80,0.14)',
      borderRadius: '12px', padding: '16px 18px',
      background: '#FDFAF7', position: 'relative', marginBottom: '12px' }}>

      <div style={{ fontSize: '9px', fontWeight: 500, color: '#C07B55',
        letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '12px' }}>
        Priority post {index + 1}
      </div>
      <button onClick={onRemove} style={{ position: 'absolute', top: '14px',
        right: '14px', fontSize: '11px', color: '#8A8070',
        background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit' }}>
        Remove
      </button>

      <div style={{ marginBottom: '10px' }}>
        <FieldLabel>Title</FieldLabel>
        <input style={INPUT_STYLE} value={post.title}
          onChange={e => onUpdate('title', e.target.value)}
          placeholder="e.g. Summer skin care campaign announcement" />
      </div>

      <div style={{ marginBottom: '10px' }}>
        <FieldLabel>Brief</FieldLabel>
        <textarea style={TEXTAREA_STYLE} value={post.brief}
          onChange={e => onUpdate('brief', e.target.value)}
          placeholder="Key messages, specific products or services to mention..." />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <FieldLabel>Platform</FieldLabel>
          <select style={SELECT_STYLE} value={post.platform}
            onChange={e => onUpdate('platform', e.target.value)}>
            <option>Instagram</option>
            <option>Facebook</option>
            <option>LinkedIn</option>
          </select>
        </div>
        <div>
          <FieldLabel>Target date</FieldLabel>
          <input type="date" style={INPUT_STYLE} value={post.targetDate}
            onChange={e => onUpdate('targetDate', e.target.value)} />
        </div>
      </div>
    </div>
  )
}
```

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Add / remove priority posts works
- [ ] All fields are controlled
- [ ] Skip navigates directly to step 3
- [ ] Existing priority post logic unchanged

---

## Step 6 — Create `StepType` (Step 3)

> **File:** `src/components/generate/step-type.tsx`

```typescript
interface StepTypeProps {
  postType:      'single' | 'carousel'
  slideCount:    number
  onTypeChange:  (t: 'single' | 'carousel') => void
  onCountChange: (n: number) => void
  onBack:        () => void
  onGenerate:    () => void
}
```

```tsx
<>
  <h2 style={CARD_TITLE_STYLE}>Post type</h2>
  <p style={CARD_SUB_STYLE}>Choose the format for this generation run</p>

  {/* Recommendation strip */}
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px',
    padding: '10px 14px', background: 'rgba(192,123,85,0.10)',
    borderRadius: '9px', marginBottom: '16px',
    fontSize: '12px', color: '#7A4A35', lineHeight: 1.55 }}>
    <InfoIcon color="#A05A35" />
    Carousels are driving the highest engagement in 2026. Recommended: 2 carousels + 1 single per week for this client.
  </div>

  {/* Type options */}
  <TypeOption
    selected={postType === 'single'}
    onClick={() => onTypeChange('single')}
    icon={<SingleImageIcon />}
    name="Single image"
    description="One polished caption with image direction prompt"
  />
  <TypeOption
    selected={postType === 'carousel'}
    onClick={() => onTypeChange('carousel')}
    icon={<CarouselIcon />}
    name="Carousel"
    description="Multiple slides with headline, body copy, and image direction per slide"
  />

  {/* Slide count — only when carousel selected */}
  {postType === 'carousel' && (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 14px', background: 'rgba(44,62,80,0.04)',
      borderRadius: '8px', marginTop: '10px' }}>
      <span style={{ fontSize: '12px', color: '#8A8070' }}>Slide count</span>
      <input
        type="number" min={3} max={10}
        value={slideCount}
        onChange={e => onCountChange(Math.min(10, Math.max(3, Number(e.target.value))))}
        style={{ width: '58px', padding: '7px 10px',
          border: '0.5px solid rgba(44,62,80,0.18)',
          borderRadius: '7px', fontSize: '14px',
          fontFamily: 'inherit', color: '#1A2630',
          textAlign: 'center', outline: 'none' }}
      />
      <span style={{ fontSize: '11px', color: 'rgba(44,62,80,0.3)' }}>3 – 10 slides</span>
    </div>
  )}

  <div style={{ display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', marginTop: '24px' }}>
    <BackButton onClick={onBack} />
    {/* Terracotta button — signals AI action */}
    <PrimaryButton onClick={onGenerate} variant="terra">
      Generate <ChevronRight />
    </PrimaryButton>
  </div>
</>
```

### `TypeOption` sub-component
```typescript
function TypeOption({ selected, onClick, icon, name, description }) {
  return (
    <div onClick={onClick} style={{
      display:     'flex',
      alignItems:  'center',
      gap:         '14px',
      padding:     '16px 18px',
      border:      selected
        ? '1.5px solid #1A2630'
        : '1.5px solid rgba(44,62,80,0.12)',
      borderRadius: '12px',
      cursor:       'pointer',
      marginBottom: '10px',
      background:   selected ? 'rgba(44,62,80,0.025)' : '#fff',
      transition:   'all 0.2s',
    }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '10px',
        background: selected ? 'rgba(44,62,80,0.10)' : 'rgba(44,62,80,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'background 0.15s' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 500,
          color: '#1A2630', marginBottom: '2px' }}>
          {name}
        </div>
        <div style={{ fontSize: '12px', color: '#8A8070' }}>{description}</div>
      </div>
    </div>
  )
}
```

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Type options are mutually exclusive
- [ ] Slide count input only appears when carousel selected
- [ ] Slide count clamped to 3–10
- [ ] Generate button is terracotta, not slate

---

## Step 7 — Create `StepLoading` (Step 4)

> **File:** `src/components/generate/step-loading.tsx`

```typescript
interface StepLoadingProps {
  clientName:    string
  stage:         0 | 1 | 2 | 3   // advances as API calls resolve
  sourceCount?:  number
  pillarProgress?: { current: number; total: number }
}

const STAGES = [
  (props) => `${props.sourceCount ?? 0} sources fetched`,
  (props) => `Researching content — pillar ${props.pillarProgress?.current ?? 1} of ${props.pillarProgress?.total ?? 4}`,
  'Writing captions and carousel slides',
  'Quality validation',
]
```

```tsx
<div style={{ flex: 1, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: '40px', background: '#fff' }}>

  {/* Kontuur frame mark */}
  <div style={{
    borderLeft:   '2px solid #C07B55',
    borderRight:  '2px solid #C07B55',
    borderTop:    '0.5px solid rgba(44,62,80,0.15)',
    borderBottom: '0.5px solid rgba(44,62,80,0.15)',
    padding:      '14px 16px',
    display:      'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: '20px',
  }}>
    [edit icon 22px stroke #C07B55 stroke-width 1.5]
  </div>

  <h2 style={{ fontFamily: 'var(--font-display, Georgia, serif)',
    fontSize: '22px', fontWeight: 400, color: '#1A2630',
    textAlign: 'center', marginBottom: '5px' }}>
    Generating posts for {clientName}
  </h2>
  <p style={{ fontSize: '13px', color: '#8A8070', textAlign: 'center',
    marginBottom: '28px' }}>
    Fetching sources, researching content, writing captions
  </p>

  {/* Stage list */}
  <div style={{ width: '100%', maxWidth: '320px',
    marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
    {[0,1,2,3].map(i => {
      const isDone   = i < stage
      const isActive = i === stage
      const label = typeof STAGES[i] === 'function'
        ? STAGES[i](props)
        : STAGES[i]
      return (
        <StageRow key={i} isDone={isDone} isActive={isActive} label={label} />
      )
    })}
  </div>

  {/* Skeleton card */}
  <SkeletonCard />
</div>
```

Stage advancement is driven by the existing generation pipeline — do not change the pipeline logic, only call `setStage(n)` at the appropriate checkpoints.

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Done stages: green background with checkmark
- [ ] Active stage: slate background with spinner
- [ ] Idle stages: warm grey background
- [ ] Skeleton card animates correctly

---

## Step 8 — Create results components

### 8a — `PostList` (left panel)

> **File:** `src/components/generate/results/post-list.tsx`

```typescript
interface GeneratedPost {
  id:          string
  pillar:      string
  pillarColor: string
  platform:    string
  postType:    string
  slideCount?: number
  score:       number
  caption:     string
  status:      'pending' | 'approved' | 'discarded'
}

interface PostListProps {
  posts:          GeneratedPost[]
  selectedPostId: string
  onSelect:       (id: string) => void
}
```

```tsx
<div style={{ width: '238px', flexShrink: 0, background: '#fff',
  borderRight: '0.5px solid rgba(44,62,80,0.08)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

  {/* Header */}
  <div style={{ padding: '10px 16px',
    borderBottom: '0.5px solid rgba(44,62,80,0.07)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0 }}>
    <span style={{ fontSize: '9px', fontWeight: 500, color: '#8A8070',
      letterSpacing: '1.5px', textTransform: 'uppercase' }}>Posts</span>
    <span style={{ fontSize: '10px', color: '#8A8070' }}>
      {posts.length} generated
    </span>
  </div>

  {/* Post rows */}
  {posts.map(post => (
    <PostListItem
      key={post.id}
      post={post}
      active={post.id === selectedPostId}
      onClick={() => onSelect(post.id)}
    />
  ))}
</div>
```

### `PostListItem`
```tsx
function PostListItem({ post, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding:      '12px 16px',
      borderBottom: '0.5px solid rgba(44,62,80,0.055)',
      cursor:       'pointer',
      position:     'relative', overflow: 'hidden',
      background:   active ? 'rgba(44,62,80,0.035)' : 'transparent',
      transition:   'background 0.12s',
    }}>
      {/* Terracotta left bar when active */}
      {active && (
        <div style={{ position: 'absolute', left: 0, top: '10%', bottom: '10%',
          width: '2.5px', background: '#C07B55', borderRadius: '0 3px 3px 0' }}/>
      )}

      {/* Row 1: pillar + score */}
      <div style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: '5px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: '11px', fontWeight: 500, color: '#1A2630' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%',
            background: post.pillarColor, flexShrink: 0 }}/>
          {post.pillar}
        </div>
        <span style={{ fontSize: '11px', fontWeight: 500,
          color: post.score >= 9 ? '#5A8A4A' : post.score >= 7 ? '#C07B55' : '#E05A3A' }}>
          {post.score}/10
        </span>
      </div>

      {/* Row 2: caption preview */}
      <div style={{ fontSize: '11px', color: '#8A8070', lineHeight: 1.45,
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '7px' }}>
        {post.caption}
      </div>

      {/* Row 3: status badge */}
      <StatusBadge status={post.status} />
    </div>
  )
}
```

### `StatusBadge`
```typescript
const STATUS_STYLES = {
  pending:   { bg: 'rgba(44,62,80,0.06)',      color: '#8A8070', icon: null,    label: 'Pending review' },
  approved:  { bg: 'rgba(90,138,74,0.10)',      color: '#5A8A4A', icon: '✓',    label: 'Approved'       },
  discarded: { bg: 'rgba(192,123,85,0.10)',     color: '#C07B55', icon: '✕',    label: 'Discarded'      },
}
```

### ✓ Step 8a Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] All posts render in list
- [ ] Active item has terracotta left bar
- [ ] Score colour: ≥9 sage green, ≥7 terracotta, <7 red
- [ ] Status badge renders correct colour/label per status
- [ ] Clicking a row calls `onSelect`

---

### 8b — `PostDetail` (middle panel)

> **File:** `src/components/generate/results/post-detail.tsx`

```typescript
interface PostDetailProps {
  post:       GeneratedPost & {
    sourceType:    string
    sourceName:    string
    sourceUrl?:    string
    hashtags:      string
    slides?:       SlideContent[]
  }
  onApprove:  () => void
  onRewrite:  () => void
  onDiscard:  () => void
}
```

### Layout — flex column, body scrolls, action bar fixed at bottom
```tsx
<div style={{ flex: 1, display: 'flex', flexDirection: 'column',
  overflow: 'hidden', background: '#F4EFE6', minWidth: 0 }}>

  {/* Subheader */}
  <PostDetailHeader post={post} />

  {/* Scrollable body */}
  <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <SourceStrip post={post} />
    <CaptionCard caption={post.caption} hashtags={post.hashtags} />
    {post.slides && post.slides.length > 0 && (
      <SlidesCard slides={post.slides} />
    )}
  </div>

  {/* Fixed action bar */}
  <div style={{ padding: '12px 20px', background: '#fff',
    borderTop: '0.5px solid rgba(44,62,80,0.08)',
    display: 'flex', gap: '8px', flexShrink: 0 }}>
    <button onClick={onApprove} style={{ flex: 1, padding: '11px',
      background: '#1A2630', color: '#ECE8E1', border: 'none',
      borderRadius: '9px', fontSize: '12px', fontWeight: 500,
      cursor: 'pointer', fontFamily: 'inherit',
      transition: 'background 0.15s' }}>
      Approve
    </button>
    <button onClick={onRewrite} style={{ padding: '11px 16px',
      background: 'rgba(44,62,80,0.07)', border: 'none',
      borderRadius: '9px', fontSize: '12px', fontWeight: 500,
      color: '#1A2630', cursor: 'pointer', fontFamily: 'inherit' }}>
      Rewrite to improve
    </button>
    <button onClick={onDiscard} style={{ padding: '11px 14px',
      background: 'none', border: '0.5px solid rgba(44,62,80,0.15)',
      borderRadius: '9px', fontSize: '12px', color: '#8A8070',
      cursor: 'pointer', fontFamily: 'inherit',
      transition: 'all 0.15s' }}>
      Discard
    </button>
  </div>
</div>
```

### `SlidesCard` — only rendered for carousel posts
```tsx
function SlidesCard({ slides }) {
  const [activeSlide, setActiveSlide] = useState(0)
  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(44,62,80,0.10)',
      borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '10px 15px',
        borderBottom: '0.5px solid rgba(44,62,80,0.07)' }}>
        <span style={{ fontSize: '9px', fontWeight: 500, color: '#8A8070',
          letterSpacing: '1.2px', textTransform: 'uppercase' }}>
          Carousel slides
        </span>
        <button onClick={() => copyAllSlides(slides)}
          style={{ fontSize: '10px', color: '#C07B55', fontWeight: 500,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit' }}>
          Copy all slides
        </button>
      </div>
      {/* Slide tab numbers */}
      <div style={{ display: 'flex', gap: '5px', padding: '9px 15px',
        borderBottom: '0.5px solid rgba(44,62,80,0.07)' }}>
        {slides.map((_, i) => (
          <SlideTab key={i} number={i + 1}
            active={activeSlide === i}
            onClick={() => setActiveSlide(i)} />
        ))}
      </div>
      {/* Active slide content */}
      <div style={{ padding: '13px 15px' }}>
        <div style={{ fontSize: '9px', fontWeight: 500, color: '#8A8070',
          letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '5px' }}>
          {slides[activeSlide]?.type ?? 'Slide'} {activeSlide === 0 ? '— Cover' : ''}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A2630',
          lineHeight: 1.5, marginBottom: '6px' }}>
          {slides[activeSlide]?.headline}
        </div>
        {slides[activeSlide]?.designNote && (
          <div style={{ fontSize: '11px', color: '#8A8070', fontStyle: 'italic',
            lineHeight: 1.55, paddingLeft: '10px',
            borderLeft: '2px solid rgba(44,62,80,0.12)' }}>
            {slides[activeSlide].designNote}
          </div>
        )}
      </div>
    </div>
  )
}
```

Keep `copyAllSlides` using the same clipboard logic already in the codebase.

### ✓ Step 8b Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Source strip shows source type and name, links to verify URL
- [ ] Caption and hashtags render correctly
- [ ] Slides card only appears for carousel posts
- [ ] Slide tabs switch correctly between slides
- [ ] Action buttons call existing approve/rewrite/discard handlers

---

### 8c — `QualityPanel` (right panel)

> **File:** `src/components/generate/results/quality-panel.tsx`

```typescript
interface QualityPanelProps {
  scores: {
    total:        number
    brief:        number
    craft:        number
    voice:        number
    language:     number
    authenticity: number
    issues?:      string[]
  }
  source: {
    name:     string
    excerpt:  string
    url?:     string
  }
  runSummary: {
    client:       string
    platform:     string
    postsCount:   number
    sourcesUsed:  string
    skippedCount: number
  }
}
```

```tsx
<div style={{ width: '238px', flexShrink: 0, background: '#fff',
  borderLeft: '0.5px solid rgba(44,62,80,0.08)',
  overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

  {/* Quality section */}
  <PanelSection title="Quality score" rightContent={
    <span style={{ fontFamily: 'var(--font-display, Georgia, serif)',
      fontSize: '24px', fontWeight: 400, color: '#5A8A4A' }}>
      {scores.total}
    </span>
  }>
    {(['brief','craft','voice','language','authenticity'] as const).map(key => (
      <ScoreRow key={key} label={key} value={scores[key]} />
    ))}
    {scores.issues?.map((issue, i) => (
      <div key={i} style={{ fontSize: '10px', color: '#C07B55',
        background: 'rgba(192,123,85,0.07)', padding: '8px 10px',
        borderRadius: '7px', marginTop: '9px', lineHeight: 1.6,
        borderLeft: '2px solid rgba(192,123,85,0.3)' }}>
        {issue}
      </div>
    ))}
  </PanelSection>

  {/* Source section */}
  <PanelSection title="Source context">
    <div style={{ fontSize: '11px', fontWeight: 500,
      color: '#1A2630', marginBottom: '5px' }}>
      {source.name}
    </div>
    <div style={{ fontSize: '11px', color: '#8A8070',
      lineHeight: 1.6, marginBottom: '7px' }}>
      {source.excerpt}
    </div>
    {source.url && (
      <a href={source.url} target="_blank" rel="noopener"
        style={{ fontSize: '10px', color: '#C07B55', fontWeight: 500,
          textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <ExternalLinkIcon /> Verify on Google
      </a>
    )}
  </PanelSection>

  {/* Run summary section */}
  <PanelSection title="Run summary">
    <RunRow label="Client"       value={runSummary.client} />
    <RunRow label="Platform"     value={runSummary.platform} />
    <RunRow label="Posts"        value={`${runSummary.postsCount} generated`} />
    <RunRow label="Sources used" value={runSummary.sourcesUsed} />
    <RunRow label="Skipped"
      value={runSummary.skippedCount > 0 ? `${runSummary.skippedCount} pillar` : 'None'}
      valueColor={runSummary.skippedCount > 0 ? '#C07B55' : '#5A8A4A'} />
  </PanelSection>
</div>
```

### `ScoreRow`
```typescript
function ScoreRow({ label, value }) {
  const isWarn = value < 9
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '7px' }}>
      <span style={{ fontSize: '11px', color: '#8A8070', width: '78px', flexShrink: 0 }}>
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </span>
      <div style={{ flex: 1, height: '3px', background: 'rgba(44,62,80,0.08)',
        borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '2px',
          width: `${value * 10}%`,
          background: isWarn ? '#C07B55' : '#5A8A4A',
          transition: 'width 0.4s ease' }}/>
      </div>
      <span style={{ fontSize: '10px', fontWeight: 500, minWidth: '20px',
        textAlign: 'right', paddingLeft: '6px',
        color: isWarn ? '#C07B55' : '#5A8A4A' }}>
        {value}
      </span>
    </div>
  )
}
```

### ✓ Step 8c Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Score bars fill to correct width with animation
- [ ] Scores <9: terracotta bar and value, ≥9: sage green
- [ ] Issue text blocks appear only when `issues.length > 0`
- [ ] Source excerpt and verify link render correctly
- [ ] Run summary reflects actual generation run data

---

## Step 9 — Create `ResultsShell`

> **File:** `src/components/generate/results/results-shell.tsx`

Assembles the topbar, skip banner, and three panels.

```typescript
interface ResultsShellProps {
  posts:          GeneratedPost[]
  selectedPostId: string
  onSelectPost:   (id: string) => void
  onApprove:      (id: string) => void
  onRewrite:      (id: string) => void
  onDiscard:      (id: string) => void
  onApproveAll:   () => void
  onNewRun:       () => void
  skippedPillar?: string
  clientName:     string
  platform:       string
  postType:       string
  qualityData:    QualityPanelProps['scores']
  sourceData:     QualityPanelProps['source']
  runSummary:     QualityPanelProps['runSummary']
}
```

### Layout
```tsx
<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

  {/* Results topbar */}
  <div style={{ height: '48px', background: '#fff',
    borderBottom: '0.5px solid rgba(44,62,80,0.10)',
    display: 'flex', alignItems: 'center',
    padding: '0 18px', gap: '14px', flexShrink: 0,
    boxShadow: '0 1px 0 rgba(44,62,80,0.05)' }}>
    <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A2630' }}>
      {posts.length} posts generated
    </span>
    <span style={{ fontSize: '11px', color: '#8A8070' }}>
      {clientName} · {platform} · {postType}
    </span>
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <PostNavigator
        current={posts.findIndex(p => p.id === selectedPostId) + 1}
        total={posts.length}
        onPrev={() => navigatePrev()}
        onNext={() => navigateNext()}
      />
      <button onClick={onNewRun} style={GHOST_BTN_STYLE}>New run</button>
      <button onClick={onApproveAll} style={PRIMARY_BTN_STYLE}>Approve all</button>
    </div>
  </div>

  {/* Skipped pillar banner */}
  {skippedPillar && (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px',
      padding: '7px 18px', background: 'rgba(192,123,85,0.07)',
      borderBottom: '1px solid rgba(192,123,85,0.12)',
      fontSize: '11px', color: '#8A4A2A', flexShrink: 0 }}>
      <WarningIcon />
      1 pillar skipped — {skippedPillar} has no sources assigned.
      <a href="/sources" style={{ color: '#C07B55', fontWeight: 500, marginLeft: '3px' }}>
        Fix in Research Sources →
      </a>
    </div>
  )}

  {/* Three panels */}
  <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
    <PostList
      posts={posts}
      selectedPostId={selectedPostId}
      onSelect={onSelectPost}
    />
    <PostDetail
      post={selectedPost}
      onApprove={() => onApprove(selectedPostId)}
      onRewrite={() => onRewrite(selectedPostId)}
      onDiscard={() => onDiscard(selectedPostId)}
    />
    <QualityPanel
      scores={qualityData}
      source={sourceData}
      runSummary={runSummary}
    />
  </div>
</div>
```

### Post navigation (prev/next arrows in topbar)
```typescript
function navigatePrev() {
  const idx = posts.findIndex(p => p.id === selectedPostId)
  if (idx > 0) onSelectPost(posts[idx - 1].id)
}
function navigateNext() {
  const idx = posts.findIndex(p => p.id === selectedPostId)
  if (idx < posts.length - 1) onSelectPost(posts[idx + 1].id)
}
```

### ✓ Step 9 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Three panels render side by side, filling the viewport
- [ ] Selecting a post in the list updates both middle and right panels
- [ ] Arrow navigation in topbar moves between posts
- [ ] Skipped pillar banner only appears when data includes a skipped pillar
- [ ] "Approve all" calls existing batch approval logic
- [ ] "New run" resets state and returns to step 1

---

## Step 10 — Wire up in the page

> **File:** `src/app/(dashboard)/generate/page.tsx`

Keep all existing state, API calls, and handlers. Add step state and assemble.

```typescript
'use client'

const [step, setStep]               = useState<GenerateStep>('client')
const [selectedPost, setSelectedPost] = useState<string | null>(null)

// All existing state unchanged:
// selectedClient, selectedPlatform, postType, slideCount,
// priorityPosts, generatedPosts, loadingStage, etc.

return (
  <GenerateShell currentStep={step} onCancel={() => router.push('/dashboard')}>

    {step === 'client' && (
      <WizardLayout sidebar={<WizardSidebar step="client" {...sidebarProps} />}>
        <StepClient {...clientProps} onNext={() => setStep('priority')} />
      </WizardLayout>
    )}

    {step === 'priority' && (
      <WizardLayout sidebar={<WizardSidebar step="priority" {...sidebarProps} />}
        centerContent={false}>
        <StepPriority {...priorityProps}
          onBack={() => setStep('client')}
          onSkip={() => setStep('type')}
          onNext={() => setStep('type')} />
      </WizardLayout>
    )}

    {step === 'type' && (
      <WizardLayout sidebar={<WizardSidebar step="type" {...sidebarProps} />}>
        <StepType {...typeProps}
          onBack={() => setStep('priority')}
          onGenerate={handleGenerate} />
      </WizardLayout>
    )}

    {step === 'loading' && (
      <StepLoading clientName={selectedClientName} stage={loadingStage}
        sourceCount={fetchedSourceCount}
        pillarProgress={pillarProgress} />
    )}

    {step === 'results' && (
      <ResultsShell {...resultsProps}
        selectedPostId={selectedPost ?? generatedPosts[0]?.id}
        onSelectPost={setSelectedPost}
        onApprove={handleApprove}
        onRewrite={handleRewrite}
        onDiscard={handleDiscard}
        onApproveAll={handleApproveAll}
        onNewRun={() => { resetState(); setStep('client') }} />
    )}

  </GenerateShell>
)
```

### `handleGenerate`
```typescript
async function handleGenerate() {
  setStep('loading')
  setLoadingStage(0)
  try {
    await fetchSources()
    setLoadingStage(1)
    await researchContent()      // existing function
    setLoadingStage(2)
    await writeCaptions()        // existing function
    setLoadingStage(3)
    await validateQuality()      // existing function
    setStep('results')
    setSelectedPost(generatedPosts[0]?.id ?? null)
  } catch (err) {
    // keep existing error handling
  }
}
```

The stage numbers map to progress in the existing pipeline. Inject `setLoadingStage()` calls at the four natural breakpoints — do not restructure the pipeline.

### ✓ Step 10 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npm run build` — no errors
- [ ] Full flow navigable: client → priority → type → generating → results
- [ ] Back buttons return to correct previous step
- [ ] Skip on priority goes directly to type
- [ ] Generate button triggers existing generation pipeline
- [ ] Loading stages advance as pipeline progresses
- [ ] Results render all generated posts in three-panel layout

---

## Step 11 — Fix purple accent

```bash
grep -rn "6366f1\|indigo\|purple\|violet" src/app/\(dashboard\)/generate \
  --include="*.tsx" --include="*.css"
```

Replace:
- Progress bar purple → `#C07B55` (terracotta)
- Platform pill selected border/background → `#1A2630` (slate)
- Any button with purple/indigo → `#1A2630` or `#C07B55`

This is a one-line change per occurrence.

### ✓ Step 11 Verification
- [ ] `grep -r "6366f1\|purple\|indigo" src/app/\(dashboard\)/generate` returns nothing
- [ ] No purple visible anywhere in the generate flow

---

## Step 12 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Visual checks
- [ ] Step indicators: done = green ✓, active = slate, idle = grey
- [ ] Dark sidebar visible on steps 1–3, updates with run context
- [ ] Platform pills: slate selected, muted unselected
- [ ] Type options: slate border when selected
- [ ] Generate button: terracotta (not slate)
- [ ] Loading: Kontuur frame mark, four named stages
- [ ] Results: three panels, left list with status badges, right quality bars

### Functional checks
- [ ] Full generation run completes end to end
- [ ] Approve, rewrite, discard all work
- [ ] Approve all works
- [ ] New run resets state and returns to step 1
- [ ] Priority posts carried through to generation
- [ ] Slide count respected for carousel posts
- [ ] Skipped pillar banner shows when applicable

---

## What is NOT changed

| File | Why |
|---|---|
| Generation pipeline API calls | Logic unchanged |
| `handleApprove` / `handleDiscard` / `handleRewrite` | Actions unchanged |
| Post data structures | Types unchanged |
| Quality score calculation | Logic unchanged |
| Route `/generate` | URL unchanged |

---

## Implementation order for Claude Code

```
Step 1  → generate-shell.tsx          (topbar + step indicators)
Step 2  → wizard-sidebar.tsx          (dark sidebar component)
Step 3  → wizard-layout.tsx           (sidebar + main wrapper)
          ↑ verify sidebar + layout render before building any step
Step 4  → step-client.tsx             (simplest step)
Step 5  → step-priority.tsx           (priority post cards)
Step 6  → step-type.tsx               (type selector + slide count)
Step 7  → step-loading.tsx            (stage progress)
Step 8a → results/post-list.tsx       (left panel)
Step 8b → results/post-detail.tsx     (middle panel)
Step 8c → results/quality-panel.tsx   (right panel)
Step 9  → results/results-shell.tsx   (assemble three panels)
Step 10 → generate/page.tsx           (wire everything up)
Step 11 → purple accent fix           (grep + replace)
Step 12 → end-to-end verification
```

---

*Kontuur — Generate Posts Flow Redesign Plan*
*5-step wizard with dark sidebar + three-panel results view.*
*All generation logic, API calls, and handlers unchanged.*
*Purple replaced with slate + terracotta throughout.*