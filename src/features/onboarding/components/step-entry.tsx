'use client'

import { Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface StepEntryProps {
  websiteUrl: string
  instagramHandle: string
  onWebsiteUrlChange: (value: string) => void
  onInstagramHandleChange: (value: string) => void
  onAnalyze: () => void
  onSkip: () => void
}

/** Step 1: centered card with URL and Instagram inputs. */
export function StepEntry({
  websiteUrl,
  instagramHandle,
  onWebsiteUrlChange,
  onInstagramHandleChange,
  onAnalyze,
  onSkip,
}: StepEntryProps) {
  const hasInput = websiteUrl.trim() !== '' || instagramHandle.trim() !== ''

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <FrameIcon />

      <h1
        className="text-prompt"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          color: 'var(--ink)',
          textAlign: 'center',
          marginBottom: '8px',
        }}
      >
        New client onboarding
      </h1>
      <p
        className="text-body"
        style={{
          color: 'var(--text2)',
          textAlign: 'center',
          marginBottom: '32px',
          maxWidth: '420px',
          lineHeight: 1.65,
        }}
      >
        Share a website or Instagram handle — Kontuur will auto-detect the brand profile, tone, and
        content pillars.
      </p>

      <InputCard
        websiteUrl={websiteUrl}
        instagramHandle={instagramHandle}
        onWebsiteUrlChange={onWebsiteUrlChange}
        onInstagramHandleChange={onInstagramHandleChange}
      />

      <button
        className="text-body"
        type="button"
        onClick={onAnalyze}
        disabled={!hasInput}
        style={{
          width: '100%',
          maxWidth: '480px',
          padding: '13px',
          background: hasInput ? 'var(--forest-deep)' : 'rgba(15,21,18,0.3)',
          color: '#f2f5f1',
          border: 'none',
          borderRadius: '10px',
          fontWeight: 500,
          cursor: hasInput ? 'pointer' : 'not-allowed',
          fontFamily: 'var(--font-sans)',
          marginBottom: '12px',
          transition: 'background 0.15s',
        }}
      >
        Analyze & continue →
      </button>

      <button
        className="text-caption"
        type="button"
        onClick={onSkip}
        style={{
          color: 'var(--text2)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Skip — I&apos;ll answer manually
      </button>
    </div>
  )
}

function FrameIcon() {
  return (
    <div
      style={{
        borderLeft: '1.5px solid var(--spring)',
        borderRight: '1.5px solid var(--spring)',
        borderTop: '1px solid var(--line2)',
        borderBottom: '1px solid var(--line2)',
        padding: '12px 14px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Pencil size={20} color="var(--spring)" strokeWidth={1.5} />
    </div>
  )
}

function InputCard({
  websiteUrl,
  instagramHandle,
  onWebsiteUrlChange,
  onInstagramHandleChange,
}: {
  websiteUrl: string
  instagramHandle: string
  onWebsiteUrlChange: (v: string) => void
  onInstagramHandleChange: (v: string) => void
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: '14px',
        padding: '24px',
        width: '100%',
        maxWidth: '480px',
        marginBottom: '16px',
      }}
    >
      <Input
        label="Website URL"
        type="url"
        placeholder="https://example.com"
        value={websiteUrl}
        onChange={(e) => onWebsiteUrlChange(e.target.value)}
      />
      <div style={{ marginTop: '14px' }}>
        <Input
          label="Instagram handle"
          type="text"
          placeholder="@username (optional)"
          value={instagramHandle}
          onChange={(e) => onInstagramHandleChange(e.target.value)}
        />
      </div>
    </div>
  )
}
