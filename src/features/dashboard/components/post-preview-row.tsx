'use client'

import { formatRelativeTime } from '@/utils/format'

type Platform = 'instagram' | 'facebook' | 'linkedin' | 'tiktok'

interface PostPreviewRowProps {
  platform: Platform
  caption: string
  clientName: string
  pillar: string
  createdAt: Date
  onApprove: () => void
}

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'IG',
  facebook: 'FB',
  linkedin: 'LI',
  tiktok: 'TK',
}

const PLATFORM_STYLE: Record<Platform, { bg: string; color: string }> = {
  instagram: { bg: 'rgba(192,123,85,0.10)', color: 'var(--color-terracotta)' },
  facebook: { bg: 'rgba(44,94,138,0.10)', color: '#2C5F8A' },
  linkedin: { bg: 'rgba(44,94,138,0.10)', color: '#2C5F8A' },
  tiktok: { bg: 'rgba(44,62,80,0.10)', color: '#2C3E50' },
}

/** Single pending post row with platform badge, truncated caption, and approve button. */
export function PostPreviewRow({
  platform,
  caption,
  clientName,
  pillar,
  createdAt,
  onApprove,
}: PostPreviewRowProps) {
  const pStyle = PLATFORM_STYLE[platform] ?? PLATFORM_STYLE.instagram

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 0',
        borderBottom: '0.5px solid rgba(44,62,80,0.06)',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: pStyle.bg,
          color: pStyle.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        {PLATFORM_LABEL[platform]}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: '#1A2630',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {caption}
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 3 }}>
          {clientName} · {pillar} · {formatRelativeTime(createdAt)}
        </div>
      </div>

      <button
        onClick={onApprove}
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: 'var(--status-ok)',
          background: 'rgba(122,154,106,0.10)',
          border: 'none',
          borderRadius: 4,
          padding: '3px 8px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        Approve
      </button>
    </div>
  )
}
