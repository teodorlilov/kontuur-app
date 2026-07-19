'use client'

import dynamic from 'next/dynamic'

/**
 * SSR-safe entry point for `SlideCanvas`. react-konva touches the DOM canvas, so it must load client-only —
 * every surface (results, review, calendar) imports the canvas from here.
 */
export const SlideCanvas = dynamic(() => import('./slide-canvas').then((m) => m.SlideCanvas), {
  ssr: false,
})
