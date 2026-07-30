import Link from 'next/link'
import { hasCyrillic } from '@/lib/canvas/font-library'
import { cn } from '@/utils/cn'

interface DashboardHeaderProps {
  agencyName: string
  clientCount: number
  isSolo: boolean
  /** IANA timezone of the agency — the greeting follows the reader's day, not the server's. */
  timezone: string
}

/** Time-of-day greeting in the agency's own timezone. */
function resolveGreeting(timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: timezone }).format(
      new Date()
    )
  )
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatToday(timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(new Date())
}

export function DashboardHeader({ agencyName, clientCount, isSolo, timezone }: DashboardHeaderProps) {
  const name = agencyName || 'there'
  const clientLine = isSolo
    ? 'Your workspace'
    : `${clientCount} ${clientCount === 1 ? 'client' : 'clients'} active`

  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em] text-ink">
          {resolveGreeting(timezone)},{' '}
          {/* Instrument Serif has no Cyrillic — Cyrillic names stay in the sans face. */}
          <em
            className={cn(
              'text-forest',
              hasCyrillic(name) ? 'font-sans not-italic' : 'font-display font-normal italic'
            )}
          >
            {name}
          </em>
        </h1>
        <p className="mt-[3px] text-[13px] text-text3">
          {formatToday(timezone)} · {clientLine}
        </p>
      </div>

      <div className="flex gap-2">
        {!isSolo && (
          <Link
            href="/clients/new"
            className="inline-flex items-center rounded-sm border border-line2 px-3.5 py-2 text-[13px] font-medium text-ink no-underline transition-colors hover:border-forest hover:bg-wash hover:text-forest"
          >
            Add client
          </Link>
        )}
        <Link
          href="/generate"
          className="inline-flex items-center gap-2 rounded-sm bg-forest px-3.5 py-2 text-[13px] font-medium text-white no-underline transition-[background-color,transform,box-shadow] duration-150 ease-contour hover:-translate-y-px hover:bg-forest-deep hover:shadow-pop"
        >
          {isSolo ? 'Create content' : 'Generate posts'} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  )
}
