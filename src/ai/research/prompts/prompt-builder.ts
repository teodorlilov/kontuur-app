import { callAnthropic } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { allocateByWeight, type WeightedPillar } from '@/lib/clients/content-pillars'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import type { ResearchTopic, SourceContext } from '../types'

/**
 * Builds the static system prompt for research topic generation.
 * Language-aware but client-agnostic — safe to cache.
 */
function buildResearchSystemPrompt(config: LanguageConfig): string {
  const { language } = config

  const sections: string[] = [
    `You are a social media strategist identifying specific, high-quality post themes.

SUGGESTED_THEME QUALITY RULES (critical — the theme becomes the post brief):
- Maximum 8-10 words. Short and punchy, NOT a headline or article title.
- Write in ${language} as a native speaker would naturally say it.
- Must name a SPECIFIC detail: a property, a price, a location, a service, a number — not a category.
- NEVER use clickbait patterns: "Complete guide to...", "Discover...", "Your chance for...", "Everything you need to know about..."
- NEVER use dashes to join two clauses ("X - Y"). Just state the topic simply.`,
  ]

  // Non-Latin script rule (Cyrillic, Greek, Arabic, etc.)
  if (/[\u0400-\u04FF\u0370-\u03FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(language)) {
    sections.push(`- NEVER mix scripts. If writing in ${language}, every word must use the native script consistently. Source URLs use Latin, but themes must use the native script only.`)
  }

  if (config.languageInstructions) {
    sections.push(config.languageInstructions)
  }

  return sections.join('\n')
}

/** Returns today's date as YYYY-MM-DD for use in prompts. */
function todayDate(): string {
  return new Date().toISOString().split('T')[0]!
}

/**
 * Wraps content in a labelled XML-style section for prompt clarity.
 * Returns empty string when content is absent — sections with no content are omitted.
 */
function buildSourceSection(title: string, tag: string, content: string): string {
  if (!content.trim()) return ''
  return `${title}:\n<${tag}>\n${content}\n</${tag}>`
}

/**
 * Encapsulates research prompt construction and LLM execution.
 * Builds source-grounded or trend-based prompts depending on available sources.
 */
export class ResearchPromptBuilder {
  private niche: string
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

    console.log("Research Prompt", prompt)
    console.log("Research System Prompt", systemText)
    console.log("Anthropic message", message)

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
    const rssSection = buildSourceSection(
      'RSS FEED CONTENT (recent articles and items)',
      'rss_content',
      sourceContext.rssItems
        .map((item) => `- ${item.title}: ${item.description}${item.link ? ` (${item.link})` : ''}`)
        .join('\n')
    )

    const webSection = buildSourceSection(
      'WEBSITE CONTENT',
      'website_content',
      sourceContext.websiteExcerpts
        .map((w) => `[Source URL: ${w.url}]${w.focusInstructions ? `\n[AI FOCUS: ${w.focusInstructions}]` : ''}\n${w.text}`)
        .join('\n\n---\n\n')
    )

    const fileSection = buildSourceSection(
      'UPLOADED DOCUMENTS (client reference material)',
      'document_content',
      sourceContext.fileExcerpts
        .map((f) => `[Document: "${f.label}"]\n${f.text}`)
        .join('\n\n---\n\n')
    )

    return `Today's date: ${todayDate()}

You are a social media strategist. Based on the following real content from the client's feeds, website, and documents, identify ${count} specific post themes for a ${this.niche} business targeting ${this.languageConfig.language}-language social media.

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
    return `Today's date: ${todayDate()}

Search for what is trending right now in ${this.niche} on social media
in ${this.languageConfig.language}-speaking markets. Focus on: popular content formats,
seasonal topics, viral post angles, relevant news. ${pillarsContext}
${historyContext}
The "source_excerpt" field should briefly describe the trend angle or observation that inspired this theme.

Return exactly ${count} findings as JSON:
[{ "finding": string, "suggested_theme": string, "pillar": string, "source_url": null, "source_title": null, "source_type": null, "source_excerpt": string }]`
  }
}
