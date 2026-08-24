'use client'

import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Spinner } from '@/components/ui/spinner'
import type { EditorJob, EditorJobs } from '../../hooks/use-editor-jobs'
import { BusyBar } from '../busy-hint'
import { EDITOR_BUTTON, EDITOR_LABEL, FOCUS_RING } from './chrome'

/**
 * Everything the editor is waiting on, in the header, where it can be seen from anywhere.
 *
 * A wait used to live in the bar that started it, which meant it existed only while you stood still
 * — switch slides and a 45s repair became invisible, though it was still running and would still
 * land. This is the same information somewhere it survives you walking away from it.
 *
 * Absent when nothing is running: a permanently mounted "0 running" chip is a piece of furniture
 * that teaches people to stop reading that corner of the screen.
 */
export function JobsTray({ jobs, discard }: Pick<EditorJobs, 'jobs' | 'discard'>) {
  const [open, setOpen] = useState(false)
  if (jobs.length === 0) return null
  const first = jobs[0]!

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="What the editor is working on"
          className={cn(
            FOCUS_RING,
            'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-chip border border-line px-2.5',
            'font-sans text-micro text-text2 transition-colors duration-150 ease-contour hover:text-ink'
          )}
        >
          <Spinner size="sm" />
          {/* One job names itself; several are counted. A list of labels in a header would push the
              Save button off a narrow window, and the popover is one click away either way. */}
          {jobs.length === 1 ? first.label : `${jobs.length} running`}
          <ChevronDown size={13} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="end"
          className="z-[210] w-[320px] rounded-chip border border-line bg-surface p-3 shadow-pop"
        >
          <div className={EDITOR_LABEL}>Working on</div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onDiscard={() => discard(job.id)} />
            ))}
          </ul>
          <p className="m-0 mt-3 text-micro text-text3">
            Discarding throws the result away. The work itself cannot be recalled — it finishes
            wherever it is running, and is billed either way.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function JobRow({ job, onDiscard }: { job: EditorJob; onDiscard: () => void }) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-sans text-caption text-ink">{job.label}</span>
        <span className="shrink-0 font-sans text-micro text-text2">Slide {job.slide + 1}</span>
      </div>
      <BusyBar startedAt={job.startedAt} typicalSeconds={job.typicalSeconds} />
      <button
        type="button"
        onClick={onDiscard}
        // Named for what it does. "Cancel" and "Stop" both promise to call the model back, which
        // nothing here can do — the request is already with the provider.
        title="Throw this result away when it arrives"
        className={cn(EDITOR_BUTTON, 'h-7 self-start px-2 text-micro')}
      >
        Discard result
      </button>
    </li>
  )
}
