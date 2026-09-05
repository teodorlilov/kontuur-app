import 'server-only'

import { facebookAdapter } from './facebook'
import { facebookComments } from './facebook-comments'
import { instagramAdapter } from './instagram'
import { instagramComments } from './instagram-comments'
import type { CommentsAdapter, NetworkAdapter } from './types'

/**
 * The networks this app can publish to, by the vocabulary
 * `social_connections.platform` uses — lowercase, not the display case
 * `PLATFORMS` carries.
 *
 * This registry is the single answer to "can we publish there". It replaces the
 * hard-coded platform check the publish path used to run, so a network that has
 * an adapter is publishable and one that does not is not — with no constant to
 * keep in agreement with it.
 */
const ADAPTERS: Record<string, NetworkAdapter> = {
  [instagramAdapter.platform]: instagramAdapter,
  [facebookAdapter.platform]: facebookAdapter,
}

/** The adapter for a platform, or null when we cannot publish there. */
export function resolveNetwork(platform: string): NetworkAdapter | null {
  return ADAPTERS[platform.toLowerCase()] ?? null
}

/**
 * The networks whose comments this app can read and moderate.
 *
 * Separate from `ADAPTERS` because publishing and moderating are separate capabilities — a
 * network could have one without the other — and because the comments queue asks a different
 * question than the publish path does.
 */
const COMMENT_ADAPTERS: Record<string, CommentsAdapter> = {
  [instagramComments.platform]: instagramComments,
  [facebookComments.platform]: facebookComments,
}

/** The comments adapter for a platform, or null when we cannot read its comments. */
export function resolveComments(platform: string): CommentsAdapter | null {
  return COMMENT_ADAPTERS[platform.toLowerCase()] ?? null
}

/**
 * Every network whose comments the queue can show.
 *
 * DERIVED from the registry, never listed beside it: a hand-kept list is the second source of
 * truth this arc keeps deleting, and the list is always the half that goes stale.
 */
export const COMMENTABLE_PLATFORMS: readonly string[] = Object.keys(COMMENT_ADAPTERS)
