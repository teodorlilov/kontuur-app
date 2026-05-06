'use client'

import { useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { useCanvaStatus } from '@/features/publishing/hooks/use-canva-status'

/**
 * Global "Design in Canva" topbar button.
 * Opens Canva in a new tab when connected.
 * Shows disabled with tooltip when not connected.
 */
export function DesignInCanvaButton() {
  const connected = useCanvaStatus()
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          if (connected) {
            window.open('https://www.canva.com/create/instagram-posts/', '_blank')
          }
        }}
        onMouseEnter={(e) => {
          if (!connected) {
            setShowTooltip(true)
          } else {
            e.currentTarget.style.background = '#6A22B0'
          }
        }}
        onMouseLeave={(e) => {
          setShowTooltip(false)
          if (connected) {
            e.currentTarget.style.background = '#7B2FBE'
          }
        }}
        disabled={!connected}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 14px 7px 10px',
          border: 'none',
          borderRadius: 9,
          background: connected ? '#7B2FBE' : 'rgba(44,62,80,0.08)',
          cursor: connected ? 'pointer' : 'default',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          color: connected ? '#fff' : 'var(--color-muted)',
          transition: 'background 150ms ease, opacity 150ms ease',
          opacity: connected ? 1 : 0.5,
        }}
      >
        {/* Canva C icon */}
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: connected ? 'rgba(255,255,255,0.2)' : 'rgba(44,62,80,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          C
        </span>
        Design in Canva
        <ChevronUp style={{ width: 14, height: 14, opacity: 0.7 }} />
      </button>

      {/* Tooltip for disconnected state */}
      {showTooltip && !connected && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            padding: '6px 10px',
            background: 'var(--color-text-1)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 500,
            borderRadius: 5,
            whiteSpace: 'nowrap',
            zIndex: 50,
            pointerEvents: 'none',
          }}
        >
          Connect Canva in Settings
        </div>
      )}
    </div>
  )
}
