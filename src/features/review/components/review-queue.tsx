'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { BatchScheduleModal } from '@/components/scheduling/batch-schedule-modal'
import { Button } from '@/components/ui/button'
import { HeaderMeta, MetaFlag, PageHeader } from '@/components/layout/page-header/page-header'
import { SelectControl } from '@/components/layout/page-header/select-control'
import { TabRail, type TabItem } from '@/components/layout/page-header/tab-rail'
import { formatRelativeTime } from '@/utils/format'
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
  /** Oldest pending post, computed server-side. Shown in the rail. */
  oldestPendingAt: string | null
}

/** Owns the page header: the tab rail and the list read the same filter state. */
export function ReviewQueue({ initialPosts, clients, bestTimeMap, oldestPendingAt }: ReviewQueueProps) {
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

  const priorityCount = posts.filter((p) => p.priority).length
  const healthCount = posts.filter((p) => p.is_health_niche).length

  const tabs: Array<TabItem<ReviewTab>> = [
    { id: 'all', label: 'All', count: posts.length },
    { id: 'priority', label: 'Priority', count: priorityCount, flag: priorityCount > 0 },
    { id: 'health', label: 'Health review', count: healthCount, warn: healthCount > 0 },
  ]

  const clientOptions = [
    { value: '', label: 'All clients' },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        crumb={[{ label: 'Review queue' }]}
        title="Review"
        count={posts.length}
        railTools={
          oldestPendingAt ? (
            <span className="hidden text-xs text-text3 sm:block">
              Oldest waiting {formatRelativeTime(new Date(oldestPendingAt))}
            </span>
          ) : null
        }
        meta={
          <HeaderMeta
            parts={[
              posts.length === 0 ? 'Nothing waiting on you' : null,
              healthCount > 0 && <MetaFlag>{healthCount} need a health check</MetaFlag>,
              priorityCount > 0 && `${priorityCount} priority`,
              approvedPosts.length > 0 && `${approvedPosts.length} approved this session`,
            ]}
          />
        }
        actions={
          <>
            {clients.length > 1 && (
              <SelectControl
                label="Client"
                value={selectedClientId ?? ''}
                options={clientOptions}
                onChange={(id) => setSelectedClientId(id || null)}
              />
            )}
            <Button
              onClick={handleApproveAll}
              disabled={posts.length === 0}
              variant="secondary"
              size="sm"
            >
              Approve all
            </Button>
          </>
        }
        tabs={<TabRail items={tabs} active={activeTab} onSelect={setActiveTab} label="Filter review queue" />}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex`} style={{ flexShrink: 0 }}>
          <ReviewPostList
            posts={filteredPosts}
            selectedPostId={selectedPostId}
            approvedCount={approvedPosts.length}
            onSelectPost={(id: string) => {
              setSelectedPostId(id)
              setMobileView('detail')
            }}
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
