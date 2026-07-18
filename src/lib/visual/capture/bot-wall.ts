import type { PageMeasurement } from '@/lib/visual/extract/measure'

const CHALLENGE =
  /(just a moment|checking your browser|verifying you are human|enable javascript|access denied|attention required|are you a robot|cf-browser-verification|please verify)/i

/** True when the page looks like a bot-wall / JS-challenge / blocked page rather than the real site. */
export function isBotWall(title: string, bodyText: string): boolean {
  return CHALLENGE.test(title) || CHALLENGE.test(bodyText)
}

/** True when the measurement carries enough colour signal to derive a real palette (not a blank shell). */
export function hasEnoughSignal(m: PageMeasurement): boolean {
  return m.colors.backgrounds.length > 0 && m.colors.texts.length > 0 && m.fontSizes.length >= 2
}
