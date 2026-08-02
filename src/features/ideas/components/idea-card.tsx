'use client'

import { Zap } from 'lucide-react'
import { formatRelativeTime } from '@/utils/format'
import type { ClientIdea } from '@/types/api'

interface IdeaCardProps {
  idea: ClientIdea
  clientDotColor: string
  onGenerate: (idea: ClientIdea) => void
  onDismiss: (id: string) => void
}

/** Single idea card for the ideas inbox. */
export function IdeaCard({ idea, clientDotColor, onGenerate, onDismiss }: IdeaCardProps) {
  const isUnread = !idea.readAt
  const isGenerated = idea.status === 'generated'

  return (
    <div style={cardStyle}>
      <CardHeader
        idea={idea}
        clientDotColor={clientDotColor}
        isUnread={isUnread}
      />

      <div style={{ padding: '13px 16px', fontSize: 13, color: 'var(--ink)', lineHeight: 1.68 }}>
        &ldquo;{idea.ideaText}&rdquo;
      </div>

      {idea.extraNotes && (
        <div
          style={{
            padding: '0 16px 13px',
            fontSize: 12,
            color: 'var(--text2)',
            lineHeight: 1.6,
          }}
        >
          {idea.extraNotes}
        </div>
      )}

      <CardFooter
        idea={idea}
        isGenerated={isGenerated}
        onGenerate={onGenerate}
        onDismiss={onDismiss}
      />
    </div>
  )
}

function CardHeader({
  idea,
  clientDotColor,
  isUnread,
}: {
  idea: ClientIdea
  clientDotColor: string
  isUnread: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '11px 16px',
        borderBottom: '1px solid rgba(15,21,18,0.07)',
        flexWrap: 'wrap',
      }}
    >
      {isUnread && <UnreadDot />}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--ink)',
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: clientDotColor,
            flexShrink: 0,
          }}
        />
        {idea.clientName}
      </div>

      {idea.clientNiche && (
        <>
          <Separator />
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{idea.clientNiche}</span>
        </>
      )}

      {idea.platform && <PlatformPill label={idea.platform} />}

      {idea.targetDate && (
        <span style={metaPillStyle}>Target: {idea.targetDate}</span>
      )}

      {idea.status === 'generated' && (
        <span style={generatedBadgeStyle}>✓ Generated</span>
      )}

      <span
        style={{
          fontSize: 11,
          color: 'rgba(15,21,18,0.7)',
          marginLeft: 'auto',
        }}
      >
        {formatRelativeTime(new Date(idea.submittedAt))}
      </span>
    </div>
  )
}

function CardFooter({
  idea,
  isGenerated,
  onGenerate,
  onDismiss,
}: {
  idea: ClientIdea
  isGenerated: boolean
  onGenerate: (idea: ClientIdea) => void
  onDismiss: (id: string) => void
}) {
  return (
    <div style={footerStyle}>
      {isGenerated ? (
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>Post generated</span>
      ) : idea.status === 'generating' ? (
        <span style={{ fontSize: 11, color: 'var(--spring-text)' }}>Generating…</span>
      ) : idea.status === 'dismissed' ? (
        <span style={{ fontSize: 11, color: 'rgba(15,21,18,0.5)' }}>Dismissed</span>
      ) : (
        <>
          <button onClick={() => onGenerate(idea)} style={generateButtonStyle}>
            <Zap size={12} />
            Generate from this idea
          </button>
          <button onClick={() => onDismiss(idea.id)} style={dismissButtonStyle}>
            Dismiss
          </button>
        </>
      )}
    </div>
  )
}

function UnreadDot() {
  return (
    <div
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: 'var(--spring-text)',
        flexShrink: 0,
      }}
    />
  )
}

function Separator() {
  return <span style={{ color: 'rgba(15,21,18,0.20)', fontSize: 11 }}>·</span>
}

function PlatformPill({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 4,
        background: 'rgba(46,158,104,0.10)',
        color: 'var(--spring-text)',
      }}
    >
      {label}
    </span>
  )
}

// ── Styles ──────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(15,21,18,0.12)',
  borderRadius: 10,
  overflow: 'hidden',
  transition: 'box-shadow 0.15s',
}

const metaPillStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  padding: '2px 8px',
  borderRadius: 4,
  background: 'rgba(15,21,18,0.06)',
  color: 'var(--text2)',
}

const generatedBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  padding: '2px 8px',
  borderRadius: 4,
  background: 'rgba(46,158,104,0.10)',
  color: 'var(--spring-text)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
}

const footerStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderTop: '1px solid rgba(15,21,18,0.07)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--sunken)',
}

const generateButtonStyle: React.CSSProperties = {
  padding: '7px 16px',
  background: 'var(--forest-deep)',
  color: '#f2f5f1',
  border: 'none',
  borderRadius: 7,
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s',
  display: 'flex',
  alignItems: 'center',
  gap: 5,
}

const dismissButtonStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'rgba(15,21,18,0.7)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
