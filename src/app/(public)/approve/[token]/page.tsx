'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Spinner } from '@/components/ui/spinner'
import { submitApproval } from '@/lib/actions/approval-actions'
import type { ApprovalBatchData, ApprovalPostData, CarouselSlide } from '@/types/api'

type PageState = 'loading' | 'error' | 'review' | 'submitted'

export default function ApprovalPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [data, setData] = useState<ApprovalBatchData | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [postNotes, setPostNotes] = useState<Record<string, string>>({})
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submittedStatus, setSubmittedStatus] = useState<'approved' | 'changes_requested' | null>(
    null
  )

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/approval/${token}`)
        if (res.status === 410) {
          setErrorMessage('This approval link has expired. Please ask your agency for a new one.')
          setState('error')
          return
        }
        if (!res.ok) {
          setErrorMessage('This link is invalid or has expired.')
          setState('error')
          return
        }
        const result = (await res.json()) as ApprovalBatchData
        setData(result)

        if (result.status !== 'pending') {
          setSubmittedStatus(result.status as 'approved' | 'changes_requested')
          setState('submitted')
        } else {
          setState('review')
        }
      } catch {
        setErrorMessage('Something went wrong. Please try again later.')
        setState('error')
      }
    }
    load()
  }, [token])

  async function handleSubmit(status: 'approved' | 'changes_requested') {
    setSubmitting(true)
    try {
      const notes = Object.entries(postNotes)
        .filter(([, note]) => note.trim().length > 0)
        .map(([postId, note]) => ({ postId, note: note.trim() }))

      const result = await submitApproval(
        token,
        status,
        notes.length > 0 ? notes : undefined
      )

      if (!result.ok) {
        setErrorMessage(result.error || 'Failed to submit response')
        setState('error')
        return
      }

      setSubmittedStatus(status)
      setState('submitted')
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
      setState('error')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleNote(postId: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev)
      if (next.has(postId)) {
        next.delete(postId)
      } else {
        next.add(postId)
      }
      return next
    })
  }

  // Format week range
  function formatWeekRange(posts: ApprovalPostData[]): string {
    const dates = posts
      .map((p) => p.scheduled_at)
      .filter((d): d is string => d !== null)
      .map((d) => new Date(d))
      .sort((a, b) => a.getTime() - b.getTime())

    if (dates.length === 0) return ''
    const first = dates[0]!
    const last = dates[dates.length - 1]!
    const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }
    return `${first.toLocaleDateString('en-US', opts)} – ${last.toLocaleDateString('en-US', opts)}`
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <p className="text-gray-700 font-medium">{errorMessage}</p>
        </div>
      </div>
    )
  }

  if (state === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md text-center">
          <div className="text-3xl mb-3">{submittedStatus === 'approved' ? '✅' : '📝'}</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {submittedStatus === 'approved'
              ? 'Thank you! Your posts are confirmed.'
              : 'Your feedback has been sent to the team.'}
          </h2>
          <p className="text-sm text-gray-500">You can close this page.</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {data.agencyName && (
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              {data.agencyName}
            </p>
          )}
          <h1 className="text-xl font-semibold text-gray-900">Posts for review</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data.clientName} · {formatWeekRange(data.posts)} · {data.posts.length} post
            {data.posts.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Post list */}
      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-4 pb-28">
        {data.posts.map((post, index) => (
          <PostPreviewCard
            key={post.id}
            post={post}
            index={index + 1}
            noteExpanded={expandedNotes.has(post.id)}
            noteValue={postNotes[post.id] ?? ''}
            onToggleNote={() => toggleNote(post.id)}
            onNoteChange={(val) => setPostNotes((prev) => ({ ...prev, [post.id]: val }))}
          />
        ))}
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-4 flex gap-3 justify-end">
          <button
            onClick={() => {
              void handleSubmit('changes_requested')
            }}
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Request changes
          </button>
          <button
            onClick={() => {
              void handleSubmit('approved')
            }}
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Approve all'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Post preview card ----------

interface PostPreviewCardProps {
  post: ApprovalPostData
  index: number
  noteExpanded: boolean
  noteValue: string
  onToggleNote: () => void
  onNoteChange: (val: string) => void
}

function PostPreviewCard({
  post,
  index,
  noteExpanded,
  noteValue,
  onToggleNote,
  onNoteChange,
}: PostPreviewCardProps) {
  const isCarousel = post.post_type === 'carousel'
  const slides =
    isCarousel && Array.isArray(post.slides_json) ? (post.slides_json as CarouselSlide[]) : []

  const scheduledDate = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-400">#{index}</span>
        {scheduledDate && (
          <span className="text-xs font-medium text-gray-700">{scheduledDate}</span>
        )}
        {post.platform && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
            {post.platform}
          </span>
        )}
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {isCarousel ? `Carousel · ${slides.length} slides` : 'Single image'}
        </span>
        {post.pillar && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
            {post.pillar}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col gap-4">
        {/* Caption */}
        {post.caption && (
          <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
            {post.caption}
          </p>
        )}

        {/* Carousel slides */}
        {isCarousel && slides.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Slides</p>
            <div className="flex flex-col gap-2">
              {slides.map((slide, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Slide {i + 1}</p>
                  <p className="text-sm font-medium text-gray-900">{slide.headline}</p>
                  <p className="text-sm text-gray-700 mt-1">{slide.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-post note */}
        <div className="border-t border-gray-100 pt-3">
          <button
            onClick={onToggleNote}
            className="text-xs text-brand-purple hover:underline font-medium"
          >
            {noteExpanded ? 'Hide note' : 'Add a note'}
          </button>
          {noteExpanded && (
            <textarea
              value={noteValue}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Leave feedback on this post (optional)..."
              rows={2}
              className="mt-2 w-full text-sm text-gray-900 border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent resize-y"
            />
          )}
        </div>
      </div>
    </div>
  )
}
