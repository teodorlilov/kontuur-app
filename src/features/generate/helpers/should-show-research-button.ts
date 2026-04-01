import type { SourceStrategy } from '@/types/api'

/** The "Research more topics" button should only appear when
 *  trend-based research is enabled (or when no strategy is set,
 *  which defaults to enabled). */
export function shouldShowResearchButton(
  sourceStrategy: SourceStrategy | null | undefined
): boolean {
  return sourceStrategy?.trend_fallback !== false
}
