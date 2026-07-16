'use client'

import { useState } from 'react'
import type { BrandTokens } from '@/lib/scene-graph'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import type { ArtDirection } from '@/lib/brand-kit/art-direction'
import { Button } from '@/components/ui/button'
import { FeedSystemPicker, type FeedSystemOption } from '../visual-system/feed-system-picker'
import { PreviewGrid } from '../visual-system/preview-grid'
import { RatioToggle } from '../visual-system/ratio-toggle'
import { TokenEditor } from '../visual-system/token-editor'
import { BrandMarks } from '../visual-system/brand-marks'
import { ArtDirectionPanel } from '../visual-system/art-direction-panel'
import { PanelHeader } from './basic-info-tab'

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  marginBottom: 10,
}

/** Dependent-post counts for the propagation note (§3.3), bucketed by what a rebrand does to each. */
export type PropagationCounts = { draftCount: number; scheduledCount: number; publishedCount: number }

interface VisualSystemTabProps {
  tokens: BrandTokens
  feedSystems: FeedSystemOption[]
  selectedFeedSystemSlug: string | null
  primaryLanguage: string
  secondaryLanguage: string
  propagation: PropagationCounts
  onTokensChange: (next: BrandTokens) => void
  onFeedSystemChange: (slug: string) => void
  /** Design-system imagery (real plates by role) shown under the live token type; absent → gradients. */
  designPlates?: Record<string, string>
  /** Generated brand vector marks (SVG) shown below the preview. */
  designVectors?: string[]
  generatingDesign?: boolean
  /** Present → renders the Generate/Regenerate design-system button (settings; onboarding has its own). */
  onGenerateDesignSystem?: () => void
  /** The brand's AI art direction (drives every post's design) + its Recompose / per-axis edit actions. */
  artDirection?: ArtDirection | null
  recomposingDirection?: boolean
  onRecomposeDirection?: () => void
  onArtDirectionChange?: (next: ArtDirection) => void
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The honest consequence of saving (§3.3). The re-render engine is Phase 7; the promise is accurate. */
function PropagationNote({ draftCount, scheduledCount, publishedCount }: PropagationCounts) {
  if (draftCount + scheduledCount + publishedCount === 0) {
    return <>No posts use this visual system yet — saving just updates the kit.</>
  }
  return (
    <>
      Saving will re-render {plural(draftCount, 'draft')} automatically.
      {scheduledCount > 0 && ` ${plural(scheduledCount, 'scheduled post')} will ask first.`}
      {publishedCount > 0 && ' Published posts are never changed.'}
    </>
  )
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
  propagation,
  onTokensChange,
  onFeedSystemChange,
  designPlates,
  designVectors,
  generatingDesign,
  onGenerateDesignSystem,
  artDirection,
  recomposingDirection,
  onRecomposeDirection,
  onArtDirectionChange,
}: VisualSystemTabProps) {
  const [ratio, setRatio] = useState<AspectRatio>('4:5')
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div style={{ ...sectionLabel, marginBottom: 0 }}>Live preview</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {onGenerateDesignSystem && (
                  <Button
                    size="sm"
                    variant={designPlates ? 'secondary' : undefined}
                    loading={generatingDesign}
                    onClick={onGenerateDesignSystem}
                  >
                    {generatingDesign ? 'Generating…' : designPlates ? 'Regenerate' : 'Generate design system'}
                  </Button>
                )}
                <RatioToggle value={ratio} onChange={setRatio} />
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <PreviewGrid tokens={tokens} feedSystemSlug={selectedFeedSystemSlug} ratio={ratio} language={primaryLanguage} columns={3} cellWidth={104} plates={designPlates} />
              {generatingDesign && !designPlates && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    background: 'rgba(244,239,230,0.55)',
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--color-muted)',
                  }}
                >
                  Generating imagery…
                </div>
              )}
            </div>
            {designVectors && designVectors.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <BrandMarks svgs={designVectors} />
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: '0.5px solid var(--color-border-1)', paddingTop: 18 }}>
          <ArtDirectionPanel artDirection={artDirection ?? null} recomposing={recomposingDirection} onRecompose={onRecomposeDirection} onChange={onArtDirectionChange} />
        </div>

        <div style={{ borderTop: '0.5px solid var(--color-border-1)', paddingTop: 18 }}>
          <div style={sectionLabel}>Feed system</div>
          <FeedSystemPicker
            systems={feedSystems}
            selectedSlug={selectedFeedSystemSlug}
            onSelect={onFeedSystemChange}
            tokens={tokens}
            language={primaryLanguage}
          />
        </div>

        <p
          style={{
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--color-text-2)',
            background: 'var(--color-sunken)',
            border: '0.5px solid var(--color-border-1)',
            borderRadius: 8,
            padding: '10px 12px',
            margin: 0,
          }}
        >
          <PropagationNote {...propagation} />
        </p>
      </div>
    </>
  )
}
