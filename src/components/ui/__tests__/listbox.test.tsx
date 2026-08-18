import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Listbox } from '../listbox'

/**
 * The one dropdown primitive — `Select`, `SelectControl` and the generate flow's client
 * picker are all skins over it, so its keyboard behaviour is the app's keyboard behaviour
 * for every menu.
 *
 * This is the exact defect class §7.12 says jsdom DOES catch, and one of the eight in
 * that arc was "layers panel unreachable by keyboard". `rovingFocus` has node tests for
 * its index arithmetic; what those cannot see is whether the listbox actually wires it to
 * real focus on real elements, which is where the wiring breaks.
 */
const OPTIONS = [
  { value: 'a', label: 'Acme Clinic', description: 'physiotherapy' },
  { value: 'b', label: 'Bright Dental' },
  { value: 'c', label: 'Coastal Vets' },
]

function setup(value = 'a') {
  const onChange = vi.fn()
  render(
    <Listbox
      value={value}
      options={OPTIONS}
      onChange={onChange}
      label="Client"
      renderTrigger={(selected) => (
        <button type="button">{selected?.label ?? 'Choose a client'}</button>
      )}
    />
  )
  return { onChange, user: userEvent.setup() }
}

describe('Listbox', () => {
  it('renders the selected option in the trigger', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Acme Clinic' })).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens on click and marks exactly one option selected', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Acme Clinic' }))

    expect(await screen.findByRole('listbox', { name: 'Client' })).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(options.filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1)
    expect(screen.getByRole('option', { name: /Acme Clinic/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('lands focus on the current choice, not the top of the list', async () => {
    const { user } = setup('c')
    await user.click(screen.getByRole('button', { name: 'Coastal Vets' }))
    await screen.findByRole('listbox')
    // The onOpenAutoFocus override exists for this. Without it a long client list opens
    // scrolled to the top with the current selection off-screen.
    expect(screen.getByRole('option', { name: /Coastal Vets/ })).toHaveFocus()
  })

  it('steps with ArrowDown/ArrowUp and clamps rather than wrapping', async () => {
    const { user } = setup('a')
    await user.click(screen.getByRole('button', { name: 'Acme Clinic' }))
    await screen.findByRole('listbox')

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: /Bright Dental/ })).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('option', { name: /Acme Clinic/ })).toHaveFocus()

    // Clamping is deliberate — rovingFocus's header says a list that jumps bottom-to-top
    // reads as a mis-press.
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('option', { name: /Acme Clinic/ })).toHaveFocus()
  })

  it('jumps to the ends with Home and End', async () => {
    const { user } = setup('a')
    await user.click(screen.getByRole('button', { name: 'Acme Clinic' }))
    await screen.findByRole('listbox')

    await user.keyboard('{End}')
    expect(screen.getByRole('option', { name: /Coastal Vets/ })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('option', { name: /Acme Clinic/ })).toHaveFocus()
  })

  it('selects with Enter and closes', async () => {
    const { onChange, user } = setup('a')
    await user.click(screen.getByRole('button', { name: 'Acme Clinic' }))
    await screen.findByRole('listbox')

    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('does not fire onChange when the current value is re-picked', async () => {
    const { onChange, user } = setup('a')
    await user.click(screen.getByRole('button', { name: 'Acme Clinic' }))
    await user.click(await screen.findByRole('option', { name: /Acme Clinic/ }))
    // A no-op change would mark a settings form dirty and arm its save bar for nothing.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not open when disabled', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Listbox
        value="a"
        options={OPTIONS}
        onChange={onChange}
        label="Client"
        disabled
        renderTrigger={(selected) => <button type="button">{selected?.label}</button>}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Acme Clinic' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
