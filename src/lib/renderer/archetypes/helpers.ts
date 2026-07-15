import type { BlendMode, Binding, Clip, Composition, Layer, Rect, VAnchor } from '@/lib/scene-graph'

/**
 * Shared scene-graph authoring helpers for the archetype modules — the single home for the `lit`/`bound`/
 * `rect`/`base`/`comp` primitives that were previously copy-pasted across `reference-compositions.ts` and
 * `feed-system-compositions.ts`. Every archetype is authored at the 4:5 `SIZE`; `compose` adapts it to the
 * target ratio via `resolveComposition`. Tokens only (no hex, no literal families) so each passes
 * `validateShareableComposition`.
 */

export const lit = <T>(value: T): Binding<T> => ({ mode: 'literal', value })
export const bound = <T>(token: string): Binding<T> => ({ mode: 'bound', token })
export const rect = (x: number, y: number, w: number, h: number, rotate = 0): Rect => ({ x, y, w, h, rotate })

/** The 4:5 authoring canvas every archetype is composed at (1080-wide; height per ratio at render). */
const SIZE = { w: 1080, h: 1350 } as const

/** The common `LayerBase` fields for a layer — defaults for the boilerplate, overridable per layer. */
export function base(a: {
  id: string
  name: string
  rect: Rect
  vAnchor?: VAnchor
  opacity?: number
  blendMode?: BlendMode
  clip?: Clip
}) {
  return {
    id: a.id,
    name: a.name,
    locked: false,
    hidden: false,
    rect: a.rect,
    ...(a.vAnchor ? { vAnchor: a.vAnchor } : {}),
    opacity: lit(a.opacity ?? 1),
    blendMode: lit<BlendMode>(a.blendMode ?? 'normal'),
    clip: a.clip ?? { kind: 'none' as const },
  }
}

/** Assemble a composition at the authoring size. `feedSystemId` is cosmetic on a template — `compose`
 *  overwrites it with the post's stored slug. */
export function comp(id: string, feedSystemId: string, layers: Layer[]): Composition {
  return { id, feedSystemId, brandKitVersion: 1, size: SIZE, layers }
}
