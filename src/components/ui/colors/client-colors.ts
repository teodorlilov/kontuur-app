import { CLIENT_COLORS } from '@/utils/constants'

/**
 * Build a deterministic client-id → color map.
 * Sorts IDs alphabetically so the same client always gets the same color.
 */
export function getClientColorMap(clientIds: string[]): Map<string, string> {
  const sorted = [...clientIds].sort()
  const map = new Map<string, string>()
  for (let i = 0; i < sorted.length; i++) {
    const id = sorted[i]
    if (id) map.set(id, CLIENT_COLORS[i % CLIENT_COLORS.length] as string)
  }
  return map
}
