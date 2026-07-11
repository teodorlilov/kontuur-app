import type { BrandTokens, ColorRole, Composition, Layer } from './types'

const HEX = /#[0-9a-f]{3,8}\b/i
const COLOR_ROLES: readonly ColorRole[] = ['surface', 'ink', 'accent', 'accent-deep', 'line']

export type ValidationIssue = { path: string; message: string }

/**
 * Enforce the two invariants a SHARED composition template must satisfy: no literal
 * colours (hex) and no literal font families. Returns [] when clean.
 * Instances (`post_visuals.composition_json`) may carry literals from operator overrides
 * and are not validated here — this is the guard for feed-system templates only.
 */
export function validateShareableComposition(composition: Composition): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  composition.layers.forEach((layer, i) => walkLayer(layer, `layers[${i}]`, issues))
  return issues
}

/** Reject a token set missing any of the five colour roles. */
export function missingColorRoles(tokens: BrandTokens): ColorRole[] {
  return COLOR_ROLES.filter((role) => !tokens.color[role])
}

function walkLayer(layer: Layer, path: string, issues: ValidationIssue[]): void {
  if (layer.type === 'text' && layer.family.mode === 'literal') {
    issues.push({
      path: `${path}.family`,
      message: 'font family must be bound to a token, not a literal',
    })
  }
  scanForHex(layer, path, issues)
  if (layer.type === 'group') {
    layer.children.forEach((child, i) => walkLayer(child, `${path}.children[${i}]`, issues))
  }
}

/** Recursively flag any hex string. Skips `children`, which walkLayer descends into itself. */
function scanForHex(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value === 'string') {
    if (HEX.test(value)) {
      issues.push({ path, message: `hex literal "${value}" is not allowed; use a token role` })
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, i) => scanForHex(entry, `${path}[${i}]`, issues))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'children') continue
      scanForHex(entry, `${path}.${key}`, issues)
    }
  }
}
