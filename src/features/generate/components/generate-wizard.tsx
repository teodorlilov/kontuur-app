'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { readNDJSONStream } from '@/utils/stream'
import { GenerateShell, type GenerateStep } from './generate-shell'
import { STEP_ORDER } from './wizard-topbar'
import { WizardCard } from './wizard-card'
import { WizardFooter } from './wizard-footer'
import { StepClient } from './step-client'
import { StepPriority } from './step-priority'
import { PostTypeSelector } from './post-type-selector'
import { StepLoading, mapPhaseToStage } from './step-loading'
import { ResultsView } from './results/results-view'
import type { ClientRow } from '@/types/database'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { PriorityPost, PostType } from '@/types/api'
import type { GenerationResult } from '@/ai/generation/types'
import type { SkippedPillar } from '@/ai/research/types'
import type { PostData, ValidationData } from '@/types/post'

type Client = Pick<ClientRow, 'id' | 'name' | 'niche' | 'language' | 'posts_per_week'>

type GeneratedPost = { post: PostData } & ValidationData

type UnifiedStreamEvent =
  | { type: 'total'; count: number }
  | { type: 'phase'; message: string }
  | { type: 'result'; data: GenerationResult }
  | { type: 'skipped_pillars'; pillars: SkippedPillar[]; skippedCount: number }
  | { type: 'error'; message: string }

interface GenerateWizardProps {
  initialClients: Client[]
  initialClientData: ClientData | null
  initialTargetPostCount: number
}

export function GenerateWizard({
  initialClients,
  initialClientData,
  initialTargetPostCount,
}: GenerateWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<GenerateStep>('client')

  // Step 1
  const [clients] = useState<Client[]>(initialClients)
  const [clientId, setClientId] = useState(initialClients[0]?.id ?? '')
  const [platform, setPlatform] = useState('Instagram')
  const [brandProfileLoading, setBrandProfileLoading] = useState(false)
  const [targetPostCount, setTargetPostCount] = useState(initialTargetPostCount)
  const [preloadedClientData, setPreloadedClientData] = useState<ClientData | null>(initialClientData)

  // Step 2
  const [priorityPosts, setPriorityPosts] = useState<PriorityPost[]>([])

  // Step 3
  const [postType, setPostType] = useState<PostType>(
    initialClientData?.defaultPostType === 'carousel' ? 'carousel' : 'single'
  )
  const [slideCount, setSlideCount] = useState(initialClientData?.defaultCarouselSlides ?? 6)

  // Step 4 + 5
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([])
  const [streamTotal, setStreamTotal] = useState(0)
  const [researchPhase, setResearchPhase] = useState('')
  const [loadingStage, setLoadingStage] = useState(0)
  const [skippedPillars, setSkippedPillars] = useState<SkippedPillar[]>([])
  const [approvedCount, setApprovedCount] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isInitialMount = useRef(true)

  const selectedClient = clients.find((c) => c.id === clientId)
  const clientName = selectedClient?.name ?? 'Client'

  useLoadClientData({
    clientId,
    clients,
    isInitialMount,
    setBrandProfileLoading,
    setPreloadedClientData,
    setPostType,
    setSlideCount,
    setTargetPostCount,
  })

  useEffect(() => {
    if (step === 'loading' && generatedPosts.length === 0 && !isGenerating) {
      void startGeneration()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    return () => { abortControllerRef.current?.abort() }
  }, [step])

  async function startGeneration() {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setStreamTotal(0)
    setGeneratedPosts([])
    setResearchPhase('')
    setLoadingStage(0)
    setSkippedPillars([])
    setIsGenerating(true)

    try {
      const res = await fetch('/api/ai/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          clientId,
          platform,
          postType,
          slideCount,
          priorityPosts,
          targetPostCount,
          preloadedClientData: preloadedClientData ?? undefined,
        }),
      })

      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        toast.error(err.error ?? 'Generation failed')
        setStep('type')
        return
      }

      await readNDJSONStream<UnifiedStreamEvent>(res, (event) => {
        if (event.type === 'total') {
          setStreamTotal(event.count)
        } else if (event.type === 'phase') {
          setResearchPhase(event.message)
          setLoadingStage((prev) => Math.max(prev, mapPhaseToStage(event.message)))
        } else if (event.type === 'result') {
          setResearchPhase('')
          setLoadingStage((prev) => Math.max(prev, 2))
          setGeneratedPosts((prev) => [...prev, event.data as unknown as GeneratedPost])
        } else if (event.type === 'skipped_pillars') {
          setSkippedPillars(event.pillars)
        } else if (event.type === 'error') {
          toast.error(event.message)
          setStep('type')
        }
      })

      setStep('results')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Generation failed — please retry')
      setStep('type')
    } finally {
      setIsGenerating(false)
    }
  }

  function handlePostRemoved(postId: string) {
    setGeneratedPosts((prev) => prev.filter((p) => p.post.id !== postId))
    setStreamTotal((t) => t - 1)
  }

  function handlePostApproved(postId: string) {
    setGeneratedPosts((prev) => prev.filter((p) => p.post.id !== postId))
    setApprovedCount((c) => c + 1)
    setStreamTotal((t) => t - 1)
  }

  function handlePostRegenerated(postId: string, updatedPost: PostData, updatedValidation: ValidationData) {
    setGeneratedPosts((prev) =>
      prev.map((p) => (p.post.id === postId ? { post: updatedPost, ...updatedValidation } : p))
    )
  }

  async function handleApproveAll() {
    const remaining = [...generatedPosts]
    for (const item of remaining) {
      try {
        const res = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: item.post.client_id,
            caption: item.post.caption,
            platform: item.post.platform,
            post_type: item.post.post_type,
            slides_json: item.post.slides_json,
            validation_json: item.post.validation_json,
            status: 'approved',
            scheduled_at: null,
            priority: item.post.priority,
            quality_score_avg: item.post.quality_score_avg,
            topic_summary: item.post.topic_summary,
            was_rewritten: item.post.was_rewritten,
            rewrite_count: item.post.rewrite_count,
            source_url: item.post.source_url ?? null,
            source_title: item.post.source_title ?? null,
            source_type: item.post.source_type ?? null,
            source_excerpt: item.post.source_excerpt ?? null,
            pillar: item.post.pillar ?? null,
          }),
        })
        if (res.ok) {
          handlePostApproved(item.post.id)
        } else {
          toast.error(`Failed to approve "${item.post.pillar ?? 'post'}"`)
        }
      } catch {
        toast.error(`Failed to approve "${item.post.pillar ?? 'post'}"`)
      }
    }
    toast.success(`${remaining.length} post${remaining.length !== 1 ? 's' : ''} approved`)
  }

  function handleNewRun() {
    setGeneratedPosts([])
    setApprovedCount(0)
    setStreamTotal(0)
    setLoadingStage(0)
    setStep('client')
  }

  function handlePlatformChange(p: string) {
    setPlatform(p)
    if (p !== 'Instagram' && postType === 'carousel') setPostType('single')
  }

  function handleStepClick(targetStep: GenerateStep) {
    if (STEP_ORDER[targetStep] < STEP_ORDER[step]) setStep(targetStep)
  }

  if (clients.length === 0) return <NoClientsState />

  const priorityBadge =
    priorityPosts.length > 0
      ? `Optional · ${priorityPosts.length} brief${priorityPosts.length > 1 ? 's' : ''}`
      : 'Optional'

  return (
    <GenerateShell currentStep={step} onCancel={() => router.push('/dashboard')} onStepClick={handleStepClick}>
      {step === 'client' && (
        <WizardCard title="Client & platform" subtitle="Choose which client and platform to generate for">
          <StepClient
            clients={clients}
            selectedClient={clientId}
            selectedPlatform={platform}
            brandProfileLoading={brandProfileLoading}
            onClientChange={setClientId}
            onPlatformChange={handlePlatformChange}
          />
          <WizardFooter onNext={() => setStep('priority')} nextDisabled={!clientId || brandProfileLoading} />
        </WizardCard>
      )}

      {step === 'priority' && (
        <WizardCard
          title="Priority posts"
          subtitle="Optional — specific campaigns or announcements that generate first"
          badge={priorityBadge}
        >
          <StepPriority posts={priorityPosts} onChange={setPriorityPosts} />
          <WizardFooter
            onBack={() => setStep('client')}
            onSkip={() => setStep('type')}
            onNext={() => setStep('type')}
          />
        </WizardCard>
      )}

      {step === 'type' && (
        <WizardCard title="Post type" subtitle="Choose the format for this generation run">
          <PostTypeSelector
            value={postType}
            slideCount={slideCount}
            platform={platform}
            onChange={setPostType}
            onSlideCountChange={setSlideCount}
          />
          <WizardFooter onBack={() => setStep('priority')} onGenerate={() => setStep('loading')} />
        </WizardCard>
      )}

      {step === 'loading' && (
        <StepLoading
          clientName={clientName}
          stage={loadingStage}
          streamTotal={streamTotal}
          generatedCount={generatedPosts.length}
          researchPhase={researchPhase}
        />
      )}

      {step === 'results' && (
        <>
          {generatedPosts.length > 0 ? (
            <ResultsView
              posts={generatedPosts}
              clientName={clientName}
              platform={platform}
              postType={postType}
              skippedPillars={skippedPillars}
              onApprove={handlePostApproved}
              onDiscard={handlePostRemoved}
              onRegenerate={handlePostRegenerated}
              onNewRun={handleNewRun}
              onApproveAll={handleApproveAll}
            />
          ) : (
            <AllReviewedState
              approvedCount={approvedCount}
              onGenerateMore={() => { setApprovedCount(0); setStep('type') }}
            />
          )}
        </>
      )}
    </GenerateShell>
  )
}

/* ─── Hook: load client data on client change ─── */

function useLoadClientData({
  clientId,
  clients,
  isInitialMount,
  setBrandProfileLoading,
  setPreloadedClientData,
  setPostType,
  setSlideCount,
  setTargetPostCount,
}: {
  clientId: string
  clients: Client[]
  isInitialMount: React.RefObject<boolean>
  setBrandProfileLoading: (v: boolean) => void
  setPreloadedClientData: (v: ClientData | null) => void
  setPostType: (v: PostType) => void
  setSlideCount: (v: number) => void
  setTargetPostCount: (v: number) => void
}) {
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (!clientId) return
    setPreloadedClientData(null)
    setBrandProfileLoading(true)
    void fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((data: { clientData?: ClientData }) => {
        if (data.clientData) {
          const cd = data.clientData
          setPreloadedClientData(cd)
          setPostType(cd.defaultPostType === 'carousel' ? 'carousel' : 'single')
          setSlideCount(cd.defaultCarouselSlides || 6)
        }
        const changedClient = clients.find((c) => c.id === clientId)
        if (changedClient && changedClient.posts_per_week > 0) {
          setTargetPostCount(changedClient.posts_per_week)
        }
      })
      .finally(() => setBrandProfileLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])
}

/* ─── Empty states ─── */

function NoClientsState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-4 text-center">
      <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
        <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900">No clients yet</p>
        <p className="text-sm text-gray-500 mt-1">Add your first client before generating posts.</p>
      </div>
      <a href="/clients/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-terracotta)] hover:underline">
        + Add your first client
      </a>
    </div>
  )
}

function AllReviewedState({
  approvedCount,
  onGenerateMore,
}: {
  approvedCount: number
  onGenerateMore: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center">
        <svg className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <div>
        <p className="text-lg font-semibold text-gray-900">All posts reviewed</p>
        <p className="text-base text-gray-500 mt-1">
          {approvedCount > 0
            ? `${approvedCount} post${approvedCount !== 1 ? 's' : ''} approved and saved.`
            : 'All posts were discarded.'}
        </p>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <Button size="sm" onClick={onGenerateMore}>Generate more</Button>
        {approvedCount > 0 && (
          <a href="/calendar" className="text-sm text-gray-500 hover:text-gray-700">View approved posts</a>
        )}
      </div>
    </div>
  )
}
