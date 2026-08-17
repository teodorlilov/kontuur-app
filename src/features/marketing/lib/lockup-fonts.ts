import {
  Archivo_Black,
  Bebas_Neue,
  Oswald,
  Playfair,
  Sofia_Sans_Extra_Condensed,
  Source_Sans_3,
  Yeseva_One,
} from 'next/font/google'

/**
 * The faces the landing page's editor demo draws lockups in.
 *
 * Self-hosted through `next/font` rather than the editor's `injectLibraryStylesheet`, which pulls a
 * stylesheet for all fifty-six families off the Google CDN. That is right inside the editor, where
 * the user is choosing between them; on the public page it would be a render-blocking request to a
 * third party for fifty families nobody is going to see.
 *
 * These seven are the WHOLE Layouts pack, which is why that pack and not Essentials: Essentials
 * spans sixteen families and twenty-three faces, and no marketing section is worth that download.
 * The pack is shown complete, so the page is not quietly a highlight reel either.
 *
 * `preload: false` because the section sits well below the fold — preloading would make the browser
 * fetch seven display faces before the hero has painted, to draw something nobody has scrolled to.
 */
// Written out rather than spread from a shared options object: `next/font` is a compile-time
// transform and only reads arguments it can see literally.
const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: '400',
  variable: '--lk-archivo-black',
})
const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: '400',
  variable: '--lk-bebas-neue',
})
const oswald = Oswald({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: '700',
  variable: '--lk-oswald',
})
const playfair = Playfair({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: '900',
  variable: '--lk-playfair',
})
const sofiaCondensed = Sofia_Sans_Extra_Condensed({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: '900',
  variable: '--lk-sofia-condensed',
})
const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: '400',
  variable: '--lk-source-sans',
})
const yesevaOne = Yeseva_One({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  weight: '400',
  variable: '--lk-yeseva-one',
})

/** Put on the section wrapper so every variable below resolves inside it, and nowhere else. */
export const LOCKUP_FONT_VARIABLES = [
  archivoBlack.variable,
  bebasNeue.variable,
  oswald.variable,
  playfair.variable,
  sofiaCondensed.variable,
  sourceSans.variable,
  yesevaOne.variable,
].join(' ')

/**
 * A catalogue family name → the CSS variable holding its self-hosted face.
 *
 * Keyed by the name the catalogue uses, so the mapping is checked against the real thing: a family
 * missing here renders in the fallback, which on a page whose entire argument is the typography is
 * worse than not shipping the section. `lockupFontStack` throws rather than degrade quietly.
 */
const VARIABLE_BY_FAMILY: Record<string, string> = {
  'Archivo Black': '--lk-archivo-black',
  'Bebas Neue': '--lk-bebas-neue',
  Oswald: '--lk-oswald',
  Playfair: '--lk-playfair',
  'Sofia Sans Extra Condensed': '--lk-sofia-condensed',
  'Source Sans 3': '--lk-source-sans',
  'Yeseva One': '--lk-yeseva-one',
}

/** The `font-family` value for a catalogue family. Throws at build time if the face is not hosted. */
export function lockupFontStack(family: string): string {
  const variable = VARIABLE_BY_FAMILY[family]
  if (!variable) {
    throw new Error(
      `The landing editor demo draws "${family}", which src/features/marketing/lib/lockup-fonts.ts does not host. Add the face, or show a lockup that does not use it.`
    )
  }
  return `var(${variable}), sans-serif`
}
