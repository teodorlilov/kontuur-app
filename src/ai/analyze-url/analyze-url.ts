export interface AnalyzeUrlInput {
  websiteContent?: string
  instagramContent?: string
}

export function buildAnalyzeUrlPrompt(input: AnalyzeUrlInput): string {
  const contentSections: string[] = []
  if (input.websiteContent) {
    contentSections.push(
      `WEBSITE CONTENT:\n<website_content>\n${input.websiteContent}\n</website_content>`
    )
  }
  if (input.instagramContent) {
    contentSections.push(
      `INSTAGRAM PROFILE:\n<instagram_content>\n${input.instagramContent}\n</instagram_content>`
    )
  }

  return `Analyze the following content from a business's online presence and extract a structured brand profile for social media content creation.

${contentSections.join('\n\n---\n\n')}

Based on this content, return a JSON object with these fields:
{
  "detected_business_name": string | null (the business/brand name as it appears on the website or profile — null if not found),
  "detected_niche": string (2-5 words, e.g. "dermatology clinic", "physiotherapy clinic", "real estate agency" — concise and search-friendly, NOT a full description),
  "detected_niche_confidence": "high" | "medium" | "low",
  "detected_target_audience": string[] (2-4 specific audience segments),
  "detected_tone": string (the tone/voice they use — e.g. "Expert and trustworthy", "Warm and approachable"),
  "detected_content_pillars": [{ "pillar": string, "weight": number }] (exactly 4 researchable subject areas — see the pillar rules below — with weights summing to 100),
  "detected_services_products": string[] (specific services or products they offer),
  "detected_language": string (primary language of content),
  "detected_language_formality": "formal" | "casual" | "neutral",
  "detected_is_health_niche": boolean,
  "detected_avoid_topics": string | null (any topics that seem off-brand or risky for this business)
}

CONTENT PILLARS — read this before answering that field.

Each pillar is handed to a research pipeline as a WEB SEARCH QUERY, to find fresh outside material this business can post about. A pillar only works if people who do NOT work at this business publish about it: industry news, techniques, data, tools, how-to coverage.

So name the SUBJECT this business has expertise in — not the categories of content on their own website. A pillar about the business itself (its own projects, results, clients, culture, process or team) returns no search results and wastes its entire share of the output.

The test: could a trade publication, a practitioner or a specialist blog have written about this pillar last month WITHOUT mentioning this business? If not, rewrite it outward. The website describes the business; the pillars must describe its FIELD.

- "Our Recent Builds" (a builder's own projects) → "Energy-efficient retrofit methods and building regulations"
- "Meet the Team" (a law firm's own people) → "Employment law changes and compliance deadlines"
- "Our Patient Stories" (a clinic's own clients) → "Polynucleotide and PDRN skin regeneration"

Those examples teach the rewrite, not a vocabulary. Answer in the language and terminology of THIS business's own field, whatever it is.

Weights reflect how much emphasis each pillar should get and must sum to 100.

Return JSON only, no markdown wrapper.`
}
