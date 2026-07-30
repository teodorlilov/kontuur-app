'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { CoverageRow } from '@/features/dashboard/components/coverage-row'
import { DAYS_PER_WEEK } from '@/utils/constants'
import type { DayState } from '@/lib/queries/cache'

const EMPTY_WEEK: DayState[] = Array<DayState>(DAYS_PER_WEEK).fill('open')

/** Keeps the block roughly the height of the review stack beside it. */
const ROWS_PER_PAGE = 3

interface ClientCoverageProps {
  clients: Array<{ id: string; name: string }>
  coverage: Record<string, DayState[]>
  clientPendingMap: Record<string, number>
}

/** Each client's week at a glance: published, scheduled, or still open. */
export function ClientCoverage({ clients, coverage, clientPendingMap }: ClientCoverageProps) {
  const [page, setPage] = useState(0)

  const pageCount = Math.max(Math.ceil(clients.length / ROWS_PER_PAGE), 1)
  // Clamp during render — the list can shrink under us when a client is removed.
  const currentPage = Math.min(page, pageCount - 1)
  const firstIndex = currentPage * ROWS_PER_PAGE
  const visible = clients.slice(firstIndex, firstIndex + ROWS_PER_PAGE)

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
          <span className="grid size-[27px] place-items-center rounded-sm bg-wash text-forest">
            <Users size={14} />
          </span>
          Client coverage
        </span>
        <span className="flex items-center gap-3 text-[10.5px] text-text3">
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-[3.5px] bg-forest" />
            Published
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-[3.5px] bg-surface shadow-[inset_0_0_0_1.5px_rgba(22,68,48,0.45)]" />
            Scheduled
          </span>
          <span className="flex items-center gap-1.5">
            <i className="slot-open size-2.5 rounded-[3.5px]" />
            Open
          </span>
        </span>
      </div>

      {clients.length === 0 ? (
        <p className="mt-4 rounded-card border border-line bg-surface px-5 py-8 text-center text-[13px] text-text2">
          No clients yet.{' '}
          <Link href="/clients/new" className="font-medium text-forest underline-offset-2 hover:underline">
            Add your first client
          </Link>
        </p>
      ) : (
        <>
          {visible.map((client, index) => (
            <CoverageRow
              key={client.id}
              clientId={client.id}
              name={client.name}
              week={coverage[client.id] ?? EMPTY_WEEK}
              pendingCount={clientPendingMap[client.id] ?? 0}
              // Tier follows position on the page, so every page keeps the
              // lime → sage → dark rhythm.
              tier={index}
            />
          ))}

          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between px-1">
              <span className="text-[11.5px] tabular-nums text-text3">
                {firstIndex + 1}–{firstIndex + visible.length} of {clients.length}
              </span>
              <div className="flex items-center gap-1.5">
                <PageButton
                  label="Previous clients"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft className="size-3.5" />
                </PageButton>
                <PageButton
                  label="Next clients"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight className="size-3.5" />
                </PageButton>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-[26px] place-items-center rounded-sm border border-line2 bg-surface text-text2 transition-colors hover:border-forest hover:text-forest disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}
