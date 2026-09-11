import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BrandStyleId } from '@/lib/visual/brand-styles'
import { BrandStylePicker } from '../components/brand-style-picker'
import { BrandStyleDialog } from '../components/brand-style-dialog'

/**
 * This is the only path by which `identity.style` is set, on the settings panel and the onboarding
 * sheet alike, and it is the one place in the feature where choosing is deliberately split from
 * previewing.
 *
 * Both consequences are silent when they break. An emit on a row click arms a save bar the user
 * never armed; an emit on cancel writes a style they looked at and rejected. Neither shows up as an
 * error — the client simply starts generating in a look nobody picked.
 *
 * The reopen case is the one that catches a real regression rather than a hypothetical: the dialog
 * is mounted only while open precisely so an abandoned preview cannot outlive a cancel, and an
 * editor who folds that back into an `open` prop breaks it without touching a line of this test.
 */

/** Holds the applied style the way both real callers do — in a draft the picker writes back into. */
function Harness({ onChange }: { onChange: (style: BrandStyleId) => void }) {
  const [value, setValue] = useState<BrandStyleId>('clinical-luxury')
  return (
    <BrandStylePicker
      value={value}
      onChange={(next) => {
        onChange(next)
        setValue(next)
      }}
    />
  )
}

async function openDialog() {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<Harness onChange={onChange} />)
  await user.click(screen.getByRole('button', { name: 'Change' }))
  return { user, onChange }
}

describe('the brand style picker', () => {
  it('summarises the current style and keeps the catalogue behind a button', async () => {
    const user = userEvent.setup()
    render(<Harness onChange={vi.fn()} />)

    expect(screen.getByText('Clinical Luxury')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('dialog', { name: 'Choose a brand style' })).toBeInTheDocument()
  })

  it('previews on a row click without choosing anything', async () => {
    const { user, onChange } = await openDialog()

    const selected = screen
      .getAllByRole('option')
      .filter((option) => option.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)

    await user.click(screen.getByRole('option', { name: /Poster Grit/ }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: /Poster Grit/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('img', { name: 'Poster Grit preview' })).toBeInTheDocument()
  })

  it('commits on confirm and re-summarises', async () => {
    const { user, onChange } = await openDialog()

    await user.click(screen.getByRole('option', { name: /Poster Grit/ }))
    await user.click(screen.getByRole('button', { name: 'Use this style' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('poster-grit')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Poster Grit')).toBeInTheDocument()
  })

  it('forgets an abandoned preview when reopened', async () => {
    const { user, onChange } = await openDialog()

    await user.click(screen.getByRole('option', { name: /Poster Grit/ }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Clinical Luxury')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change' }))

    expect(screen.getByRole('option', { name: /Clinical Luxury/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('option', { name: /Poster Grit/ })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })

  it('does not commit when dismissed with Escape', async () => {
    const { user, onChange } = await openDialog()

    await user.click(screen.getByRole('option', { name: /Poster Grit/ }))
    await user.keyboard('{Escape}')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays quiet when the current style is re-confirmed', async () => {
    const { user, onChange } = await openDialog()

    await user.click(screen.getByRole('button', { name: 'Use this style' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('narrows the list to what was searched for', async () => {
    const { user } = await openDialog()

    await user.type(screen.getByRole('searchbox', { name: 'Search styles' }), 'grit')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: /Poster Grit/ })).toBeInTheDocument()
  })

  it('steps the list with the arrow keys, and clamps at the top', async () => {
    const user = userEvent.setup()
    render(<BrandStyleDialog current="graphic-editorial" onConfirm={vi.fn()} onClose={vi.fn()} />)

    const options = screen.getAllByRole('option')
    options[0]!.focus()

    await user.keyboard('{ArrowDown}')
    expect(options[1]!).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(options[0]!).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(options[0]!).toHaveFocus()
  })
})
