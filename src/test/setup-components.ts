import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/**
 * Placeholder env, because several modules throw at IMPORT time when it is absent
 * (`lib/supabase/server.ts`, `utils/ai-client.ts`).
 *
 * A component only has to be somewhere in a client component's import graph to drag one
 * of those in, so without this a test fails before it renders anything, with an error
 * about Supabase config that says nothing about the component. These values are never
 * used — every test that reaches the network mocks `fetch` or the module itself.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://placeholder.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'placeholder-anon-key'
process.env.NEXT_PUBLIC_APP_URL ??= 'https://placeholder.test'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'placeholder-service-role-key'
process.env.ANTHROPIC_API_KEY ??= 'placeholder-anthropic-key'

// Testing-library does not auto-clean when `globals` is set through a project config,
// and a leaked tree makes the NEXT test's `getByRole` ambiguous rather than failing
// where the leak is — which is the hardest kind of test failure to read.
afterEach(cleanup)

/**
 * jsdom implements neither of these, and React 19 + Radix call both on mount.
 *
 * Stubbed here rather than per-file: a component test that fails because the environment
 * lacks an API has told you nothing about the component, and discovering that once per
 * test file is pure tax.
 */
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Sticky headers and lazy rails observe intersection; jsdom has no viewport to intersect
// with. A no-op observer means "nothing is ever intersecting", which is the correct
// resting state for a component that has never been scrolled.
if (!window.IntersectionObserver) {
  window.IntersectionObserver = class {
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds: readonly number[] = []
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  } as unknown as typeof IntersectionObserver
}

// Radix dialogs measure and scroll-lock on open; jsdom has neither.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
