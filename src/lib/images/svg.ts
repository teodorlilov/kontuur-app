/**
 * Guard + sanitise for generated SVG (Recraft text-to-vector returns real SVG source we store and later
 * rasterise). These render only inside an `<img>` / data-URL, which already runs SVGs in a restricted,
 * script-free mode — but we sanitise on ingest as defence in depth, and reject anything that isn't an SVG
 * so a stray HTML error page never lands in the vector bank. Pure string work: fully unit-tested.
 */

/** True when the string actually looks like SVG markup (not an error page or empty body). */
export function isSvg(s: string): boolean {
  return /<svg[\s>]/i.test(s)
}

/** Strip anything executable or externally-referencing from an SVG: scripts, event handlers,
 *  `<foreignObject>` (can embed HTML), and `javascript:`/inline `href`s. Returns the cleaned markup. */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/(?:xlink:href|href)\s*=\s*(["'])\s*javascript:[^"']*\1/gi, '')
    .trim()
}
