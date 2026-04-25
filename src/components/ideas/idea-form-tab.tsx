'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, ExternalLink } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { SectionCard } from '@/features/settings/components/section-card'
import type { ClientIdea } from '@/types/api'

interface IdeaFormTabProps {
  clientId: string
  clientName: string
}

/** Client settings tab showing the idea form link and recent ideas. */
export function IdeaFormTab({ clientId, clientName }: IdeaFormTabProps) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [ideas, setIdeas] = useState<ClientIdea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true)
    try {
      const [tokenRes, ideasRes] = await Promise.all([
        fetch('/api/ideas/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        }),
        fetch(`/api/ideas?clientId=${clientId}&limit=5`),
      ])

      const tokenData = await tokenRes.json()
      const ideasData = await ideasRes.json()

      setToken(tokenData.token ?? null)
      setIdeas(ideasData.ideas ?? [])
    } catch {
      toast.error('Failed to load idea form data')
    } finally {
      setLoading(false)
    }
  }

  const formUrl = token ? `${window.location.origin}/ideas/${token}` : ''
  const newCount = ideas.filter((i) => i.status === 'new').length

  function handleCopy() {
    void navigator.clipboard.writeText(formUrl)
    toast.success('Link copied to clipboard')
  }

  if (loading) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: '#8A8070' }}>Loading...</div>
    )
  }

  return (
    <div>
      <SectionCard
        title="Client idea form"
        subtitle={`Send this link to ${clientName} so they can submit post ideas directly. No login required.`}
        headerAction={
          newCount > 0 ? (
            <span style={badgeStyle}>
              {newCount} new idea{newCount !== 1 ? 's' : ''}
            </span>
          ) : undefined
        }
      >
        <div style={{ padding: '16px 20px' }}>
          {token ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div style={urlBoxStyle}>{formUrl}</div>
                <button onClick={handleCopy} style={actionButtonStyle}>
                  <Copy size={13} />
                  Copy
                </button>
                <a href={formUrl} target="_blank" rel="noopener noreferrer" style={actionButtonStyle}>
                  <ExternalLink size={13} />
                  Open
                </a>
              </div>
              <div style={{ fontSize: 11, color: '#8A8070' }}>
                {ideas.length > 0
                  ? `${ideas.length} idea${ideas.length !== 1 ? 's' : ''} submitted`
                  : 'No ideas submitted yet'}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#8A8070' }}>
              Could not generate form link. Please try again.
            </div>
          )}
        </div>
      </SectionCard>

      {ideas.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={sectionHeaderStyle}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#1A2630' }}>
              Recent ideas
            </span>
            <button onClick={() => router.push(`/ideas`)} style={viewAllStyle}>
              View all →
            </button>
          </div>

          {ideas.slice(0, 3).map((idea) => (
            <IdeaPreviewRow key={idea.id} idea={idea} />
          ))}
        </div>
      )}
    </div>
  )
}

function IdeaPreviewRow({ idea }: { idea: ClientIdea }) {
  return (
    <div style={previewRowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: '#1A2630',
            lineHeight: 1.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          &ldquo;{idea.ideaText}&rdquo;
        </div>
      </div>
      {idea.platform && (
        <span style={platformPillStyle}>{idea.platform}</span>
      )}
      {idea.status === 'new' && (
        <span style={newDotStyle} />
      )}
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  padding: '3px 8px',
  borderRadius: 5,
  background: 'rgba(192,123,85,0.12)',
  color: '#C07B55',
  whiteSpace: 'nowrap',
}

const urlBoxStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 12,
  color: '#8A8070',
  background: 'rgba(44,62,80,0.04)',
  border: '0.5px solid rgba(44,62,80,0.10)',
  borderRadius: 7,
  padding: '8px 12px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const actionButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '7px 12px',
  borderRadius: 7,
  fontSize: 11,
  fontWeight: 500,
  color: '#1A2630',
  background: 'none',
  border: '0.5px solid rgba(44,62,80,0.16)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
}

const viewAllStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: '#C07B55',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const previewRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 14px',
  background: 'var(--color-surface)',
  border: '0.5px solid rgba(44,62,80,0.08)',
  borderRadius: 8,
  marginBottom: 4,
}

const platformPillStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  padding: '2px 7px',
  borderRadius: 4,
  background: 'rgba(192,123,85,0.10)',
  color: '#C07B55',
  flexShrink: 0,
}

const newDotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#C07B55',
  flexShrink: 0,
}
