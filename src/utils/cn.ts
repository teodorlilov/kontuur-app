import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The Contour type ramp, as tailwind-merge needs to see it.
 *
 * `text-*` is ambiguous — it is both the font-size and the text-colour utility —
 * so tailwind-merge decides which group a class belongs to by matching it against
 * the scales it knows. It has never heard of `text-body` or `text-caption`, so it
 * filed every step of this ramp under *colour* and treated them as conflicting
 * with `text-white`.
 *
 * The later class wins a conflict, and the size classes are appended after the
 * variant classes in both Button and ActionLink — so `text-white` was being
 * deleted from every primary button, leaving inherited dark ink on Deep Pine.
 * Registering the ramp as font-size restores the size-vs-colour distinction.
 *
 * Keep this in step with the `--text-*` tokens in globals.css — in both
 * directions. A step missing from here silently eats whatever colour precedes
 * it; a step left here after its token is deleted keeps a dead name working in
 * merges. `src/app/__tests__/type-ramp.test.ts` asserts the two sets are equal,
 * so neither can drift unnoticed.
 */
export const TYPE_RAMP = [
  'prompt',
  'metric',
  'headline',
  'display',
  'lead',
  'title',
  'body',
  'caption',
  'micro',
  'label',
]

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: TYPE_RAMP }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
