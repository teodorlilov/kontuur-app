import { describe, expect, it } from 'vitest'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants'
import { DEFAULT_GROWTH, isFrameGrown, paddedFrame } from '../outpaint-geometry'

const CANVAS = { w: CANVAS_WIDTH, h: CANVAS_HEIGHT }
/** The size every AI background is generated at. */
const NATIVE = { width: 1088, height: 1360 }
/** A legacy square background, the case that motivated squaring up to the canvas aspect first. */
const LEGACY_SQUARE = { width: 1024, height: 1024 }

const onGrid = (value: number) => value % 16 === 0

describe('paddedFrame', () => {
  it('produces on-grid dimensions — the constraint the live probe established', () => {
    // The model floors an off-grid request (2040 → 2032) while honouring an on-grid one exactly,
    // and the mask is drawn at whatever we compute here. Off-grid = an 8px seam shift.
    for (const src of [NATIVE, LEGACY_SQUARE, { width: 999, height: 1333 }]) {
      const frame = paddedFrame(src, CANVAS)
      expect(onGrid(frame.width), `width ${frame.width}`).toBe(true)
      expect(onGrid(frame.height), `height ${frame.height}`).toBe(true)
    }
  })

  it('lands the native background on exactly the size the probe proved', () => {
    const frame = paddedFrame(NATIVE, CANVAS)
    expect({ width: frame.width, height: frame.height }).toEqual({ width: 1632, height: 2048 })
  })

  it('never crops the source — the frame always contains it', () => {
    for (const src of [NATIVE, LEGACY_SQUARE, { width: 1900, height: 400 }]) {
      const frame = paddedFrame(src, CANVAS)
      expect(frame.width).toBeGreaterThanOrEqual(src.width)
      expect(frame.height).toBeGreaterThanOrEqual(src.height)
      expect(frame.left).toBeGreaterThanOrEqual(0)
      expect(frame.top).toBeGreaterThanOrEqual(0)
    }
  })

  it('centres the source with integer offsets', () => {
    const frame = paddedFrame(NATIVE, CANVAS)
    expect(Number.isInteger(frame.left)).toBe(true)
    expect(Number.isInteger(frame.top)).toBe(true)
    // Within a pixel of centred on each axis (odd differences cannot split evenly).
    expect(Math.abs(frame.left - (frame.width - NATIVE.width) / 2)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(frame.top - (frame.height - NATIVE.height) / 2)).toBeLessThanOrEqual(0.5)
  })

  it('squares a legacy square source up to the canvas aspect before growing', () => {
    // Growing 1024² alone would generate border the 4:5 cover-crop then discards sideways.
    const frame = paddedFrame(LEGACY_SQUARE, CANVAS)
    const frameAspect = frame.width / frame.height
    const canvasAspect = CANVAS.w / CANVAS.h
    // Grid rounding moves it a little; it must still be far closer to 4:5 than to square.
    expect(Math.abs(frameAspect - canvasAspect)).toBeLessThan(0.05)
    expect(frameAspect).toBeLessThan(1)
  })

  it('caps the longest edge at the size the probe confirmed, whatever growth is asked for', () => {
    const frame = paddedFrame(NATIVE, CANVAS, 99)
    expect(Math.max(frame.width, frame.height)).toBeLessThanOrEqual(2048)
    expect(onGrid(frame.width) && onGrid(frame.height)).toBe(true)
  })

  it('never shrinks: a growth below 1 is treated as no growth', () => {
    const frame = paddedFrame(NATIVE, CANVAS, 0.5)
    expect(frame.width).toBeGreaterThanOrEqual(NATIVE.width)
    expect(frame.height).toBeGreaterThanOrEqual(NATIVE.height)
  })

  it('reports a source that is already at the cap as not grown, so the UI can refuse', () => {
    const atCap = { width: 2048, height: 2048 }
    expect(isFrameGrown(paddedFrame(atCap, CANVAS, DEFAULT_GROWTH))).toBe(false)
    expect(isFrameGrown(paddedFrame(NATIVE, CANVAS))).toBe(true)
  })

  it('carries the source dimensions, so the mask and the composite need no second argument', () => {
    const frame = paddedFrame(NATIVE, CANVAS)
    expect(frame.sourceWidth).toBe(NATIVE.width)
    expect(frame.sourceHeight).toBe(NATIVE.height)
  })
})
