import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { ConfidenceBadge } from '../confidence-badge'
import { FeedSystemPicker } from '../feed-system-picker'
import { PreviewGrid } from '../preview-grid'
import { TokenEditor } from '../token-editor'

const noop = () => undefined

const SYSTEMS = [
  { slug: 'editorial', name: 'Editorial', description: 'High-contrast serif.' },
  { slug: 'bold-blocks', name: 'Bold blocks', description: 'Heavy grotesk.' },
  { slug: 'quiet-grid', name: 'Quiet grid', description: 'Light grotesk, no photography.' },
]

describe('visual-system components render without throwing', () => {
  it('ConfidenceBadge', () => {
    expect(() => renderToStaticMarkup(createElement(ConfidenceBadge, { confidence: 'measured' }))).not.toThrow()
  })

  it('PreviewGrid — a 3×3 grid of reference compositions in the tokens', () => {
    const html = renderToStaticMarkup(createElement(PreviewGrid, { tokens: DEFAULT_TOKENS }))
    expect(html).toContain('fonts.googleapis.com')
  })

  it('TokenEditor — five colour inputs + language-filtered type', () => {
    const html = renderToStaticMarkup(
      createElement(TokenEditor, { tokens: DEFAULT_TOKENS, onChange: noop, primaryLanguage: 'Bulgarian' })
    )
    expect(html).toContain('type="color"')
  })

  it('FeedSystemPicker — three cards, recommendation as a sentence', () => {
    const html = renderToStaticMarkup(
      createElement(FeedSystemPicker, {
        systems: SYSTEMS,
        selectedSlug: 'editorial',
        recommendedSlug: 'editorial',
        recommendationReason: 'your site uses a high-contrast serif',
        onSelect: noop,
        tokens: DEFAULT_TOKENS,
      })
    )
    expect(html).toContain('Recommended')
  })
})
