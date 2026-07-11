'use client'

import type { BrandTokens } from '@/lib/scene-graph'
import { FeedSystemPicker, type FeedSystemOption } from '../visual-system/feed-system-picker'
import { PreviewGrid } from '../visual-system/preview-grid'
import { TokenEditor } from '../visual-system/token-editor'
import { PanelHeader } from './basic-info-tab'

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  marginBottom: 10,
}

interface VisualSystemTabProps {
  tokens: BrandTokens
  feedSystems: FeedSystemOption[]
  selectedFeedSystemSlug: string | null
  primaryLanguage: string
  secondaryLanguage: string
  onTokensChange: (next: BrandTokens) => void
  onFeedSystemChange: (slug: string) => void
}

/**
 * The Visual system tab (§3.1): edit the five colour roles + type on the left, watch a live 3×3 preview
 * recolour instantly on the right, and pick a feed system below. All client-side — no request until the
 * topbar Save. Mirrors the Brand profile tab's controlled shape.
 */
export function VisualSystemTab({
  tokens,
  feedSystems,
  selectedFeedSystemSlug,
  primaryLanguage,
  secondaryLanguage,
  onTokensChange,
  onFeedSystemChange,
}: VisualSystemTabProps) {
  return (
    <>
      <PanelHeader title="Visual system" subtitle="Colours, type, and the feed system for this client's posts" />
      <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) auto', gap: 24, alignItems: 'start' }}>
          <TokenEditor
            tokens={tokens}
            onChange={onTokensChange}
            primaryLanguage={primaryLanguage}
            secondaryLanguage={secondaryLanguage}
          />
          <div>
            <div style={sectionLabel}>Live preview</div>
            <PreviewGrid tokens={tokens} columns={3} cellWidth={104} />
          </div>
        </div>

        <div style={{ borderTop: '0.5px solid var(--color-border-1)', paddingTop: 18 }}>
          <div style={sectionLabel}>Feed system</div>
          <FeedSystemPicker
            systems={feedSystems}
            selectedSlug={selectedFeedSystemSlug}
            onSelect={onFeedSystemChange}
            tokens={tokens}
          />
        </div>
      </div>
    </>
  )
}
