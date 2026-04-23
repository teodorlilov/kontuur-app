'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PostList } from './post-list'
import { PostDetail } from './post-detail'
import { QualityPanel } from './quality-panel'
import type { PostData, ValidationData } from '@/types/post'
import type { SkippedPillar } from '@/ai/research/types'

type GeneratedPost = { post: PostData } & ValidationData

interface ResultsViewProps {
  posts: GeneratedPost[]
  clientName: string
  platform: string
  postType: string
  skippedPillars: SkippedPillar[]
  onApprove: (postId: string) => void
  onDiscard: (postId: string) => void
  onRegenerate: (postId: string, updatedPost: PostData, updatedValidation: ValidationData) => void
  onNewRun: () => void
}

/** Step 5: three-panel results view with topbar. */
export function ResultsView({
  posts,
  clientName,
  platform,
  postType,
  skippedPillars,
  onApprove,
  onDiscard,
  onRegenerate,
  onNewRun,
}: ResultsViewProps) {
  const [selectedPostId, setSelectedPostId] = useState(posts[0]?.post.id ?? '')

  const selectedPost = posts.find((p) => p.post.id === selectedPostId)
  const selectedIndex = posts.findIndex((p) => p.post.id === selectedPostId)

  function handleApprove(postId: string) {
    onApprove(postId)
    selectNextAfterRemoval(postId)
  }

  function handleDiscard(postId: string) {
    onDiscard(postId)
    selectNextAfterRemoval(postId)
  }

  function selectNextAfterRemoval(removedId: string) {
    const remaining = posts.filter((p) => p.post.id !== removedId)
    if (remaining.length === 0) return
    const removedIndex = posts.findIndex((p) => p.post.id === removedId)
    const nextIndex = Math.min(removedIndex, remaining.length - 1)
    setSelectedPostId(remaining[nextIndex]!.post.id)
  }

  function navigatePrev() {
    if (selectedIndex > 0) setSelectedPostId(posts[selectedIndex - 1]!.post.id)
  }

  function navigateNext() {
    if (selectedIndex < posts.length - 1) setSelectedPostId(posts[selectedIndex + 1]!.post.id)
  }

  if (posts.length === 0) return null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ResultsTopbar
        postsCount={posts.length}
        clientName={clientName}
        platform={platform}
        postType={postType}
        currentIndex={selectedIndex}
        onPrev={navigatePrev}
        onNext={navigateNext}
        onNewRun={onNewRun}
      />
      {skippedPillars.length > 0 && <SkippedBanner pillars={skippedPillars} />}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <PostList posts={posts} selectedPostId={selectedPostId} onSelect={setSelectedPostId} />
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
            onApprove={handleApprove}
            onDiscard={handleDiscard}
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
  )
}

function ResultsTopbar({
  postsCount,
  clientName,
  platform,
  postType,
  currentIndex,
  onPrev,
  onNext,
  onNewRun,
}: {
  postsCount: number
  clientName: string
  platform: string
  postType: string
  currentIndex: number
  onPrev: () => void
  onNext: () => void
  onNewRun: () => void
}) {
  return (
    <div
      style={{
        height: '48px',
        background: 'var(--color-surface)',
        borderBottom: '0.5px solid var(--color-border-1)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        gap: '14px',
        flexShrink: 0,
        boxShadow: '0 1px 0 rgba(44,62,80,0.05)',
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-1)' }}>
        {postsCount} posts generated
      </span>
      <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
        {clientName} · {platform} · {postType === 'carousel' ? 'Carousel' : 'Single image'}
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <PostNavigator current={currentIndex + 1} total={postsCount} onPrev={onPrev} onNext={onNext} />
        <Button variant="ghost" size="sm" onClick={onNewRun}>
          New run
        </Button>
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
