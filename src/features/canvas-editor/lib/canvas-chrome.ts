/**
 * The editor's on-canvas chrome colours, as literals.
 *
 * Konva paints into a canvas, and a canvas cannot read a CSS custom property — so every guide,
 * marquee and handle drawn on the stage needs a real colour string rather than a token. That is the
 * whole reason these are hex at all, and it is not licence to pick a colour: each one MUST equal the
 * `globals.css` token it names, and `__tests__/canvas-chrome.test.ts` fails if the two drift.
 *
 * Chrome only. Nothing here is exported into the jpeg — the sheet the artwork sits on is
 * `CANVAS_PAPER` in `lib/canvas/constants.ts`, because that one IS baked and belongs with the doc.
 */

/** `--spring`: Kontuur's green. The hover outline, the marquee and the arch handle. */
export const CHROME_SPRING = '#2e9e68'

/** `--danger`: the system's one signal red, used at hairline weight for alignment guides. */
export const CHROME_DANGER = '#b04a38'

/**
 * The marquee's band, as translucent spring.
 *
 * `rgba()` rather than an eight-digit hex because Konva hands `fill`/`stroke` straight to the 2D
 * context, and Safari's parser has historically been the weak link on `#rrggbbaa` in that position.
 */
export const CHROME_MARQUEE_STROKE = 'rgba(46, 158, 104, 0.9)'
export const CHROME_MARQUEE_FILL = 'rgba(46, 158, 104, 0.08)'
