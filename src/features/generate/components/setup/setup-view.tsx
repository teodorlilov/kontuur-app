'use client'

import Link from 'next/link'
import { ClockCircleIcon, DangerCircleIcon } from '@solar-icons/react/linear'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { FLOW_NOTICE_ACTION_CLASS, FlowNotice } from '@/features/generate/components/flow-notice'
import { pluralise } from '@/utils/format'
import { ClientPicker, type PickerClient } from './client-picker'
import { FormatCards } from './format-cards'
import { CountSteppers } from './count-steppers'
import { BriefList } from './brief-list'
import { RunPanel } from './run-panel'
import { DEFAULT_RUN_SIZE, PLAN_AND_BILLING_PATH } from '@/utils/constants'
import { postsLeft as postsLeftLine } from '@/lib/billing/copy'
import type { RunPlan } from '@/features/generate/lib/run-plan'
import type { PostType, PriorityPost, ClientIdea } from '@/types/api'
import type { PostsAffordable } from '@/lib/billing/post-allowance'

interface SetupViewProps {
  clients: PickerClient[]
  clientId: string
  clientMeta: string
  clientLoading: boolean
  postType: PostType
  slideCount: number
  postCount: number
  /** Posts this period can still pay for at the chosen format; zero replaces the form. */
  affordable: PostsAffordable
  briefs: PriorityPost[]
  runPlan: RunPlan
  sourceIdea?: ClientIdea
  generating: boolean
  onClientChange: (id: string) => void
  onPostTypeChange: (type: PostType) => void
  onSlideCountChange: (count: number) => void
  onPostCountChange: (count: number) => void
  onBriefsChange: (briefs: PriorityPost[]) => void
  /** Leading briefs the user may not remove — a client idea they opened the run from. */
  lockedBriefCount?: number
  /** Drafts still waiting for review — one row per group, above the picker. */
  waiting: WaitingRow[]
  onReviewWaiting: (key: number) => void
  onGenerate: () => void
}

/** One group of waiting drafts as the setup row says them. */
interface WaitingRow {
  key: number
  clientName: string
  count: number
  /** "2h ago", "3d ago" — pinned to the server's render instant so SSR and hydration agree. */
  writtenAgo: string
}

/**
 * Step 1 — everything on one screen; the run panel updates as choices land.
 *
 * With nothing left to spend the form is replaced by the refusal rather than rendered around a
 * stepper that cannot leave zero: the choices exist to size a run, and there is no run to size.
 * The waiting rows stay — drafts from earlier runs are still reviewable, and this route is where
 * they live.
 */
export function SetupView(props: SetupViewProps) {
  const { sourceIdea } = props
  const isIdeaFlow = !!sourceIdea
  const spent = props.affordable.posts === 0
  const selectedClient = props.clients.find((c) => c.id === props.clientId)
  const postsPerWeek = selectedClient?.posts_per_week ?? DEFAULT_RUN_SIZE

  const metaLine = [
    props.postType === 'carousel' ? `Carousel, ${props.slideCount} slides` : 'Single image',
    selectedClient?.name,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="rv mx-auto grid w-full max-w-[1280px] items-start gap-6 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="p-6">
        <h1 className="text-headline font-semibold text-ink">Generate posts</h1>
        <p className="mt-1 text-caption text-text2">
          {isIdeaFlow
            ? 'This run writes the client’s idea. Add researched posts alongside it if you want more.'
            : 'Everything on one screen. The panel on the right updates as you choose.'}
        </p>

        {props.waiting.length > 0 && (
          <div className="mt-5 flex flex-col gap-2">
            {props.waiting.map((row) => (
              <FlowNotice
                key={row.key}
                glyph={ClockCircleIcon}
                action={
                  <button
                    type="button"
                    className={FLOW_NOTICE_ACTION_CLASS}
                    onClick={() => props.onReviewWaiting(row.key)}
                  >
                    Review {row.count === 1 ? 'it' : 'them'}
                  </button>
                }
              >
                <span className="font-semibold text-pending">{pluralise(row.count, 'draft')}</span>{' '}
                for <i>{row.clientName}</i> {row.count === 1 ? 'is' : 'are'} waiting for review —
                from a run {row.writtenAgo}.
              </FlowNotice>
            ))}
          </div>
        )}

        {spent ? (
          <FlowNotice
            glyph={DangerCircleIcon}
            className="mt-5"
            action={
              <Link href={PLAN_AND_BILLING_PATH} className={FLOW_NOTICE_ACTION_CLASS}>
                Plan &amp; billing
              </Link>
            }
          >
            {postsLeftLine(0, props.affordable.limiting)}
          </FlowNotice>
        ) : (
          <>
            <SetupGroup title="Client" first>
              <ClientPicker
                clients={props.clients}
                selectedId={props.clientId}
                meta={props.clientMeta}
                onSelect={props.onClientChange}
                disabled={isIdeaFlow}
              />
              {props.clientLoading && (
                <p className="mt-2 flex items-center gap-2 text-caption text-text2">
                  <Spinner size="sm" /> Loading brand profile…
                </p>
              )}
            </SetupGroup>

            <SetupGroup title="Format">
              <FormatCards
                value={props.postType}
                slideCount={props.slideCount}
                onChange={props.onPostTypeChange}
              />
            </SetupGroup>

            {/* Shown on the idea flow too. An idea is a locked priority brief, not a
            different kind of run — it starts the stepper at 0 so "just this idea"
            is one post, and raising it adds researched posts alongside. Hiding the
            stepper made that combination unreachable while the flow beneath it
            already summed briefs and researched posts correctly. */}
            <SetupGroup title="How many">
              <CountSteppers
                postCount={props.postCount}
                affordable={props.affordable}
                slideCount={props.slideCount}
                briefCount={props.briefs.length}
                postType={props.postType}
                postsPerWeek={postsPerWeek}
                onPostCount={props.onPostCountChange}
                onSlideCount={props.onSlideCountChange}
              />
            </SetupGroup>

            <SetupGroup title="Priority briefs" hint={isIdeaFlow ? undefined : '— optional'}>
              <BriefList
                briefs={props.briefs}
                onChange={props.onBriefsChange}
                lockedCount={props.lockedBriefCount ?? 0}
              />
            </SetupGroup>
          </>
        )}
      </Card>

      {!spent && (
        <RunPanel
          runPlan={props.runPlan}
          // The real numbers, not a hardcoded 1. The idea is already one of `briefs`,
          // so the panel's postCount + briefCount is the same sum the server writes.
          postCount={props.postCount}
          briefCount={props.briefs.length}
          affordable={props.affordable}
          metaLine={metaLine}
          clientId={props.clientId}
          generating={props.generating}
          onGenerate={props.onGenerate}
        />
      )}
    </div>
  )
}

function SetupGroup({
  title,
  hint,
  first,
  children,
}: {
  title: string
  hint?: string
  first?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={first ? 'mt-5' : 'mt-6 border-t border-line pt-5'}>
      <h2 className="mb-3 text-label font-semibold uppercase text-text2">
        {title}
        {hint && (
          <span className="ml-1 font-normal normal-case tracking-normal text-text3">{hint}</span>
        )}
      </h2>
      {children}
    </section>
  )
}
