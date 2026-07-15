import type { Archetype } from './types'
import { EDITORIAL_ARCHETYPES } from './editorial'
import { BOLD_BLOCKS_ARCHETYPES } from './bold-blocks'
import { QUIET_GRID_ARCHETYPES } from './quiet-grid'
import { GRAPHIC_ARCHETYPES } from './graphic'
import { VECTOR_ARCHETYPES } from './vector'

/**
 * The archetype **registry** — the single source of every layout, consumed by `compose` (sampling), the
 * feed-system showcase (previews/picker), and the imagery layer. Adding a layout is adding a module and
 * one entry here; nothing downstream changes.
 */
export type { Archetype } from './types'

const ALL: Archetype[] = [
  ...EDITORIAL_ARCHETYPES,
  ...BOLD_BLOCKS_ARCHETYPES,
  ...QUIET_GRID_ARCHETYPES,
  ...GRAPHIC_ARCHETYPES,
  ...VECTOR_ARCHETYPES,
]

export const ARCHETYPES: Record<string, Archetype> = Object.fromEntries(ALL.map((a) => [a.id, a]))

export function getArchetype(id: string): Archetype | undefined {
  return ARCHETYPES[id]
}
