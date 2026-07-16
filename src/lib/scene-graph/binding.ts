import type { Binding, BrandTokens } from './types'

/** A literal binding — the value is used as-is (the single authoring helper for `{ mode: 'literal' }`). */
export const lit = <T>(value: T): Binding<T> => ({ mode: 'literal', value })

/** A token binding — resolved against the kit at render (the single helper for `{ mode: 'bound' }`). */
export const bound = <T>(token: string): Binding<T> => ({ mode: 'bound', token })

/**
 * Resolve a binding against a brand kit's tokens.
 * `literal` returns its value; `bound` looks up a dot-path (e.g. 'color.accent',
 * 'type.display.family') in `tokens`. Throws on an unknown path — a dangling token
 * reference is a bug, never a silent fallback.
 */
export function resolve<T>(binding: Binding<T>, tokens: BrandTokens): T {
  if (binding.mode === 'literal') return binding.value
  const value = lookup(tokens, binding.token)
  if (value === undefined) {
    throw new Error(`Unknown token path: "${binding.token}"`)
  }
  // The path is resolved dynamically, so the runtime type is unknowable here; the
  // caller declares T for the binding it created. This is the one unavoidable assertion.
  return value as T
}

function lookup(tokens: BrandTokens, path: string): unknown {
  let current: unknown = tokens
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
    if (current === undefined) return undefined
  }
  return current
}
