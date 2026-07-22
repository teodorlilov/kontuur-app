'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { BatchScheduleModal } from '@/components/scheduling/batch-schedule-modal'
import { ReviewHeader } from './review-header'
import { ReviewPostList } from './review-post-list'
import { ReviewPostView } from './review-post-view'
import {
  filterReviewPosts,
  type ReviewPost,
  type ReviewTab,
} from '@/features/review/lib/filter-review-posts'
import { upsertImageAtPosition } from '@/features/publishing/lib/image-list'
import type { BestTimePlatform, PostImage } from '@/types/api'

interface ReviewQueueProps {
  initialPosts: ReviewPost[]
  clients: Array<{ id: string; name: string; is_health_niche: boolean }>
  bestTimeMap: Record<string, BestTimePlatform[] | null>
}

export function ReviewQueue({ initialPosts, clients, bestTimeMap }: ReviewQueueProps) {
  const [posts, setPosts] = useState(initialPosts)
  const [activeTab, setActiveTab] = useState<ReviewTab>('all')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [selectedPostId, setSelectedPostId] = useState<string | null>(initialPosts[0]?.id ?? null)
  const [approvedPosts, setApprovedPosts] = useState<ReviewPost[]>([])
  const [batchPosts, setBatchPosts] = useState<ReviewPost[]>([])
  const [batchOpen, setBatchOpen] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')

  const filteredPosts = useMemo(
    () => filterReviewPosts(posts, activeTab, selectedClientId),
    [posts, activeTab, selectedClientId]
  )
  const selectedPost = filteredPosts.find((p) => p.id === selectedPostId)

  function selectNextAfterRemoval(removedId: string) {
    const remaining = filteredPosts.filter((p) => p.id !== removedId)
    if (remaining.length === 0) {
      setSelectedPostId(null)
      return
    }
    const removedIndex = filteredPosts.findIndex((p) => p.id === removedId)
    const nextIndex = Math.min(removedIndex, remaining.length - 1)
    setSelectedPostId(remaining[nextIndex]!.id)
  }

  function handleApprove(postId: string) {
    const post = posts.find((p) => p.id === postId)
    if (post) setApprovedPosts((prev) => [...prev, post])
    setPosts((prev) => prev.filter((p) => p.id !== postId))
    selectNextAfterRemoval(postId)
  }

  function handleDelete(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId))
    selectNextAfterRemoval(postId)
  }

  function handleImageUpserted(postId: string, image: PostImage) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, images: upsertImageAtPosition(p.images, image) } : p))
    )
  }

  function handleImageDeleted(postId: string, imageId: string) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, images: p.images.filter((img) => img.id !== imageId) } : p))
    )
  }

  function handleApproveAll() {
    setBatchPosts(posts)
    setBatchOpen(true)
  }

  function handleBatchComplete() {
    const scheduledIds = new Set(batchPosts.map((p) => p.id))
    setApprovedPosts((prev) => [...prev, ...batchPosts])
    setPosts((prev) => prev.filter((p) => !scheduledIds.has(p.id)))
    setSelectedPostId((prev) => {
      if (prev && scheduledIds.has(prev)) return null
      return prev
    })
    setBatchPosts([])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <ReviewHeader
        pendingCount={posts.length}
        approvedCount={approvedPosts.length}
        onApproveAll={handleApproveAll}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex`} style={{ flexShrink: 0 }}>
          <ReviewPostList
            posts={filteredPosts}
            allPosts={posts}
            clients={clients}
            selectedPostId={selectedPostId}
            activeTab={activeTab}
            selectedClientId={selectedClientId}
            approvedCount={approvedPosts.length}
            onSelectPost={(id: string) => {
              setSelectedPostId(id)
              setMobileView('detail')
            }}
            onTabChange={setActiveTab}
            onClientChange={setSelectedClientId}
            onOpenBatch={() => {
              setBatchPosts(approvedPosts)
              setBatchOpen(true)
            }}
          />
        </div>

        <div className={`${mobileView === 'detail' ? 'flex' : 'hidden'} md:flex`} style={{ flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
          {/* Mobile back button */}
          <button
            type="button"
            className="md:hidden"
            onClick={() => setMobileView('list')}
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
            {selectedPost ? (
              <ReviewPostView
                key={selectedPost.id}
                post={selectedPost}
                bestTimeData={bestTimeMap[selectedPost.client_id] ?? null}
                onApprove={handleApprove}
                onDelete={handleDelete}
                onImageUpserted={handleImageUpserted}
                onImageDeleted={handleImageDeleted}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-muted)' }}>
                    {posts.length === 0 ? 'No posts to review' : 'Select a post to review'}
                  </p>
                  {posts.length === 0 && (
                    <p style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px', opacity: 0.7 }}>
                      Posts will appear here when autonomous generation is enabled.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <BatchScheduleModal
        open={batchOpen}
        onClose={() => {
          setBatchOpen(false)
          setBatchPosts([])
        }}
        posts={batchPosts.map((p) => ({
          id: p.id,
          client_name: p.client_name,
          caption: p.caption,
          platform: p.platform,
        }))}
        onComplete={handleBatchComplete}
      />
    </div>
  )
}
