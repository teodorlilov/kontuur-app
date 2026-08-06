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
      className="bg-surface border border-line rounded-lg px-4 py-[13px] mb-[18px] cursor-pointer"
      style={{ transition: 'all 0.15s' }}
    >
      <div className="flex items-center gap-2.5">
        {/* Label */}
        <span className="text-label font-semibold uppercase text-spring-text flex items-center gap-[5px] shrink-0">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4l3 3" />
          </svg>
          AI Summary
        </span>

        {/* Preview — hidden when expanded */}
        {!expanded && (
          <span className="text-caption text-text2 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {preview}
          </span>
        )}

        {/* Toggle */}
        <span className="text-micro font-medium text-spring-text shrink-0 whitespace-nowrap">
          {expanded ? '← Collapse' : 'Expand →'}
        </span>
      </div>

      {/* Full text */}
      {expanded && (
        // leading-[1.72] is the block's original line-height: a multi-sentence
        // summary reads looser than text-caption's own 1.4 UI setting.
        <div className="text-caption text-text2 leading-[1.72] mt-2.5 pt-2.5 border-t border-t-ink/6">
          {clean}
        </div>
      )}
    </div>
  )
}
