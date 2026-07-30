import Link from 'next/link'
import { Users } from 'lucide-react'
import { CoverageRow } from '@/features/dashboard/components/coverage-row'
import { DAYS_PER_WEEK } from '@/utils/constants'
import type { DayState } from '@/lib/queries/cache'

const EMPTY_WEEK: DayState[] = Array<DayState>(DAYS_PER_WEEK).fill('open')

interface ClientCoverageProps {
  clients: Array<{ id: string; name: string }>
  coverage: Record<string, DayState[]>
  clientPendingMap: Record<string, number>
}

/** Each client's week at a glance: published, scheduled, or still open. */
export function ClientCoverage({ clients, coverage, clientPendingMap }: ClientCoverageProps) {
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
            <i className="size-2.5 rounded-[3.5px]" style={{ background: 'var(--hatch)' }} />
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
        clients.map((client, index) => (
          <CoverageRow
            key={client.id}
            clientId={client.id}
            name={client.name}
            week={coverage[client.id] ?? EMPTY_WEEK}
            pendingCount={clientPendingMap[client.id] ?? 0}
            tier={index}
          />
        ))
      )}
    </section>
  )
}
