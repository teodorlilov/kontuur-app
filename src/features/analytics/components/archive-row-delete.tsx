'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { deleteReport } from '../actions/report-actions'

/** Removes one archived report; the row list re-renders on refresh. */
export function ArchiveRowDelete({ reportId }: { reportId: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await deleteReport(reportId)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          router.refresh()
        })
      }
      className="print-hide text-micro font-medium text-text3 transition-colors hover:text-danger disabled:opacity-60"
    >
      {pending ? 'Removing…' : 'Remove'}
    </button>
  )
}
