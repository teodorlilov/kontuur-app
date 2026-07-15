import type { Composition, TextSlot } from '@/lib/scene-graph'

/**
 * A layout **archetype** — one self-contained slide layout, the unit of design variety. Compose samples
 * archetypes from the active style's pool (opener for the cover, closer for the CTA, content sampled with
 * variety) instead of the old fixed five-role cycle, and the imagery layer routes on `imagery`. Adding a
 * layout = adding one module + registering it; nothing else changes.
 */
export type ArchetypeKind = 'opener' | 'content' | 'closer'

/** What imagery this layout wants — drives model routing (Phase B) and whether fal runs at all. `none` is
 *  a pure-compositor slide (no spend); `photo`/`cutout` fill a plate; `vector` fills a generated mark. */
export type ArchetypeImagery = 'none' | 'photo' | 'cutout' | 'vector'

export type Archetype = {
  id: string
  kind: ArchetypeKind
  imagery: ArchetypeImagery
  /** The text slots this layout fills (informational; copy injection is slot-based in `injectCopy`). */
  slots: readonly TextSlot[]
  /** The token-bound template, authored at 4:5. Its `id` matches the archetype `id`. */
  composition: Composition
}

/** Build an Archetype, asserting the composition carries the archetype's id (keeps the registry honest). */
export function archetype(
  id: string,
  kind: ArchetypeKind,
  imagery: ArchetypeImagery,
  slots: readonly TextSlot[],
  composition: Composition
): Archetype {
  return { id, kind, imagery, slots, composition: { ...composition, id } }
}
