'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Calendar, Send } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { getMondayISO } from '@/utils/date-helpers'
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
import type { ClientIdea } from '@/types/api'

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
  initialIdea?: ClientIdea
}

export function GenerateWizard({
  initialClients,
  initialClientData,
  initialTargetPostCount,
  initialIdea,
}: GenerateWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<GenerateStep>(initialIdea ? 'type' : 'client')
  const [sourceIdea] = useState<ClientIdea | undefined>(initialIdea)

  // Step 1
  const [clients] = useState<Client[]>(initialClients)
  const [clientId, setClientId] = useState(initialIdea?.clientId ?? initialClients[0]?.id ?? '')
  const [platform, setPlatform] = useState(initialIdea?.platform ?? 'Instagram')
  const [brandProfileLoading, setBrandProfileLoading] = useState(false)
  const [targetPostCount, setTargetPostCount] = useState(initialIdea ? 0 : initialTargetPostCount)
  const [preloadedClientData, setPreloadedClientData] = useState<ClientData | null>(initialClientData)

  // Step 2
  const [priorityPosts, setPriorityPosts] = useState<PriorityPost[]>(
    initialIdea
      ? [{
          title: initialIdea.ideaText.slice(0, 60),
          brief: initialIdea.ideaText,
          platform: initialIdea.platform ?? 'Instagram',
          targetDate: initialIdea.targetDate ?? '',
        }]
      : []
  )

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
  const [discardedCount, setDiscardedCount] = useState(0)
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
      const endpoint = sourceIdea ? '/api/ai/generate-from-idea' : '/api/ai/generate-stream'
      const payload = sourceIdea
        ? { ideaId: sourceIdea.id, postType, slideCount, preloadedClientData: preloadedClientData ?? undefined }
        : { clientId, platform, postType, slideCount, priorityPosts, targetPostCount, preloadedClientData: preloadedClientData ?? undefined }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(payload),
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
    setDiscardedCount((c) => c + 1)

    // Reset idea back to "new" when the generated post is discarded
    if (sourceIdea) {
      void fetch('/api/ideas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId: sourceIdea.id, status: 'new' }),
      })
    }
  }

  function handlePostApproved(postId: string) {
    setGeneratedPosts((prev) => prev.filter((p) => p.post.id !== postId))
    setApprovedCount((c) => c + 1)
    setStreamTotal((t) => t - 1)

    // Link the approved post to the idea (status already set to 'generated' by the route)
    if (sourceIdea && approvedCount === 0) {
      void fetch('/api/ideas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId: sourceIdea.id, postId }),
      })
    }
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
    setDiscardedCount(0)
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
    <GenerateShell currentStep={step} onCancel={() => router.push('/dashboard')} onStepClick={handleStepClick} sourceIdea={sourceIdea} showTopbar={step !== 'results' || generatedPosts.length === 0}>
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
          isIdeaFlow={!!sourceIdea}
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
              discardedCount={discardedCount}
              clientName={clientName}
              clientId={clientId}
              onGenerateMore={() => { setApprovedCount(0); setDiscardedCount(0); setStep('type') }}
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
  discardedCount,
  clientName,
  clientId,
  onGenerateMore,
}: {
  approvedCount: number
  discardedCount: number
  clientName: string
  clientId: string
  onGenerateMore: () => void
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)

  async function handleSendApproval() {
    setSending(true)
    try {
      const res = await fetch('/api/approval/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, weekStart: getMondayISO() }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error: string }
        throw new Error(err.error || 'Failed to send approval email')
      }
      const data = (await res.json()) as { postCount: number }
      toast.success(`Approval sent — ${data.postCount} post${data.postCount !== 1 ? 's' : ''}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send approval email')
    } finally {
      setSending(false)
    }
  }

  const stats = [
    { value: approvedCount, label: 'APPROVED', color: '#5A8A4A' },
    { value: discardedCount, label: 'DISCARDED', color: '#C07B55' },
    { value: approvedCount, label: 'ON CALENDAR', color: '#8A8070' },
  ]

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 2px 16px rgba(44,62,80,0.07)',
          padding: '48px 40px 40px',
          maxWidth: 520,
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Checkmark */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(90,138,74,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5A8A4A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>

        {/* Heading */}
        <h2 style={{ fontSize: 22, fontWeight: 600, color: '#1A2630', margin: '0 0 6px' }}>
          All posts reviewed
        </h2>
        <p style={{ fontSize: 14, color: '#8A8070', margin: '0 0 28px' }}>
          {approvedCount > 0
            ? `${approvedCount} post${approvedCount !== 1 ? 's' : ''} approved and saved to calendar for ${clientName}`
            : 'All posts were discarded.'}
        </p>

        {/* Stats */}
        <div
          style={{
            display: 'flex',
            borderTop: '1px solid rgba(44,62,80,0.08)',
            borderBottom: '1px solid rgba(44,62,80,0.08)',
            padding: '20px 0',
            marginBottom: 28,
          }}
        >
          {stats.map((s) => (
            <div key={s.label} style={{ flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#8A8070', letterSpacing: 0.5, marginTop: 4 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onGenerateMore} style={actionBtnStyle}>
            <Sparkles size={14} />
            Generate more posts
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => router.push('/calendar')} style={{ ...actionBtnStyle, flex: 1 }}>
              <Calendar size={14} />
              View in calendar
            </button>
            <button
              onClick={handleSendApproval}
              disabled={sending || approvedCount === 0}
              style={{ ...actionBtnStyle, flex: 1, opacity: sending || approvedCount === 0 ? 0.5 : 1 }}
            >
              <Send size={14} />
              {sending ? 'Sending...' : 'Send for approval'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const actionBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 500,
  color: '#8A8070',
  background: 'none',
  border: '1px solid rgba(44,62,80,0.12)',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'all 0.15s',
}
