'use client'

import { useState } from 'react'

interface QuickActionBtnProps {
  label: string
  sublabel: string
  iconColor: string
  iconBg: string
  icon: React.ReactNode
  onClick: () => void
}

/** Quick action button with icon badge, hover terracotta border. */
export function QuickActionBtn({
  label,
  sublabel,
  iconBg,
  icon,
  onClick,
}: QuickActionBtnProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '11px 13px',
        borderRadius: 8,
        border: hovered ? '0.5px solid var(--color-terracotta)' : '0.5px solid rgba(44,62,80,0.12)',
        background: hovered ? '#fff' : '#F9F6F2',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        textAlign: 'left',
        width: '100%',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#1A2630' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 1 }}>{sublabel}</div>
      </div>
    </button>
  )
}
