# Forgot Password Page Redesign Plan

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

# Find the actual forgot password page path
find src -name "*.tsx" | xargs grep -l "Reset your password\|forgot\|reset-password" | head -5
```

Update the file path in the steps below if it differs from
`src/app/(auth)/forgot-password/page.tsx`.

---

## What Changes

The forgot password page currently has:
- Plain grey centred layout
- Logo mark at top
- Single email input in a white card
- Send reset link button
- Back to sign in link

After this plan:
- Split panel layout via `AuthLayout`
- Left panel: static copy (no slider on this page — see rationale below)
- Two distinct UI states: form state and success state
- Updated field, label, button styles matching login and signup
- All existing server action and reset logic unchanged

### Why no slider on the left panel

The forgot password page is a recovery flow — the user is stressed and focused on
one task. A rotating slider would be distracting. The left panel uses static copy
instead, and the copy changes between the two states (form → success) to feel
responsive to where the user is.

---

## Files Modified

| File | Change |
|---|---|
| `src/app/(auth)/forgot-password/page.tsx` | UPDATE — split layout, two states, restyle |
| `src/components/auth/auth-layout.tsx` | UPDATE — add optional `staticCopy` prop |

---

## Step 1 — Add `staticCopy` prop to `AuthLayout`

> **File:** `src/components/auth/auth-layout.tsx`

The forgot password page needs static left panel copy instead of the slider.
Add an optional `staticCopy` prop. When provided, it replaces the slider.
When absent, the slider renders as before — login and signup pages are unaffected.

```tsx
interface AuthLayoutProps {
  children: React.ReactNode
  staticCopy?: {
    headline: string          // plain text — italic word handled separately
    italicWord?: string       // optional word to render in terracotta italic
    body: string
  }
}

export function AuthLayout({ children, staticCopy }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <div
        className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
        style={{ width: '52%', background: '#1A2630', flexShrink: 0 }}
      >
        {/* Background rings — unchanged */}
        ...

        {/* Logo mark — unchanged */}
        ...

        {/* Conditional: static copy OR slider */}
        <div className="relative z-10 flex-1 flex flex-col justify-end pt-12">
          {staticCopy ? (
            <div>
              <h2 style={{
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontSize: '28px',
                fontWeight: 400,
                color: '#ECE8E1',
                lineHeight: 1.4,
                marginBottom: '12px',
              }}>
                {staticCopy.italicWord
                  ? staticCopy.headline.split(staticCopy.italicWord).map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <em style={{ fontStyle: 'italic', color: '#C07B55' }}>
                            {staticCopy.italicWord}
                          </em>
                        )}
                      </span>
                    ))
                  : staticCopy.headline
                }
              </h2>
              <p style={{
                fontSize: '13px',
                color: 'rgba(236,232,225,0.42)',
                lineHeight: 1.75,
                maxWidth: '290px',
              }}>
                {staticCopy.body}
              </p>
            </div>
          ) : (
            <AuthSlider />
          )}
        </div>
      </div>

      {/* Right panel — unchanged */}
      <div
        className="flex flex-1 flex-col items-center justify-center p-8 lg:p-12"
        style={{ background: '#F4EFE6' }}
      >
        ...
        {children}
        ...
      </div>
    </div>
  )
}
```

### ✓ Step 1 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Login page still renders slider (no `staticCopy` prop passed) — unaffected
- [ ] Signup page still renders slider — unaffected
- [ ] `staticCopy` prop is optional — no breaking changes to existing pages

---

## Step 2 — Build the form state

> **File:** `src/app/(auth)/forgot-password/page.tsx`

The form state is what the user sees on first load. It has:
- Back to sign in link at the top
- Heading and subtitle
- Email input
- Send reset link button
- Helper note about spam folder

Wrap the existing form in `AuthLayout` with static copy. Keep all existing
server action logic, form state, and error handling unchanged.

```tsx
import { AuthLayout } from '@/components/auth/auth-layout'

const FORM_COPY = {
  headline: 'Back in your account in minutes.',
  italicWord: 'minutes.',
  body: 'Enter your email and we will send you a secure reset link. It arrives within a minute.',
}

export default function ForgotPasswordPage() {
  // Keep all existing state, hooks, server actions here — unchanged

  return (
    <AuthLayout staticCopy={FORM_COPY}>
      <div style={{ width: '100%', maxWidth: '320px' }}>

        {/* Back link */}
        <a
          href="/login"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: '#8A8070',
            textDecoration: 'none',
            letterSpacing: '0.3px',
            marginBottom: '32px',
          }}
        >
          ← Back to sign in
        </a>

        {/* Heading */}
        <h3 style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: '24px',
          fontWeight: 400,
          color: '#1A2630',
          marginBottom: '4px',
        }}>
          Reset your password
        </h3>
        <p style={{ fontSize: '13px', color: '#8A8070', marginBottom: '32px', lineHeight: 1.6 }}>
          Enter your email and we'll send you a reset link.
        </p>

        {/* Existing form — update input/button styles only */}
        {/* Keep: form action, input name="email", error display */}

        {/* Email field */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            fontWeight: 500,
            color: '#1A2630',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Email
          </label>
          {/* Keep existing input — add style only */}
          <input
            type="email"
            name="email"   {/* keep existing name attribute */}
            placeholder="you@agency.com"
            style={{
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
          />
        </div>

        {/* Submit button — keep existing type and action */}
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
            marginTop: '4px',
          }}
        >
          Send reset link
        </button>

        {/* Helper note */}
        <div style={{
          marginTop: '20px',
          padding: '14px',
          background: 'rgba(44,62,80,0.05)',
          borderLeft: '2px solid #C07B55',
          borderRadius: '0 4px 4px 0',
        }}>
          <p style={{ fontSize: '11px', color: '#8A8070', lineHeight: 1.65 }}>
            If you don't receive an email within a few minutes, check your spam
            folder or make sure you're using the address you signed up with.
          </p>
        </div>

      </div>
    </AuthLayout>
  )
}
```

### ✓ Step 2 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Page renders with split layout — dark left panel, warm right panel
- [ ] Left panel shows static copy — no slider
- [ ] Back link is visible above the heading
- [ ] Form submits — existing server action still fires
- [ ] Error state still displays (test with invalid email)

---

## Step 3 — Build the success state

> **File:** `src/app/(auth)/forgot-password/page.tsx`

After the reset email is sent, the page switches to a success confirmation state.
The left panel copy also changes to reflect the new context.

The existing page likely uses a boolean state variable (e.g. `emailSent`,
`submitted`, `success`) to toggle between form and success views. Find that
variable and use it to conditionally render both the `staticCopy` prop and
the right panel content.

```tsx
const FORM_COPY = {
  headline: 'Back in your account in minutes.',
  italicWord: 'minutes.',
  body: 'Enter your email and we will send you a secure reset link. It arrives within a minute.',
}

const SUCCESS_COPY = {
  headline: 'Check your inbox.',
  italicWord: 'inbox.',
  body: 'The reset link is on its way. It expires in 60 minutes — use it before then.',
}

// In the component return:
<AuthLayout staticCopy={emailSent ? SUCCESS_COPY : FORM_COPY}>
  {emailSent ? <SuccessState email={submittedEmail} /> : <FormState />}
</AuthLayout>
```

**Success state content:**

```tsx
function SuccessState({ email }: { email: string }) {
  return (
    <div style={{ width: '100%', maxWidth: '320px', textAlign: 'center' }}>

      {/* Email icon in terracotta circle */}
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        border: '1.5px solid #C07B55',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 24px',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="#C07B55" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
        </svg>
      </div>

      {/* Heading */}
      <h3 style={{
        fontFamily: 'var(--font-display, Georgia, serif)',
        fontSize: '24px',
        fontWeight: 400,
        color: '#1A2630',
        marginBottom: '8px',
      }}>
        Check your email
      </h3>

      <p style={{ fontSize: '13px', color: '#8A8070', lineHeight: 1.7, marginBottom: '8px' }}>
        We sent a password reset link to
      </p>

      {/* Email chip */}
      <div style={{
        display: 'inline-block',
        background: '#ffffff',
        border: '1px solid rgba(44,62,80,0.14)',
        borderRadius: '4px',
        padding: '6px 12px',
        fontSize: '12px',
        color: '#1A2630',
        fontWeight: 500,
        marginBottom: '28px',
      }}>
        {email}
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(44,62,80,0.1)' }}/>
        <span style={{ fontSize: '10px', color: '#B4A898', letterSpacing: '1px' }}>OR</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(44,62,80,0.1)' }}/>
      </div>

      {/* Resend link — keep existing resend logic if it exists */}
      <p style={{ fontSize: '11px', color: '#8A8070', marginBottom: '16px' }}>
        Didn't receive it?{' '}
        <a href="#" style={{ color: '#C07B55', textDecoration: 'none' }}>
          Resend email
        </a>
      </p>

      {/* Back link */}
      <a
        href="/login"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          fontSize: '11px',
          color: '#8A8070',
          textDecoration: 'none',
          width: '100%',
        }}
      >
        ← Back to sign in
      </a>

    </div>
  )
}
```

### ✓ Step 3 Verification
- [ ] `npx tsc --noEmit` — no errors
- [ ] Success state renders after form is submitted with a valid email
- [ ] Submitted email address displays correctly in the chip
- [ ] Left panel copy changes to "Check your inbox" in success state
- [ ] Resend link is visible
- [ ] Back to sign in link navigates to login

---

## Step 4 — End-to-end verification

```bash
npx tsc --noEmit
npm run build
```

### Visual checks
- [ ] Form state: split layout, static copy on left, form on right
- [ ] Success state: split layout, updated copy on left, confirmation on right
- [ ] Left panel copy transitions correctly between form and success
- [ ] All three auth pages (login, signup, forgot password) use consistent:
  - Same input style
  - Same label style
  - Same button style
  - Same left panel background and logo mark

### Functional checks
- [ ] Submit valid email → transitions to success state
- [ ] Submit invalid email format → validation error displays
- [ ] Submit email not in system → success state still shows
  (security best practice — never confirm whether email exists)
- [ ] Resend email link works if existing logic supports it
- [ ] Back to sign in navigates to `/login`
- [ ] Mobile layout: single column, form centred

### Consistency check across all auth pages

| Element | Login | Signup | Forgot password |
|---|---|---|---|
| Left panel background | #1A2630 | #1A2630 | #1A2630 |
| Logo mark | ✓ | ✓ | ✓ |
| Left panel content | Slider | Slider | Static copy |
| Right panel background | #F4EFE6 | #F4EFE6 | #F4EFE6 |
| Input style | White, subtle border | White, subtle border | White, subtle border |
| Button style | Slate, terracotta hover | Slate, terracotta hover | Slate, terracotta hover |

---

## What is NOT changed

| File / Attribute | Why |
|---|---|
| Server action for sending reset email | Business logic — not in scope |
| Email validation logic | Not in scope |
| Redirect after reset link clicked | Not in scope — separate page |
| Input `name`, `type`, `required` | Form submission depends on these |
| `AuthSlider` component | No changes needed |
| Login page | Not affected |
| Signup page | Not affected |

---

## Implementation order for Claude Code

```
Step 1 → auth-layout.tsx            (add staticCopy prop — verify login/signup unaffected)
Step 2 → forgot-password/page.tsx   (form state with static left copy)
Step 3 → forgot-password/page.tsx   (success state + left copy swap)
Step 4 → end-to-end verification
```

---

*Kontuur — Forgot Password Page Redesign Plan*
*Prerequisite: AuthSlider and AuthLayout must exist before starting.*
*Change visual presentation only. All reset email logic stays unchanged.*