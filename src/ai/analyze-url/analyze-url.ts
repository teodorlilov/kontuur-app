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
  "detected_content_pillars": [{ "pillar": string, "weight": number }] (exactly 4 content themes with weights summing to 100),
  "detected_services_products": string[] (specific services or products they offer),
  "detected_language": string (primary language of content),
  "detected_language_formality": "formal" | "casual" | "neutral",
  "detected_is_health_niche": boolean,
  "detected_testimonial_voice": string | null (if you can infer how a happy customer would describe them, write one sentence — otherwise null),
  "detected_avoid_topics": string | null (any topics that seem off-brand or risky for this business),
  "detected_vibe_preset": "luxury-minimalist" | "modern-tech" | "creative-edgy" | "polished-photo" (the best-fit visual vibe — see guide below)
}

For content pillars, identify the main themes/topics this business should post about based on their services and content. Assign weights reflecting how much emphasis each pillar should get (must sum to 100).

For the vibe preset, pick the ONE visual language that best fits this brand:
- "luxury-minimalist": soft lighting, neutral/beige palettes, editorial negative space — aesthetic clinics, skincare, premium real estate, high-end coaching.
- "modern-tech": 3D isometric shapes, flat vibrant vectors, geometric — SaaS, marketing/finance/crypto agencies, B2B.
- "creative-edgy": risograph texture, halftone, neon, bold retro-modern — freelancers, Gen-Z brands, streetwear, media.
- "polished-photo": realistic lifestyle photography, natural sunlight, product close-ups — e-commerce, lifestyle, restaurants, fitness.

Return JSON only, no markdown wrapper.`
}
