import type { DayState } from '@/lib/queries/week-coverage'

/**
 * How a day's state is drawn on a light ground: solid Deep Pine for published, an outlined cell
 * for scheduled, the hatch for open. The legend's swatches, the roster's chips and My week's
 * cards all read from here — they are the same three words at three sizes, and the strings used
 * to be spelled out at each.
 */
export const DAY_STATE_CLASSES: Record<DayState, string> = {
  published: 'bg-forest',
  scheduled: 'bg-surface shadow-[inset_0_0_0_1.5px_rgba(22,68,48,0.45)]',
  open: 'slot-open',
}

/** The same three states on the roster's dark capsule tier, where the ground inverts. */
export const DAY_STATE_CLASSES_ON_DARK: Record<DayState, string> = {
  published: 'bg-surface',
  scheduled: 'bg-transparent shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.65)]',
  open: 'slot-open-inv',
}
