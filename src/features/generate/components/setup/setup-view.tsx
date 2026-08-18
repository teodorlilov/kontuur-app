'use client'

import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { ClientPicker, type PickerClient } from './client-picker'
import { PlatformGroup } from './platform-group'
import { FormatCards } from './format-cards'
import { CountSteppers } from './count-steppers'
import { BriefList } from './brief-list'
import { RunPanel } from './run-panel'
import { DEFAULT_RUN_SIZE } from '@/utils/constants'
import type { RunPlan } from '@/features/generate/lib/run-plan'
import type { PostType, PriorityPost, ClientIdea } from '@/types/api'

interface SetupViewProps {
  clients: PickerClient[]
  clientId: string
  clientMeta: string
  clientLoading: boolean
  platform: string
  postType: PostType
  slideCount: number
  postCount: number
  briefs: PriorityPost[]
  runPlan: RunPlan
  sourceIdea?: ClientIdea
  generating: boolean
  onClientChange: (id: string) => void
  onPlatformChange: (platform: string) => void
  onPostTypeChange: (type: PostType) => void
  onSlideCountChange: (count: number) => void
  onPostCountChange: (count: number) => void
  onBriefsChange: (briefs: PriorityPost[]) => void
  /** Leading briefs the user may not remove — a client idea they opened the run from. */
  lockedBriefCount?: number
  onGenerate: () => void
}

/** Step 1 — everything on one screen; the run panel updates as choices land. */
export function SetupView(props: SetupViewProps) {
  const { sourceIdea } = props
  const isIdeaFlow = !!sourceIdea
  const selectedClient = props.clients.find((c) => c.id === props.clientId)
  const postsPerWeek = selectedClient?.posts_per_week ?? DEFAULT_RUN_SIZE

  const metaLine = [
    props.platform,
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

        <SetupGroup title="Platform">
          <PlatformGroup
            platform={props.platform}
            publishState={props.runPlan.publishState}
            clientName={selectedClient?.name ?? 'this client'}
            clientId={props.clientId}
            onChange={props.onPlatformChange}
          />
        </SetupGroup>

        <SetupGroup title="Format">
          <FormatCards
            value={props.postType}
            platform={props.platform}
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
            postType={props.postType}
          />
        </SetupGroup>
      </Card>

      <RunPanel
        runPlan={props.runPlan}
        // The real numbers, not a hardcoded 1. The idea is already one of `briefs`,
        // so the panel's postCount + briefCount is the same sum the server writes.
        postCount={props.postCount}
        briefCount={props.briefs.length}
        metaLine={metaLine}
        clientId={props.clientId}
        generating={props.generating}
        onGenerate={props.onGenerate}
      />
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
