'use client'

import type { BrandTokens } from '@/lib/scene-graph'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { feedSystemPack, feedSystemTokens } from '@/lib/renderer/feed-system-compositions'
import type { FeedSystemOption } from '@/lib/brand-kit/feed-systems'
import { PreviewCell } from './preview-cell'

export type { FeedSystemOption }

/**
 * The three feed-system cards (F-3): same palette, different system, each with a live cover preview of
 * *that* system's cover composition in the client's colours. The recommendation is stated as a sentence,
 * not a badge. No price on any card. Colours never differ between systems — only type, chrome, and layout.
 */
export function FeedSystemPicker({
  systems,
  selectedSlug,
  recommendedSlug,
  recommendationReason,
  onSelect,
  tokens,
  language,
}: {
  systems: FeedSystemOption[]
  selectedSlug: string | null
  recommendedSlug?: string | null
  recommendationReason?: string
  onSelect: (slug: string) => void
  tokens: BrandTokens
  /** The client's language — localizes the placeholder demo copy on the card previews. */
  language?: string
}) {
  return (
    <>
      {systems.map((system) => (
        <link key={system.slug} rel="stylesheet" href={kitFontsHref(feedSystemTokens(system.slug, tokens))} />
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {systems.map((system) => {
          const isSelected = system.slug === selectedSlug
          const isRecommended = system.slug === recommendedSlug
          const cardTokens = feedSystemTokens(system.slug, tokens)
          return (
            <button
              key={system.slug}
              type="button"
              onClick={() => onSelect(system.slug)}
              style={{
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: 12,
                borderRadius: 12,
                cursor: 'pointer',
                background: 'var(--color-surface)',
                border: isSelected ? '1px solid var(--color-terracotta)' : '0.5px solid var(--color-border-1)',
                fontFamily: 'inherit',
              }}
            >
              <PreviewCell composition={feedSystemPack(system.slug).cover} tokens={cardTokens} width={166} language={language} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)' }}>{system.name}</span>
                {isSelected && <span style={{ fontSize: 12, color: 'var(--color-terracotta)' }}>✓</span>}
              </div>
              <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-2)', margin: 0 }}>{system.description}</p>
              {isRecommended && recommendationReason && (
                <p style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-terracotta)', margin: 0, fontStyle: 'italic' }}>
                  Recommended — {recommendationReason}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}
