'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PostList } from './post-list'
import { PostDetail } from './post-detail'
import { QualityPanel } from './quality-panel'
import type { DraftVisual } from '@/features/generate/lib/draft-visuals'
import type { CanvasDoc } from '@/types/canvas'
import type { PostData, ValidationData } from '@/types/post'
import type { SkippedPillar } from '@/ai/research/types'

type GeneratedPost = { post: PostData } & ValidationData

interface ResultsViewProps {
  posts: GeneratedPost[]
  clientName: string
  platform: string
  postType: string
  skippedPillars: SkippedPillar[]
  visualsByPost: Record<string, DraftVisual[]>
  onRegenerateVisual: (post: PostData, position: number) => void
  onEditedVisual: (draftId: string, visual: DraftVisual) => void
  onApplyStyleToAll: (post: PostData, sourcePosition: number, doc: CanvasDoc) => void
  onApprove: (postId: string) => void
  onDiscard: (postId: string) => void
  onRegenerate: (postId: string, updatedPost: PostData, updatedValidation: ValidationData) => void
  onNewRun: () => void
  onApproveAll?: () => void
}

/** Step 5: three-panel results view with topbar. */
export function ResultsView({
  posts,
  clientName,
  platform,
  postType,
  skippedPillars,
  visualsByPost,
  onRegenerateVisual,
  onEditedVisual,
  onApplyStyleToAll,
  onApprove,
  onDiscard,
  onRegenerate,
  onNewRun,
  onApproveAll,
}: ResultsViewProps) {
  const [selectedPostId, setSelectedPostId] = useState(posts[0]?.post.id ?? '')
  const [mobilePanel, setMobilePanel] = useState<'list' | 'detail'>('list')
  const prevPostIdsRef = useRef<string[]>([])

  // When posts array changes (post removed), auto-select the next valid post
  useEffect(() => {
    const currentIds = posts.map((p) => p.post.id)
    const prevIds = prevPostIdsRef.current
    prevPostIdsRef.current = currentIds

    if (!currentIds.includes(selectedPostId) && currentIds.length > 0) {
      const removedIndex = prevIds.indexOf(selectedPostId)
      const nextIndex = Math.min(Math.max(0, removedIndex), currentIds.length - 1)
      setSelectedPostId(currentIds[nextIndex]!)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts])

  const selectedPost = posts.find((p) => p.post.id === selectedPostId)
  const selectedIndex = posts.findIndex((p) => p.post.id === selectedPostId)

  function navigatePrev() {
    if (selectedIndex > 0) setSelectedPostId(posts[selectedIndex - 1]!.post.id)
  }

  function navigateNext() {
    if (selectedIndex < posts.length - 1) setSelectedPostId(posts[selectedIndex + 1]!.post.id)
  }

  const handleSelectPost = useCallback((id: string) => {
    setSelectedPostId(id)
    setMobilePanel('detail')
  }, [])

  if (posts.length === 0) return null

  const allVisuals = Object.values(visualsByPost).flat()
  const doneVisuals = allVisuals.filter((v) => v.status === 'done').length
  const generatingVisuals = allVisuals.some((v) => v.status === 'generating')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ResultsTopbar
        postsCount={posts.length}
        clientName={clientName}
        platform={platform}
        postType={postType}
        currentIndex={selectedIndex}
        visualsProgress={generatingVisuals ? `Generating visuals ${doneVisuals}/${allVisuals.length}…` : null}
        onPrev={navigatePrev}
        onNext={navigateNext}
        onNewRun={onNewRun}
        onApproveAll={onApproveAll}
      />
      {skippedPillars.length > 0 && <SkippedBanner pillars={skippedPillars} />}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Post list — full width on mobile, fixed 280px on desktop */}
        <div className={`${mobilePanel === 'list' ? 'flex' : 'hidden'} md:flex`} style={{ flexShrink: 0 }}>
          <PostList posts={posts} selectedPostId={selectedPostId} visualsByPost={visualsByPost} onSelect={handleSelectPost} />
        </div>

        {/* Detail + quality panels — hidden on mobile when viewing list */}
        <div className={`${mobilePanel === 'detail' ? 'flex' : 'hidden'} md:flex`} style={{ flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
          {/* Mobile back button */}
          <button
            type="button"
            className="md:hidden"
            onClick={() => setMobilePanel('list')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-muted)',
              background: 'var(--color-surface)',
              border: 'none',
              borderBottom: '0.5px solid var(--color-border-1)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            <ChevronLeft size={14} />
            Back to list
          </button>

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {selectedPost && (
              <PostDetail
                key={selectedPost.post.id}
                post={selectedPost.post}
                validationData={{
                  language: selectedPost.language,
                  slop: selectedPost.slop,
                  sourceGrounding: selectedPost.sourceGrounding,
                  criteria: selectedPost.criteria,
                  scores: selectedPost.scores,
                }}
                visuals={visualsByPost[selectedPost.post.id]}
                onRegenerateVisual={(position) => onRegenerateVisual(selectedPost.post, position)}
                onEditedVisual={onEditedVisual}
                onApplyStyleToAll={onApplyStyleToAll}
                onApprove={onApprove}
                onDiscard={onDiscard}
                onRegenerate={onRegenerate}
              />
            )}
            {selectedPost && (
              <QualityPanel
                key={`quality-${selectedPost.post.id}`}
                post={selectedPost.post}
                validationData={{
                  language: selectedPost.language,
                  slop: selectedPost.slop,
                  sourceGrounding: selectedPost.sourceGrounding,
                  criteria: selectedPost.criteria,
                  scores: selectedPost.scores,
                }}
                runSummary={{
                  clientName,
                  platform,
                  postsCount: posts.length,
                  skippedCount: skippedPillars.length,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultsTopbar({
  postsCount,
  clientName,
  platform,
  postType,
  currentIndex,
  visualsProgress,
  onPrev,
  onNext,
  onNewRun,
  onApproveAll,
}: {
  postsCount: number
  clientName: string
  platform: string
  postType: string
  currentIndex: number
  visualsProgress: string | null
  onPrev: () => void
  onNext: () => void
  onNewRun: () => void
  onApproveAll?: () => void
}) {
  return (
    <div
      style={{
        minHeight: '46px',
        background: 'var(--color-surface)',
        borderBottom: '0.5px solid var(--color-border-1)',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '6px 18px',
        gap: '8px',
        flexShrink: 0,
        boxShadow: '0 1px 0 rgba(44,62,80,0.05)',
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-1)' }}>
        {postsCount} posts generated
      </span>
      <span className="hidden sm:inline" style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
        {clientName} · {platform} · {postType === 'carousel' ? 'Carousel' : 'Single image'}
      </span>
      {visualsProgress && (
        <span style={{ fontSize: '11px', fontWeight: 500, color: '#C07B55' }} className="animate-pulse">
          ✨ {visualsProgress}
        </span>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <PostNavigator current={currentIndex + 1} total={postsCount} onPrev={onPrev} onNext={onNext} />
        <Button variant="ghost" size="sm" onClick={onNewRun}>
          New run
        </Button>
        {onApproveAll && (
          <Button size="sm" onClick={onApproveAll}>
            Approve all
          </Button>
        )}
      </div>
    </div>
  )
}

function PostNavigator({
  current,
  total,
  onPrev,
  onNext,
}: {
  current: number
  total: number
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <button
        type="button"
        onClick={onPrev}
        disabled={current <= 1}
        style={{
          padding: '4px',
          background: 'none',
          border: 'none',
          cursor: current <= 1 ? 'not-allowed' : 'pointer',
          opacity: current <= 1 ? 0.3 : 1,
          color: 'var(--color-text-2)',
        }}
      >
        <ChevronLeft size={14} />
      </button>
      <span style={{ fontSize: '11px', color: 'var(--color-muted)', minWidth: '60px', textAlign: 'center' }}>
        Post {current} of {total}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={current >= total}
        style={{
          padding: '4px',
          background: 'none',
          border: 'none',
          cursor: current >= total ? 'not-allowed' : 'pointer',
          opacity: current >= total ? 0.3 : 1,
          color: 'var(--color-text-2)',
        }}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}

function SkippedBanner({ pillars }: { pillars: SkippedPillar[] }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 18px',
        background: 'rgba(192,123,85,0.07)',
        borderBottom: '1px solid rgba(192,123,85,0.12)',
        fontSize: '11px',
        color: '#8A4A2A',
        flexShrink: 0,
      }}
    >
      <AlertTriangle size={13} />
      {pillars.length === 1
        ? `1 pillar skipped — ${pillars[0]!.name} has no sources assigned.`
        : `${pillars.length} pillars skipped — no sources assigned.`}
      <a
        href="/sources"
        style={{ color: 'var(--color-terracotta)', fontWeight: 500, marginLeft: '3px', textDecoration: 'none' }}
      >
        Fix in Research Sources →
      </a>
    </div>
  )
}
