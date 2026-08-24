import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NumberField } from '../components/number-field'

/**
 * The editor's numeric field, which was unusable in two directions at once.
 *
 * Typing: every keystroke was parsed and clamped, so the first digit of any value below the field's
 * minimum became that minimum — on Size, whose floor is 8, typing 12 produced 82 — and clearing the
 * box parsed as 0, because `Number('')` is 0 rather than NaN, which clamped back to 8 before a
 * second digit could be typed. Stepping: the native spinner is hidden app-wide at this width, so
 * there was nothing to click and the only way to step was a keyboard habit nothing advertised.
 */

/** Size's own range — the field the bug was reported against. */
const SIZE = { label: 'Size', min: 8, max: 400 }

function renderField(props: Partial<Parameters<typeof NumberField>[0]> = {}) {
  const onChange = vi.fn()
  render(<NumberField {...SIZE} value={96} onChange={onChange} {...props} />)
  return onChange
}

const field = (label = 'Size') => screen.getByLabelText(label)

describe('typing', () => {
  it('does not clamp a half-typed number up to the minimum', () => {
    const onChange = renderField()
    // "1" is below Size's floor of 8. Committing it would rewrite the field to 8 and turn the
    // next keystroke into 82 — the reported bug.
    fireEvent.change(field(), { target: { value: '1' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(field()).toHaveValue('1')
  })

  it('commits as soon as the typed number is in range', () => {
    const onChange = renderField()
    fireEvent.change(field(), { target: { value: '1' } })
    fireEvent.change(field(), { target: { value: '12' } })
    expect(onChange).toHaveBeenCalledWith(12)
  })

  it('lets the field be cleared, without reading empty as zero', () => {
    const onChange = renderField()
    fireEvent.change(field(), { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(field()).toHaveValue('')
  })

  it('reverts an abandoned edit instead of guessing at it', () => {
    const onChange = renderField()
    fireEvent.change(field(), { target: { value: '' } })
    fireEvent.blur(field())
    expect(onChange).not.toHaveBeenCalled()
    // Back to the live value, not down to the minimum.
    expect(field()).toHaveValue('96')
  })

  it('clamps an out-of-range value once the edit is settled', () => {
    const onChange = renderField()
    fireEvent.change(field(), { target: { value: '900' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(field())
    expect(onChange).toHaveBeenCalledWith(400)
  })

  it('settles on Enter without waiting for focus to leave', () => {
    const onChange = renderField()
    fireEvent.change(field(), { target: { value: '900' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(400)
  })

  it('accepts a negative value, which a number input could not even display half-typed', () => {
    const onChange = renderField({ label: 'Rotation', min: -180, max: 180, value: 0 })
    fireEvent.change(field('Rotation'), { target: { value: '-' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(field('Rotation')).toHaveValue('-')
    fireEvent.change(field('Rotation'), { target: { value: '-90' } })
    expect(onChange).toHaveBeenCalledWith(-90)
  })
})

describe('stepping', () => {
  it('steps up and down from the buttons', () => {
    const onChange = renderField()
    fireEvent.click(screen.getByLabelText('Increase Size'))
    expect(onChange).toHaveBeenCalledWith(97)
    fireEvent.click(screen.getByLabelText('Decrease Size'))
    expect(onChange).toHaveBeenCalledWith(95)
  })

  it('steps with the arrow keys in the field', () => {
    const onChange = renderField()
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(97)
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith(95)
  })

  it('holds a fractional step at its own precision rather than drifting', () => {
    // 1.35 + 0.05 is 1.4000000000000001 unquantised, and that would be stored and displayed.
    const onChange = renderField({
      label: 'Line height',
      min: 0.8,
      max: 3,
      step: 0.05,
      value: 1.35,
    })
    fireEvent.click(screen.getByLabelText('Increase Line height'))
    expect(onChange).toHaveBeenCalledWith(1.4)
  })

  it('cannot step past either end of the range', () => {
    const atCeiling = renderField({ value: 400 })
    fireEvent.click(screen.getByLabelText('Increase Size'))
    expect(atCeiling).toHaveBeenCalledWith(400)
  })

  it('drops a half-typed draft when the value is stepped', () => {
    const onChange = renderField()
    fireEvent.change(field(), { target: { value: '1' } })
    fireEvent.click(screen.getByLabelText('Increase Size'))
    // Stepped from the live value, and the field shows it rather than the abandoned "1".
    expect(onChange).toHaveBeenCalledWith(97)
    expect(field()).toHaveValue('96')
  })
})
