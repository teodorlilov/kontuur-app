'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { PriorityPostForm } from '@/features/generate/components/priority-post-form'
import { PostTypeSelector } from '@/features/generate/components/post-type-selector'
import { PostCard, type PostData, type ValidationData } from '@/components/posts/post-card'
import { PostCardSkeleton } from '@/components/posts/post-card-skeleton'
import { readNDJSONStream } from '@/utils/stream'
import { PLATFORMS } from '@/utils/constants'
import type { ClientRow } from '@/types/database'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { PriorityPost, PostType } from '@/types/api'
import type { GenerationResult } from '@/ai/generation/types'
import type { SkippedPillar } from '@/ai/research/types'

type Client = Pick<ClientRow, 'id' | 'name' | 'niche' | 'language' | 'posts_per_week'>

type GeneratedPost = { post: PostData } & ValidationData

type UnifiedStreamEvent =
  | { type: 'total'; count: number }
  | { type: 'phase'; message: string }
  | { type: 'result'; data: GenerationResult }
  | { type: 'skipped_pillars'; pillars: SkippedPillar[]; skippedCount: number }
  | { type: 'error'; message: string }

const STEP_LABELS = [
  'Client & Platform',
  'Priority Posts',
  'Post Type',
  'Generated Posts',
]

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
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1
  const [clients] = useState<Client[]>(initialClients)
  const [clientId, setClientId] = useState(initialClients[0]?.id ?? '')
  const [platform, setPlatform] = useState('Instagram')
  const [brandProfileLoading, setBrandProfileLoading] = useState(false)
  const [targetPostCount, setTargetPostCount] = useState(initialTargetPostCount)
  // Holds full ClientData for passthrough to generate-stream API. Cleared on client change.
  const [preloadedClientData, setPreloadedClientData] = useState<ClientData | null>(
    initialClientData
  )

  // Step 2
  const [priorityPosts, setPriorityPosts] = useState<PriorityPost[]>([])

  // Step 3
  const [postType, setPostType] = useState<PostType>(
    initialClientData?.defaultPostType === 'carousel' ? 'carousel' : 'single'
  )
  const [slideCount, setSlideCount] = useState(initialClientData?.defaultCarouselSlides ?? 6)

  // Step 4
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([])
  const [streamTotal, setStreamTotal] = useState(0)
  const [researchPhase, setResearchPhase] = useState('')
  const [skippedPillars, setSkippedPillars] = useState<SkippedPillar[]>([])
  const [hasGenerated, setHasGenerated] = useState(false)
  const [approvedCount, setApprovedCount] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isInitialMount = useRef(true)

  // Load brand profile when client changes (skips first render — initial data comes from props)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (!clientId) return
    // Client changed — clear preloaded data and fetch fresh
    setPreloadedClientData(null)
    setBrandProfileLoading(true)
    void fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((data: { clientData?: ClientData; posting_schedule?: unknown }) => {
        if (data.clientData) {
          const cd = data.clientData
          setPreloadedClientData(cd)
          if (cd.defaultPostType === 'carousel') setPostType('carousel')
          else setPostType('single')
          setSlideCount(cd.defaultCarouselSlides || 6)
        }
        // posts_per_week comes from the clients list already loaded at page render
        const changedClient = clients.find((c) => c.id === clientId)
        if (changedClient && changedClient.posts_per_week > 0) {
          setTargetPostCount(changedClient.posts_per_week)
        }
      })
      .finally(() => setBrandProfileLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  // Start generation when entering step 4
  useEffect(() => {
    if (currentStep === 4 && generatedPosts.length === 0 && !isGenerating) {
      void startGeneration()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep])

  // Abort any in-flight streams when navigating between steps
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [currentStep])

  async function startGeneration() {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setStreamTotal(0)
    setGeneratedPosts([])
    setResearchPhase('')
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
        setCurrentStep(3)
        return
      }

      await readNDJSONStream<UnifiedStreamEvent>(res, (event) => {
        if (event.type === 'total') {
          setStreamTotal(event.count)
        } else if (event.type === 'phase') {
          setResearchPhase(event.message)
        } else if (event.type === 'result') {
          setResearchPhase('')
          setGeneratedPosts((prev) => [...prev, event.data as unknown as GeneratedPost])
        } else if (event.type === 'skipped_pillars') {
          setSkippedPillars(event.pillars)
        } else if (event.type === 'error') {
          toast.error(event.message)
          setCurrentStep(3)
        }
      })

      setHasGenerated(true)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Generation failed — please retry')
      setCurrentStep(3)
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

  function handlePostRegenerated(
    postId: string,
    updatedPost: PostData,
    updatedValidation: ValidationData
  ) {
    setGeneratedPosts((prev) =>
      prev.map((p) => (p.post.id === postId ? { post: updatedPost, ...updatedValidation } : p))
    )
  }

  const canNext = (() => {
    if (currentStep === 1) return !!clientId && !brandProfileLoading
    return true
  })()

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-4 text-center">
        <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
          <svg
            className="h-6 w-6 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">No clients yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Add your first client before generating posts.
          </p>
        </div>
        <a
          href="/clients/new"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#534AB7] hover:underline"
        >
          + Add your first client
        </a>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header + progress bar — hidden on completion state */}
      {!(hasGenerated && generatedPosts.length === 0) && (
        <>
          <div className="mb-10">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                fontWeight: 400,
                color: 'var(--color-text-1)',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Generate posts
            </h1>
            <p className="text-base text-gray-500 mt-1">
              Step {currentStep} of {STEP_LABELS.length} — {STEP_LABELS[currentStep - 1]}
            </p>
          </div>

          <div className="flex gap-1.5 mb-10">
            {STEP_LABELS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  i + 1 < currentStep
                    ? 'bg-[#534AB7]'
                    : i + 1 === currentStep
                      ? 'bg-[#7F77DD]'
                      : 'bg-gray-200'
                )}
              />
            ))}
          </div>
        </>
      )}

      {/* Step content */}
      <div className="flex flex-col gap-8">
        {/* Step 1 — Client & Platform */}
        {currentStep === 1 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-base font-medium text-gray-700">Client</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-[#534AB7] focus:outline-none focus:ring-1 focus:ring-[#534AB7]"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {brandProfileLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Spinner size="sm" />
                Loading brand profile...
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-base font-medium text-gray-700">Platform</label>
              <div className="flex flex-wrap gap-2.5">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPlatform(p)
                      if (p !== 'Instagram' && postType === 'carousel') {
                        setPostType('single')
                      }
                    }}
                    className={cn(
                      'px-4 py-2 rounded-full border text-base transition-colors',
                      platform === p
                        ? 'border-[#534AB7] bg-[#EEEDFE] text-[#534AB7]'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Step 2 — Priority Posts */}
        {currentStep === 2 && (
          <div className="flex flex-col gap-5">
            <p className="text-base text-gray-600">
              Add priority posts for specific campaigns or announcements. They generate first and
              appear with a red badge in review.
            </p>
            <PriorityPostForm posts={priorityPosts} onChange={setPriorityPosts} />
            {priorityPosts.length === 0 && (
              <p className="text-sm text-gray-400">No priority posts — this step is optional.</p>
            )}
          </div>
        )}

        {/* Step 3 — Post Type */}
        {currentStep === 3 && (
          <PostTypeSelector
            value={postType}
            slideCount={slideCount}
            platform={platform}
            onChange={setPostType}
            onSlideCountChange={setSlideCount}
          />
        )}

        {/* Step 4 — Generated Posts */}
        {currentStep === 4 && (
          <div className="flex flex-col gap-4">
            {isGenerating && researchPhase && (
              <p className="text-sm text-gray-500 animate-pulse">{researchPhase}</p>
            )}

            {skippedPillars.length > 0 && generatedPosts.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 space-y-1">
                <p className="font-medium">
                  {skippedPillars.length === 1 ? '1 pillar skipped' : `${skippedPillars.length} pillars skipped`}
                </p>
                {skippedPillars.map((p) => (
                  <p key={p.name} className="text-xs">
                    <span className="font-medium">{p.name}</span> — no sources assigned or no content found.
                  </p>
                ))}
              </div>
            )}

            {isGenerating && streamTotal > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Generating posts...</span>
                  <span>
                    {generatedPosts.length} of {streamTotal} complete
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#534AB7] transition-all duration-700 ease-out"
                    style={{ width: `${streamTotal > 0 ? Math.round((generatedPosts.length / streamTotal) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}

            {(isGenerating || generatedPosts.length > 0) &&
              streamTotal > 0 &&
              Array.from({ length: streamTotal }, (_, i) => {
                const item = generatedPosts[i]
                return item ? (
                  <div
                    key={item.post.id}
                    className="animate-[fadein_0.4s_ease-out_forwards] opacity-0"
                  >
                    <PostCard
                      post={item.post}
                      validationData={{
                        quality: item.quality,
                        language: item.language,
                        slop: item.slop,
                        sourceGrounding: item.sourceGrounding,
                        criteria: item.criteria,
                        scores: item.scores,
                      }}
                      onApprove={handlePostApproved}
                      onDiscard={handlePostRemoved}
                      onRegenerate={handlePostRegenerated}
                    />
                  </div>
                ) : (
                  <PostCardSkeleton key={`skeleton-${i}`} />
                )
              })}

            {!isGenerating && generatedPosts.length === 0 && hasGenerated && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
                <div className="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center">
                  <svg
                    className="h-8 w-8 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
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
                  <Button
                    size="sm"
                    onClick={() => {
                      setGeneratedPosts([])
                      setHasGenerated(false)
                      setApprovedCount(0)
                      setCurrentStep(3)
                    }}
                  >
                    Generate more
                  </Button>
                  {approvedCount > 0 && (
                    <a href="/calendar" className="text-sm text-gray-500 hover:text-gray-700">
                      View approved posts
                    </a>
                  )}
                </div>
              </div>
            )}

            {!isGenerating && generatedPosts.length === 0 && !hasGenerated && streamTotal === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg
                    className="h-6 w-6 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">No posts generated</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Something went wrong during generation.
                  </p>
                </div>
                <button
                  onClick={() => {
                    void startGeneration()
                  }}
                  className="text-sm font-medium text-[#534AB7] hover:underline"
                >
                  Retry generation
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      {clients.length > 0 && (currentStep < 4 || isGenerating) && (
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-gray-100">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              if (currentStep === 4) {
                abortControllerRef.current?.abort()
                setGeneratedPosts([])
                setStreamTotal(0)
                setResearchPhase('')
              }
              setCurrentStep((s) => Math.max(1, s - 1))
            }}
            disabled={currentStep === 1}
          >
            {currentStep === 4 ? 'Cancel' : 'Back'}
          </Button>

          {currentStep < 4 && (
            <div className="flex items-center gap-4">
              {currentStep === 2 && (
                <button
                  onClick={() => setCurrentStep(3)}
                  className="text-base text-gray-400 hover:text-gray-600"
                >
                  Skip
                </button>
              )}
              <Button size="lg" onClick={() => setCurrentStep((s) => s + 1)} disabled={!canNext}>
                {currentStep === 3 ? 'Generate' : 'Next'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
