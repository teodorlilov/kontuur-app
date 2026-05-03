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
              .map((i) => {
                const tag = i.eligiblePillars?.length ? `[${i.eligiblePillars.join(', ')}] ` : ''
                return `- ${tag}${i.title}: ${i.description} (${i.link})`
              })
              .join('\n')
          )
        : ''

    const webSection =
      sourceContext.websiteExcerpts.length > 0
        ? buildPromptSection(
            'WEBSITE_DATA',
            'website_content',
            sourceContext.websiteExcerpts
              .map((w) => {
                const tag = w.eligiblePillars?.length ? `[${w.eligiblePillars.join(', ')}] ` : ''
                return w.focusInstructions
                  ? `${tag}[URL: ${w.url}]\n[Focus: ${w.focusInstructions}]\n${w.text}`
                  : `${tag}[URL: ${w.url}]\n${w.text}`
              })
              .join('\n\n')
          )
        : ''

    const fileSection =
      sourceContext.fileExcerpts.length > 0
        ? buildPromptSection(
            'INTERNAL_DOCUMENTS',
            'document_content',
            sourceContext.fileExcerpts
              .map((f) => {
                const tag = f.eligiblePillars?.length ? `[${f.eligiblePillars.join(', ')}] ` : ''
                return `${tag}[File: ${f.label}]\n${f.text}`
              })
              .join('\n\n')
          )
        : ''

    const webSearchSection =
      sourceContext.webSearchItems && sourceContext.webSearchItems.length > 0
        ? buildPromptSection(
            'WEB_SEARCH_RESULTS',
            'web_search_content',
            sourceContext.webSearchItems
              .map((r) => {
                const tag = r.eligiblePillars?.length ? `[${r.eligiblePillars.join(', ')}] ` : ''
                return `- ${tag}${r.title}: ${r.snippet} (${r.url})`
              })
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

### SOURCING RULES:
- Every topic MUST be grounded in the provided source material. Never use your own knowledge.
- If a source item has a pillar tag in brackets (e.g. [Pillar A, Pillar B]), only use it for the named pillars. Untagged items are available to all pillars.
- RSS items → source_type "rss", source_url = item link.
- Website pages → source_type "website", source_url = page URL.
- Documents → source_type "file", source_url = null.
- Web search → source_type "web_search", source_url = result URL.
- If a pillar has no available source items, omit that pillar entirely — do NOT fabricate.
- Never return a topic with source_url null unless source_type is "file".
- Maximize source diversity: use each available source URL at least once before reusing any URL for a second topic. Each topic from the same URL must cover a genuinely different angle.
- source_excerpt MUST only contain information that is explicitly present in the source material. Do NOT add facts, mechanisms, claims, or details from your own knowledge — even if they are technically correct. If the source doesn't mention something, it must not appear in the excerpt.

### TASK: Identify up to ${count} unique post theme${count > 1 ? 's' : ''}. Return only topics grounded in the provided source material — fewer than ${count} is acceptable if sources don't fully cover all pillars.
[{
  "finding": "one sentence: why this theme, what specific fact justifies it",
  "suggested_theme": "5-10 words summary about the theme in ${this.languageConfig.language}, use proper grammer",
  "pillar": "pillar name",
  "source_url": "url or null",
  "source_title": "title or null",
  "source_type": "rss | website | file | web_search | null",
  "source_excerpt": "Write in ${this.languageConfig.language}. 5-8 sentences extracting the key facts from the source. Each sentence must correspond to a specific passage in the source — do not infer, interpret, or connect facts that the source does not explicitly connect. Include only facts, claims, and details that are explicitly stated — do NOT add information from your own knowledge, even if technically correct. For technical or medical terms, use the established term in ${this.languageConfig.language}. If no established term exists, keep the original English term — do NOT create hybrid transliterations mixing Latin and Cyrillic characters. Replace all double-quotes with single-quotes."
}]`
  }

  private buildPillarAllocationBlock(count: number): string {
    if (this.contentPillars.length === 0) return ''
    const allocation = allocateByWeight(this.contentPillars, count)
    const pillarInstructions = this.contentPillars
      .map((p) => {
        const n = allocation.get(p.pillar) ?? 0
        return `- "${p.pillar}" (${p.weight}%): generate ${n} topic(s)`
      })
      .join('\n')

    return `Content pillars with weighted distribution:\n${pillarInstructions}`
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
