import { fetchSiteProfile } from './fetch-site-profile'
import { fetchInstagramProfile } from './fetch-instagram'
import { analyzeUrl } from '@/utils/ai'
import type { UrlAnalysisResponse } from '@/types/api'

interface AnalyzeBrandInput {
  websiteUrl?: string
  instagramHandle?: string
}

/**
 * Reads a brand's public presence and returns the model's read of it.
 *
 * `null` means nothing could be fetched at all — the one outcome both callers turn into a distinct
 * answer rather than an error, because a site that will not load is a fact about the site. An
 * unparseable model response throws through to the caller's boundary, where it is logged once.
 *
 * Shared because onboarding and the brand-profile re-read compose exactly the same three steps,
 * and a second copy is how the two would come to disagree about which sources a read includes.
 */
export async function analyzeBrand(input: AnalyzeBrandInput): Promise<UrlAnalysisResponse | null> {
  const websiteUrl = input.websiteUrl?.trim()
  const instagramHandle = input.instagramHandle?.trim().replace(/^@/, '')

  const [website, instagram] = await Promise.all([
    // The site, not the page: a homepage is usually a hero and a nav bar, and the profile drawn
    // from one is what the client's pillars and search queries are built on for good.
    websiteUrl ? fetchSiteProfile(websiteUrl).catch(() => null) : null,
    instagramHandle ? fetchInstagramProfile(instagramHandle).catch(() => null) : null,
  ])

  const websiteContent = website?.content ?? ''
  const instagramContent = instagram?.markdown ?? ''
  if (!websiteContent && !instagramContent) return null

  return analyzeUrl({ websiteContent, instagramContent })
}
