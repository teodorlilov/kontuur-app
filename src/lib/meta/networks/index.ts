import 'server-only'

import { instagramAdapter } from './instagram'
import type { NetworkAdapter } from './types'

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
}

/** The adapter for a platform, or null when we cannot publish there. */
export function resolveNetwork(platform: string): NetworkAdapter | null {
  return ADAPTERS[platform.toLowerCase()] ?? null
}
