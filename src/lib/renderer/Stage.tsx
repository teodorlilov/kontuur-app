'use client'

import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { BrandTokens } from '@/lib/scene-graph'
import { tokenVars } from './token-vars'
import { SLIDE_H, SLIDE_W } from './layer-style'

declare global {
  interface Window {
    __stageReady?: boolean
  }
}

/**
 * The 1080×1350 render root. Exposes the brand kit's colour roles as CSS variables, sets the
 * document language for OpenType `locl`, and signals `window.__stageReady` once fonts and images
 * have settled — the flag the render service waits on before screenshotting.
 */
export function Stage({ tokens, lang, children }: { tokens: BrandTokens; lang: string; children: ReactNode }) {
  useEffect(() => {
    let cancelled = false
    async function signalReady() {
      try {
        if (document.fonts?.ready) await document.fonts.ready
        const images = Array.from(document.querySelectorAll<HTMLImageElement>('#stage img'))
        await Promise.all(images.map((img) => (img.decode ? img.decode().catch(() => undefined) : Promise.resolve())))
      } finally {
        if (!cancelled) window.__stageReady = true
      }
    }
    void signalReady()
    return () => {
      cancelled = true
    }
  }, [])

  // The `--role-*` custom properties are merged in here; cast because they aren't part of the
  // base CSSProperties key set across React type versions.
  const style = {
    position: 'relative',
    width: SLIDE_W,
    height: SLIDE_H,
    overflow: 'hidden',
    background: 'var(--role-surface)',
    ...tokenVars(tokens),
  } as CSSProperties

  return (
    <div id="stage" lang={lang} style={style}>
      {children}
    </div>
  )
}
