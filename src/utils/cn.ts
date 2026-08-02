import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The Contour type ramp, as tailwind-merge needs to see it.
 *
 * `text-*` is ambiguous — it is both the font-size and the text-colour utility —
 * so tailwind-merge decides which group a class belongs to by matching it against
 * the scales it knows. It has never heard of `text-body-lg`, so it filed every
 * step of this ramp under *colour* and treated them as conflicting with
 * `text-white`.
 *
 * The later class wins a conflict, and the size classes are appended after the
 * variant classes in both Button and ActionLink — so `text-white` was being
 * deleted from every primary button, leaving inherited dark ink on Deep Pine.
 * Registering the ramp as font-size restores the size-vs-colour distinction.
 *
 * Keep this in step with the `--text-*` tokens in globals.css. A missing step
 * does not fail loudly; it silently eats whatever colour precedes it.
 */
const TYPE_RAMP = [
  'metric',
  'headline',
  'display-lg',
  'display',
  'display-sm',
  'title',
  'body-lg',
  'body',
  'stat-label',
  'caption-lg',
  'caption',
  'micro',
  'label-lg',
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
