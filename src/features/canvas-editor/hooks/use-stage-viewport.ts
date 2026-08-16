'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { clamp } from '@/lib/canvas/clamp'
import { WHEEL_ZOOM_RATE } from '@/lib/canvas/constants'

/** Zoom range. The floor keeps a huge canvas reachable; the ceiling is enough for brush detail. */
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
/** Breathing room between the canvas and the workspace edges at the fit zoom. */
const FIT_PADDING = 48
/** How much one zoom button press changes the scale. */
const ZOOM_STEP = 1.2

interface StageViewport {
  scale: number
  x: number
  y: number
}

export interface ViewportControls extends StageViewport {
  /** Workspace size in CSS px — the stage fills it, and the canvas floats inside. */
  container: { width: number; height: number }
  /** True while Space is held: the canvas pans instead of selecting. */
  panning: boolean
  zoomByWheel: (screenPoint: { x: number; y: number }, deltaY: number) => void
  panBy: (dx: number, dy: number) => void
  /** Adopt a pan the stage already applied itself (Space-drag moves the node, then reports). */
  setPan: (x: number, y: number) => void
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  actualSize: () => void
  /** Whether the view is still the (self-maintaining) fit view rather than a manual one. */
  isFit: boolean
}

/**
 * Pan/zoom for the workspace the canvas floats in. The doc never changes — this is pure view
 * state, so nothing here touches the undo history.
 *
 * The fit view is DERIVED, never stored: while the user has not taken manual control the view is
 * recomputed from the container each render, so resizing the window re-fits for free.
 */
export function useStageViewport(
  containerRef: React.RefObject<HTMLDivElement | null>,
  canvas: { w: number; h: number }
): ViewportControls {
  const [container, setContainer] = useState({ width: 0, height: 0 })
  const [manual, setManual] = useState<StageViewport | null>(null)
  const [panning, setPanning] = useState(false)

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect
      if (box) setContainer({ width: box.width, height: box.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [containerRef])

  const fitted = useMemo((): StageViewport => {
    if (!container.width || !container.height) return { scale: 1, x: 0, y: 0 }
    // Never magnify past 1:1 on fit — a small canvas in a big workspace should look its real size.
    const scale = Math.min(
      (container.width - FIT_PADDING) / canvas.w,
      (container.height - FIT_PADDING) / canvas.h,
      1
    )
    return centered(scale, container, canvas)
  }, [container, canvas])

  const viewport = manual ?? fitted
  // Gesture handlers read the live fit through a ref so a burst of wheel events can keep using the
  // updater form without capturing a stale closure.
  const fittedRef = useRef(fitted)
  useEffect(() => {
    fittedRef.current = fitted
  }, [fitted])

  const zoomAtPoint = useCallback((screenPoint: { x: number; y: number }, factor: number) => {
    setManual((current) => {
      const base = current ?? fittedRef.current
      const scale = clamp(base.scale * factor, MIN_ZOOM, MAX_ZOOM)
      if (scale === base.scale) return current ?? base
      // Keep the canvas point under the cursor pinned while the scale changes around it.
      const canvasPoint = {
        x: (screenPoint.x - base.x) / base.scale,
        y: (screenPoint.y - base.y) / base.scale,
      }
      return {
        scale,
        x: screenPoint.x - canvasPoint.x * scale,
        y: screenPoint.y - canvasPoint.y * scale,
      }
    })
  }, [])

  const zoomByWheel = useCallback(
    (screenPoint: { x: number; y: number }, deltaY: number) =>
      zoomAtPoint(screenPoint, Math.exp(-deltaY * WHEEL_ZOOM_RATE)),
    [zoomAtPoint]
  )

  const panBy = useCallback((dx: number, dy: number) => {
    setManual((current) => {
      const base = current ?? fittedRef.current
      return { ...base, x: base.x + dx, y: base.y + dy }
    })
  }, [])

  const setPan = useCallback((x: number, y: number) => {
    setManual((current) => ({ ...(current ?? fittedRef.current), x, y }))
  }, [])

  const zoomAtCentre = useCallback(
    (factor: number) => zoomAtPoint({ x: container.width / 2, y: container.height / 2 }, factor),
    [zoomAtPoint, container]
  )

  const zoomIn = useCallback(() => zoomAtCentre(ZOOM_STEP), [zoomAtCentre])
  const zoomOut = useCallback(() => zoomAtCentre(1 / ZOOM_STEP), [zoomAtCentre])
  /** Hand the view back to the derived fit, which then maintains itself on resize. */
  const fit = useCallback(() => setManual(null), [])
  const actualSize = useCallback(
    () => setManual(centered(1, container, canvas)),
    [container, canvas]
  )

  // Space is a held modifier, not a toggle — it must survive repeats and release anywhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (target?.isContentEditable) return
      // Space is how a focused control is activated; swallowing it there would make every button
      // in the editor chrome inert for keyboard users. Panning is for when the canvas has focus.
      if (target?.closest('button, a, [role="button"], summary')) return
      if (event.code === 'Space') {
        event.preventDefault()
        setPanning(true)
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') setPanning(false)
    }
    // A focus change mid-hold would otherwise strand the canvas in pan mode.
    const clear = () => setPanning(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clear)
    }
  }, [])

  return {
    ...viewport,
    container,
    panning,
    zoomByWheel,
    panBy,
    setPan,
    zoomIn,
    zoomOut,
    fit,
    actualSize,
    isFit: manual === null,
  }
}

function centered(
  scale: number,
  container: { width: number; height: number },
  canvas: { w: number; h: number }
): StageViewport {
  return {
    scale,
    x: (container.width - canvas.w * scale) / 2,
    y: (container.height - canvas.h * scale) / 2,
  }
}
