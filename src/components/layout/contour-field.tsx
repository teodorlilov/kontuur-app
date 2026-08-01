'use client'

import { useEffect, useRef } from 'react'

/**
 * The ground of every dashboard surface.
 *
 * Kontuur means contour, and a week of scheduled content is terrain — ridges
 * where the calendar is full, flats where it is open. Depth comes from
 * interrupting this pattern, not from a shadow: a card is a clearing, opaque
 * with a hairline edge, and the contour lines simply stop at its boundary.
 *
 * That is why the ground is near-white. On #fbfcfa a white card separates by
 * 1.05:1 — nothing — so tone cannot do the work and the terrain has to.
 *
 * Ported from docs/redesign-mocks/archive/dashboard-v2.html and reviewed as state B of
 * docs/redesign-mocks/archive/clients-contour.html. Every constant below is tuned
 * against that ground; re-deriving them will not reproduce the same field.
 */

/** Gaussian peaks in normalised space — the shape of the terrain. */
const PEAKS = [
  { x: 0.88, y: 0.06, a: 1.0, s: 0.26 },
  { x: 0.06, y: 0.44, a: 0.78, s: 0.2 },
  { x: 0.72, y: 0.92, a: 0.92, s: 0.3 },
  { x: 0.34, y: 1.06, a: 0.6, s: 0.18 },
  { x: 1.04, y: 0.56, a: 0.7, s: 0.22 },
] as const

/** One contour segment, as a pair of edge indices. */
type Segment = readonly [number, number]

/** Marching-squares segment table, indexed by the four-corner bitmask. */
const CASES: readonly Segment[][] = [
  [], [[3, 2]], [[2, 1]], [[3, 1]],
  [[0, 1]], [[3, 0], [2, 1]], [[0, 2]], [[3, 0]],
  [[3, 0]], [[0, 2]], [[3, 2], [0, 1]], [[0, 1]],
  [[3, 1]], [[2, 1]], [[3, 2]], [],
]

const GRID_STEP = 9
const LEVELS = 15
/** Redraw at most once per settled resize rather than per resize event. */
const RESIZE_DEBOUNCE_MS = 120
/** Retina is worth it; 3x on a large display is not. */
const MAX_DPR = 2

type Point = [number, number]

function field(nx: number, ny: number): number {
  let v = 0
  for (const p of PEAKS) {
    const dx = nx - p.x
    const dy = ny - p.y
    v += p.a * Math.exp(-(dx * dx + dy * dy) / (2 * p.s * p.s))
  }
  return v
}

/** Where a contour crosses an edge, by linear interpolation between corners. */
function lerp(a: number, b: number, pa: Point, pb: Point, level: number): Point {
  const t = (level - a) / (b - a)
  return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]
}

function sizeToBox(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  canvas.width = Math.round(canvas.clientWidth * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** The static terrain. One pass, no animation loop. */
function drawField(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return

  sizeToBox(canvas, ctx)
  ctx.clearRect(0, 0, w, h)

  const cols = Math.ceil(w / GRID_STEP)
  const rows = Math.ceil(h / GRID_STEP)
  const grid = new Float32Array((cols + 1) * (rows + 1))
  for (let gy = 0; gy <= rows; gy++) {
    for (let gx = 0; gx <= cols; gx++) {
      grid[gy * (cols + 1) + gx] = field((gx * GRID_STEP) / w, (gy * GRID_STEP) / h)
    }
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (let li = 1; li <= LEVELS; li++) {
    const level = li * 0.075
    ctx.strokeStyle = `rgba(22, 68, 48, ${(0.05 + li * 0.006).toFixed(3)})`
    // Every fifth line is heavier, so the terrain reads as a survey map.
    ctx.lineWidth = li % 5 === 0 ? 1.1 : 0.7
    ctx.beginPath()

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i0 = y * (cols + 1) + x
        const tl = grid[i0]!
        const tr = grid[i0 + 1]!
        const bl = grid[i0 + cols + 1]!
        const br = grid[i0 + cols + 2]!

        const idx =
          (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0)
        const segs = CASES[idx]!
        if (segs.length === 0) continue

        const px = x * GRID_STEP
        const py = y * GRID_STEP
        const pTL: Point = [px, py]
        const pTR: Point = [px + GRID_STEP, py]
        const pBR: Point = [px + GRID_STEP, py + GRID_STEP]
        const pBL: Point = [px, py + GRID_STEP]
        const edges: Point[] = [
          lerp(tl, tr, pTL, pTR, level),
          lerp(tr, br, pTR, pBR, level),
          lerp(bl, br, pBL, pBR, level),
          lerp(tl, bl, pTL, pBL, level),
        ]

        for (const [from, to] of segs) {
          const a = edges[from]!
          const b = edges[to]!
          ctx.moveTo(a[0], a[1])
          ctx.lineTo(b[0], b[1])
        }
      }
    }
    ctx.stroke()
  }
}

/** Draws the two-layer contour ground the app shell sits on. */
export function ContourField() {
  const fieldRef = useRef<HTMLCanvasElement>(null)
  const peakRef = useRef<HTMLCanvasElement>(null)

  // Layer 1 — the terrain itself.
  useEffect(() => {
    const canvas = fieldRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    drawField(canvas, ctx)

    let timer: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => drawField(canvas, ctx), RESIZE_DEBOUNCE_MS)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Layer 2 — the terrain rises where you point, so attention reads as
  // elevation. Conceptual rather than decorative, but it is still motion, so
  // it does not run at all under prefers-reduced-motion.
  useEffect(() => {
    const canvas = peakRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let current: { x: number; y: number } | null = null
    let target: { x: number; y: number } | null = null
    let raf: number | null = null

    const clear = () => ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)

    const render = () => {
      raf = null
      clear()
      if (!current || !target) return

      current.x += (target.x - current.x) * 0.14
      current.y += (target.y - current.y) * 0.14

      for (let r = 1; r <= 6; r++) {
        ctx.beginPath()
        ctx.arc(current.x, current.y, r * 15, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(22, 68, 48, ${(0.09 - r * 0.012).toFixed(3)})`
        ctx.lineWidth = r === 5 ? 1.1 : 0.7
        ctx.stroke()
      }

      // Self-terminating: this is a decay toward the cursor, not a standing
      // loop. Once the rings catch up, nothing is scheduled.
      if (Math.abs(target.x - current.x) > 0.4 || Math.abs(target.y - current.y) > 0.4) {
        raf = requestAnimationFrame(render)
      }
    }

    // Cached rather than read per event: getBoundingClientRect() inside
    // onPointerMove forced a layout on every pointer sample, app-wide, at up to
    // 120Hz. A ResizeObserver rather than window.resize because the sidebar
    // animates its own width — that moves this canvas's left edge without the
    // window ever resizing, and a stale rect would offset the rings.
    let rect = canvas.getBoundingClientRect()

    const observer = new ResizeObserver(() => {
      sizeToBox(canvas, ctx)
      rect = canvas.getBoundingClientRect()
    })

    const onPointerMove = (e: PointerEvent) => {
      target = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      current ??= { ...target }
      if (raf === null) raf = requestAnimationFrame(render)
    }
    const onPointerLeave = () => {
      target = null
      current = null
      clear()
    }

    sizeToBox(canvas, ctx)
    observer.observe(canvas)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave)

    return () => {
      if (raf !== null) cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  return (
    <>
      <canvas
        ref={fieldRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 size-full"
      />
      <canvas
        ref={peakRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 size-full"
      />
    </>
  )
}
