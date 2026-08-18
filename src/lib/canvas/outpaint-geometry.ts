/**
 * Where an outpaint's extra pixels go.
 *
 * Two constraints decide every number here, both measured against `openai/gpt-image-2/edit` on
 * 2026-08-16 rather than assumed (see TECH-DEBT §2.10):
 *
 * 1. The model honours a requested size EXACTLY when it is a multiple of 16, and FLOORS it when it
 *    is not — asking for 2040 returns 2032. The mask is drawn at the size we compute, so if that
 *    size is off-grid the mask and the returned image disagree and the seam shifts by up to 8px.
 *    Every dimension this module produces is therefore already on-grid; nothing downstream rounds.
 * 2. The frame is capped, because each call is a paid ~50s generation and a larger canvas buys
 *    nothing once the result is cover-cropped back into a 4:5 slide.
 */

/** The model's dimension grid. */
const GRID = 16
/** Longest padded edge we will ask for — 2048 is the largest size the probe confirmed. */
const MAX_PADDED_EDGE = 2048
/** How much bigger the padded frame is than the source, before the cap. */
export const DEFAULT_GROWTH = 1.5

export interface PaddedFrame {
  /** The padded image's dimensions — always on-grid integers. */
  width: number
  height: number
  /** Where the original sits inside the padded image; integers, so no half-pixel seam. */
  left: number
  top: number
  /** The original's own dimensions, carried so callers need not thread them separately. */
  sourceWidth: number
  sourceHeight: number
}

/** Round up onto the model's grid. Up, never down: rounding down would crop source pixels away. */
function ceilToGrid(value: number): number {
  return Math.ceil(value / GRID) * GRID
}

/**
 * The padded frame for one outpaint.
 *
 * The source is first squared up to the CANVAS aspect, then grown. Growing alone would spend the
 * generation on pixels the slide's cover-crop throws away — a 1024² background in a 4:5 frame loses
 * about a fifth of its new border sideways before anyone sees it.
 */
export function paddedFrame(
  src: { width: number; height: number },
  canvas: { w: number; h: number },
  growth: number = DEFAULT_GROWTH
): PaddedFrame {
  const aspect = canvas.w / canvas.h
  // The smallest box that contains the source AND matches the canvas aspect.
  const aspectWidth = Math.max(src.width, src.height * aspect)
  const aspectHeight = Math.max(src.height, src.width / aspect)

  // One scale for both axes, clamped so neither the growth floor nor the pixel cap is breached.
  const wanted = Math.max(1, growth)
  const capped = Math.min(wanted, MAX_PADDED_EDGE / aspectWidth, MAX_PADDED_EDGE / aspectHeight)
  const scale = Math.max(1, capped)

  const width = Math.min(MAX_PADDED_EDGE, ceilToGrid(aspectWidth * scale))
  const height = Math.min(MAX_PADDED_EDGE, ceilToGrid(aspectHeight * scale))

  return {
    width,
    height,
    // Centred, and integral: a half-pixel offset would smear the one region we promise to preserve.
    left: Math.round((width - src.width) / 2),
    top: Math.round((height - src.height) / 2),
    sourceWidth: src.width,
    sourceHeight: src.height,
  }
}

/** True when there is nothing to generate — the source already fills the capped frame. */
export function isFrameGrown(frame: PaddedFrame): boolean {
  return frame.width > frame.sourceWidth || frame.height > frame.sourceHeight
}
