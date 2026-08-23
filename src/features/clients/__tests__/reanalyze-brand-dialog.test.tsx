import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReanalyzeBrandDialog } from '../components/settings/reanalyze-brand-dialog'
import type { BrandSuggestion } from '@/features/clients/lib/brand-suggestion'

/**
 * The opt-out is the whole safety mechanism here: this dialog proposes overwriting pillars and a
 * tone someone edited by hand. If a cleared checkbox stops excluding its row, the surface still
 * looks correct and quietly applies work the reader declined.
 */
const SUGGESTIONS: BrandSuggestion[] = [
  {
    id: 'tone',
    label: 'Brand tone',
    current: 'Clinical',
    suggested: 'Warm and reassuring',
    patch: { brand: { tone: 'Warm and reassuring' } },
  },
  {
    id: 'pillars',
    label: 'Content pillars',
    current: 'Implants 50% · Whitening 50%',
    suggested: 'Patient stories 60% · Treatments explained 40%',
    patch: { brand: { contentPillars: [{ id: 'p1', pillar: 'Patient stories', weight: 60 }] } },
    parts: {
      current: [
        { id: 'c1', pillar: 'Implants', weight: 50 },
        { id: 'c2', pillar: 'Whitening', weight: 50 },
      ],
      suggested: [
        { id: 'p1', pillar: 'Patient stories', weight: 60 },
        { id: 'p2', pillar: 'Treatments explained', weight: 40 },
      ],
    },
  },
]

function setup(suggestions = SUGGESTIONS) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(
    <ReanalyzeBrandDialog open onClose={onClose} suggestions={suggestions} onApply={onApply} />
  )
  return { onApply, onClose, user: userEvent.setup() }
}

describe('ReanalyzeBrandDialog', () => {
  it('shows what each suggestion would replace', () => {
    setup()
    expect(screen.getByText('Clinical')).toBeInTheDocument()
    expect(screen.getByText('Warm and reassuring')).toBeInTheDocument()
  })

  it('names each pillar and its share rather than running the set into one line', () => {
    // The joined string is what this row used to render, and four pillars of it is a paragraph
    // nobody can compare against another paragraph.
    setup()
    expect(
      screen.queryByText('Patient stories 60% · Treatments explained 40%')
    ).not.toBeInTheDocument()
    for (const name of ['Implants', 'Whitening', 'Patient stories', 'Treatments explained']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getAllByText('50%')).toHaveLength(2)
  })

  it('says so when a field has nothing set rather than showing a blank', () => {
    setup([{ ...SUGGESTIONS[0]!, current: '' }])
    expect(screen.getByText('Not set')).toBeInTheDocument()
  })

  it('starts with every row accepted', async () => {
    const { onApply, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Apply 2 changes' }))
    expect(onApply).toHaveBeenCalledWith(SUGGESTIONS)
  })

  it('applies only the rows still ticked', async () => {
    const { onApply, user } = setup()
    await user.click(screen.getByRole('checkbox', { name: /Brand tone/ }))
    await user.click(screen.getByRole('button', { name: 'Apply 1 change' }))
    expect(onApply).toHaveBeenCalledWith([SUGGESTIONS[1]])
  })

  it('cannot apply nothing', async () => {
    const { onApply, user } = setup()
    await user.click(screen.getByRole('checkbox', { name: /Brand tone/ }))
    await user.click(screen.getByRole('checkbox', { name: /Content pillars/ }))
    expect(screen.getByRole('button', { name: /Apply 0 changes/ })).toBeDisabled()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('shows a row’s consequence only while that row is ticked', async () => {
    const warning =
      '2 sources scoped to the pillars this replaces will go back to feeding every pillar.'
    const { user } = setup([{ ...SUGGESTIONS[1]!, warning }])
    expect(screen.getByText(warning)).toBeInTheDocument()

    // Untick it and the consequence stops applying, so it stops being stated.
    await user.click(screen.getByRole('checkbox', { name: /Content pillars/ }))
    expect(screen.queryByText(warning)).not.toBeInTheDocument()
  })

  it('closes without applying', async () => {
    const { onApply, onClose, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
  })
})
