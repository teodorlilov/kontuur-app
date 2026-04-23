import type { ReactNode } from 'react'

interface PanelSectionProps {
  title: string
  rightContent?: ReactNode
  children: ReactNode
}

/** Reusable section wrapper for info panels (quality, source, post info). */
export function PanelSection({ title, rightContent, children }: PanelSectionProps) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--color-border-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '9px', fontWeight: 500, color: 'var(--color-muted)', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
          {title}
        </span>
        {rightContent}
      </div>
      {children}
    </div>
  )
}
