import { describe, it, expect } from 'vitest'
import { buildAnalyzeUrlPrompt } from '../analyze-url'

/**
 * The pillar paragraph is the highest-leverage prose in the app.
 *
 * Pillars become Tavily search queries, the feed suggestions, and the weighted theme allocation —
 * so a pillar the open web has nothing to say about costs its entire weight share of every run,
 * silently, forever. It used to read "identify the main themes this business should post about
 * based on their services and content", which is a site-summarisation brief: for an agency, whose
 * website is about its own work rather than its field, it reliably returned pillars like "Studio
 * Culture & Behind-the-Scenes" that no search can serve.
 *
 * These assert the three jobs the rewrite has to keep doing — name the purpose, forbid
 * inward-facing themes, demonstrate the rewrite — rather than the exact wording, which should stay
 * free to improve.
 */
describe('buildAnalyzeUrlPrompt', () => {
  const prompt = buildAnalyzeUrlPrompt({ websiteContent: 'We are a social media agency.' })

  it('tells the model that a pillar is used as a web search query', () => {
    expect(prompt).toContain('WEB SEARCH QUERY')
  })

  it('rules out pillars that describe the business rather than its field', () => {
    expect(prompt).toMatch(/not the categories of content on their own website/i)
    expect(prompt).toMatch(/its own projects, results, clients, culture, process or team/i)
  })

  it('demonstrates the rewrite rather than only describing it', () => {
    // Concrete before/after pairs, not the specific industries they are drawn from — which set of
    // verticals reads best is still being measured, and pinning the current wording here would
    // turn every experiment into a test edit. What must not vanish is the demonstration itself.
    expect((prompt.match(/→/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('keeps the weighted four-pillar contract the schema and the mix row expect', () => {
    expect(prompt).toContain('exactly 4')
    expect(prompt).toContain('sum to 100')
  })

  it('includes a source block only for the content it was given', () => {
    expect(prompt).toContain('<website_content>')
    expect(prompt).not.toContain('<instagram_content>')

    const both = buildAnalyzeUrlPrompt({ websiteContent: 'site', instagramContent: 'profile' })
    expect(both).toContain('<website_content>')
    expect(both).toContain('<instagram_content>')
  })
})
