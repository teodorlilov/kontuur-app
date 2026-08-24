'use client'

import Image from 'next/image'
import { Layers, Image as ImageIcon, Shapes, Sparkles, Type } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { LockupPreview, PreviewShape, PreviewText } from '../../lib/lockup-previews'
import { PREVIEW_CANVAS, SAMPLE_COPY } from '../../lib/lockup-previews'
import { useSectionLoop } from '../../hooks/use-section-loop'

/**
 * The editor, as the landing page shows it.
 *
 * Geometry arrives as plain numbers from a server component — see `lockup-previews.ts` — so the
 * catalogue itself never reaches this bundle. The only thing this file decides is which lockup is
 * on screen.
 */

/** One hold per offerable lockup. Module scope: a fresh array each render restarts the loop. */
const HOLDS = [2600, 2600, 2600, 2600, 2600] as const

/** The rail, in the order the editor lists it. Labelled, because the real one is. */
const RAIL = [
  { label: 'Text', Icon: Type },
  { label: 'Elements', Icon: Shapes },
  { label: 'AI', Icon: Sparkles },
  { label: 'Image', Icon: ImageIcon },
  { label: 'Layers', Icon: Layers },
] as const

/**
 * Slide copy for the strip, so six thumbnails read as six posts rather than one repeated.
 *
 * Slide one is left out: its thumbnail is the canvas above it, repainted with whatever lockup is
 * showing, because that is what a slide strip is.
 */
const DECK = [
  ['Slow water, no bitterness', 'Twelve hours cold pulls sweetness instead.'],
  ['One origin, one roast', 'We print the roast date on every bag.'],
  ['Served over one cube', 'Slower melt, no watery last third.'],
  ['Take a bag home', 'We grind it how you brew it.'],
  ['Open from seven', 'Aster & Rye, 42 Bridge Street.'],
] as const

/**
 * Authoring units → a share of the container's inline size.
 *
 * One number scales the strip thumbnail, the panel tile and the canvas alike — which is exactly why
 * a tile in the real picker predicts what the slide will do. Vertical positions divide by the WIDTH
 * too: the box is a fixed 4:5, so `y / 1080` already carries the height.
 */
const u = (value: number) => `calc(${value / PREVIEW_CANVAS.w} * 100cqi)`

function LockupText({ node }: { node: PreviewText }) {
  return (
    <p
      // Every value is computed from authoring geometry — the one case the system allows inline
      // style, and the reason a lockup can be drawn at three sizes from one set of numbers.
      style={{
        position: 'absolute',
        left: u(node.x),
        top: u(node.y),
        width: u(node.width),
        fontFamily: node.fontFamily,
        fontSize: u(node.fontSize),
        fontWeight: node.fontWeight,
        fontStyle: node.italic ? 'italic' : 'normal',
        lineHeight: node.lineHeight,
        letterSpacing: node.letterSpacing ? u(node.letterSpacing) : 'normal',
        textAlign: node.align,
        color: node.fill,
      }}
      className="m-0 whitespace-pre-wrap"
    >
      {node.text}
    </p>
  )
}

function LockupShape({ node }: { node: PreviewShape }) {
  return (
    <span
      style={{
        position: 'absolute',
        left: u(node.x),
        top: u(node.y),
        width: u(node.width),
        height: u(node.height),
        background: node.fill,
      }}
    />
  )
}

/** One lockup drawn over the slide's picture, at whatever size the box happens to be. */
function Slide({
  lockup,
  copy,
  className,
}: {
  lockup: LockupPreview
  copy?: { headline: string; body: string }
  className?: string
}) {
  // The strip's slides carry their own words; everywhere else the sample copy is already baked in.
  const texts = copy
    ? lockup.texts.map((node, at) =>
        at === lockup.texts.length - 1
          ? { ...node, text: copy.body }
          : at === lockup.texts.length - 2
            ? { ...node, text: copy.headline }
            : node
      )
    : lockup.texts

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden bg-sunken [contain:paint] [container-type:inline-size]',
        className
      )}
      style={{ aspectRatio: `${PREVIEW_CANVAS.w} / ${PREVIEW_CANVAS.h}` }}
    >
      <Image src="/landing/editor-canvas.jpg" alt="" fill sizes="360px" className="object-cover" />
      {lockup.shapes.map((shape, at) => (
        <LockupShape key={`s${at}`} node={shape} />
      ))}
      {texts.map((node, at) => (
        <LockupText key={`t${at}`} node={node} />
      ))}
    </div>
  )
}

/** A toolbar control the demo only has to LOOK like — the section is a picture of the editor. */
function Chip({ children, on }: { children: React.ReactNode; on?: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-sm border px-2 py-1 text-micro',
        on ? 'border-forest bg-wash text-forest' : 'border-line text-text2'
      )}
    >
      {children}
    </span>
  )
}

export function EditorFrame({ previews }: { previews: LockupPreview[] }) {
  const offerable = previews.filter((preview) => !preview.blocked)
  const { ref, phase } = useSectionLoop<HTMLDivElement>({ holds: HOLDS })
  const active = offerable[phase % offerable.length] ?? previews[0]!

  return (
    <div
      ref={ref}
      aria-hidden="true"
      // Capped below the band's own width: the editor is full-screen, where a wide stage around a
      // 4:5 canvas is simply what it looks like — at landing scale that much air reads as a mistake.
      className="mx-auto max-w-[1160px] overflow-hidden rounded-card border border-ink/[0.05] bg-surface shadow-frame"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5">
        <span className="truncate text-caption font-medium text-ink">Slide 1 of 6</span>
        <div className="flex flex-none items-center gap-1.5">
          <span className="rounded-sm border border-line px-2.5 py-1 text-micro text-text2">
            Cancel
          </span>
          <span className="hidden rounded-sm border border-line px-2.5 py-1 text-micro text-text2 sm:inline">
            Apply style…
          </span>
          <span className="rounded-sm bg-forest px-3 py-1 text-micro font-semibold text-white">
            Save
          </span>
        </div>
      </div>

      <div className="flex">
        <nav className="hidden flex-none flex-col gap-0.5 border-r border-line p-2 sm:flex">
          {RAIL.map(({ label, Icon }, at) => (
            <span
              key={label}
              className={cn(
                'flex w-14 flex-col items-center gap-1 rounded-sm px-1 py-1.5 text-micro',
                at === 0 ? 'bg-wash text-forest' : 'text-text3'
              )}
            >
              <Icon size={14} aria-hidden />
              {label}
            </span>
          ))}
        </nav>

        <aside className="hidden w-[212px] flex-none border-r border-line p-3 lg:block">
          <p className="m-0 mb-2 text-label uppercase text-text2">Lockups</p>
          <div className="mb-2.5 flex gap-1">
            <span className="flex-1 rounded-sm border border-line py-1 text-center text-micro text-text3">
              Essentials
            </span>
            <span className="flex-1 rounded-sm border border-forest bg-wash py-1 text-center text-micro font-medium text-forest">
              Layouts
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {previews.map((preview) => (
              <span
                key={preview.id}
                className={cn(
                  'block rounded-sm border p-0.5 transition-colors duration-500 ease-contour',
                  preview.id === active.id ? 'border-forest bg-wash' : 'border-line'
                )}
              >
                <Slide
                  lockup={preview}
                  className={cn('rounded-xs', preview.blocked && 'opacity-45 grayscale')}
                />
                <span className="block px-0.5 pt-0.5 text-micro text-text2">{preview.label}</span>
                {preview.blocked && (
                  // The tool saying what will not fit is the tool working, so the page shows it.
                  <span className="block px-0.5 text-micro text-text3">{preview.blocked}</span>
                )}
              </span>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="hidden items-center gap-1.5 overflow-hidden border-b border-line px-3 py-2 sm:flex">
            <Chip>Reposition</Chip>
            <Chip>Backdrop</Chip>
          </div>

          <div className="relative grid flex-1 place-items-center bg-sunken p-4">
            <Slide lockup={active} className="w-full max-w-[396px] rounded-sm shadow-frame" />
            <span className="absolute bottom-3 right-3 rounded-chip border border-line bg-surface px-2.5 py-1 text-micro text-text2 shadow-pop">
              39%
            </span>
          </div>

          <div className="flex items-end justify-center gap-2 border-t border-line px-3 py-2.5">
            {[SAMPLE_COPY, ...DECK.map(([headline, body]) => ({ headline, body }))].map(
              (copy, at) => (
                <span key={at} className="flex flex-col items-center gap-1">
                  <Slide
                    lockup={at === 0 ? active : offerable[at % offerable.length]!}
                    copy={copy}
                    className={cn(
                      'w-8 rounded-xs border',
                      at === 0 ? 'border-forest' : 'border-transparent'
                    )}
                  />
                  <span
                    className={cn(
                      'text-micro',
                      at === 0 ? 'font-semibold text-forest' : 'text-text3'
                    )}
                  >
                    {at + 1}
                  </span>
                </span>
              )
            )}
          </div>
        </div>
      </div>

      <p className="m-0 flex min-h-[38px] items-center gap-2 border-t border-line px-4 py-2.5 text-caption text-text2">
        <b className="font-semibold text-ink">{active.label}</b>
        <span className="text-text3">— {active.description}</span>
      </p>
    </div>
  )
}
