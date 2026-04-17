# Auth Pages Redesign Plan

> **For Claude Code:** Implement steps in order. Run `npx tsc --noEmit` after each step.
> Do not implement the next step until the current one is verified.
> Do not modify any file not mentioned in the steps below.

---

## Context

The login and signup pages currently use a centred single-column layout on a plain grey
background. They will be redesigned to a split-panel layout:

- **Left panel (52%):** Dark slate `#1A2630` background with the Kontuur logo mark and
  an auto-advancing content slider cycling through four value proposition slides.
- **Right panel (48%):** Warm off-white `#F4EFE6` background containing the existing
  form with updated visual styling.

All existing form logic, server actions, validation, and error handling remain unchanged.
Only the visual presentation changes.

---

## Design Tokens

```
--slate:        #1A2630   sidebar, primary button, text on light
--warm-bg:      #F4EFE6   right panel background
--cream:        #ECE8E1   text on dark backgrounds
--terracotta:   #C07B55   accent, active states, hover, brand sub
--muted:        #8A8070   secondary text on light
--border-light: rgba(44,62,80,0.14)   input borders on light
--border-dark:  rgba(236,232,225,0.2) decorative borders on dark
```

## Typography

- **Display:** Playfair Display (already in project via `--font-display`)
- **Body/UI:** DM Sans or Geist Sans (already in project via `--font-sans`)

---

## Files Modified

| File | Change |
|---|---|
| `src/components/auth/auth-slider.tsx` | CREATE — shared slider component |
| `src/components/auth/auth-layout.tsx` | CREATE — shared split-panel wrapper |
| `src/app/(auth)/login/page.tsx` | UPDATE — use new layout, keep form logic |
| `src/app/(auth)/signup/page.tsx` | UPDATE — use new layout, keep form logic |

> **Note:** Confirm actual file paths before starting:
> ```bash
> find src -name "*.tsx" | xargs grep -l "Sign in\|login\|signin" | head -5
> find src -name "*.tsx" | xargs grep -l "Create account\|signup\|register" | head -5
> ```

---

## Step 1 — Create `AuthSlider` component

> **File:** `src/components/auth/auth-slider.tsx`

A self-contained client component. Auto-advances every 4 seconds. Dots are clickable
and reset the timer. No props required — slides are hardcoded as they are marketing copy,
not dynamic data.

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'

const SLIDES = [
  {
    headline: ['Your clients\u2019 social presence,', 'intelligently managed.'],
    italicWord: 'intelligently',
    body: 'Research, generate, schedule and analyse \u2014 all from one place built for agencies.',
  },
  {
    headline: ['From brief to published post in', 'minutes, not hours.'],
    italicWord: 'minutes,',
    body: 'AI-powered research finds the right angles. Generation writes on-brand copy. You just approve.',
  },
  {
    headline: ['Every client, every platform,', 'one dashboard.'],
    italicWord: 'one',
    body: 'Manage multiple clients without switching tools. Content pillars, brand voice, and scheduling \u2014 all in one place.',
  },
  {
    headline: ['Analytics that tell you what\u2019s', 'actually working.'],
    italicWord: 'actually',
    body: 'Real Instagram insights per post, per client. Know what content drives reach before you generate more.',
  },
]

const INTERVAL = 4000

export function AuthSlider() {
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % SLIDES.length)
    }, INTERVAL)
  }

  useEffect(() => {
    startTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function goTo(n: number) {
    setCurrent(n)
    startTimer()
  }

  const slide = SLIDES[current]!

  return (
    <div className="flex flex-col justify-end flex-1 pb-1 relative">
      {/* Slide content */}
      <div className="min-h-[160px] relative">
        {SLIDES.map((s, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-all duration-500"
            style={{
              opacity: i === current ? 1 : 0,
              transform: i === current ? 'translateY(0)' : 'translateY(10px)',
              pointerEvents: i === current ? 'auto' : 'none',
            }}
          >
            <h2
              className="mb-3 leading-snug"
              style={{
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontSize: '28px',
                fontWeight: 400,
                color: '#ECE8E1',
              }}
            >
              {s.headline.map((line, li) => (
                <span key={li}>
                  {line.split(' ').map((word, wi) => (
                    <span key={wi}>
                      {word === s.italicWord
                        ? <em style={{ fontStyle: 'italic', color: '#C07B55' }}>{word}</em>
                        : word
                      }
                      {' '}
                    </span>
                  ))}
                  {li < s.headline.length - 1 && <br />}
                </span>
              ))}
            </h2>
            <p style={{ fontSize: '13px', color: 'rgba(236,232,225,0.42)', lineHeight: 1.75, maxWidth: '290px' }}>
              {s.body}
            </p>
          </div>
        ))}
      </div>

      {/* Dot navigation */}
      <div className="flex gap-2 mt-6">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.3s, transform 0.3s',
              background: i === current ? '#C07B55' : 'rgba(236,232,225,0.2)',
              transform: i === current ? 'scale(1.2)' : 'scale(1)',
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Component renders without errors when imported
- [ ] Slides advance every 4 seconds
- [ ] Clicking a dot jumps to that slide and resets the timer

---

## Step 2 — Create `AuthLayout` component

> **File:** `src/components/auth/auth-layout.tsx`

Server component. Shared split-panel wrapper used by both login and signup pages.
Accepts `children` for the right panel (the form).

```tsx
import { AuthSlider } from './auth-slider'

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">

      {/* Left panel — dark slate with logo + slider */}
      <div
        className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
        style={{ width: '52%', background: '#1A2630', flexShrink: 0 }}
      >
        {/* Background rings — decorative */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 400 600"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <ellipse cx="350" cy="300" rx="240" ry="240" stroke="rgba(236,232,225,0.03)" strokeWidth="70"/>
          <ellipse cx="350" cy="300" rx="160" ry="160" stroke="rgba(192,123,85,0.05)" strokeWidth="40"/>
          <ellipse cx="350" cy="300" rx="80" ry="80" stroke="rgba(236,232,225,0.04)" strokeWidth="20"/>
        </svg>

        {/* Logo mark */}
        <div className="relative z-10 inline-block" style={{
          borderLeft: '1.5px solid #C07B55',
          borderRight: '1.5px solid #C07B55',
          borderTop: '0.5px solid rgba(236,232,225,0.2)',
          borderBottom: '0.5px solid rgba(236,232,225,0.2)',
          padding: '18px 24px',
        }}>
          <div style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontSize: '32px',
            fontWeight: 400,
            color: '#ECE8E1',
            letterSpacing: '5px',
          }}>
            KONTUUR
          </div>
          <div style={{
            fontSize: '9px',
            color: '#C07B55',
            letterSpacing: '8px',
            marginTop: '6px',
          }}>
            SOCIAL INTELLIGENCE
          </div>
        </div>

        {/* Slider */}
        <div className="relative z-10 flex-1 flex flex-col justify-end pt-12">
          <AuthSlider />
        </div>
      </div>

      {/* Right panel — warm off-white with form */}
      <div
        className="flex flex-1 flex-col items-center justify-center p-8 lg:p-12"
        style={{ background: '#F4EFE6' }}
      >
        {/* Mobile logo — shown only below lg breakpoint */}
        <div className="flex lg:hidden mb-10 inline-block" style={{
          borderLeft: '1.5px solid #C07B55',
          borderRight: '1.5px solid #C07B55',
          borderTop: '0.5px solid rgba(44,62,80,0.2)',
          borderBottom: '0.5px solid rgba(44,62,80,0.2)',
          padding: '14px 20px',
        }}>
          <div style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontSize: '24px',
            fontWeight: 400,
            color: '#1A2630',
            letterSpacing: '4px',
          }}>
            KONTUUR
          </div>
          <div style={{ fontSize: '8px', color: '#C07B55', letterSpacing: '6px', marginTop: '4px' }}>
            SOCIAL INTELLIGENCE
          </div>
        </div>

        {/* Form content passed from page */}
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>

    </div>
  )
}
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Left panel renders on lg+ screens, hidden on mobile
- [ ] Mobile logo shows on small screens
- [ ] Right panel takes full width on mobile, 48% on desktop
- [ ] `children` renders correctly inside the right panel

---

## Step 3 — Update login page

> **File:** `src/app/(auth)/login/page.tsx` *(confirm actual path first)*

Wrap the existing form in `AuthLayout`. Update form field styles only.
**Do not touch:** server actions, form state, error handling, redirect logic.

```tsx
import { AuthLayout } from '@/components/auth/auth-layout'

export default function LoginPage() {
  return (
    <AuthLayout>
      {/* ---- Keep all existing form JSX here ---- */}
      {/* Only update className/style props on the wrapper, inputs, button, links */}
      {/* DO NOT change: form action, input names, error display logic, redirects */}

      <div>
        <h3 style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: '24px',
          fontWeight: 400,
          color: '#1A2630',
          marginBottom: '4px',
        }}>
          Welcome back
        </h3>
        <p style={{ fontSize: '13px', color: '#8A8070', marginBottom: '32px' }}>
          Sign in to your account
        </p>

        {/* Existing form — update input/button styles per style guide below */}
      </div>
    </AuthLayout>
  )
}
```

**Input style** (apply to all form inputs):
```
background: #fff
border: 1px solid rgba(44,62,80,0.14)
border-radius: 4px
padding: 12px 14px
font-size: 13px
color: #1A2630
focus border-color: #C07B55
```

**Label style:**
```
font-size: 10px
font-weight: 500
color: #1A2630
letter-spacing: 2px
text-transform: uppercase
margin-bottom: 8px
```

**Primary button style:**
```
background: #1A2630
color: #ECE8E1
border-radius: 4px
padding: 13px
font-size: 10px
letter-spacing: 2.5px
text-transform: uppercase
hover background: #C07B55
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Login page renders with split layout on desktop
- [ ] Login page is full-width on mobile
- [ ] Form submits correctly — existing server action still fires
- [ ] Error states still display (test with wrong credentials)
- [ ] "Forgot password" and "Sign up" links still work

---

## Step 4 — Update signup page

> **File:** `src/app/(auth)/signup/page.tsx` *(confirm actual path first)*

Same pattern as Step 3. Wrap in `AuthLayout`, update styles, keep all logic.

The signup page has additional elements — apply these styles:

**Use case selector cards** (the "Agency / Solo" option cards):
```
background: #fff
border: 1px solid rgba(44,62,80,0.14)
border-radius: 4px
padding: 12px 14px
selected border: 1px solid #1A2630
hover border-color: #C07B55
```

**Left panel copy for signup** — update `AuthSlider` is the same component,
no changes needed. The slider works for both pages.

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Signup page renders with split layout
- [ ] Use case selector cards style correctly — selected state visible
- [ ] Form submits — existing server action fires
- [ ] "Already have an account? Sign in" link works
- [ ] Password validation still triggers

---

## Step 5 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Visual checks
- [ ] Login and signup pages use identical left panel (same logo, same slider)
- [ ] Slider advances automatically every 4 seconds on both pages
- [ ] All four slides display correctly with italic accent word
- [ ] Dot navigation works — clicking jumps to slide and resets timer
- [ ] Forms are visually consistent — same input style, label style, button style
- [ ] Mobile layout: left panel hidden, form full-width, mobile logo visible

### Functional checks
- [ ] Login with correct credentials — redirects to dashboard
- [ ] Login with wrong credentials — error message displays
- [ ] Signup with valid data — account created, redirects correctly
- [ ] Signup with duplicate email — error displays
- [ ] Forgot password link navigates correctly
- [ ] Sign up / Sign in cross-links work

### Responsive checks
- [ ] lg breakpoint (1024px): split layout visible
- [ ] md and below: single column, mobile logo shown, form centred

---

## What is NOT changed

| File | Why |
|---|---|
| Form server actions | Logic unchanged — only presentation |
| Auth middleware | Not affected |
| Supabase auth helpers | Not affected |
| Dashboard layout | Not affected |
| Any other page | Not affected |
| `STYLE_GUIDE.md` | Add new auth tokens after implementation |

---

## Implementation order for Claude Code

```
Step 1 → auth-slider.tsx        (isolated component, test in isolation)
Step 2 → auth-layout.tsx        (depends on slider)
         ↑ verify both components compile before touching pages
Step 3 → login/page.tsx         (wrap in layout, update styles only)
Step 4 → signup/page.tsx        (same pattern as login)
Step 5 → end-to-end verification
```

---

*Kontuur — Auth Pages Redesign Plan*
*Keep all form logic unchanged. Visual presentation only.*