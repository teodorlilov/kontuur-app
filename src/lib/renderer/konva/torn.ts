/**
 * Torn-paper edge geometry — kept Konva-free so the maths is unit-testable without a canvas (like the
 * `treatments` filters). `applyClip` (build.ts) draws the returned polygon as a clip path, giving a block
 * a ripped-paper edge for the collage look. Seeded so it's deterministic — preview == export.
 */

/**
 * The rectangle outline as a closed polygon with small seeded jitter perpendicular to each edge — a torn
 * edge. Returns a flat `[x0, y0, x1, y1, …]` point list (even length). `step` is the spacing between
 * torn points; `jitter` the max ± perpendicular offset.
 */
export function tornRectPoints(w: number, h: number, seed = 1, jitter = 14, step = 40): number[] {
  let s = (seed >>> 0) || 1
  const rnd = () => {
    // A small LCG — deterministic pseudo-random in 0..1, no dependency on Math.random.
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const pts: number[] = []
  // Walk each edge start→end, offsetting each sample by ±jitter along the edge normal (nx, ny).
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const dx = x1 - x0
    const dy = y1 - y0
    const n = Math.max(1, Math.round(Math.hypot(dx, dy) / step))
    for (let i = 0; i < n; i++) {
      const t = i / n
      const j = (rnd() - 0.5) * 2 * jitter
      pts.push(x0 + dx * t + nx * j, y0 + dy * t + ny * j)
    }
  }
  edge(0, 0, w, 0, 0, 1) // top    — jitter vertically
  edge(w, 0, w, h, -1, 0) // right  — jitter horizontally
  edge(w, h, 0, h, 0, -1) // bottom
  edge(0, h, 0, 0, 1, 0) // left
  return pts
}
