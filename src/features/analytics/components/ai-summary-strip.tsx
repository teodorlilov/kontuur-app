'use client'

import { useState } from 'react'

interface AiSummaryStripProps {
  summary: string
}

/** Strips markdown headings and bold/italic markers from AI text. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s.+\n?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim()
}

/** Collapsible single-line AI summary strip. */
export function AiSummaryStrip({ summary }: AiSummaryStripProps) {
  const [expanded, setExpanded] = useState(false)
  const clean = stripMarkdown(summary)
  const preview = clean.split('.')[0] + '…'

  return (
    <div
      onClick={() => setExpanded((prev) => !prev)}
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border-1)',
        borderRadius: 'var(--radius-lg)',
        padding: '13px 16px',
        marginBottom: 18,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Label */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 9,
            fontWeight: 500,
            color: 'var(--color-terracotta)',
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4l3 3" />
          </svg>
          AI Summary
        </span>

        {/* Preview — hidden when expanded */}
        {!expanded && (
          <span
            style={{
              fontSize: 12,
              color: 'var(--color-muted)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {preview}
          </span>
        )}

        {/* Toggle */}
        <span style={{ fontSize: 10, color: 'var(--color-terracotta)', fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {expanded ? '← Collapse' : 'Expand →'}
        </span>
      </div>

      {/* Full text */}
      {expanded && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-text-2)',
            lineHeight: 1.72,
            marginTop: 10,
            paddingTop: 10,
            borderTop: '0.5px solid rgba(44,62,80,0.06)',
          }}
        >
          {clean}
        </div>
      )}
    </div>
  )
}
