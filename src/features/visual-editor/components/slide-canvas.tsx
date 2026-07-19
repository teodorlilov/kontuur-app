'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Rect, Image as KonvaImage, Text, Group } from 'react-konva'
import type Konva from 'konva'
import type { Palette } from '@/types/visual'
import { TEXT_ZONES, type BackdropRole } from '@/lib/images/text-zones'
import { fontFamilyStack, googleFontsHref, type FontKey } from '@/lib/visual/fonts'

/**
 * The single composed-slide renderer (preview now; interactive in Phase 4; `toDataURL()` export later).
 * Draws the backdrop image (or a brand-gradient fallback) with a contrast scrim + the copy placed in the
 * role's `TEXT_ZONES` rect — the same zone the backdrop prompt reserved. Interior slides sharing one base
 * image are made distinct by a per-`slideIndex` crop offset + accent tint. Client-only.
 */
export function SlideCanvas({
  role,
  headline,
  body,
  backdropUrl,
  palette,
  displayFontKey,
  bodyFontKey,
  width = 320,
  slideIndex = 0,
}: {
  role: BackdropRole
  headline: string
  body: string
  backdropUrl?: string
  palette: Palette
  displayFontKey: FontKey
  bodyFontKey: FontKey
  width?: number
  slideIndex?: number
}) {
  const height = Math.round((width * 5) / 4) // 4:5 portrait
  const zone = TEXT_ZONES[role]
  const img = useBackdropImage(backdropUrl)
  const fontsReady = useFontsReady(displayFontKey, bodyFontKey)
  const stageRef = useRef<Konva.Stage>(null)

  // Redraw once fonts/image resolve so Konva measures text with the real faces.
  useEffect(() => {
    stageRef.current?.batchDraw()
  }, [fontsReady, img])

  const zx = zone.rect.x * width
  const zy = zone.rect.y * height
  const zw = zone.rect.w * width
  const zh = zone.rect.h * height
  // Interior crop pan: shift the source window per slide so shared bases read differently.
  const pan = role === 'interior' ? (slideIndex % 3) * 0.12 : 0

  return (
    <>
      <link rel="stylesheet" href={googleFontsHref([displayFontKey, bodyFontKey])} />
      <Stage ref={stageRef} width={width} height={height} style={{ borderRadius: 10, overflow: 'hidden' }}>
        <Layer>
          {img ? (
            <KonvaImage
              image={img}
              x={0}
              y={0}
              width={width}
              height={height}
              crop={cropForCover(img, width, height, pan)}
            />
          ) : (
            <Rect x={0} y={0} width={width} height={height} fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: width, y: height }}
              fillLinearGradientColorStops={[0, palette.surface, 0.5, palette.surface, 1.3, palette.accent]} />
          )}

          {/* Interior tint keyed to slide index — cheap per-slide variety. */}
          {role === 'interior' && img && (
            <Rect x={0} y={0} width={width} height={height} fill={palette.accent} opacity={0.06 + (slideIndex % 3) * 0.05} />
          )}

          {/* Contrast scrim in the text zone (PRD §5). */}
          <Rect
            x={zx - 8}
            y={zy - 10}
            width={zw + 16}
            height={zh + 20}
            fill={palette.surface}
            opacity={0.72}
            cornerRadius={8}
          />

          <Group x={zx} y={zy}>
            <Text
              text={headline}
              width={zw}
              fontFamily={fontFamilyStack(displayFontKey)}
              fontSize={Math.round(width * 0.075)}
              fill={palette.ink}
              lineHeight={1.05}
              align={role === 'cta' ? 'center' : 'left'}
            />
            <Rect x={0} y={Math.round(width * 0.075) * 1.4} width={width * 0.14} height={3} fill={palette.accent} cornerRadius={2} />
            <Text
              text={body}
              width={zw}
              y={Math.round(width * 0.075) * 1.4 + 12}
              fontFamily={fontFamilyStack(bodyFontKey)}
              fontSize={Math.round(width * 0.04)}
              fill={palette.ink}
              opacity={0.82}
              lineHeight={1.3}
              align={role === 'cta' ? 'center' : 'left'}
            />
          </Group>
        </Layer>
      </Stage>
    </>
  )
}

/** Cover-fit crop window for an image drawn into a `w×h` box, panned horizontally by `pan` (0 = centre). */
function cropForCover(img: HTMLImageElement, w: number, h: number, pan: number): Konva.RectConfig['crop'] {
  const scale = Math.max(w / img.width, h / img.height)
  const cropW = w / scale
  const cropH = h / scale
  const slackX = Math.max(0, img.width - cropW)
  const x = Math.min(slackX, Math.max(0, slackX * (0.5 + pan)))
  return { x, y: Math.max(0, img.height - cropH) / 2, width: cropW, height: cropH }
}

/** Load a crossOrigin image element for Konva (crossOrigin enables a future `toDataURL()` export). */
function useBackdropImage(url?: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) {
      setImg(null)
      return
    }
    const el = new window.Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => setImg(el)
    el.onerror = () => setImg(null)
    el.src = url
    return () => {
      el.onload = null
      el.onerror = null
    }
  }, [url])
  return img
}

/** Resolve once the preset web fonts are ready, so Konva text isn't drawn in a fallback face. */
function useFontsReady(...keys: FontKey[]): boolean {
  const href = useMemo(() => googleFontsHref(keys), [keys.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    void href
    document.fonts?.ready.then(() => {
      if (active) setReady(true)
    })
    return () => {
      active = false
    }
  }, [href])
  return ready
}
