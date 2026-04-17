# Signup Page Redesign Plan

> **For Claude Code:** This plan assumes `AuthSlider` and `AuthLayout` from
> `AUTH_REDESIGN_PLAN.md` Steps 1 and 2 are already built and verified.
> Do not start this plan until both components exist and compile cleanly.
> Run `npx tsc --noEmit` after each step. Do not modify files not listed here.

---

## Prerequisites

Before starting, confirm these files exist:

```bash
# Shared components must already exist
ls src/components/auth/auth-slider.tsx
ls src/components/auth/auth-layout.tsx

# Find the actual signup page path
find src -name "*.tsx" | xargs grep -l "Create account\|signup\|register" | head -5
```

Update the file path in Step 1 below if it differs from `src/app/(auth)/signup/page.tsx`.

---

## What Changes

The signup page currently has:
- Plain grey centred layout
- Logo mark at top
- Form card with white background and rounded corners
- Business name, email, password fields
- Two use case selector cards (Agency / Solo)
- Create account button
- "Already have an account? Sign in" link

After this plan:
- Split panel layout via `AuthLayout` — dark left panel with slider, warm right panel
- Updated field styles, label styles, button style
- Use case selector cards restyled to match design system
- All existing form logic, server actions, validation, error handling unchanged

---

## Design Tokens (same as auth system)

```
background right panel:  #F4EFE6
primary text:            #1A2630
secondary text:          #8A8070
accent:                  #C07B55
input background:        #ffffff
input border:            rgba(44, 62, 80, 0.14)
input border focus:      #C07B55
input text:              #1A2630
input placeholder:       #C4BAB0
card selected border:    #1A2630
card hover border:       #C07B55
button background:       #1A2630
button text:             #ECE8E1
button hover:            #C07B55
```

---

## Files Modified

| File | Change |
|---|---|
| `src/app/(auth)/signup/page.tsx` | UPDATE — wrap in AuthLayout, restyle form elements |

Only one file changes. `AuthSlider` and `AuthLayout` are already built.

---

## Step 1 — Wrap signup page in AuthLayout

> **File:** `src/app/(auth)/signup/page.tsx`

Wrap the entire page return in `<AuthLayout>`. The form content becomes the
`children` prop rendered in the right panel.

**Do not change:**
- Form `action` or `method`
- Input `name` attributes
- Server action imports or calls
- Error state variables and display logic
- Redirect logic
- Any `useFormState`, `useFormStatus`, or similar hooks

```tsx
import { AuthLayout } from '@/components/auth/auth-layout'

export default function SignupPage() {
  return (
    <AuthLayout>
      {/* All existing form JSX moves here — unchanged */}
    </AuthLayout>
  )
}
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Page renders with split panel layout — dark left, warm right
- [ ] Slider visible and advancing in left panel
- [ ] Mobile: left panel hidden, form full-width, mobile logo shown
- [ ] Form still submits (do not test with real data yet — just confirm no console errors)

---

## Step 2 — Update page heading and subtext

> **File:** `src/app/(auth)/signup/page.tsx`

Find the heading "Create your account" and subtitle "14-day free trial, no card required".
Update their styles only — do not change the text content.

```tsx
<h3 style={{
  fontFamily: 'var(--font-display, Georgia, serif)',
  fontSize: '24px',
  fontWeight: 400,
  color: '#1A2630',
  marginBottom: '4px',
}}>
  Create your account
</h3>
<p style={{
  fontSize: '13px',
  color: '#8A8070',
  marginBottom: '32px',
}}>
  14-day free trial, no card required
</p>
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Heading renders in Playfair Display at correct weight
- [ ] Subtitle is muted — lighter than heading

---

## Step 3 — Update form field styles

> **File:** `src/app/(auth)/signup/page.tsx`

Update the visual style of the three form fields: Business name, Email, Password.
Change only `className` or `style` props on the wrapping `div`, `label`, and `input`.
Do not touch `name`, `type`, `id`, `required`, `minLength`, or any other functional attribute.

**Label style** — apply to all three field labels:
```tsx
<label style={{
  display: 'block',
  fontSize: '10px',
  fontWeight: 500,
  color: '#1A2630',
  letterSpacing: '2px',
  textTransform: 'uppercase',
  marginBottom: '8px',
}}>
```

**Input style** — apply to all three inputs:
```tsx
<input style={{
  width: '100%',
  padding: '12px 14px',
  background: '#ffffff',
  border: '1px solid rgba(44,62,80,0.14)',
  borderRadius: '4px',
  fontSize: '13px',
  color: '#1A2630',
  outline: 'none',
  fontFamily: 'inherit',
}}
onFocus={(e) => e.currentTarget.style.borderColor = '#C07B55'}
onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(44,62,80,0.14)'}
/>
```

> If the project uses Tailwind for inputs, use these classes instead:
> `className="w-full px-3.5 py-3 bg-white border border-black/[0.14] rounded text-sm
> text-[#1A2630] outline-none focus:border-[#C07B55] transition-colors"`

**Field spacing** — wrap each field in:
```tsx
<div style={{ marginBottom: '16px' }}>
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] All three inputs render with white background and subtle border
- [ ] Labels are uppercase, small, tracked
- [ ] Input border turns terracotta on focus
- [ ] Placeholder text is visibly lighter than typed text

---

## Step 4 — Update use case selector cards

> **File:** `src/app/(auth)/signup/page.tsx`

The two option cards ("I manage social media for clients" / "I manage my own business
socials") need restyling. The selection logic stays exactly as-is — only the visual
presentation of the selected and unselected states changes.

**Unselected card:**
```tsx
<div style={{
  padding: '12px 14px',
  background: '#ffffff',
  border: '1px solid rgba(44,62,80,0.14)',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'border-color 0.2s',
}}>
```

**Selected card** (add to whichever card is currently active):
```tsx
style={{
  padding: '12px 14px',
  background: '#ffffff',
  border: '1px solid #1A2630',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'border-color 0.2s',
}}
```

**Card title text:**
```tsx
<div style={{ fontSize: '13px', fontWeight: 500, color: '#1A2630' }}>
  I manage social media for clients
</div>
```

**Card subtitle text:**
```tsx
<div style={{ fontSize: '11px', color: '#9A8F82', marginTop: '2px' }}>
  Agency mode — manage multiple clients
</div>
```

**Label above the cards:**
```tsx
<span style={{
  display: 'block',
  fontSize: '10px',
  fontWeight: 500,
  color: '#1A2630',
  letterSpacing: '2px',
  textTransform: 'uppercase',
  marginBottom: '8px',
  marginTop: '4px',
}}>
  How will you use Kontuur?
</span>
```

### ✓ Step 4 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Both cards render with white background and subtle border
- [ ] Selected card has darker `#1A2630` border — visually distinct
- [ ] Clicking a card switches the selected state — existing logic still works
- [ ] Card title and subtitle text sizes are clearly different

---

## Step 5 — Update Create account button

> **File:** `src/app/(auth)/signup/page.tsx`

Update the primary button style only. Do not change the button's `type`, `disabled`
state, loading state, or any functional behaviour.

```tsx
<button
  type="submit"
  style={{
    width: '100%',
    padding: '13px',
    background: '#1A2630',
    color: '#ECE8E1',
    border: 'none',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 500,
    fontFamily: 'inherit',
    letterSpacing: '2.5px',
    textTransform: 'uppercase',
    cursor: 'pointer',
    marginTop: '8px',
    transition: 'background 0.2s',
  }}
  onMouseEnter={(e) => e.currentTarget.style.background = '#C07B55'}
  onMouseLeave={(e) => e.currentTarget.style.background = '#1A2630'}
>
  Create account
</button>
```

> If the button has a loading/pending state (e.g. shows a spinner during submission),
> preserve that logic. Only the base visual style changes.

### ✓ Step 5 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Button renders in slate with cream text
- [ ] Hover changes button to terracotta
- [ ] Disabled state still visually indicates disabled (if it exists)
- [ ] Loading/pending state still shows (if it exists)

---

## Step 6 — Update footer link

> **File:** `src/app/(auth)/signup/page.tsx`

Update the "Already have an account? Sign in" link style at the bottom of the form.

```tsx
<div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: '#8A8070' }}>
  Already have an account?{' '}
  <a href="/login" style={{ color: '#C07B55', textDecoration: 'none' }}>
    Sign in
  </a>
</div>
```

Keep the existing `href` — do not change the link destination.

### ✓ Step 6 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Link text is muted grey, "Sign in" is terracotta
- [ ] Link navigates to login page correctly

---

## Step 7 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Visual checks — compare against the mockup
- [ ] Left panel: dark slate, Kontuur logo in terracotta-border frame, slider advancing
- [ ] Right panel: warm off-white `#F4EFE6` background
- [ ] Heading: Playfair Display, slate, light weight
- [ ] All inputs: white background, subtle border, terracotta focus ring
- [ ] Labels: uppercase, small caps, tracked
- [ ] Use case cards: clean white with border, selected state clearly distinct
- [ ] Button: slate background, cream text, terracotta on hover
- [ ] Footer link: muted text with terracotta accent

### Functional checks — nothing should break
- [ ] Submit with all fields valid → account created, redirects correctly
- [ ] Submit with missing fields → validation errors display
- [ ] Submit with duplicate email → error message displays
- [ ] Password too short → validation triggers
- [ ] Use case card selection persists through form submission
- [ ] "Sign in" link navigates to login page
- [ ] Mobile layout: single column, form centred, mobile logo visible

### Consistency check with login page
- [ ] Input style matches login page inputs exactly
- [ ] Button style matches login page button exactly
- [ ] Label style matches login page labels exactly
- [ ] Left panel is identical — same logo, same slider, same background

---

## What is NOT changed

| Attribute / File | Why |
|---|---|
| Input `name`, `type`, `id`, `required` | Form submission depends on these |
| Server action imports and calls | Business logic — not in scope |
| Error state variables and display | Validation logic — not in scope |
| `useFormState` / `useFormStatus` hooks | React form state — not in scope |
| Redirect after successful signup | Auth flow — not in scope |
| `AuthSlider` component | Already built in Step 1 of main plan |
| `AuthLayout` component | Already built in Step 2 of main plan |
| Login page | Separate plan — do not touch |

---

## Implementation order for Claude Code

```
Step 1 → Wrap in AuthLayout           (layout shell — verify slider appears)
Step 2 → Heading and subtext styles   (typography only)
Step 3 → Form field styles            (inputs and labels)
Step 4 → Use case selector cards      (selection logic unchanged)
Step 5 → Create account button        (hover state, loading state preserved)
Step 6 → Footer link                  (style only)
Step 7 → End-to-end verification
```

---

*Kontuur — Signup Page Redesign Plan*
*Prerequisite: AuthSlider and AuthLayout must exist before starting.*
*Change visual presentation only. All form logic stays unchanged.*