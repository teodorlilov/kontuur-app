'use client'

interface WizardLayoutProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  centerContent?: boolean
  maxWidth?: string
}

/** Sidebar + scrollable main area with centered white card. */
export function WizardLayout({ sidebar, children, centerContent = true, maxWidth = '620px' }: WizardLayoutProps) {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {sidebar}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: centerContent ? '32px' : '28px 32px',
          display: 'flex',
          alignItems: centerContent ? 'center' : 'flex-start',
          justifyContent: 'center',
        }}
      >
        <WizardCard maxWidth={maxWidth}>{children}</WizardCard>
      </div>
    </div>
  )
}

function WizardCard({ children, maxWidth }: { children: React.ReactNode; maxWidth: string }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border-1)',
        borderRadius: '16px',
        padding: '32px',
        width: '100%',
        maxWidth,
        boxShadow: '0 2px 16px rgba(44,62,80,0.06)',
      }}
    >
      {children}
    </div>
  )
}
