import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { VisualIdentity } from '@/types/visual'
import { VisualIdentityPanel } from '../components/visual-identity-panel'
import { DraftFieldEdit } from '@/features/onboarding/components/draft-field'
import { buildEmptyDraft } from '@/features/onboarding/lib/build-draft'
import type { DraftRowSpec } from '@/features/onboarding/lib/draft-rows'

/**
 * One invariant, asserted at both palette editors: changing the brand colours must not carry
 * `palette_description` forward.
 *
 * That description is the ONLY colour information an image prompt receives, so an identity whose
 * hexes and description disagree generates in the palette the user just rejected — silently, and
 * for every post from then on. The settings panel enforced this and the onboarding sheet did not,
 * which is exactly the kind of divergence a shared helper cannot fix on its own: nothing stops the
 * next editor from spreading the old identity again. These tests are what stops it.
 */

/** A measured blue identity, description and all — what the extractor hands the sheet. */
const BLUE: VisualIdentity = {
  palette: {
    surface: '#FFFFFF',
    ink: '#1A1A1A',
    accent: '#2563EB',
    'accent-deep': '#1E3A8A',
    line: '#E5E5E5',
  },
  style: 'clinical-luxury',
  palette_description: 'Primary accent: periwinkle blue\nDeep accent: deep cobalt blue',
}

/**
 * Set the "Primary" swatch to the tan the user actually wants.
 *
 * Matched on a prefix because the swatch's label carries its current hex alongside the role name.
 */
function recolourPrimary() {
  fireEvent.change(screen.getByLabelText(/^Primary/), { target: { value: '#CCAE7B' } })
}

describe('palette editors', () => {
  it('settings panel drops the stale description when a colour changes', () => {
    const onChange = vi.fn()
    render(<VisualIdentityPanel identity={BLUE} onChange={onChange} />)

    recolourPrimary()

    const emitted = onChange.mock.calls[0]?.[0] as VisualIdentity
    expect(emitted.palette.accent).toBe('#CCAE7B')
    expect(emitted).not.toHaveProperty('palette_description')
  })

  it('onboarding sheet drops the stale description when a colour changes', () => {
    const onChange = vi.fn()
    const spec: DraftRowSpec = {
      id: 'palette',
      group: 'system',
      label: 'Brand palette',
      kind: 'palette',
    }
    render(
      <DraftFieldEdit
        spec={spec}
        draft={{ ...buildEmptyDraft(), identity: BLUE }}
        onChange={onChange}
      />
    )

    recolourPrimary()

    const emitted = onChange.mock.calls[0]?.[0] as { identity: VisualIdentity }
    expect(emitted.identity.palette.accent).toBe('#CCAE7B')
    expect(emitted.identity).not.toHaveProperty('palette_description')
  })

  it('keeps the description when only the brand style changes — colours did not move', () => {
    const onChange = vi.fn()
    render(<VisualIdentityPanel identity={BLUE} onChange={onChange} />)

    // The card itself, not the zoom button nested inside it — both carry the style's name.
    const card = screen
      .getAllByRole('button', { name: /graphic editorial/i })
      .find((el) => el.hasAttribute('aria-pressed'))
    fireEvent.click(card!)

    const emitted = onChange.mock.calls[0]?.[0] as VisualIdentity
    expect(emitted.style).toBe('graphic-editorial')
    expect(emitted.palette_description).toBe(BLUE.palette_description)
  })
})
