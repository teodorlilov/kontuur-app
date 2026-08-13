'use client'

import Image from 'next/image'
import { Check, Link2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useSectionLoop } from '../../hooks/use-section-loop'
import { SplitBand } from './section'

/** Link appears → post loads → they tap → it is on the calendar. */
const HOLDS = [1000, 1500, 1500, 5200] as const

export function Approvals() {
  const { ref, phase } = useSectionLoop<HTMLDivElement>({ holds: HOLDS })
  const tapped = phase >= 2
  const scheduled = phase >= 3

  return (
    <SplitBand
      id="approvals"
      eyebrow="Client approvals"
      title={
        <>
          Approval in <em>one tap</em> — no logins
        </>
      }
      note="Send your client a link. They see the post exactly as it will run, approve it or ask for changes — and it lands on the calendar the moment they say yes. No accounts, no PDFs, no screenshots in WhatsApp."
      visual={
        <div
          ref={ref}
          aria-hidden="true"
          className="mx-auto flex w-full max-w-[560px] flex-col gap-5 rounded-card border border-ink/[0.05] bg-surface p-8"
        >
          <span
            className={cn(
              'inline-flex w-fit items-center gap-2 rounded-full bg-sunken px-3 py-1.5 text-caption text-text2',
              'transition-[opacity,transform] duration-500 ease-contour motion-reduce:transition-none',
              phase >= 0 ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
            )}
          >
            <Link2 size={12} aria-hidden />
            kontuur.app/approve/x7k…
          </span>

          <div
            className={cn(
              'overflow-hidden rounded-panel border border-line',
              'transition-[opacity,transform] duration-500 ease-contour motion-reduce:transition-none',
              phase >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
            )}
          >
            <div className="relative h-[280px]">
              <Image
                src="/landing/approve.jpg"
                alt=""
                fill
                sizes="560px"
                className="object-cover"
              />
            </div>
            <div className="flex flex-col gap-2 p-4">
              <span className="h-2 w-[82%] rounded-full bg-line" />
              <span className="h-2 w-[58%] rounded-full bg-line" />
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-caption font-semibold transition-colors duration-300',
                tapped ? 'bg-forest text-white' : 'bg-wash text-forest'
              )}
            >
              {tapped && <Check size={12} strokeWidth={2.6} aria-hidden />}
              {tapped ? 'Approved' : 'Approve'}
            </span>
            <span className="rounded-full border border-line2 px-4 py-2 text-caption text-text2">
              Request changes
            </span>
          </div>

          <p
            className={cn(
              'text-caption font-medium text-forest',
              'transition-[opacity,transform] duration-500 ease-contour motion-reduce:transition-none',
              scheduled ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
            )}
          >
            On the calendar — Mon 09:00
          </p>

          <p className="text-caption text-text3">No account. No login. One tap.</p>
        </div>
      }
    />
  )
}
