import type { TextBlock } from '@anthropic-ai/sdk/resources'
import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { allocateByWeight, type WeightedPillar } from '@/lib/clients/content-pillars'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import type { ResearchTopic, SourceContext } from './types'
import { todayDateString } from '@/ai/utils/prompt-helpers'

/**
 * Wraps content in a labelled XML-style section for prompt clarity.
 * Returns empty string when content is absent — sections with no content are omitted.
 * Module-level pure function — no class dependency, safe to reuse by other builders.
 */
function buildPromptSection(title: string, tag: string, content: string): string {
  if (!content.trim()) return ''
  return `${title}:\n<${tag}>\n${content}\n</${tag}>`
}

/**
 * Encapsulates research prompt construction and LLM execution.
 * Builds source-grounded or trend-based prompts depending on available sources.
 *
 * Immutable fields (niche, languageConfig, contentPillars, systemPrompt) are set once
 * in the constructor. postHistory is the only mutable field, updated by the retry loop
 * via updateHistory().
 */
export class ResearchPromptBuilder {
  private readonly niche: string
  private readonly languageConfig: LanguageConfig
  private readonly contentPillars: WeightedPillar[]
  private readonly systemPrompt: string
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
    this.systemPrompt = this.buildResearcherSystemPrompt()
  }

  /** Update post history (used by pipeline retry loop with extended history). */
  updateHistory(history: string[]): void {
    this.postHistory = history
  }

  /**
   * Build prompt, call LLM, parse response.
   * Returns topics plus raw prompt and response for retry conversation history.
   */
  async generateTopics(
    count: number,
    sourceContext?: SourceContext,
  ): Promise<{ topics: ResearchTopic[]; userPrompt: string; rawResponse: string }> {
    const pillarsContext = this.buildPillarAllocationBlock(count)
    const historyContext = this.buildCoveredTopicsBlock()

    const userPrompt = this.hasResearchSources(sourceContext)
      ? this.buildResearcherUserPrompt(count, sourceContext!, pillarsContext, historyContext)
      : this.buildTrendResearchPrompt(count, pillarsContext, historyContext)

    console.log("RESEARCH USER PROMPT", userPrompt)
    console.log("RESEARCH SYSTEM PROMPT", this.systemPrompt)

    console.log(`[ai:research] → callAnthropic (count=${count}, model=haiku)`)
    const t0 = Date.now()
    const message = await callAnthropic({
      systemPrompt: this.systemPrompt,
      userMessage: userPrompt,
      model: LIGHT_MODEL,
      assistantPrefill: '[',
    })
    console.log(`[ai:research] ← done in ${Date.now() - t0}ms`)

    const rawResponse = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as TextBlock).text)
      .join('')

    const topics = parseJsonResponse<ResearchTopic[]>(message, 'array', '[')
    return { topics, userPrompt, rawResponse }
  }

  /**
   * Retry generation using conversation history.
   * Sends only the deficit count + updated exclusion list.
   * Source data is NOT re-sent — Claude retains it from the conversation history.
   */
  async generateTopicsRetry(
    deficit: number,
    originalUserPrompt: string,
    originalRawResponse: string,
  ): Promise<ResearchTopic[]> {
    console.log(`[ai:research] → retry callAnthropic (deficit=${deficit}, model=haiku)`)
    const t0 = Date.now()
    const message = await callAnthropic({
      systemPrompt: this.systemPrompt,
      userMessage: this.buildRetryPrompt(deficit),
      model: LIGHT_MODEL,
      assistantPrefill: '[',
      conversationHistory: [
        { role: 'user', content: originalUserPrompt },
        { role: 'assistant', content: '[' + originalRawResponse },
      ],
    })
    console.log(`[ai:research] ← retry done in ${Date.now() - t0}ms`)

    return parseJsonResponse<ResearchTopic[]>(message, 'array', '[')
  }

  // ---- System prompt (Step 3: role + language identity only) ----

  private buildResearcherSystemPrompt(): string {
    const { language, languageInstructions } = this.languageConfig

    const parts: string[] = [
      `You are a strategic content researcher for social media agencies.
You analyse raw business data — service descriptions, documents,
RSS feeds — and extract post themes that are specific, factual, and immediately
actionable for the client's social media manager.

You write exclusively in ${language} using natural native phrasing.
Never translate literally from English — write as a ${language} native speaker would.`,
    ]

    if (ResearchPromptBuilder.usesNonLatinScript(language)) {
      parts.push(
        `Every theme and excerpt must use the native ${language} script exclusively.
The only exception is 'source_url' which may contain Latin characters.`
      )
    }

    if (languageInstructions) {
      parts.push(languageInstructions)
    }

    return parts.join('\n\n')
  }

  // ---- User prompts (Step 4: theme rules + output format moved here) ----

  private buildResearcherUserPrompt(
    count: number,
    sourceContext: SourceContext,
    pillarsContext: string,
    historyContext: string,
  ): string {
    const rssSection = sourceContext.rssItems.length > 0
      ? buildPromptSection('RSS_FEED', 'rss_content',
          sourceContext.rssItems.map(i => `- ${i.title}: ${i.description} (${i.link})`).join('\n'))
      : ''

    const webSection = sourceContext.websiteExcerpts.length > 0
      ? buildPromptSection('WEBSITE_DATA', 'website_content',
          sourceContext.websiteExcerpts.map(w => `[URL: ${w.url}]\n${w.text}`).join('\n\n'))
      : ''

    const fileSection = sourceContext.fileExcerpts.length > 0
      ? buildPromptSection('INTERNAL_DOCUMENTS', 'document_content',
          sourceContext.fileExcerpts.map(f => `[File: ${f.label}]\n${f.text}`).join('\n\n'))
      : ''

    return `Date: ${todayDateString()}
Target: ${this.niche} | Language: ${this.languageConfig.language}
Task: Identify exactly ${count} unique post theme${count > 1 ? 's' : ''}.

### INPUT DATA:
${rssSection}
${webSection}
${fileSection}

### CONTENT PILLARS & DISTRIBUTION:
${pillarsContext}

### EXCLUSION LIST (Do NOT suggest these):
${historyContext}

### SOURCING PROTOCOL:
1. **Grounded Sourcing (Priority):** If the input data above contains specific facts, features, or updates, use them. Reference the source URL/Title in the JSON.
2. **Trend-Based Sourcing (Backup):** If data is missing for a required pillar, suggest a theme based on 2026 industry trends for "${this.niche}". Set source fields to null and describe the trend in 'source_excerpt'.

### THEME RULES (apply to every theme):
- 6–10 words. One punchy declarative statement.
- Must include one hard fact: price, location, feature name, or measurable result.
- Never generic. Name the specific thing, not the category.
- No clickbait. No dashes. No colons. No multiple sentences.

### JSON OUTPUT FORMAT:
Generate exactly ${count} object${count > 1 ? 's' : ''}:
[{
  "finding": "Why this theme was chosen (based on source or trend).",
  "suggested_theme": "The 6-10 word theme in ${this.languageConfig.language}.",
  "pillar": "Pillar name",
  "source_url": "string | null",
  "source_title": "string | null",
  "source_type": "rss | website | file | null",
  "source_excerpt": "5-8 sentence summary of key facts. Replace ALL double-quotes with single-quotes."
}]`
  }

  private buildTrendResearchPrompt(
    count: number,
    pillarsContext: string,
    historyContext: string,
  ): string {
    return `Date: ${todayDateString()}
Target: ${this.niche} | Language: ${this.languageConfig.language}
Task: Identify exactly ${count} unique, trend-based post theme${count > 1 ? 's' : ''}.

### RESEARCH BRIEF:
No client documents were provided for this run. Analyse the current April 2026 landscape for the "${this.niche}" industry. Focus on:
- **Seasonality:** What are consumers in the ${this.languageConfig.language} market concerned about right now?
- **Emerging Shifts:** New technologies, methods, or industry news making headlines this month.
- **Viral Formats:** Content structures currently performing well.

### CONTENT PILLARS & DISTRIBUTION:
${pillarsContext}

### EXCLUSION LIST (Do NOT repeat these):
${historyContext}

### THEME RULES (apply to every theme):
- 6–10 words. One punchy declarative statement.
- Must include one hard fact: price, location, feature name, or measurable result.
- Never generic. Name the specific thing, not the category.
- No clickbait. No dashes. No colons. No multiple sentences.

### JSON OUTPUT FORMAT:
Generate exactly ${count} object${count > 1 ? 's' : ''}. Use 'source_excerpt' to describe the specific trend or hook that justifies the theme.
[{
  "finding": "Specific observation of a current market trend or consumer behavior.",
  "suggested_theme": "The 6-10 word theme in ${this.languageConfig.language}.",
  "pillar": "Pillar name",
  "source_url": null,
  "source_title": null,
  "source_type": null,
  "source_excerpt": "A brief description of the industry trend or viral hook observed for 2026."
}]`
  }

  // ---- Retry prompt (Step 5: minimal — no source data re-sent) ----

  private buildRetryPrompt(deficit: number): string {
    const history = this.buildCoveredTopicsBlock()
    return `Good. Now generate ${deficit} more unique theme${deficit > 1 ? 's' : ''} from the same source content.

The new theme${deficit > 1 ? 's' : ''} must be completely distinct from everything already suggested.
${history}

Return exactly ${deficit} JSON object${deficit > 1 ? 's' : ''} using the same format as before.`
  }

  // ---- Shared block builders ----

  private buildPillarAllocationBlock(count: number): string {
    if (this.contentPillars.length === 0) return ''
    const allocation = allocateByWeight(this.contentPillars, count)
    const pillarInstructions = this.contentPillars
      .map((p) => `- "${p.pillar}" (${p.weight}%): generate ${allocation.get(p.pillar) ?? 0} topic(s)`)
      .join('\n')
    return `Content pillars with weighted distribution:\n${pillarInstructions}\nDistribute topics according to these weights. Include the pillar name in each topic's response.`
  }

  private buildCoveredTopicsBlock(): string {
    if (this.postHistory.length === 0) return ''
    return `\nRECENTLY COVERED TOPICS (do NOT suggest these or closely related themes — find fresh angles the client has NOT posted about yet):\n${this.postHistory.map((t) => `- ${t}`).join('\n')}\n`
  }

  // ---- Helpers ----

  private hasResearchSources(ctx?: SourceContext): boolean {
    return (
      !!ctx &&
      (ctx.rssItems.length > 0 || ctx.websiteExcerpts.length > 0 || ctx.fileExcerpts.length > 0)
    )
  }

  private static usesNonLatinScript(language: string): boolean {
    const nonLatinLanguages = ['Bulgarian', 'Russian', 'Ukrainian', 'Greek', 'Arabic', 'Hebrew', 'Chinese', 'Japanese', 'Korean']
    return nonLatinLanguages.includes(language)
  }
}
