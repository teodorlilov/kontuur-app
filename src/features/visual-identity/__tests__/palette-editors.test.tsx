import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { VisualIdentity } from '@/types/visual'
import { VisualIdentityPanel } from '../components/visual-identity-panel'
import { BRAND_STYLES } from '@/lib/visual/brand-styles'
import { getFontEntry } from '@/lib/canvas/font-library'
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

/**
 * The type pairing is the client's, and it must survive being chosen.
 *
 * Fonts are resolved through `fontsFor(identity)` at four call sites — the seeder's three text
 * roles and the editor's lockup context. All four fall back to the brand style, so a stored pairing
 * that fails to reach the identity blob does not error: it silently renders in the style's faces and
 * looks exactly like the feature never landed.
 */
describe('the brand type pairing', () => {
  it('stores a chosen pairing on the identity without disturbing the palette', () => {
    const onChange = vi.fn()
    render(<VisualIdentityPanel identity={BLUE} onChange={onChange} />)

    const headline = screen.getByLabelText('Headline')
    fireEvent.change(headline, { target: { value: 'Fira Sans' } })

    const next = onChange.mock.calls[0]![0] as VisualIdentity
    expect(next.fonts?.display).toBe('Fira Sans')
    expect(next.palette).toEqual(BLUE.palette)
    // Unlike a colour edit, a font change leaves the cached prompt description alone — it describes
    // colour and says nothing about type.
    expect(next.palette_description).toBe(BLUE.palette_description)
  })

  it('shows the brand style’s own faces until the client chooses otherwise', () => {
    render(<VisualIdentityPanel identity={BLUE} onChange={vi.fn()} />)
    const style = BRAND_STYLES[BLUE.style]
    expect(screen.getByLabelText<HTMLSelectElement>('Headline').value).toBe(style.fonts.display)
    expect(screen.getByLabelText<HTMLSelectElement>('Body').value).toBe(style.fonts.body)
  })

  /** A body face has to be readable at 26px; a display face is not offered for that slot. */
  it('never offers a display face for body copy', () => {
    render(<VisualIdentityPanel identity={BLUE} onChange={vi.fn()} />)
    const body = screen.getByLabelText<HTMLSelectElement>('Body')
    const offered = [...body.options].map((option) => option.value)
    expect(offered).not.toContain('Dela Gothic One')
    expect(offered).toContain('Inter')
  })
})

describe('the font lists and the client’s language', () => {
  it('offers only Cyrillic-capable faces to a Bulgarian client', () => {
    render(<VisualIdentityPanel identity={BLUE} onChange={vi.fn()} language="Bulgarian" />)
    const offered = [...screen.getByLabelText<HTMLSelectElement>('Headline').options]
    expect(offered.length).toBeGreaterThan(3)
    for (const option of offered) {
      expect(getFontEntry(option.value)?.cyrillic, `${option.value} offered to Bulgarian`).toBe(
        true
      )
    }
  })

  it('offers the whole library when the language is Latin', () => {
    render(<VisualIdentityPanel identity={BLUE} onChange={vi.fn()} language="English" />)
    const offered = [...screen.getByLabelText<HTMLSelectElement>('Headline').options].map(
      (option) => option.value
    )
    expect(offered).toContain('Archivo Black')
  })

  /**
   * A `<select>` whose value matches no option silently shows the FIRST one and fires no change —
   * so the panel would claim a face the posts are not set in, with nothing to correct it. A stored
   * choice therefore survives a filter that would otherwise exclude it.
   */
  it('keeps a stored Latin-only face visible after the client switches to Bulgarian', () => {
    const latinOnly = { ...BLUE, fonts: { display: 'Archivo Black', body: 'Inter' } } as const
    render(<VisualIdentityPanel identity={latinOnly} onChange={vi.fn()} language="Bulgarian" />)
    const headline = screen.getByLabelText<HTMLSelectElement>('Headline')
    expect(headline.value).toBe('Archivo Black')
    expect([...headline.options].map((o) => o.value)).toContain('Archivo Black')
  })
})
