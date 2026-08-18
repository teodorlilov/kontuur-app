import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

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

// Radix dialogs measure and scroll-lock on open; jsdom has neither.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
