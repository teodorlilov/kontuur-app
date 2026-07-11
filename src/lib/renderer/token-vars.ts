import type { BrandTokens, ColorRole } from '@/lib/scene-graph'

const ROLES: readonly ColorRole[] = ['surface', 'ink', 'accent', 'accent-deep', 'line']

/**
 * Map a brand kit's colours to the CSS custom properties `<Stage>` exposes:
 * `{ '--role-accent': '#…', … }`. Marks and layers reference these via `var(--role-*)`,
 * so a rebrand is a variable swap, not a re-render of anything.
 */
export function tokenVars(tokens: BrandTokens): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const role of ROLES) vars[`--role-${role}`] = tokens.color[role]
  return vars
}
