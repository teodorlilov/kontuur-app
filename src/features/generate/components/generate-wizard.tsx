'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { PriorityPostForm } from '@/features/generate/components/priority-post-form'
import { ThemeRow, type ThemeInput } from '@/features/generate/components/theme-row'
import { PostTypeSelector } from '@/features/generate/components/post-type-selector'
import type { PriorityPost, PostType } from '@/types/api'
import { ResearchProgress } from '@/features/generate/components/research-progress'
import { PostCard, type PostData, type ValidationData } from '@/components/posts/post-card'
import { PostCardSkeleton } from '@/components/posts/post-card-skeleton'
import { shouldShowResearchButton } from '@/features/generate/helpers/should-show-research-button'
import { readNDJSONStream } from '@/utils/stream'
import { PLATFORMS } from '@/utils/constants'
import type { ClientRow, BrandProfileRow } from '@/types/database'

type Client = Pick<ClientRow, 'id' | 'name' | 'niche' | 'language'>

type BrandProfile = Pick<BrandProfileRow, 'tone' | 'target_audience' | 'content_pillars' | 'default_post_type' | 'default_carousel_slides'> & {
  source_strategy: { rss: boolean; website: boolean; file: boolean; trend_fallback: boolean; require_source_grounding?: boolean } | null
}

interface ResearchTopic {
  finding: string
  suggested_theme: string
  pillar?: string
  source_url?: string | null
  source_title?: string | null
  source_type?: 'rss' | 'website' | 'file'
  source_excerpt?: string
  source_full_text?: string
}

interface ThemeWithSource extends ThemeInput {
  pillar?: string
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceType?: 'rss' | 'website' | 'file'
  sourceExcerpt?: string
  sourceFullText?: string
}

type GeneratedPost = { post: PostData } & ValidationData

const STEP_LABELS = [
  'Client & Platform',
  'Priority Posts',
  'Weekly Themes',
  'Post Type',
  'Generated Posts',
]

export function GenerateWizard() {
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientId, setClientId] = useState('')
  const [platform, setPlatform] = useState('Instagram')
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null)
  const [brandProfileLoading, setBrandProfileLoading] = useState(false)
  const [targetPostCount, setTargetPostCount] = useState(3)

  // Step 2
  const [priorityPosts, setPriorityPosts] = useState<PriorityPost[]>([])

  // Step 3
  const [themes, setThemes] = useState<ThemeWithSource[]>([])
  const [isResearching, setIsResearching] = useState(false)
  const [hasAutoResearched, setHasAutoResearched] = useState(false)

  // Step 4
  const [postType, setPostType] = useState<PostType>('single')
  const [slideCount, setSlideCount] = useState(6)

  // Step 5
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([])
  const [streamTotal, setStreamTotal] = useState(0)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [approvedCount, setApprovedCount] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Load clients on mount
  useEffect(() => {
    void fetch('/api/clients')
      .then((r) => r.json())
      .then((data: { clients?: Client[] }) => {
        if (data.clients) {
          setClients(data.clients)
          if (data.clients.length > 0 && !clientId) {
            setClientId(data.clients[0]?.id ?? '')
          }
        }
      })
      .finally(() => setClientsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load brand profile when client changes
  useEffect(() => {
    if (!clientId) return
    setBrandProfileLoading(true)
    void fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((data: { client?: { posts_per_week: number }; brand_profile?: BrandProfile }) => {
        if (data.brand_profile) {
          const profile = data.brand_profile
          setBrandProfile(profile)
          if (profile.default_post_type === 'carousel') setPostType('carousel')
          else if (profile.default_post_type === 'reels') setPostType('reels')
          else setPostType('single')
          setSlideCount(profile.default_carousel_slides || 6)
        }
        if (data.client?.posts_per_week != null && data.client.posts_per_week > 0) {
          setTargetPostCount(data.client.posts_per_week)
        }
      })
      .finally(() => setBrandProfileLoading(false))
  }, [clientId])

  // Auto-research when entering step 3
  useEffect(() => {
    if (currentStep === 3 && !hasAutoResearched && clientId) {
      setHasAutoResearched(true)
      void handleResearch()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep])

  // Start generation when entering step 5
  useEffect(() => {
    if (currentStep === 5 && generatedPosts.length === 0 && !isGenerating) {
      void startGeneration()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep])

  // Abort any in-flight generation stream when leaving step 5
  useEffect(() => {
    return () => { abortControllerRef.current?.abort() }
  }, [currentStep])

  async function startGeneration() {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    const validThemes = themes.filter((t) => t.selected && t.description.trim())
    if (validThemes.length === 0 && priorityPosts.length === 0) {
      toast.error('Add at least one theme to generate posts')
      setCurrentStep(3)
      return
    }

    const total = validThemes.length + priorityPosts.length
    setStreamTotal(total)
    setGeneratedPosts([])
    setIsGenerating(true)

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          clientId,
          platform,
          themes: validThemes.map((t) => ({
            description: t.description,
            count: 1,
            pillar: t.pillar,
            sourceUrl: t.sourceUrl,
            sourceTitle: t.sourceTitle,
            sourceType: t.sourceType,
            sourceExcerpt: t.sourceExcerpt,
            sourceFullText: t.sourceFullText,
          })),
          postType,
          slideCount,
          priorityPosts,
        }),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        toast.error(err.error ?? 'Generation failed')
        setCurrentStep(3)
        return
      }

      await readNDJSONStream<GeneratedPost>(res, (post) => {
        setGeneratedPosts((prev) => [...prev, post])
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

  async function handleResearch() {
    const client = clients.find((c) => c.id === clientId)
    if (!client) return
    setIsResearching(true)
    try {
      const res = await fetch('/api/ai/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, niche: client.niche ?? 'general', language: client.language, count: targetPostCount }),
      })
      const data = await res.json() as { topics?: ResearchTopic[] }
      if (data.topics) {
        setThemes(data.topics.map((t, i) => ({
          description: t.suggested_theme,
          count: 1,
          selected: i < targetPostCount,
          pillar: t.pillar,
          sourceUrl: t.source_url,
          sourceTitle: t.source_title,
          sourceType: t.source_type,
          sourceExcerpt: t.source_excerpt,
          sourceFullText: t.source_full_text,
        })))
      }
    } catch {
      toast.error('Research failed')
    } finally {
      setIsResearching(false)
    }
  }

  function handleThemeChange(index: number, theme: ThemeInput) {
    const current = themes[index]
    if (current && !current.selected && theme.selected) {
      const currentSelected = themes.filter((t) => t.selected).length
      if (currentSelected >= targetPostCount) {
        toast.error(`Maximum ${targetPostCount} theme${targetPostCount !== 1 ? 's' : ''} allowed`)
        return
      }
    }
    setThemes((prev) => prev.map((t, i) => (i === index ? { ...t, ...theme } : t)))
  }

  function handleThemeRemove(index: number) {
    setThemes((prev) => prev.filter((_, i) => i !== index))
  }

  function handlePostRemoved(postId: string) {
    setGeneratedPosts((prev) => prev.filter((p) => p.post.id !== postId))
  }

  function handlePostApproved(postId: string) {
    setGeneratedPosts((prev) => prev.filter((p) => p.post.id !== postId))
    setApprovedCount((c) => c + 1)
  }

  function handlePostRegenerated(postId: string, updatedPost: PostData, updatedValidation: ValidationData) {
    setGeneratedPosts((prev) =>
      prev.map((p) => p.post.id === postId ? { post: updatedPost, ...updatedValidation } : p)
    )
  }

  const selectedThemes = themes.filter((t) => t.selected && t.description.trim())

  const canNext = (() => {
    if (currentStep === 1) return !!clientId
    if (currentStep === 3) return themes.some((t) => t.selected && t.description.trim()) || priorityPosts.length > 0
    return true
  })()

  if (currentStep === 1 && clientsLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500">Loading clients...</p>
      </div>
    )
  }

  if (currentStep === 1 && clients.length === 0) {
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
        <a href="/clients/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#534AB7] hover:underline">
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
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-text-1)', letterSpacing: '-0.02em', margin: 0 }}>Generate posts</h1>
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
                        if (p !== 'Instagram' && (postType === 'carousel' || postType === 'reels')) {
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
              Add priority posts for specific campaigns or announcements. They generate first and appear with a red badge in review.
            </p>
            <PriorityPostForm posts={priorityPosts} onChange={setPriorityPosts} />
            {priorityPosts.length === 0 && (
              <p className="text-sm text-gray-400">No priority posts — this step is optional.</p>
            )}
          </div>
        )}

        {/* Step 3 — Weekly Themes */}
        {currentStep === 3 && (
          <div className="flex flex-col gap-5">
            {isResearching && themes.length === 0 ? (
              <ResearchProgress
                clientName={clients.find((c) => c.id === clientId)?.name ?? 'client'}
              />
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {themes.map((theme, i) => (
                    <ThemeRow
                      key={i}
                      theme={theme}
                      index={i}
                      onChange={handleThemeChange}
                      onRemove={handleThemeRemove}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  {selectedThemes.length < targetPostCount && (
                    <button
                      onClick={() => setThemes((prev) => [...prev, { description: '', count: 1, selected: true }])}
                      className="text-base font-medium text-[#534AB7] hover:underline"
                    >
                      + Add theme
                    </button>
                  )}
                  <span className="text-sm text-gray-500 ml-auto">
                    {selectedThemes.length} of {targetPostCount} themes
                    {priorityPosts.length > 0 && ` + ${priorityPosts.length} priority`}
                  </span>
                </div>

                {shouldShowResearchButton(brandProfile?.source_strategy) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={isResearching}
                    onClick={() => { void handleResearch() }}
                  >
                    Research more topics
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 4 — Post Type */}
        {currentStep === 4 && (
          <PostTypeSelector
            value={postType}
            slideCount={slideCount}
            platform={platform}
            onChange={setPostType}
            onSlideCountChange={setSlideCount}
          />
        )}

        {/* Step 5 — Generated Posts */}
        {currentStep === 5 && (
          <div className="flex flex-col gap-4">

            {/* Real-time progress counter — driven by stream events, not a fake timer */}
            {isGenerating && streamTotal > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Generating posts...</span>
                  <span>{generatedPosts.length} of {streamTotal} complete</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#534AB7] transition-all duration-700 ease-out"
                    style={{ width: `${Math.round((generatedPosts.length / streamTotal) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Skeleton + real post slots — N slots rendered immediately, swapped as posts arrive */}
            {(isGenerating || generatedPosts.length > 0) && streamTotal > 0 && (
              Array.from({ length: streamTotal }, (_, i) => {
                const item = generatedPosts[i]
                return item ? (
                  <div key={item.post.id} className="animate-[fadein_0.4s_ease-out_forwards] opacity-0">
                    <PostCard
                      post={item.post}
                      validationData={{ quality: item.quality, language: item.language, slop: item.slop, sourceGrounding: item.sourceGrounding }}
                      onApprove={handlePostApproved}
                      onDiscard={handlePostRemoved}
                      onRegenerate={handlePostRegenerated}
                    />
                  </div>
                ) : (
                  <PostCardSkeleton key={`skeleton-${i}`} />
                )
              })
            )}

            {/* All posts reviewed */}
            {!isGenerating && generatedPosts.length === 0 && hasGenerated && (
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
                  <Button
                    size="sm"
                    onClick={() => {
                      setGeneratedPosts([])
                      setHasGenerated(false)
                      setApprovedCount(0)
                      setHasAutoResearched(false)
                      setCurrentStep(3)
                    }}
                  >
                    Generate more
                  </Button>
                  {approvedCount > 0 && (
                    <a href="/posts" className="text-sm text-gray-500 hover:text-gray-700">
                      View approved posts
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Error / no posts generated */}
            {!isGenerating && generatedPosts.length === 0 && !hasGenerated && streamTotal === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">No posts generated</p>
                  <p className="text-sm text-gray-500 mt-1">Something went wrong during generation.</p>
                </div>
                <button
                  onClick={() => { void startGeneration() }}
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
      {currentStep < 5 && clients.length > 0 && (
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-gray-100">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
            disabled={currentStep === 1}
          >
            Back
          </Button>

          <div className="flex items-center gap-4">
            {currentStep === 2 && (
              <button
                onClick={() => setCurrentStep(3)}
                className="text-base text-gray-400 hover:text-gray-600"
              >
                Skip
              </button>
            )}
            <Button
              size="lg"
              onClick={() => setCurrentStep((s) => s + 1)}
              disabled={!canNext}
            >
              {currentStep === 4 ? 'Generate' : 'Next'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
