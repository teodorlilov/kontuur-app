'use client'

import { useCallback, useState } from 'react'
import Image from 'next/image'
import { Check, RotateCcw } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useSectionLoop } from '../../hooks/use-section-loop'
import { useTypewriter } from '../../hooks/use-typewriter'
import { Section, SectionHead } from './section'

/**
 * Three real composition templates, not three colourways: photo-led with a
 * serif accent, type-led with a marker band, and poster type on a deep ground.
 * The engine produces all three, and which one a client gets is decided by
 * their extracted visual identity.
 *
 * Each caption matches its own photograph literally — the café copy names the
 * pumpkin cortado and the cardamom buns that are in the frame. A caption that
 * could sit on any picture is exactly the failure this section exists to deny.
 */
const RUNS = [
  {
    client: 'GreenLeaf Café',
    initials: 'GC',
    source: 'the café’s blog — “The autumn menu, explained”',
    sourceShort: 'from the café’s blog',
    voice: 'Warm, unhurried, first-person plural',
    visual: 'Photo-led — editorial photo + serif accent',
    caption:
      'The autumn menu is here — pumpkin cortado, cardamom buns, and slow Sunday brunch is back. First pour is on us this weekend.',
    template: 'photo',
    image: '/landing/engine-cafe.jpg',
    word: 'seasonal',
  },
  {
    client: 'VitaFit Nutrition',
    initials: 'VF',
    source: 'the studio’s article — “Protein timing: the evidence”',
    sourceShort: 'from the studio’s article',
    voice: 'Direct, evidence-first, zero hype',
    visual: 'Type-led — condensed caps + marker band',
    caption:
      'Protein myth #4: more is always better. It isn’t — timing beats total. Our dietitian on what actually moves the needle.',
    template: 'caps',
    image: '/landing/engine-protein.jpg',
    word: 'protein, honestly',
  },
  {
    client: 'Atelier Nord',
    initials: 'AN',
    source: 'the label’s journal — “Collar construction notes”',
    sourceShort: 'from the label’s journal',
    voice: 'Considered, tactile, quietly precise',
    visual: 'Poster type on a deep ground',
    caption:
      'Fourteen hours of hand-stitching go into every collar. This week: the work no one sees.',
    template: 'poster',
    image: null,
    word: 'behind\nthe seams',
  },
] as const

const CHECKS = ['Grounded in source', 'On-brand', 'No clichés'] as const

/** Read → write → compose → check → settled. */
const HOLDS = [1400, 3400, 1900, 1500, 6200] as const

export function Engine() {
  const [runIndex, setRunIndex] = useState(0)
  const nextRun = useCallback(() => setRunIndex((i) => (i + 1) % RUNS.length), [])
  const { ref, phase, replay } = useSectionLoop<HTMLDivElement>({
    holds: HOLDS,
    onCycle: nextRun,
  })

  const run = RUNS[runIndex]!
  const caption = useTypewriter(run.caption, phase >= 1)

  const steps = [
    {
      title: 'Reading the sources',
      sub: run.source,
      gain: 'content tied to their business, never generic',
    },
    {
      title: "Writing in the brand's voice",
      sub: run.voice,
      gain: 'sounds like the client, not a chatbot',
    },
    {
      title: 'Composing the visual',
      sub: run.visual,
      gain: 'on-brand, and editable in the built-in editor',
    },
    { title: 'Quality checks', sub: null, gain: 'nothing half-baked reaches the feed' },
  ]

  function runAgain() {
    nextRun()
    replay()
  }

  return (
    <Section id="engine" wrap="split">
      <SectionHead
        align="center"
        eyebrow="The engine"
        title={
          <>
            Watch a post get <em>composed</em>
          </>
        }
        note={
          <>
            Every post starts from your client&apos;s actual business — their articles, their menu,
            their launches — written in their voice and quality-checked before it reaches you. Copy
            and visual are generated <b className="font-semibold text-ink">together</b>: a post
            never arrives half-done.
          </>
        }
      />

      <div className="mb-12 mt-6 flex justify-center">
        <button
          type="button"
          onClick={runAgain}
          className="inline-flex items-center gap-2 rounded-full border border-line2 px-3.5 py-2 text-caption text-text2 transition-colors duration-150 ease-contour hover:border-forest hover:bg-wash hover:text-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring"
        >
          <RotateCcw size={13} aria-hidden />
          Run it again
        </button>
      </div>

      <div ref={ref} className="grid items-center gap-12 lg:grid-cols-[1fr_520px] lg:gap-[72px]">
        <ol className="flex list-none flex-col gap-7">
          {steps.map((step, index) => {
            const active = phase >= index
            return (
              <li
                key={step.title}
                className={cn(
                  'flex gap-4 transition-opacity duration-500 ease-contour motion-reduce:transition-none',
                  active ? 'opacity-100' : 'opacity-40'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 size-2.5 flex-none rounded-full transition-colors duration-500',
                    active ? 'bg-spring' : 'bg-line2'
                  )}
                />
                <div className="min-w-0">
                  <p className="text-title text-ink">{step.title}</p>
                  {step.sub ? (
                    <p className="mt-1 text-caption text-text2">{step.sub}</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {CHECKS.map((check, checkIndex) => (
                        <span
                          key={check}
                          style={{ transitionDelay: `${150 + checkIndex * 180}ms` }}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full bg-wash px-2 py-0.5 text-micro font-medium text-forest',
                            'transition-[opacity,transform] duration-300 ease-contour motion-reduce:transition-none',
                            phase >= 3 ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
                          )}
                        >
                          <Check size={10} strokeWidth={2.6} aria-hidden />
                          {check}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1.5 text-caption text-spring-text">→ {step.gain}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <PostCard run={run} phase={phase} caption={caption} />
      </div>
    </Section>
  )
}

function PostCard({
  run,
  phase,
  caption,
}: {
  run: (typeof RUNS)[number]
  phase: number
  caption: string
}) {
  const composed = phase >= 2
  const ready = phase >= 4

  return (
    <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-card border border-ink/[0.05] bg-surface shadow-frame">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <span className="grid size-7 flex-none place-items-center rounded-full bg-wash text-micro font-semibold text-forest">
          {run.initials}
        </span>
        <span className="text-caption font-medium text-ink">{run.client}</span>
        {/* Labelled as a sample, because it is one. */}
        <span className="ml-auto rounded-full bg-sunken px-2 py-0.5 text-micro text-text3">
          Sample
        </span>
      </div>

      <div
        className={cn(
          'relative h-[360px] overflow-hidden transition-[filter,opacity] duration-700 ease-contour motion-reduce:transition-none',
          run.template === 'poster' ? 'surface-dark' : 'bg-sunken',
          composed ? 'opacity-100 blur-0' : 'opacity-70 blur-md'
        )}
      >
        {run.image && <Image src={run.image} alt="" fill sizes="520px" className="object-cover" />}

        {run.template === 'photo' && (
          <>
            <span className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-ink/55 to-transparent" />
            <span
              className={cn(
                'absolute bottom-6 left-6 font-display italic text-white transition-opacity duration-500',
                composed ? 'opacity-100' : 'opacity-0'
              )}
              // Fluid Hero Exception — post artwork, sized to the card.
              style={{ fontSize: 'clamp(28px, 3.4vw, 42px)' }}
            >
              {run.word}
            </span>
          </>
        )}

        {run.template === 'caps' && (
          <span className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-1 bg-gradient-to-t from-ink/65 to-transparent p-6">
            {/* leading/tracking: condensed caps artwork, not interface type. */}
            <span
              className={cn(
                'text-headline uppercase leading-[1.3] tracking-[0.04em] text-white transition-opacity duration-500',
                composed ? 'opacity-100' : 'opacity-0'
              )}
            >
              Protein,
              <br />
              <span className="bg-spring/45 px-1.5">honestly</span>
            </span>
          </span>
        )}

        {run.template === 'poster' && (
          <span
            className={cn(
              'absolute inset-0 grid place-items-center whitespace-pre-line px-8 text-center font-display italic leading-tight text-ink-inv transition-opacity duration-500',
              composed ? 'opacity-100' : 'opacity-0'
            )}
            // Fluid Hero Exception — post artwork, sized to the card.
            style={{ fontSize: 'clamp(28px, 3vw, 38px)' }}
          >
            {run.word}
          </span>
        )}
      </div>

      <p className="min-h-[76px] px-4 py-4 text-body text-ink">
        {caption}
        {phase === 1 && caption.length < run.caption.length && (
          <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-spring" />
        )}
      </p>

      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <span className="text-caption text-text3">{run.sourceShort}</span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-micro font-semibold transition-colors duration-500',
            ready ? 'bg-marker text-forest-deep' : 'bg-sunken text-text3'
          )}
        >
          <span
            className={cn('size-1.5 rounded-full', ready ? 'bg-forest' : 'live-dot bg-pending')}
          />
          {ready ? 'Ready for review' : 'Composing'}
        </span>
      </div>
    </div>
  )
}
