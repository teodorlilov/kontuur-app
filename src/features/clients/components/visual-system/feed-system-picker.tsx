'use client'

import type { BrandTokens } from '@/lib/scene-graph'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { useKitFonts } from '@/lib/render/use-kit-fonts'
import { feedSystemTokens, filmstripFrames, styleShowcase } from '@/lib/renderer/feed-system-compositions'
import { getStyle } from '@/lib/renderer/styles'
import type { FeedSystemOption } from '@/lib/brand-kit/feed-systems'
import { PreviewCell } from './preview-cell'

export type { FeedSystemOption }

/**
 * The feed-system cards (F-3): same palette, different system, each with a live **filmstrip** of three of
 * *that* style's actual layouts (opener → a content layout → closer) in the client's colours — so a card
 * shows the style's range, not one cover (and a no-photo/vector style reads correctly instead of falling
 * back to editorial). A crisp one-line character sits under the name; the recommendation is a sentence,
 * not a badge. Colours never differ between systems — only type, chrome, and layout.
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
  useKitFonts(systems.map((system) => kitFontsHref(feedSystemTokens(system.slug, tokens))))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {systems.map((system) => {
          const isSelected = system.slug === selectedSlug
          const isRecommended = system.slug === recommendedSlug
          const cardTokens = feedSystemTokens(system.slug, tokens)
          const frames = filmstripFrames(styleShowcase(system.slug), 3)
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
              <div style={{ display: 'flex', gap: 6 }}>
                {frames.map((arch) => (
                  <PreviewCell key={arch.id} composition={arch.composition} tokens={cardTokens} width={51} language={language} />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)' }}>{system.name}</span>
                {isSelected && <span style={{ fontSize: 12, color: 'var(--color-terracotta)' }}>✓</span>}
              </div>
              <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-2)', margin: 0 }}>{getStyle(system.slug).character}</p>
              {isRecommended && recommendationReason && (
                <p style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-terracotta)', margin: 0, fontStyle: 'italic' }}>
                  Recommended — {recommendationReason}
                </p>
              )}
            </button>
          )
        })}
    </div>
  )
}
