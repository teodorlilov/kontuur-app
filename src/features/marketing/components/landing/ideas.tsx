'use client'

import Image from 'next/image'
import { cn } from '@/utils/cn'
import { useSectionLoop } from '../../hooks/use-section-loop'
import { useTypewriter } from '../../hooks/use-typewriter'
import { SplitBand } from './section'

const MESSAGE = 'We’re launching the winter menu next week — can we tease it somehow?'

/** They type → Kontuur thinks → a draft exists. */
const HOLDS = [3600, 1300, 5400] as const

export function Ideas() {
  const { ref, phase } = useSectionLoop<HTMLDivElement>({ holds: HOLDS })
  const message = useTypewriter(MESSAGE, phase >= 0)

  return (
    <SplitBand
      id="ideas"
      visualFirst
      eyebrow="Ideas inbox"
      title={
        <>
          Client ideas become <em>drafts</em>
        </>
      }
      note="Every client gets their own ideas link. Whatever they send — a launch, a promo, a half-formed thought — arrives in your Ideas inbox and comes back as a composed post, ready for review. No more “can you make a post about…?” emails."
      visual={
        <div
          ref={ref}
          aria-hidden="true"
          className="mx-auto flex w-full max-w-[560px] flex-col gap-5 rounded-card border border-ink/[0.05] bg-surface p-8"
        >
          <div className="rounded-panel rounded-bl-xs bg-sunken px-4 py-3">
            <p className="text-label uppercase text-text3">Client · via their ideas link</p>
            <p className="mt-1.5 text-body text-ink">
              {message}
              {phase === 0 && message.length < MESSAGE.length && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-spring" />
              )}
            </p>
          </div>

          <div className="flex justify-center gap-1.5">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                style={{ animationDelay: `${dot * 160}ms` }}
                className={cn(
                  'size-1.5 rounded-full bg-spring transition-opacity duration-300',
                  phase >= 1 ? 'animate-pulse opacity-100' : 'opacity-0'
                )}
              />
            ))}
          </div>

          <div
            className={cn(
              'overflow-hidden rounded-panel border border-line',
              'transition-[opacity,transform] duration-500 ease-contour motion-reduce:transition-none',
              phase >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
            )}
          >
            <div className="relative h-[220px]">
              <Image src="/landing/winter.jpg" alt="" fill sizes="560px" className="object-cover" />
            </div>
            <div className="flex flex-col gap-2 p-4">
              <p className="text-title text-ink">Winter menu — a first look</p>
              <span className="h-2 w-[75%] rounded-full bg-line" />
              <span className="h-2 w-1/2 rounded-full bg-line" />
              <span className="mt-1 w-fit rounded-full bg-wash px-2.5 py-1 text-micro font-semibold text-forest">
                Draft ready for review
              </span>
            </div>
          </div>
        </div>
      }
    />
  )
}
