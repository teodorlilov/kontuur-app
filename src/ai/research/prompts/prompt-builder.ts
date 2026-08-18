import { allocateByWeight, type WeightedPillar } from '@/lib/clients/content-pillars'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import type { SourceContext, TopicBrief } from '../types'
import { todayDateString } from '@/ai/utils/prompt-helpers'
import { buildLanguageRules } from '@/ai/shared/build-prompt-sections'
import {
  DEFENSIVE_DATA_CLAUSE,
  PROMPT_FIELD_LIMITS,
  sanitizePromptField,
  sanitizeSourceText,
} from '@/ai/utils/sanitize'

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
  private readonly recentPillarCounts?: Map<string, number>
  readonly systemPrompt: string

  constructor(opts: {
    niche: string
    languageConfig: LanguageConfig
    contentPillars: WeightedPillar[]
    postHistory: string[]
    excludedUrls?: string[]
    /** Recent posts per pillar — enables deficit-aware allocation (small batches rotate pillars). */
    recentPillarCounts?: Map<string, number>
  }) {
    this.niche = opts.niche
    this.languageConfig = opts.languageConfig
    this.contentPillars = opts.contentPillars
    this.postHistory = opts.postHistory
    this.excludedUrls = opts.excludedUrls ?? []
    this.recentPillarCounts = opts.recentPillarCounts
    this.systemPrompt = this.buildResearchSystemPrompt()
  }

  /**
   * Build the user prompt that plans a whole run: a topic for every user-supplied
   * brief, plus `researchCount` the model chooses itself.
   *
   * Both in one call on purpose. Separate passes could hand the same article to a
   * brief and to a researched topic, because neither would know what the other took.
   */
  buildTopicPlanPrompt(
    plan: { briefs: readonly TopicBrief[]; researchCount: number },
    sourceContext?: SourceContext
  ): string {
    const ctx: SourceContext = sourceContext ?? {
      rssItems: [],
      websiteExcerpts: [],
      fileExcerpts: [],
    }
    return this.buildSourcedPrompt(
      plan,
      ctx,
      this.buildPillarAllocationBlock(plan.researchCount),
      this.buildCoveredTopicsBlock()
    )
  }

  // ---- Private prompt builders ----

  private buildResearchSystemPrompt(): string {
    const { language } = this.languageConfig
    const parts = [
      `You are a strategic content researcher for social media agencies.
You read raw business data and extract post themes that are specific, factual, and immediately usable by a social media manager.

${DEFENSIVE_DATA_CLAUSE}

### THEME RULES (read before analysing the source):
- Short summary of the them in native ${language}. One punchy declarative statement — not a question, not a comparison.
- Must name ONE specific thing: a device, a mechanism, a condition name, a measurable result, or a number.
- NEVER: comparison frames ("X vs Y", "X срещу Y"), category summaries ("ползите от...", "видове..."), article-title endings ("...разликите", "...предимствата").
- Must be specific to this client — not writeable by any clinic in the niche.
`,
      buildLanguageRules(this.languageConfig),
    ]
    return parts.filter(Boolean).join('\n\n')
  }

  /**
   * The five source sections, in the order the model reads them.
   *
   * Every field below is third-party text the agency does not control — a feed item, a
   * scraped page, an uploaded document, a search result, a Meta caption — so all of it
   * goes through a sanitiser before it lands inside an XML-style section. Unescaped, any
   * one of them could close its own tag and address the model directly, which would let
   * whoever writes a subscribed feed steer what the agency publishes under a client's
   * name. Short fields cap through `sanitizePromptField`; bodies use `sanitizeSourceText`
   * because their length is already budgeted in `source-gathering.ts` (see its JSDoc).
   */
  private buildSourceMaterialBlock(sourceContext: SourceContext): string {
    const pillarTagFor = (pillars?: string[]): string =>
      pillars?.length
        ? `[${pillars.map((p) => sanitizePromptField(p, PROMPT_FIELD_LIMITS.short)).join(', ')}] `
        : ''

    const rssSection =
      sourceContext.rssItems.length > 0
        ? buildPromptSection(
            'RSS_FEED',
            'rss_content',
            sourceContext.rssItems
              .map((i) => {
                const tag = pillarTagFor(i.eligiblePillars)
                const title = sanitizePromptField(i.title)
                const description = sanitizePromptField(i.description)
                const link = sanitizePromptField(i.link)
                return `- ${tag}${title}: ${description} (${link})`
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
                const tag = pillarTagFor(w.eligiblePillars)
                const url = sanitizePromptField(w.url)
                const text = sanitizeSourceText(w.text)
                return w.focusInstructions
                  ? `${tag}[URL: ${url}]\n[Focus: ${sanitizePromptField(w.focusInstructions, PROMPT_FIELD_LIMITS.long)}]\n${text}`
                  : `${tag}[URL: ${url}]\n${text}`
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
                const tag = pillarTagFor(f.eligiblePillars)
                return `${tag}[File: ${sanitizePromptField(f.label, PROMPT_FIELD_LIMITS.short)}]\n${sanitizeSourceText(f.text)}`
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
                const tag = pillarTagFor(r.eligiblePillars)
                const title = sanitizePromptField(r.title)
                const snippet = sanitizePromptField(r.snippet)
                const url = sanitizePromptField(r.url)
                return `- ${tag}${title}: ${snippet} (${url})`
              })
              .join('\n')
          )
        : ''

    const performanceSection =
      sourceContext.performanceItems && sourceContext.performanceItems.length > 0
        ? buildPromptSection(
            'TOP_PERFORMING_RECENT_POSTS',
            'performance_content',
            `This client's best recent posts — angles their audience has PROVEN to respond to. Propose FOLLOW-UP angles (a deeper dive, the next step, the question the post raised). Never repeat the same content.\n` +
              sourceContext.performanceItems
                .map((p) => {
                  // A caption is fetched back from Meta, not written here — same posture
                  // as the feeds above, capped at `long` because Instagram allows 2200.
                  const pillarTag = p.pillar
                    ? `[${sanitizePromptField(p.pillar, PROMPT_FIELD_LIMITS.short)}] `
                    : ''
                  const link = p.permalink ? ` (${sanitizePromptField(p.permalink)})` : ''
                  const caption = sanitizePromptField(p.caption, PROMPT_FIELD_LIMITS.long)
                  return `- ${pillarTag}"${caption}" — ${p.engagementSummary}${link}`
                })
                .join('\n')
          )
        : ''

    return `${rssSection}
${webSection}
${fileSection}
${webSearchSection}
${performanceSection}`
  }

  /**
   * Requested posts the model must plan, listed before the sourcing rules so the
   * source assignments below are made with the requests already in view.
   */
  private buildRequestedPostsBlock(briefs: readonly TopicBrief[]): string {
    if (briefs.length === 0) return ''
    const lines = briefs.map((b, i) => `${i + 1}. "${sanitizePromptField(b.text)}"`).join('\n')
    return `
### REQUESTED POSTS — the client asked for these by name. One topic each, brief_index set to the number shown:
${lines}
`
  }

  private buildSourcedPrompt(
    plan: { briefs: readonly TopicBrief[]; researchCount: number },
    sourceContext: SourceContext,
    pillarsContext: string,
    historyContext: string
  ): string {
    const { briefs, researchCount } = plan
    const count = researchCount
    // Additive by design: with no briefs every one of these is '' and the prompt is
    // byte-identical to the batch prompt that shipped before briefs existed. The
    // snapshot in research-prompt-stability.test.ts is what holds that true.
    const briefRules =
      briefs.length === 0
        ? ''
        : `
- The REQUESTED POSTS above are required. Return exactly one topic per requested post, with brief_index set to its number, in addition to the ${count} you choose yourself.
- A requested post's topic keeps the client's intent — do not substitute a different subject because the sources suit it better.
- Give each requested post the single best-matching source. If nothing in the source material genuinely relates to it, set source_url, source_title and source_type to null rather than attaching a loose match — an unsourced post is honest, a mismatched one is not.
- Never give the same source_url to a requested post and to a topic you chose. Requested posts have first claim.
- Requested posts get pillar null: the client asked for them, so they sit outside the pillar rotation.`
    const briefTask =
      briefs.length === 0
        ? ''
        : ` Also return one topic for each of the ${briefs.length} REQUESTED POST${briefs.length > 1 ? 'S' : ''} above.`
    const briefIndexField =
      briefs.length === 0
        ? ''
        : `\n  "brief_index": "the requested post's number, or null if you chose this topic yourself",`

    return `Date: ${todayDateString()}
### NICHE: ${this.niche}

### CONTENT PILLARS & DISTRIBUTION:
${pillarsContext}

### EXCLUSION LIST:
${historyContext}
${this.buildRequestedPostsBlock(briefs)}
### SOURCE MATERIAL (use for grounding):
${this.buildSourceMaterialBlock(sourceContext)}

### SOURCING RULES:
- Every topic MUST be grounded in the provided source material. Never use your own knowledge.
- If a source item has a pillar tag in brackets (e.g. [Pillar A, Pillar B]), only use it for the named pillars. Untagged items are available to all pillars.
- RSS items → source_type "rss", source_url = item link.
- Website pages → source_type "website", source_url = page URL.
- Documents → source_type "file", source_url = null.
- Web search → source_type "web_search", source_url = result URL.
- Top performing posts → source_type "performance", source_url = the post's permalink or null.
- Prefer source items tied to seasonal moments, holidays, or occasions relevant to this niche and the ${this.languageConfig.language} market in the next 4-6 weeks — but ONLY when the source material itself supports the topic; never invent seasonal content without a source.
- If a pillar has no available source items, omit that pillar entirely — do NOT fabricate.
- Never return a topic with source_url null unless source_type is "file" or "performance".
- Maximize source diversity: use each available source URL at least once before reusing any URL for a second topic. Each topic from the same URL must cover a genuinely different angle.
- source_excerpt MUST only contain information that is explicitly present in the source material. Do NOT add facts, mechanisms, claims, or details from your own knowledge — even if they are technically correct. If the source doesn't mention something, it must not appear in the excerpt.${briefRules}

### TASK: Identify up to ${count} unique post theme${count > 1 ? 's' : ''}. Return only topics grounded in the provided source material — fewer than ${count} is acceptable if sources don't fully cover all pillars.${briefTask}
[{
  "finding": "one sentence: why this theme, what specific fact justifies it",${briefIndexField}
  "suggested_theme": "5-10 words summary about the theme in ${this.languageConfig.language}, use proper grammer",
  "pillar": "pillar name",
  "source_url": "url or null",
  "source_title": "title or null",
  "source_type": "rss | website | file | web_search | performance | null",
  "source_excerpt": "Write in ${this.languageConfig.language}. ${this.buildExcerptSpec()} Each sentence must correspond to a specific passage in the source — do not infer, interpret, or connect facts that the source does not explicitly connect. Include only facts, claims, and details that are explicitly stated — do NOT add information from your own knowledge, even if technically correct. For technical or medical terms, use the established term in ${this.languageConfig.language}. If no established term exists, keep the original English term — do NOT create hybrid transliterations mixing Latin and Cyrillic characters. Replace all double-quotes with single-quotes."
}]`
  }

  /**
   * How much the excerpt must carry. For non-English clients the excerpt is the
   * writer's ONLY grounding text (the raw English source stays out of the
   * writer's prompt to stop translationese), so it must hold every fact the
   * post could need. English clients keep the lean spec — their writer still
   * reads the full source text, and a longer excerpt would only cost tokens.
   */
  private buildExcerptSpec(): string {
    const isEnglish = this.languageConfig.language.trim().toLowerCase() === 'english'
    return isEnglish
      ? '5-8 sentences extracting the key facts from the source.'
      : `8-12 sentences extracting the key facts from the source. This excerpt is the ONLY source text the post writer will see, so carry every number, price, percentage, named person, named product and concrete claim from the source that the theme needs.`
  }

  private buildPillarAllocationBlock(count: number): string {
    if (this.contentPillars.length === 0) return ''
    const allocation = allocateByWeight(this.contentPillars, count, this.recentPillarCounts)
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
