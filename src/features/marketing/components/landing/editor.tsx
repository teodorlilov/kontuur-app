'use client'

import Image from 'next/image'
import { Eraser, MousePointer2, PenTool, Shapes, Type } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useSectionLoop } from '../../hooks/use-section-loop'
import { Reveal } from './reveal'
import { Section, SectionHead } from './section'

const TOOLS = [MousePointer2, Type, PenTool, Shapes, Eraser] as const

/** Select → move → marker → element → saved. */
const HOLDS = [1400, 1400, 1200, 1400, 4200] as const

/**
 * The real Konva editor's five moves, in order.
 *
 * Each phase lights the tool that would do it, because the point of this
 * section is that the tweak happens inside Kontuur — no Canva round-trip, no
 * export-and-reimport.
 */
export function Editor() {
  const { ref, phase } = useSectionLoop<HTMLDivElement>({ holds: HOLDS })
  const selected = phase >= 0 && phase <= 2
  const moved = phase >= 1
  const marked = phase >= 2
  const decorated = phase >= 3
  const saved = phase >= 4

  return (
    <Section id="editor" wrap="wide">
      <SectionHead
        align="center"
        eyebrow="The editor"
        title={
          <>
            Need a tweak? <em>Open the editor</em>
          </>
        }
        note="Every visual is fully editable inside Kontuur — move and restyle the type, swipe a marker highlight, drop in elements, cut subjects out of photos. No Canva round-trips, no export-import dance."
        className="mb-12"
      />

      <Reveal>
        <div
          ref={ref}
          aria-hidden="true"
          className="mx-auto w-full max-w-[880px] overflow-hidden rounded-card border border-ink/[0.05] bg-surface shadow-frame"
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className="text-caption font-medium text-ink">
              seasonal specials <span className="font-normal text-text3">· GreenLeaf Café</span>
            </span>
            <span
              className={cn(
                'rounded-md bg-forest px-3.5 py-1.5 text-micro font-semibold text-white transition-transform duration-300 ease-contour',
                saved ? 'scale-105' : 'scale-100'
              )}
            >
              {saved ? 'Saved to draft' : 'Save to draft'}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row">
            <div className="flex flex-none gap-1.5 border-b border-line p-3 sm:flex-col sm:border-b-0 sm:border-r">
              {TOOLS.map((Tool, index) => (
                <span
                  key={index}
                  className={cn(
                    'grid size-9 place-items-center rounded-md transition-colors duration-300 ease-contour',
                    phase === index ? 'bg-wash text-forest' : 'text-text3'
                  )}
                >
                  <Tool size={15} aria-hidden />
                </span>
              ))}
            </div>

            <div className="grid flex-1 place-items-center bg-sunken p-8">
              <div className="relative h-[400px] w-[320px] overflow-hidden rounded-panel shadow-frame">
                <Image
                  src="/landing/editor-canvas.jpg"
                  alt=""
                  fill
                  sizes="320px"
                  className="object-cover"
                />

                <svg
                  viewBox="0 0 80 80"
                  className={cn(
                    'absolute right-4 top-4 size-[76px] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none',
                    decorated
                      ? 'rotate-[8deg] scale-100 opacity-100'
                      : '-rotate-45 scale-50 opacity-0'
                  )}
                >
                  <path
                    d="M40 72 C40 48 40 30 40 10"
                    stroke="#164430"
                    strokeWidth="2"
                    fill="none"
                  />
                  <ellipse
                    cx="27"
                    cy="28"
                    rx="13"
                    ry="6"
                    fill="#7fb99a"
                    transform="rotate(-35 27 28)"
                  />
                  <ellipse
                    cx="53"
                    cy="22"
                    rx="13"
                    ry="6"
                    fill="#4e8f6f"
                    transform="rotate(30 53 22)"
                  />
                  <ellipse
                    cx="29"
                    cy="50"
                    rx="12"
                    ry="5.5"
                    fill="#4e8f6f"
                    transform="rotate(-30 29 50)"
                  />
                  <ellipse
                    cx="52"
                    cy="45"
                    rx="12"
                    ry="5.5"
                    fill="#7fb99a"
                    transform="rotate(28 52 45)"
                  />
                </svg>

                <div
                  style={{
                    // Computed: the type block being dragged is the demo.
                    transform: moved ? 'translate(8px, -46px) rotate(-2deg)' : 'none',
                  }}
                  className="absolute bottom-6 left-6 transition-transform duration-700 ease-contour motion-reduce:transition-none"
                >
                  <span className="font-display text-headline italic leading-tight text-white [text-shadow:0_1px_14px_rgba(0,0,0,0.35)]">
                    <span
                      className={cn(
                        "relative isolate before:absolute before:-left-[0.06em] before:-right-[0.08em] before:bottom-[0.03em] before:-z-10 before:h-[0.44em] before:origin-left before:-skew-x-12 before:bg-spring/55 before:transition-transform before:duration-500 before:ease-contour before:content-['']",
                        marked ? 'before:scale-x-100' : 'before:scale-x-0'
                      )}
                    >
                      seasonal
                    </span>
                    <br />
                    specials
                  </span>

                  <span
                    className={cn(
                      'absolute -inset-x-3 -inset-y-2.5 rounded-xs border border-dashed border-spring transition-opacity duration-300',
                      selected ? 'opacity-100' : 'opacity-0'
                    )}
                  >
                    {[
                      '-left-1 -top-1',
                      '-right-1 -top-1',
                      '-bottom-1 -left-1',
                      '-bottom-1 -right-1',
                    ].map((at) => (
                      <span
                        key={at}
                        className={cn(
                          'absolute size-2 rounded-[2px] border border-spring bg-surface',
                          at
                        )}
                      />
                    ))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  )
}
