/** The canvas-doc authoring/export space: 1080×1350 (IG-recommended 4:5 portrait). These numbers
 *  exist ONLY here — the doc schema, seeding, editor stage and exporter all import them. */
export const CANVAS_WIDTH = 1080
export const CANVAS_HEIGHT = 1350

/** Bump when a stored doc STOPS PARSING against the previous schema; readers must then add a
 *  migration path per version. v2 replaced v1's separate text/element bands with one ordered
 *  `nodes` list — see `doc-v1.ts`. Adding an OPTIONAL field is not such a change: old docs still
 *  parse and simply lack it, so `hidden`/`locked`/`flipX`/`flipY` arrived without a bump. */
export const CANVAS_DOC_VERSION = 2

/** Narrowest a text layer can be resized to (authoring-space px) — drag fold and Transformer agree. */
export const MIN_TEXT_LAYER_WIDTH = 80

/** Upper background-reposition zoom (1 = cover fit) — the doc schema and zoom controls agree. */
export const MAX_BACKGROUND_ZOOM = 3

/** Smallest an element can be resized to (authoring-space px) — transform fold and Transformer agree. */
export const MIN_ELEMENT_SIZE = 40

/**
 * Wheel-to-zoom feel: ~1 full zoom step per ~460px of wheel travel.
 *
 * Shared on purpose. The stage zoom and the reposition-mode crop zoom are different subjects on the
 * same wheel, and a user who scrolls into one and then the other must not feel two devices.
 */
export const WHEEL_ZOOM_RATE = 0.0015

/** Max nodes of any kind per doc — the schema write-gate and the editor's add guards agree.
 *  40 = the two 20-item caps v1 kept per band, now that one list holds both. */
export const MAX_NODES = 40
