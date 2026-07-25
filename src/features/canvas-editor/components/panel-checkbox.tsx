'use client'

interface PanelCheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  title?: string
}

/** The properties panel's standard labelled checkbox row (uppercase, italic, above-text, …). */
export function PanelCheckbox({ label, checked, onChange, disabled, title }: PanelCheckboxProps) {
  return (
    <label
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        color: 'var(--color-text-1)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}
