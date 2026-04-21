# Client Onboarding Flow Redesign — Implementation Plan

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after each step.
> Do not modify files not listed here. Do not skip steps.
> All existing onboarding logic, AI analysis, and server actions remain unchanged.
> Only visual presentation, layout, and routing structure change.

---

## Context

The current onboarding lives inside the `(dashboard)` layout group, so the
sidebar nav is always visible. This plan moves it to a separate layout group
with its own minimal chrome (logo + cancel only), making it a full-screen
focused flow.

---

## The Four Steps

```
Step 1 — Entry        URL + Instagram handle input, Analyze & continue
Step 2 — Loading      Analysis progress with four named stages
Step 3 — Interview    Chat Q&A with auto-detected suggestions, left progress sidebar
Step 4 — Review       Full profile summary with left nav TOC, Confirm & save
```

All existing logic (AI analysis, interview Q&A, profile building, server actions)
is preserved. Only the visual shell changes.

---

## Architecture Decision — Separate Layout Group

The onboarding must render **outside** the `(dashboard)` layout so the sidebar
never mounts.

### Current structure (wrong)
```
src/app/
  (dashboard)/
    layout.tsx          ← renders sidebar
    clients/
      new/
        page.tsx        ← onboarding currently here — sidebar visible
```

### New structure (correct)
```
src/app/
  (dashboard)/
    layout.tsx          ← sidebar layout — unchanged
    clients/
      page.tsx          ← clients list — unchanged
  (onboarding)/
    layout.tsx          ← NEW: minimal layout, no sidebar
    clients/
      new/
        page.tsx        ← MOVED: onboarding lives here
```

The URL stays the same (`/clients/new`). Only the layout group changes.

---

## Files Modified

| File | Change |
|---|---|
| `src/app/(onboarding)/layout.tsx` | CREATE — minimal full-screen layout |
| `src/app/(onboarding)/clients/new/page.tsx` | MOVE + UPDATE — from (dashboard) to (onboarding) |
| `src/components/onboarding/onboarding-shell.tsx` | CREATE — topbar chrome |
| `src/components/onboarding/step-entry.tsx` | CREATE — step 1 |
| `src/components/onboarding/step-loading.tsx` | CREATE — step 2 |
| `src/components/onboarding/step-interview.tsx` | CREATE — step 3 |
| `src/components/onboarding/step-review.tsx` | CREATE — step 4 |
| `src/components/onboarding/interview-sidebar.tsx` | CREATE — left progress panel |
| `src/components/onboarding/review-sidebar.tsx` | CREATE — left TOC panel |

> **Find current onboarding files first:**
> ```bash
> find src -name "*.tsx" | xargs grep -l "New client onboarding\|Analyze.*continue\|interview\|onboarding" | head -10
> find src -name "*.tsx" | xargs grep -l "Review client profile\|Confirm and save" | head -10
> ```

---

## Step 1 — Create the onboarding layout group

### 1a — Create `src/app/(onboarding)/layout.tsx`

Full-screen layout with no sidebar, no topbar, no navigation chrome.
The onboarding manages its own chrome internally.

```typescript
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F4EFE6',
      fontFamily: 'var(--font-sans, "DM Sans", system-ui, sans-serif)',
    }}>
      {children}
    </div>
  )
}
```

No providers, no auth wrappers beyond what is already in the root layout.
Auth protection for this route should come from middleware — verify the user
is logged in before reaching `/clients/new`.

### 1b — Move the onboarding page

Copy the existing `src/app/(dashboard)/clients/new/page.tsx` to
`src/app/(onboarding)/clients/new/page.tsx`.

Keep all existing logic intact. The page file should not change in this step —
only its location in the file tree changes.

If a redirect or link elsewhere in the app points to `/clients/new`, it will
automatically use the new layout. No link changes needed.

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Navigating to `/clients/new` no longer shows the sidebar
- [ ] The page content still renders (may look unstyled — that is expected)
- [ ] Auth still works — unauthenticated users cannot reach the page

---

## Step 2 — Create `OnboardingShell` topbar

> **File:** `src/components/onboarding/onboarding-shell.tsx`

Minimal topbar with logo, step indicator, and cancel button.
Wraps the entire onboarding flow.

```typescript
interface OnboardingShellProps {
  currentStep:  1 | 2 | 3 | 4
  totalSteps:   4
  onCancel:     () => void
  children:     React.ReactNode
}
```

### Topbar layout
```tsx
<div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
  background: '#F4EFE6' }}>

  {/* Topbar */}
  <div style={{
    display:       'flex',
    alignItems:    'center',
    justifyContent:'space-between',
    padding:       '0 32px',
    height:        '52px',
    background:    '#fff',
    borderBottom:  '0.5px solid rgba(44,62,80,0.10)',
    flexShrink:    0,
  }}>
    {/* Logo */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{
        fontFamily:    'var(--font-display, Georgia, serif)',
        fontSize:      '15px',
        fontWeight:    400,
        color:         '#1A2630',
        letterSpacing: '3px',
        paddingRight:  '16px',
        borderRight:   '0.5px solid rgba(44,62,80,0.12)',
        marginRight:   '8px',
      }}>
        KONTUUR
      </div>
      <span style={{ fontSize: '12px', color: '#8A8070' }}>
        New client onboarding
      </span>
    </div>

    {/* Step indicator + cancel */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <span style={{ fontSize: '11px', color: '#8A8070' }}>
        Step {currentStep} of {totalSteps}
      </span>
      <button
        onClick={onCancel}
        style={{ fontSize: '12px', color: '#8A8070', background: 'none',
          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          padding: '6px 0' }}
      >
        Cancel onboarding
      </button>
    </div>
  </div>

  {/* Thin progress line below topbar */}
  <div style={{ height: '2px', background: 'rgba(44,62,80,0.06)', flexShrink: 0 }}>
    <div style={{
      height: '100%',
      background: '#C07B55',
      width: `${(currentStep / totalSteps) * 100}%`,
      transition: 'width 0.4s ease',
    }}/>
  </div>

  {/* Content */}
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
    {children}
  </div>
</div>
```

### Cancel behaviour
When "Cancel onboarding" is clicked, show a confirmation before navigating away:

```typescript
function handleCancel() {
  const confirmed = window.confirm(
    'Cancel onboarding? Any unsaved progress will be lost.'
  )
  if (confirmed) router.push('/clients')
}
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Topbar shows KONTUUR wordmark, step indicator, cancel button
- [ ] Terracotta progress line advances with step number
- [ ] Cancel shows confirmation and navigates to /clients on confirm

---

## Step 3 — Create `StepEntry` (Step 1)

> **File:** `src/components/onboarding/step-entry.tsx`

```typescript
interface StepEntryProps {
  websiteUrl:          string
  instagramHandle:     string
  onWebsiteChange:     (v: string) => void
  onInstagramChange:   (v: string) => void
  onAnalyze:           () => void
  onSkip:              () => void
  isAnalyzing:         boolean
}
```

### Layout — centred, single column
```tsx
<div style={{ flex: 1, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>

  {/* Kontuur frame icon */}
  <div style={{
    borderLeft:   '1.5px solid #C07B55',
    borderRight:  '1.5px solid #C07B55',
    borderTop:    '0.5px solid rgba(44,62,80,0.18)',
    borderBottom: '0.5px solid rgba(44,62,80,0.18)',
    padding:      '12px 14px',
    marginBottom: '20px',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'center',
  }}>
    [edit icon 20px stroke #C07B55 stroke-width 1.5]
  </div>

  <h1 style={{ fontFamily: 'var(--font-display, Georgia, serif)',
    fontSize: '26px', fontWeight: 400, color: '#1A2630',
    textAlign: 'center', marginBottom: '8px' }}>
    New client onboarding
  </h1>
  <p style={{ fontSize: '14px', color: '#8A8070', textAlign: 'center',
    marginBottom: '32px', maxWidth: '420px', lineHeight: 1.65 }}>
    Share a website or Instagram handle — Kontuur will auto-detect the
    brand profile, tone, and content pillars.
  </p>

  {/* Input card */}
  <div style={{ background: '#fff', border: '0.5px solid rgba(44,62,80,0.12)',
    borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '480px',
    marginBottom: '16px' }}>
    <Field label="Website URL">
      <input
        value={websiteUrl}
        onChange={e => onWebsiteChange(e.target.value)}
        placeholder="https://physiomed-plovdiv.eu"
        style={INPUT_STYLE}
      />
    </Field>
    <div style={{ marginTop: '14px' }}>
      <Field label="Instagram handle">
        <input
          value={instagramHandle}
          onChange={e => onInstagramChange(e.target.value)}
          placeholder="@username (optional)"
          style={INPUT_STYLE}
        />
      </Field>
    </div>
  </div>

  {/* Analyze button */}
  <button
    onClick={onAnalyze}
    disabled={!websiteUrl && !instagramHandle}
    style={{
      width: '100%', maxWidth: '480px', padding: '13px',
      background: !websiteUrl && !instagramHandle ? 'rgba(44,62,80,0.3)' : '#1A2630',
      color: '#ECE8E1', border: 'none', borderRadius: '10px',
      fontSize: '14px', fontWeight: 500, cursor: 'pointer',
      fontFamily: 'inherit', marginBottom: '12px',
      transition: 'background 0.15s',
    }}
  >
    {isAnalyzing ? 'Analyzing...' : 'Analyze & continue →'}
  </button>

  {/* Skip link */}
  <button onClick={onSkip} style={{ fontSize: '12px', color: '#8A8070',
    background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
    Skip — I'll answer manually
  </button>
</div>
```

Shared `INPUT_STYLE`:
```typescript
const INPUT_STYLE: React.CSSProperties = {
  width:      '100%',
  padding:    '10px 13px',
  border:     '0.5px solid rgba(44,62,80,0.16)',
  borderRadius: '8px',
  fontSize:   '14px',
  fontFamily: 'inherit',
  color:      '#1A2630',
  background: '#fff',
  outline:    'none',
}
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Analyze button disabled when both inputs empty
- [ ] Analyze button calls `onAnalyze` with current values
- [ ] Skip calls `onSkip`

---

## Step 4 — Create `StepLoading` (Step 2)

> **File:** `src/components/onboarding/step-loading.tsx`

```typescript
interface StepLoadingProps {
  stage: 0 | 1 | 2 | 3   // current stage index
  onSkip: () => void
}

const STAGES = [
  'Fetching website content',
  'Detecting brand voice and tone',
  'Identifying content pillars',
  'Building client profile',
]
```

### Layout — centred, white background
```tsx
<div style={{ flex: 1, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', padding: '40px',
  background: '#fff' }}>

  {/* Search icon in slate box */}
  <div style={{ width: '56px', height: '56px', borderRadius: '14px',
    background: '#1A2630', display: 'flex', alignItems: 'center',
    justifyContent: 'center', marginBottom: '20px' }}>
    [search icon 22px stroke #C07B55 stroke-width 1.5]
  </div>

  <h2 style={{ fontFamily: 'var(--font-display, Georgia, serif)',
    fontSize: '22px', fontWeight: 400, color: '#1A2630',
    marginBottom: '6px', textAlign: 'center' }}>
    Analyzing brand presence
  </h2>
  <p style={{ fontSize: '13px', color: '#8A8070', textAlign: 'center',
    marginBottom: '32px' }}>
    Scanning website, detecting tone and content themes
  </p>

  {/* Stage progress list */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px',
    width: '100%', maxWidth: '340px', marginBottom: '28px' }}>
    {STAGES.map((label, i) => {
      const isDone   = i < stage
      const isActive = i === stage
      return (
        <div key={i} style={{
          display:       'flex',
          alignItems:    'center',
          gap:           '10px',
          padding:       '10px 14px',
          borderRadius:  '8px',
          background:    isDone   ? 'rgba(122,154,106,0.08)'
                       : isActive ? 'rgba(44,62,80,0.06)'
                       : '#F9F6F2',
          transition:    'background 0.3s',
        }}>
          {/* Stage icon */}
          <div style={{ width: '20px', height: '20px', borderRadius: '50%',
            background: isDone   ? '#5A8A4A'
                       : isActive ? '#1A2630'
                       : 'rgba(44,62,80,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0 }}>
            {isDone && [checkmark icon 10px stroke #fff]}
            {isActive && <Spinner />}
          </div>
          <span style={{ fontSize: '12px', fontWeight: 500,
            color: isDone   ? '#5A8A4A'
                 : isActive ? '#1A2630'
                 : '#8A8070' }}>
            {label}
          </span>
        </div>
      )
    })}
  </div>

  <button onClick={onSkip} style={{ fontSize: '12px', color: '#8A8070',
    background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
    Skip to interview →
  </button>
</div>
```

### Spinner component (inline)
```typescript
function Spinner() {
  return (
    <div style={{
      width: '10px', height: '10px',
      border: '2px solid rgba(236,232,225,0.3)',
      borderTopColor: '#ECE8E1',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }}/>
  )
}
// Add keyframes to global CSS or use style tag:
// @keyframes spin { to { transform: rotate(360deg) } }
```

### Stage advancement
The parent page advances `stage` as the analysis API calls complete.
Each API call resolves → increment stage by 1. This drives the visual progress.

```typescript
// In the parent page:
setStage(0)  // fetching content started
const content = await fetchWebsiteContent(url)
setStage(1)  // detecting tone
const tone = await detectBrandTone(content)
setStage(2)  // identifying pillars
const pillars = await identifyPillars(content, tone)
setStage(3)  // building profile
const profile = await buildClientProfile(...)
// → advance to interview step
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Stages before current show green with checkmark
- [ ] Current stage shows slate background with spinner
- [ ] Future stages show muted grey
- [ ] Skip navigates to interview step

---

## Step 5 — Create `InterviewSidebar`

> **File:** `src/components/onboarding/interview-sidebar.tsx`

```typescript
interface InterviewSidebarProps {
  questions: {
    id:        string
    label:     string
    status:    'done' | 'active' | 'pending'
  }[]
}
```

```tsx
<div style={{ width: '260px', flexShrink: 0, background: '#1A2630',
  padding: '28px 24px', display: 'flex', flexDirection: 'column',
  position: 'relative', overflow: 'hidden' }}>

  {/* Decorative rings */}
  <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
    width: '100%', height: '100%' }} viewBox="0 0 260 620" fill="none">
    <ellipse cx="240" cy="310" rx="200" ry="200"
      stroke="rgba(236,232,225,0.025)" strokeWidth="60"/>
    <ellipse cx="240" cy="310" rx="130" ry="130"
      stroke="rgba(192,123,85,0.04)" strokeWidth="35"/>
  </svg>

  <div style={{ position: 'relative', zIndex: 2 }}>
    {/* Logo */}
    <div style={{ fontFamily: 'var(--font-display, Georgia, serif)',
      fontSize: '16px', color: '#ECE8E1', letterSpacing: '3px', marginBottom: '3px' }}>
      KONTUUR
    </div>
    <div style={{ fontSize: '7px', color: '#C07B55', letterSpacing: '5px',
      marginBottom: '28px' }}>
      SOCIAL INTELLIGENCE
    </div>

    {/* Progress label */}
    <div style={{ fontSize: '9px', fontWeight: 500, color: 'rgba(236,232,225,0.4)',
      letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>
      Interview progress
    </div>

    {/* Question list */}
    {questions.map(q => (
      <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '9px',
        padding: '7px 0', borderBottom: '0.5px solid rgba(236,232,225,0.07)' }}>
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
          background: q.status === 'done'   ? '#5A8A4A'
                    : q.status === 'active' ? '#C07B55'
                    : 'rgba(236,232,225,0.18)' }}/>
        <span style={{ fontSize: '12px',
          color: q.status === 'done'   ? 'rgba(236,232,225,0.75)'
               : q.status === 'active' ? '#ECE8E1'
               : 'rgba(236,232,225,0.35)',
          fontWeight: q.status === 'active' ? 500 : 400 }}>
          {q.label}
        </span>
      </div>
    ))}
  </div>

  {/* Footer note */}
  <div style={{ marginTop: 'auto', position: 'relative', zIndex: 2,
    fontSize: '11px', color: 'rgba(236,232,225,0.28)', lineHeight: 1.6,
    paddingTop: '20px' }}>
    Auto-detected answers are pre-filled. Edit anything that doesn't fit.
  </div>
</div>
```

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Done questions: green dot, muted text
- [ ] Active question: terracotta dot, white text, font-weight 500
- [ ] Pending questions: grey dot, very muted text
- [ ] Decorative rings visible but subtle

---

## Step 6 — Create `StepInterview` (Step 3)

> **File:** `src/components/onboarding/step-interview.tsx`

```typescript
interface StepInterviewProps {
  messages:      InterviewMessage[]
  questions:     InterviewSidebarProps['questions']
  inputValue:    string
  onInputChange: (v: string) => void
  onConfirm:     () => void
  isLoading:     boolean
}

interface InterviewMessage {
  role:        'ai' | 'user'
  content:     string
  suggestion?: string   // auto-detected value, shown in AI messages
  suggestionLabel?: string  // e.g. "Detected from website"
}
```

### Layout — left sidebar + right chat
```tsx
<div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
  <InterviewSidebar questions={questions} />

  {/* Chat area */}
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
    background: '#fff', overflow: 'hidden' }}>

    {/* Messages */}
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px',
      display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {messages.map((msg, i) => (
        msg.role === 'ai'
          ? <AiMessage key={i} content={msg.content}
              suggestion={msg.suggestion}
              suggestionLabel={msg.suggestionLabel} />
          : <UserMessage key={i} content={msg.content} />
      ))}
      {isLoading && <AiTypingIndicator />}
    </div>

    {/* Input bar */}
    <div style={{ borderTop: '0.5px solid rgba(44,62,80,0.10)',
      padding: '14px 20px', background: '#fff', flexShrink: 0 }}>
      <p style={{ fontSize: '10px', color: '#8A8070', marginBottom: '8px',
        textAlign: 'center', letterSpacing: '0.3px' }}>
        Confirm the auto-detected answer or type your own
      </p>
      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          value={inputValue}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onConfirm()}
          placeholder="Edit or confirm the suggested answer..."
          style={{ flex: 1, padding: '10px 13px',
            border: '0.5px solid rgba(44,62,80,0.16)',
            borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
            color: '#1A2630', background: '#F9F6F2', outline: 'none' }}
        />
        <button onClick={onConfirm} style={{ padding: '9px 18px',
          background: '#1A2630', color: '#ECE8E1', border: 'none',
          borderRadius: '7px', fontSize: '12px', fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          transition: 'background 0.15s' }}>
          Confirm & next →
        </button>
      </div>
    </div>
  </div>
</div>
```

### `AiMessage` sub-component
```tsx
function AiMessage({ content, suggestion, suggestionLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      {/* AI avatar */}
      <div style={{ width: '28px', height: '28px', borderRadius: '7px',
        background: '#1A2630', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
        [edit icon 11px stroke #C07B55]
      </div>

      {/* Bubble */}
      <div style={{ background: '#F9F6F2',
        border: '0.5px solid rgba(44,62,80,0.10)',
        borderRadius: '0 10px 10px 10px',
        padding: '12px 14px', maxWidth: '480px' }}>
        <p style={{ fontSize: '13px', color: '#1A2630', lineHeight: 1.6,
          marginBottom: suggestion ? '10px' : 0 }}>
          {content}
        </p>

        {/* Auto-detected suggestion */}
        {suggestion && (
          <div style={{ padding: '8px 11px',
            background: 'rgba(44,62,80,0.05)',
            borderLeft: '2px solid #C07B55',
            borderRadius: '0 5px 5px 0' }}>
            <div style={{ fontSize: '9px', fontWeight: 500, color: '#C07B55',
              letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' }}>
              {suggestionLabel ?? 'Detected from website'}
            </div>
            <div style={{ fontSize: '12px', color: '#4A5060',
              fontStyle: 'italic', lineHeight: 1.55 }}>
              {suggestion}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

### `UserMessage` sub-component
```tsx
function UserMessage({ content }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ background: '#1A2630', color: '#ECE8E1',
        borderRadius: '10px 0 10px 10px',
        padding: '11px 14px', maxWidth: '440px',
        fontSize: '13px', lineHeight: 1.55 }}>
        {content}
      </div>
    </div>
  )
}
```

### `AiTypingIndicator` sub-component
```tsx
function AiTypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '7px',
        background: '#1A2630', flexShrink: 0 }}/>
      <div style={{ background: '#F9F6F2',
        border: '0.5px solid rgba(44,62,80,0.10)',
        borderRadius: '0 10px 10px 10px',
        padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width: '5px', height: '5px',
              borderRadius: '50%', background: '#8A8070',
              animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}/>
          ))}
        </div>
      </div>
    </div>
  )
}
// Add @keyframes bounce { 0%,80%,100% { opacity:0.3 } 40% { opacity:1 } }
```

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Chat messages scroll correctly — new messages appear at bottom
- [ ] AI messages show warm grey bubble with optional suggestion block
- [ ] Suggestion block has terracotta left border and label
- [ ] User messages show slate bubble, right-aligned
- [ ] Typing indicator animates correctly
- [ ] Enter key in input calls `onConfirm`
- [ ] Interview sidebar shows correct progress state

---

## Step 7 — Create `ReviewSidebar`

> **File:** `src/components/onboarding/review-sidebar.tsx`

```typescript
interface ReviewSection {
  id:      string
  label:   string
  status:  'ok' | 'warning' | 'empty'
}

interface ReviewSidebarProps {
  sections:         ReviewSection[]
  activeSection:    string
  onSectionClick:   (id: string) => void
  onConfirm:        () => void
  onRedo:           () => void
  detectedFrom?:    string   // e.g. "physiomed-plovdiv.eu"
  isSaving:         boolean
}
```

```tsx
<div style={{ width: '260px', flexShrink: 0, background: '#1A2630',
  padding: '24px', display: 'flex', flexDirection: 'column' }}>

  {/* Logo */}
  <div style={{ fontFamily: 'var(--font-display, Georgia, serif)',
    fontSize: '15px', color: '#ECE8E1', letterSpacing: '3px', marginBottom: '3px' }}>
    KONTUUR
  </div>
  <div style={{ fontSize: '7px', color: '#C07B55', letterSpacing: '5px',
    marginBottom: '24px' }}>
    SOCIAL INTELLIGENCE
  </div>

  {/* Section nav */}
  <div style={{ fontSize: '9px', fontWeight: 500, color: 'rgba(236,232,225,0.4)',
    letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
    Profile review
  </div>

  <div style={{ flex: 1, marginBottom: '20px' }}>
    {sections.map(s => (
      <div key={s.id} onClick={() => onSectionClick(s.id)}
        style={{ display: 'flex', alignItems: 'center', gap: '9px',
          padding: '7px 8px', borderRadius: '5px', cursor: 'pointer',
          marginBottom: '2px', transition: 'background 0.15s',
          background: s.id === activeSection
            ? 'rgba(236,232,225,0.10)' : 'transparent' }}>
        <div style={{ width: '5px', height: '5px', borderRadius: '50%',
          flexShrink: 0,
          background: s.status === 'ok'      ? '#5A8A4A'
                    : s.status === 'warning' ? '#C07B55'
                    : 'rgba(236,232,225,0.2)' }}/>
        <span style={{ fontSize: '12px',
          color: s.id === activeSection
            ? '#ECE8E1' : 'rgba(236,232,225,0.65)',
          fontWeight: s.id === activeSection ? 500 : 400 }}>
          {s.label}
        </span>
      </div>
    ))}
  </div>

  {/* Detection note */}
  {detectedFrom && (
    <div style={{ fontSize: '11px', color: 'rgba(236,232,225,0.3)',
      lineHeight: 1.6, marginBottom: '20px' }}>
      Profile auto-detected from{' '}
      <span style={{ color: '#ECE8E1', fontWeight: 500 }}>{detectedFrom}</span>
      <br/>
      <span style={{ color: 'rgba(236,232,225,0.25)' }}>
        Edit any section before saving
      </span>
    </div>
  )}

  {/* Actions */}
  <button onClick={onConfirm} disabled={isSaving}
    style={{ width: '100%', padding: '12px', background: '#C07B55',
      color: '#fff', border: 'none', borderRadius: '9px',
      fontSize: '13px', fontWeight: 500, cursor: 'pointer',
      fontFamily: 'inherit', marginBottom: '8px',
      opacity: isSaving ? 0.7 : 1, transition: 'all 0.15s' }}>
    {isSaving ? 'Saving...' : 'Confirm & save client'}
  </button>
  <button onClick={onRedo}
    style={{ width: '100%', padding: '10px',
      background: 'rgba(236,232,225,0.08)', color: 'rgba(236,232,225,0.55)',
      border: 'none', borderRadius: '9px', fontSize: '12px',
      cursor: 'pointer', fontFamily: 'inherit' }}>
    Redo interview
  </button>
</div>
```

### ✓ Step 7 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Active section highlighted with white text and translucent background
- [ ] Status dots: green (ok), terracotta (warning), grey (empty)
- [ ] Clicking a section calls `onSectionClick`
- [ ] Confirm button shows "Saving..." when `isSaving` is true

---

## Step 8 — Create `StepReview` (Step 4)

> **File:** `src/components/onboarding/step-review.tsx`

The right panel of the review step. Renders all profile sections as white cards.
Each section has a header (section label + Edit button) and a body.

```typescript
interface StepReviewProps {
  profile:          DetectedClientProfile   // existing type from your codebase
  sections:         ReviewSection[]
  activeSection:    string
  onSectionClick:   (id: string) => void
  onEditSection:    (id: string) => void
  onConfirm:        () => void
  onRedo:           () => void
  isSaving:         boolean
}
```

### Layout
```tsx
<div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
  <ReviewSidebar
    sections={sections}
    activeSection={activeSection}
    onSectionClick={handleSectionClick}
    onConfirm={onConfirm}
    onRedo={onRedo}
    detectedFrom={profile.websiteUrl}
    isSaving={isSaving}
  />

  {/* Right scroll area */}
  <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px',
    background: '#F4EFE6' }} ref={scrollAreaRef}>

    {/* Health banner — only for health clients */}
    {profile.isHealthClient && <HealthBanner />}

    {/* Profile sections */}
    <ReviewCard id="basic"    title="Basic info"          icon="user"      onEdit={...}>
      {/* 2-col grid: name + niche */}
    </ReviewCard>

    <ReviewCard id="audience" title="Target audience"     icon="users"     onEdit={...}>
      {/* Tag pills */}
    </ReviewCard>

    <ReviewCard id="goals"    title="Social media goals"  icon="target"    onEdit={...}>
      {/* Tag pills */}
    </ReviewCard>

    <ReviewCard id="brand"    title="Brand tone & pillars" icon="edit"     onEdit={...}>
      {/* Tone text + pillar rows with colour dots */}
    </ReviewCard>

    <ReviewCard id="topics"   title="Topics to avoid"     icon="x-circle"  onEdit={...}>
      {/* Comma-separated text */}
    </ReviewCard>

    <ReviewCard id="testimonial" title="Client testimonial voice" icon="quote" onEdit={...}>
      {/* Italic quote */}
    </ReviewCard>

    <ReviewCard id="platforms" title="Recommended platforms" icon="share-2" onEdit={...}>
      {/* 2-col platform grid */}
    </ReviewCard>

    <ReviewCard id="schedule" title="Autonomous schedule"  icon="calendar"  onEdit={...}>
      {/* 3-col grid: frequency, day, time */}
    </ReviewCard>
  </div>
</div>
```

### `ReviewCard` reusable sub-component
```tsx
function ReviewCard({ id, title, icon, onEdit, children }) {
  return (
    <div id={`section-${id}`} style={{ background: '#fff',
      border: '0.5px solid rgba(44,62,80,0.10)', borderRadius: '12px',
      overflow: 'hidden', marginBottom: '14px' }}>

      <div style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '13px 18px',
        borderBottom: '0.5px solid rgba(44,62,80,0.07)' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, color: '#8A8070',
          letterSpacing: '1.5px', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: '7px' }}>
          [icon 10px color #8A8070]
          {title}
        </div>
        <button onClick={() => onEdit(id)}
          style={{ fontSize: '11px', color: '#C07B55', fontWeight: 500,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit' }}>
          Edit
        </button>
      </div>

      <div style={{ padding: '14px 18px' }}>
        {children}
      </div>
    </div>
  )
}
```

### Scroll-to-section behaviour
When `activeSection` changes (from sidebar click), scroll the right panel
to the corresponding card:

```typescript
function handleSectionClick(id: string) {
  setActiveSection(id)
  const el = document.getElementById(`section-${id}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
```

### `HealthBanner`
```tsx
function HealthBanner() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px',
      padding: '11px 14px', background: 'rgba(192,123,85,0.07)',
      borderLeft: '2px solid #C07B55', borderRadius: '0 8px 8px 0',
      marginBottom: '14px' }}>
      [warning icon 14px #C07B55 flex-shrink:0 margin-top:1px]
      <div>
        <div style={{ fontSize: '12px', fontWeight: 500, color: '#A05A35',
          marginBottom: '2px' }}>
          Health-related client detected
        </div>
        <div style={{ fontSize: '11px', color: '#C07B55', lineHeight: 1.55 }}>
          All posts will include medical safety instructions.
          Human review is mandatory before publishing.
        </div>
      </div>
    </div>
  )
}
```

### ✓ Step 8 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] All 8 review cards render with correct data
- [ ] Health banner appears for health clients, hidden otherwise
- [ ] Clicking a sidebar section smooth-scrolls to that card
- [ ] Edit button per card opens edit mode (keep existing edit logic)
- [ ] Confirm & save in sidebar triggers save and navigates to client page

---

## Step 9 — Wire up in the page

> **File:** `src/app/(onboarding)/clients/new/page.tsx`

Keep all existing state, API calls, and server actions. Add step state and
assemble the new components.

```typescript
'use client'

type OnboardingStep = 'entry' | 'loading' | 'interview' | 'review'

export default function NewClientPage() {
  const [step, setStep] = useState<OnboardingStep>('entry')
  const router = useRouter()

  // All existing state variables unchanged:
  // websiteUrl, instagramHandle, messages, profile, isSaving, etc.

  function handleCancel() {
    const confirmed = window.confirm('Cancel onboarding? Progress will be lost.')
    if (confirmed) router.push('/clients')
  }

  const stepNumber = {
    entry: 1, loading: 2, interview: 3, review: 4
  }[step] as 1 | 2 | 3 | 4

  return (
    <OnboardingShell
      currentStep={stepNumber}
      totalSteps={4}
      onCancel={handleCancel}
    >
      {step === 'entry' && (
        <StepEntry
          websiteUrl={websiteUrl}
          instagramHandle={instagramHandle}
          onWebsiteChange={setWebsiteUrl}
          onInstagramChange={setInstagramHandle}
          onAnalyze={handleAnalyze}
          onSkip={() => setStep('interview')}
          isAnalyzing={false}
        />
      )}
      {step === 'loading' && (
        <StepLoading
          stage={loadingStage}
          onSkip={() => setStep('interview')}
        />
      )}
      {step === 'interview' && (
        <StepInterview
          messages={messages}
          questions={interviewQuestions}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onConfirm={handleConfirm}
          isLoading={isLoading}
        />
      )}
      {step === 'review' && (
        <StepReview
          profile={detectedProfile}
          sections={reviewSections}
          activeSection={activeSection}
          onSectionClick={setActiveSection}
          onEditSection={handleEditSection}
          onConfirm={handleSaveClient}
          onRedo={() => setStep('interview')}
          isSaving={isSaving}
        />
      )}
    </OnboardingShell>
  )
}
```

### ✓ Step 9 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npm run build` — no errors
- [ ] Full onboarding flow navigable: entry → loading → interview → review
- [ ] No sidebar visible at any step
- [ ] Cancel from any step confirms and navigates to /clients
- [ ] Progress bar advances with each step
- [ ] Step indicator in topbar shows correct number

---

## Step 10 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Flow verification (test with real client)
- [ ] Entry: enter URL → Analyze → loading appears
- [ ] Loading: 4 stages advance as API calls resolve
- [ ] Interview: AI messages appear, suggestion block shows auto-detected value, confirming advances
- [ ] Review: all 8 sections populated, scroll-to works, Edit opens edit mode
- [ ] Confirm & save: creates client, navigates to source stepper or client page
- [ ] Redo interview: returns to interview step with fresh state

### Visual consistency
- [ ] No purple anywhere — all accents are terracotta or slate
- [ ] Fonts: Playfair Display for titles, DM Sans for body
- [ ] Input styles consistent with rest of app
- [ ] Button styles consistent (slate primary, terracotta confirm)

### Edge cases
- [ ] Skip analysis: entry → skip → interview (no loading step)
- [ ] Health client: banner appears on review page
- [ ] Cancel mid-interview: confirmation shown, navigates to /clients
- [ ] Browser back button during interview: confirmation or disabled

---

## What is NOT changed

| File / Feature | Why |
|---|---|
| AI analysis API calls | Logic unchanged |
| Interview question sequence | Content unchanged |
| Brand profile detection | Logic unchanged |
| `handleSaveClient` server action | Logic unchanged |
| Source stepper after save | Triggered after confirm as before |
| Auth middleware | Not in scope |

---

## Implementation order for Claude Code

```
Step 1 → (onboarding)/layout.tsx     (route isolation — verify sidebar gone)
Step 2 → onboarding-shell.tsx         (topbar chrome, progress bar)
         ↑ verify topbar renders before building any step components
Step 3 → step-entry.tsx               (simplest step)
Step 4 → step-loading.tsx             (stage progress)
Step 5 → interview-sidebar.tsx        (isolated sidebar component)
Step 6 → step-interview.tsx           (chat UI + sidebar)
Step 7 → review-sidebar.tsx           (isolated sidebar component)
Step 8 → step-review.tsx              (review cards + sidebar)
Step 9 → (onboarding)/clients/new/page.tsx  (assemble — keep all logic)
         ↑ wire steps to existing state and API calls
Step 10 → end-to-end verification
```

---

*Kontuur — Onboarding Flow Redesign Plan*
*Full-screen layout group — no sidebar. Purple → slate + terracotta.*
*All existing AI analysis, interview logic, and server actions unchanged.*