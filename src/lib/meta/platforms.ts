/**
 * Which networks the product publishes to, and what they are called: the stored vocabulary
 * (`social_connections.platform`, every destination zod enum) and its names and marks.
 * Deliberately import-free — `lib/meta/networks` reads it, so it must never read back.
 */

/** How `social_connections.platform` and the Meta OAuth flow spell a network. */
export const POST_PLATFORMS = ['instagram', 'facebook'] as const

export type PostPlatform = (typeof POST_PLATFORMS)[number]

/** How each network is named to a person; the adapters' `label` reads this too. */
export const PLATFORM_NAMES: Record<PostPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
}

/** Two-letter marks for where a name will not fit. */
export const PLATFORM_MARKS: Record<PostPlatform, string> = {
  instagram: 'IG',
  facebook: 'FB',
}

/** Name a set of destinations the way a sentence would: "Instagram and Facebook". */
export function namePlatforms(platforms: readonly string[]): string {
  const names = platforms.flatMap((platform) => {
    const known = toPublishingPlatform(platform)
    return known ? [PLATFORM_NAMES[known]] : []
  })
  return new Intl.ListFormat('en', { type: 'conjunction' }).format(names)
}

/**
 * The connection's network, canonically spelled, or null for a row we do not publish to (Canva
 * shares the table). Tolerates display case.
 */
export function toPublishingPlatform(platform: string | null | undefined): PostPlatform | null {
  return POST_PLATFORMS.find((p) => p === platform?.toLowerCase()) ?? null
}
