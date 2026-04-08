'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

export { DropdownMenu }

// Styled sub-components for convenience
export function DropdownContent({
  children,
  align = 'end',
  sideOffset = 6,
}: {
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={sideOffset}
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border-1)',
          borderRadius: 'var(--radius-lg)',
          padding: 6,
          boxShadow: '0 4px 24px rgba(26,25,24,0.10), 0 1px 4px rgba(26,25,24,0.06)',
          minWidth: 180,
          zIndex: 100,
          animation: 'dropdown-in 150ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
}

export function DropdownItem({
  children,
  danger = false,
  onSelect,
  disabled,
}: {
  children: React.ReactNode
  danger?: boolean
  onSelect?: () => void
  disabled?: boolean
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 13.5,
        fontFamily: 'var(--font-sans)',
        color: danger ? 'var(--color-error-fg)' : 'var(--color-text-1)',
        cursor: 'pointer',
        transition: 'background 100ms ease',
        outline: 'none',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'var(--color-error-bg)' : 'var(--color-overlay)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </DropdownMenu.Item>
  )
}

export function DropdownSeparator() {
  return (
    <DropdownMenu.Separator
      style={{
        height: '0.5px',
        background: 'var(--color-border-1)',
        margin: '4px 0',
      }}
    />
  )
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu.Label
      style={{
        padding: '5px 10px 3px',
        fontSize: 10,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        color: 'var(--color-text-3)',
      }}
    >
      {children}
    </DropdownMenu.Label>
  )
}

export const DropdownRoot = DropdownMenu.Root
export const DropdownTrigger = DropdownMenu.Trigger
