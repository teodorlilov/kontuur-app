import { callAnthropic } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { allocateByWeight, type WeightedPillar } from '@/lib/clients/content-pillars'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import { buildResearchSystemPrompt } from './system-prompt'
import type { ResearchTopic, SourceContext } from '../types'

/**
 * Encapsulates research prompt construction and LLM execution.
 * Builds source-grounded or trend-based prompts depending on available sources.
 */
export class ResearchPromptBuilder {
  private niche: string
  private language: string
  private languageConfig: LanguageConfig
  private contentPillars: WeightedPillar[]
  private postHistory: string[]

  constructor(opts: {
    niche: string
    languageConfig: LanguageConfig
    contentPillars: WeightedPillar[]
    postHistory: string[]
  }) {
    this.niche = opts.niche
    this.language = opts.languageConfig.language
    this.languageConfig = opts.languageConfig
    this.contentPillars = opts.contentPillars
    this.postHistory = opts.postHistory
  }

  /** Update post history (used by pipeline retry loop with extended history). */
  updateHistory(history: string[]): void {
    this.postHistory = history
  }

  /**
   * Build prompt, call LLM, parse response. Returns ResearchTopic[].
   */
  async generateTopics(count: number, sourceContext?: SourceContext): Promise<ResearchTopic[]> {
    const prompt = this.buildUserPrompt(count, sourceContext)
    const systemText = buildResearchSystemPrompt(this.languageConfig)

    const message = await callAnthropic({ systemPrompt: systemText, userMessage: prompt })

    return parseJsonResponse<ResearchTopic[]>(message, 'array')
  }

  // ---- Private prompt construction ----

  private buildUserPrompt(count: number, sourceContext?: SourceContext): string {
    const pillarsContext = this.buildPillarsContext(count)
    const historyContext = this.buildHistoryContext()

    if (this.hasSourceContent(sourceContext)) {
      return this.buildSourceGroundedPrompt(count, sourceContext!, pillarsContext, historyContext)
    }
    return this.buildTrendFallbackPrompt(count, pillarsContext, historyContext)
  }

  private buildPillarsContext(count: number): string {
    if (this.contentPillars.length === 0) return ''
    const allocation = allocateByWeight(this.contentPillars, count)
    const pillarInstructions = this.contentPillars
      .map((p) => `- "${p.pillar}" (${p.weight}%): generate ${allocation.get(p.pillar) ?? 0} topic(s)`)
      .join('\n')
    return `Content pillars with weighted distribution:\n${pillarInstructions}\nDistribute topics according to these weights. Include the pillar name in each topic's response.`
  }

  private buildHistoryContext(): string {
    if (this.postHistory.length === 0) return ''
    return `\nRECENTLY COVERED TOPICS (do NOT suggest these or closely related themes — find fresh angles the client has NOT posted about yet):\n${this.postHistory.map((t) => `- ${t}`).join('\n')}\n`
  }

  private hasSourceContent(ctx?: SourceContext): boolean {
    return (
      !!ctx &&
      (ctx.rssItems.length > 0 || ctx.websiteExcerpts.length > 0 || ctx.fileExcerpts.length > 0)
    )
  }

  private buildSourceGroundedPrompt(
    count: number,
    sourceContext: SourceContext,
    pillarsContext: string,
    historyContext: string
  ): string {
    const rssSection =
      sourceContext.rssItems.length > 0
        ? `RSS FEED CONTENT (recent articles and items):\n<rss_content>\n${sourceContext.rssItems
            .map((item) => `- ${item.title}: ${item.description}${item.link ? ` (${item.link})` : ''}`)
            .join('\n')}\n</rss_content>`
        : ''

    const webSection =
      sourceContext.websiteExcerpts.length > 0
        ? `WEBSITE CONTENT:\n<website_content>\n${sourceContext.websiteExcerpts.map((w) => `[Source URL: ${w.url}]${w.focusInstructions ? `\n[AI FOCUS: ${w.focusInstructions}]` : ''}\n${w.text}`).join('\n\n---\n\n')}\n</website_content>`
        : ''

    const fileSection =
      sourceContext.fileExcerpts.length > 0
        ? `UPLOADED DOCUMENTS (client reference material):\n<document_content>\n${sourceContext.fileExcerpts.map((f) => `[Document: "${f.label}"]\n${f.text}`).join('\n\n---\n\n')}\n</document_content>`
        : ''

    return `Today's date: ${new Date().toISOString().split('T')[0]}

You are a social media strategist. Based on the following real content from the client's feeds, website, and documents, identify ${count} specific post themes for a ${this.niche} business targeting ${this.language}-language social media.

${rssSection}

${webSection}

${fileSection}

IMPORTANT: Ground each theme in the actual content above when relevant source material exists — reference a specific article, service, listing, or topic found in the sources.

HYBRID SOURCING: If no source content above covers a particular content pillar, use trend-based research for that pillar instead — suggest themes based on what is currently trending in the "${this.niche}" niche for that pillar's topic area. For trend-based topics, set source_url, source_title, and source_type to null; use source_excerpt for a brief trend description.
${pillarsContext}
${historyContext}
Return exactly ${count} findings as JSON:
[{ "finding": string, "suggested_theme": string, "pillar": string, "source_url": string | null, "source_title": string | null, "source_type": "rss" | "website" | "file" | null, "source_excerpt": string }]

The "finding" field should describe what specific content from the sources inspired this theme, or for trend-based themes, describe the trend observation.

For each source-grounded topic:
- "source_url": the article link or website URL if available in the source content, otherwise null
- "source_title": the article or document title
- "source_type": which source type it came from ("rss", "website", or "file")
- "source_excerpt": a verbatim excerpt of 5-8 sentences from the source covering the key facts for this theme (features, numbers, prices, location details, materials, amenities — whatever is most relevant)

For trend-based topics (no source available), set source_url, source_title, and source_type to null. Use source_excerpt for a brief trend description.`
  }

  private buildTrendFallbackPrompt(
    count: number,
    pillarsContext: string,
    historyContext: string
  ): string {
    return `Today's date: ${new Date().toISOString().split('T')[0]}

Search for what is trending right now in ${this.niche} on social media
in ${this.language}-speaking markets. Focus on: popular content formats,
seasonal topics, viral post angles, relevant news. ${pillarsContext}
${historyContext}
The "source_excerpt" field should briefly describe the trend angle or observation that inspired this theme.

Return exactly ${count} findings as JSON:
[{ "finding": string, "suggested_theme": string, "pillar": string, "source_url": null, "source_title": null, "source_type": null, "source_excerpt": string }]`
  }
}
