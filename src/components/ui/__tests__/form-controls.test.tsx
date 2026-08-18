import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from '../input'
import { Select, ensureOption } from '../select'
import { ToggleRow } from '../form/toggle-row'
import { Chip, ChipGroup } from '../form/chip-group'

/**
 * The form controls, tested through the accessible tree.
 *
 * These carry the app's a11y contract — `aria-invalid` on a bad field, `role="switch"`
 * with `aria-checked` rather than `aria-pressed`, `aria-pressed` on a chip because a chip
 * IS a toggle. Each of those distinctions is written down in a component comment as the
 * right call, and until now nothing checked that the component still made it.
 */

describe('Input', () => {
  it('associates its label with the control', async () => {
    const user = userEvent.setup()
    render(<Input label="Client name" />)
    // getByLabelText resolves through htmlFor/id. If that wiring breaks, clicking the
    // label stops focusing the field and a screen reader announces nothing.
    const input = screen.getByLabelText('Client name')
    await user.type(input, 'Acme')
    expect(input).toHaveValue('Acme')
  })

  it('marks itself invalid and announces the error politely', () => {
    render(<Input label="Email" error="That address is not valid" />)
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    const error = screen.getByText('That address is not valid')
    // aria-live so the message reaches a screen reader on a failed submit, when focus
    // has not moved to the field.
    expect(error).toHaveAttribute('aria-live', 'polite')
  })

  it('carries no aria-invalid when it is fine', () => {
    render(<Input label="Email" />)
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
  })
})

describe('Select', () => {
  const OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'bg', label: 'Bulgarian' },
  ]

  // The trigger's ACCESSIBLE name is its label ("Language"); the chosen option is its
  // visible text. Both matter and they are different things — a reader announces the
  // label, the user reads the value — so they are queried separately throughout.
  it('shows the placeholder when nothing is chosen', () => {
    render(
      <Select
        label="Language"
        options={OPTIONS}
        value=""
        placeholder="Choose a language"
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Language' })).toHaveTextContent('Choose a language')
  })

  it('shows the selected option once chosen', () => {
    render(<Select label="Language" options={OPTIONS} value="bg" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Language' })).toHaveTextContent('Bulgarian')
  })

  it('reports the chosen value back by value, not by event', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Select label="Language" options={OPTIONS} value="en" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Language' }))
    await user.click(await screen.findByRole('option', { name: /Bulgarian/ }))
    // The API deliberately differs from a native select — this pins it.
    expect(onChange).toHaveBeenCalledWith('bg')
  })

  it('does not open when disabled', async () => {
    const user = userEvent.setup()
    render(<Select label="Language" options={OPTIONS} value="en" onChange={vi.fn()} disabled />)
    await user.click(screen.getByRole('button', { name: 'Language' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('ensureOption', () => {
  const OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'bg', label: 'Bulgarian' },
  ]

  it('prepends a stored value the list has never heard of', () => {
    // The bug this exists for: a client saved before a language joined the list would
    // render as the FIRST option — the control showing one language while the row held
    // another, with no sign anything was wrong.
    expect(ensureOption(OPTIONS, 'sv')[0]).toEqual({ value: 'sv', label: 'sv' })
  })

  it('leaves a known value alone', () => {
    expect(ensureOption(OPTIONS, 'bg')).toEqual(OPTIONS)
  })

  it('leaves an empty value alone', () => {
    expect(ensureOption(OPTIONS, '')).toEqual(OPTIONS)
  })
})

describe('ToggleRow', () => {
  it('is a switch, not a pressed button', () => {
    render(<ToggleRow title="Auto-publish" checked={false} onChange={vi.fn()} />)
    const toggle = screen.getByRole('switch', { name: 'Auto-publish' })
    // The component comment argues switch/aria-checked over button/aria-pressed, because
    // that is what makes a reader announce "on"/"off". Pinned so it stays true.
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).not.toHaveAttribute('aria-pressed')
  })

  it('reports the value it is moving TO', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ToggleRow title="Auto-publish" checked={false} onChange={onChange} />)
    await user.click(screen.getByRole('switch', { name: 'Auto-publish' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('is operable from the keyboard', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ToggleRow title="Auto-publish" checked={false} onChange={onChange} />)
    await user.tab()
    expect(screen.getByRole('switch', { name: 'Auto-publish' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('does not fire when disabled', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ToggleRow title="Auto-publish" checked onChange={onChange} disabled />)
    await user.click(screen.getByRole('switch', { name: 'Auto-publish' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('ChipGroup', () => {
  it('names the set and exposes each chip as a toggle', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <ChipGroup label="Publishing platform">
        <Chip pressed onClick={onClick}>
          Instagram
        </Chip>
        <Chip pressed={false} onClick={onClick}>
          Facebook
        </Chip>
      </ChipGroup>
    )

    expect(screen.getByRole('group', { name: 'Publishing platform' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Instagram' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Facebook' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )

    await user.click(screen.getByRole('button', { name: 'Facebook' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire a disabled chip', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <ChipGroup label="Publishing platform">
        <Chip pressed={false} onClick={onClick} disabled>
          Facebook
        </Chip>
      </ChipGroup>
    )
    await user.click(screen.getByRole('button', { name: 'Facebook' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
