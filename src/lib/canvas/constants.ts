/** The canvas-doc authoring/export space: 1080×1350 (IG-recommended 4:5 portrait). These numbers
 *  exist ONLY here — the doc schema, seeding, editor stage and exporter all import them. */
export const CANVAS_WIDTH = 1080
export const CANVAS_HEIGHT = 1350

/** Bump when the CanvasDoc shape changes; readers must then add a migration path per version. */
export const CANVAS_DOC_VERSION = 1

/** Narrowest a text layer can be resized to (authoring-space px) — drag fold and Transformer agree. */
export const MIN_TEXT_LAYER_WIDTH = 80
