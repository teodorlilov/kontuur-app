import { allocateByWeight, type WeightedPillar } from '@/lib/clients/content-pillars'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import type { SourceContext } from '../types'
import { todayDateString } from '@/ai/utils/prompt-helpers'
import { buildLanguageRulesSection } from '@/ai/shared/build-client-profile'

function buildPromptSection(title: string, tag: string, content: string): string {
  if (!content.trim()) return ''
  return `${title}:\n<${tag}>\n${content}\n</${tag}>`
}

export class ResearchPromptBuilder {
  private readonly niche: string
  private readonly languageConfig: LanguageConfig
  private readonly contentPillars: WeightedPillar[]
  private postHistory: string[]
  private readonly excludedUrls: string[]
  readonly systemPrompt: string

  constructor(opts: {
    niche: string
    languageConfig: LanguageConfig
    contentPillars: WeightedPillar[]
    postHistory: string[]
    excludedUrls?: string[]
  }) {
    this.niche = opts.niche
    this.languageConfig = opts.languageConfig
    this.contentPillars = opts.contentPillars
    this.postHistory = opts.postHistory
    this.excludedUrls = opts.excludedUrls ?? []
    this.systemPrompt = this.buildResearchSystemPrompt()
  }

  /** Build the user prompt for the initial generation request. */
  buildResearchUserPrompt(count: number, sourceContext?: SourceContext): string {
    const pillarsContext = this.buildPillarAllocationBlock(count)
    const historyContext = this.buildCoveredTopicsBlock()
    const ctx: SourceContext = sourceContext ?? { rssItems: [], websiteExcerpts: [], fileExcerpts: [] }
    return this.buildSourcedPrompt(count, ctx, pillarsContext, historyContext)
  }

  // ---- Private prompt builders ----

  private buildResearchSystemPrompt(): string {
    const { language } = this.languageConfig
    const parts = [
      `You are a strategic content researcher for social media agencies.
You read raw business data and extract post themes that are specific, factual, and immediately usable by a social media manager.

### THEME RULES (read before analysing the source):
- Short summary of the them in native ${language}. One punchy declarative statement — not a question, not a comparison.
- Must name ONE specific thing: a device, a mechanism, a condition name, a measurable result, or a number.
- NEVER: comparison frames ("X vs Y", "X срещу Y"), category summaries ("ползите от...", "видове..."), article-title endings ("...разликите", "...предимствата").
- Must be specific to this client — not writeable by any clinic in the niche.
`,
      buildLanguageRulesSection(this.languageConfig),
    ]
    return parts.filter(Boolean).join('\n\n')
  }

  private buildSourcedPrompt(
    count: number,
    sourceContext: SourceContext,
    pillarsContext: string,
    historyContext: string
  ): string {
    const rssSection =
      sourceContext.rssItems.length > 0
        ? buildPromptSection(
            'RSS_FEED',
            'rss_content',
            sourceContext.rssItems
              .map((i) => `- ${i.title}: ${i.description} (${i.link})`)
              .join('\n')
          )
        : ''

    const webSection =
      sourceContext.websiteExcerpts.length > 0
        ? buildPromptSection(
            'WEBSITE_DATA',
            'website_content',
            sourceContext.websiteExcerpts.map((w) => `[URL: ${w.url}]\n${w.text}`).join('\n\n')
          )
        : ''

    const fileSection =
      sourceContext.fileExcerpts.length > 0
        ? buildPromptSection(
            'INTERNAL_DOCUMENTS',
            'document_content',
            sourceContext.fileExcerpts.map((f) => `[File: ${f.label}]\n${f.text}`).join('\n\n')
          )
        : ''

    const webSearchSection =
      sourceContext.webSearchItems && sourceContext.webSearchItems.length > 0
        ? buildPromptSection(
            'WEB_SEARCH_RESULTS',
            'web_search_content',
            sourceContext.webSearchItems
              .map((r) => `- ${r.title}: ${r.snippet} (${r.url})`)
              .join('\n')
          )
        : ''

    return `Date: ${todayDateString()}
### NICHE: ${this.niche}

### CONTENT PILLARS & DISTRIBUTION:
${pillarsContext}

### EXCLUSION LIST:
${historyContext}

### SOURCE MATERIAL (use for grounding):
${rssSection}
${webSection}
${fileSection}
${webSearchSection}

### SOURCING:
- Grounded (priority): use specific facts, device names, mechanisms from the source above. Reference source URL.
- RSS/website/file: set source_type to "rss", "website", or "file" respectively.
- Web search (trend): items from WEB_SEARCH_RESULTS are current web articles from this month. Set source_type to "web_search".
- Trend fallback: if a pillar has no source coverage, use ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })} trends. Set source fields to null.


### TASK: Identify exactly ${count} unique post theme${count > 1 ? 's' : ''}.


CRITICAL: You MUST return EXACTLY ${count} JSON object${count > 1 ? 's' : ''} — never fewer. If source material does not cover all pillars, use current ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })} industry trends for the remaining slots and set source fields to null.
[{
  "finding": "one sentence: why this theme, what specific fact justifies it",
  "suggested_theme": "5-10 words summary about the theme in ${this.languageConfig.language}, use proper grammer",
  "pillar": "pillar name",
  "source_url": "url or null",
  "source_title": "title or null",
  "source_type": "rss | website | file | web_search | null",
  "source_excerpt": "Write in ${this.languageConfig.language}. 5-8 sentences covering: (1) who this is for and what specific problems or conditions it addresses, (2) how it works — name the exact mechanism, technology, or clinical approach, (3) what measurable result or outcome it delivers. Use correct professional terminology as a practitioner in ${this.languageConfig.language} would write it — do NOT transliterate or literally translate terms from the source language. This text will be used directly as the primary grounding context for post generation, so it must be accurate, specific, and written in the client's register. Replace all double-quotes with single-quotes."
}]`
  }

  private buildPillarAllocationBlock(count: number): string {
    if (this.contentPillars.length === 0) return ''
    const allocation = allocateByWeight(this.contentPillars, count)
    const pillarInstructions = this.contentPillars
      .map(
        (p) => `- "${p.pillar}" (${p.weight}%): generate ${allocation.get(p.pillar) ?? 0} topic(s)`
      )
      .join('\n')
    return `Content pillars with weighted distribution:\n${pillarInstructions}\nDistribute topics according to these weights. Include the pillar name in each topic's response.`
  }

  private buildCoveredTopicsBlock(): string {
    const lines: string[] = []
    if (this.postHistory.length > 0) {
      lines.push(`RECENTLY COVERED TOPICS (do NOT suggest these or closely related themes — find fresh angles the client has NOT posted about yet):\n${this.postHistory.map((t) => `- ${t}`).join('\n')}`)
    }
    if (this.excludedUrls.length > 0) {
      lines.push(`DO NOT use these source URLs — already used in previous posts:\n${this.excludedUrls.map((u) => `- ${u}`).join('\n')}`)
    }
    return lines.length > 0 ? `\n${lines.join('\n\n')}\n` : ''
  }

}
