'use client'

import { useState } from 'react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { BatchScheduleModal } from '@/components/scheduling/batch-schedule-modal'
import { ReviewPostCard } from './review-post-card'
import {
  filterReviewPosts,
  type ReviewPost,
  type ReviewTab,
} from '@/lib/review/filter-review-posts'

interface ReviewQueueProps {
  initialPosts: ReviewPost[]
  clients: Array<{ id: string; name: string; is_health_niche: boolean }>
}

const tabs: Array<{ key: ReviewTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'priority', label: 'Priority' },
]

export function ReviewQueue({ initialPosts, clients }: ReviewQueueProps) {
  const [posts, setPosts] = useState(initialPosts)
  const [activeTab, setActiveTab] = useState<ReviewTab>('all')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [approvedPosts, setApprovedPosts] = useState<ReviewPost[]>([])
  const [batchOpen, setBatchOpen] = useState(false)

  const filteredPosts = filterReviewPosts(posts, activeTab, selectedClientId)

  function handleApprove(postId: string) {
    const post = posts.find((p) => p.id === postId)
    if (post) setApprovedPosts((prev) => [...prev, post])
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }

  function handleDelete(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }

  function handleBatchComplete() {
    setApprovedPosts([])
  }

  const priorityCount = posts.filter((p) => p.priority).length

  return (
    <div className="flex flex-col gap-6">
      {/* Filter controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.label}
              {tab.key === 'priority' && priorityCount > 0 && (
                <span className="ml-1.5 bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
                  {priorityCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Client filter */}
        {clients.length > 1 && (
          <select
            value={selectedClientId ?? ''}
            onChange={(e) => setSelectedClientId(e.target.value || null)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {/* Schedule batch + Count */}
        <div className="flex items-center gap-3 sm:ml-auto">
          {approvedPosts.length > 0 && (
            <Button onClick={() => setBatchOpen(true)} size="sm" variant="secondary">
              Schedule {approvedPosts.length} approved
            </Button>
          )}
          <p className="text-xs text-gray-500">
            {filteredPosts.length} {filteredPosts.length === 1 ? 'post' : 'posts'}
          </p>
        </div>
      </div>

      {/* Post list or empty state */}
      {filteredPosts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 font-medium">No posts to review</p>
          <p className="text-sm text-gray-400 mt-1">
            Posts will appear here when autonomous generation is enabled.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredPosts.map((post) => (
            <ReviewPostCard
              key={post.id}
              post={post}
              onApprove={handleApprove}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
      <BatchScheduleModal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        posts={approvedPosts.map((p) => ({
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
