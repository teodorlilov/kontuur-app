import type { BrandTokens, ColorRole } from '@/lib/scene-graph'

/**
 * Canvas needs concrete colours, not the CSS custom properties the DOM renderer used. `roleColor`
 * resolves a colour role to its hex; `substituteRoleVars` rewrites an SVG mark's `var(--role-*)`
 * fills/strokes to hex so it rasterises correctly (a data-URL SVG can't read CSS variables).
 */
export function roleColor(tokens: BrandTokens, role: ColorRole): string {
  return tokens.color[role]
}

const ROLE_VAR = /var\(\s*--role-([a-z-]+)\s*\)/g

/** Replace every `var(--role-<role>)` in an SVG string with the kit's hex for that role. */
export function substituteRoleVars(svg: string, tokens: BrandTokens): string {
  return svg.replace(ROLE_VAR, (whole, role: string) => {
    const hex = tokens.color[role as ColorRole]
    return hex ?? whole
  })
}
