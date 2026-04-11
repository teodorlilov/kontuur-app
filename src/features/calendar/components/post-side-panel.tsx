'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getNextDateForDay } from '@/utils/date-helpers'
import { Button } from '@/components/ui/button'
import { PLATFORMS } from '@/utils/constants'
import { PostContentDisplay } from '@/components/posts/post-content-display'
import type { CalendarPost, BestTimePlatform } from '@/types/api'

interface PostSidePanelProps {
  post: CalendarPost | null
  onClose: () => void
  onSave: (postId: string, updates: { scheduled_at?: string; platform?: string }) => void
  onUnschedule?: (postId: string) => void
  bestTimeData?: BestTimePlatform[] | null
  saving: boolean
}

export function PostSidePanel({
  post,
  onClose,
  onSave,
  onUnschedule,
  bestTimeData,
  saving,
}: PostSidePanelProps) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState('')

  // Reset form when post changes
  useEffect(() => {
    if (!post) return
    if (post.scheduled_at) {
      const d = new Date(post.scheduled_at)
      setSelectedDate(d.toISOString().slice(0, 10))
      setSelectedTime(d.toTimeString().slice(0, 5))
    } else {
      setSelectedDate('')
      setSelectedTime('')
    }
    setSelectedPlatform(post.platform ?? '')
  }, [post])

  if (!post) return null

  const platformData = bestTimeData?.find(
    (bt) => bt.platform.toLowerCase() === (selectedPlatform || post.platform || '').toLowerCase()
  )

  function handleSave() {
    if (!selectedDate || !post) return
    const scheduledAt = new Date(`${selectedDate}T${selectedTime || '12:00'}:00`).toISOString()
    const updates: { scheduled_at?: string; platform?: string } = { scheduled_at: scheduledAt }
    if (selectedPlatform && selectedPlatform !== post.platform) {
      updates.platform = selectedPlatform
    }
    onSave(post.id, updates)
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="fixed top-0 right-0 z-40 h-full w-full max-w-md bg-white border-l border-gray-200 shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Post details</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-5">
          {/* Post meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-700">{post.client_name}</span>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                post.status === 'scheduled'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-green-50 text-green-700'
              )}
            >
              {post.status === 'scheduled' ? 'Scheduled' : 'Approved'}
            </span>
            {post.approval_status && (
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full',
                  post.approval_status === 'pending' && 'bg-amber-50 text-amber-700',
                  post.approval_status === 'approved' && 'bg-green-50 text-green-700',
                  post.approval_status === 'changes_requested' && 'bg-red-50 text-red-700'
                )}
              >
                {post.approval_status === 'pending'
                  ? 'Awaiting client approval'
                  : post.approval_status === 'approved'
                    ? 'Client approved'
                    : 'Changes requested'}
              </span>
            )}
          </div>

          {/* Client feedback note */}
          {post.approval_status === 'changes_requested' && post.approval_client_note && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
              <p className="text-xs font-medium text-red-700 mb-1">Client feedback</p>
              <p className="text-sm text-red-900">{post.approval_client_note}</p>
            </div>
          )}

          {/* Post content (shared with generation flow) */}
          <PostContentDisplay
            caption={post.caption}
            platform={post.platform}
            postType={post.post_type}
            slidesJson={post.slides_json}
            priority={post.priority}
            qualityScoreAvg={post.quality_score_avg}
            sourceUrl={post.source_url}
            sourceTitle={post.source_title}
            sourceType={post.source_type}
            sourceExcerpt={post.source_excerpt}
            pillar={post.pillar}
          />

          {/* Best time recommendations */}
          {platformData && (
            <div className="flex flex-col gap-2 bg-indigo-50/50 rounded-lg p-3">
              <p className="text-xs font-medium text-indigo-700 uppercase tracking-wide">
                Best times for {platformData.platform}
              </p>
              {platformData.best_days.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {platformData.best_days.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelectedDate(getNextDateForDay(day))}
                      className="text-xs px-2 py-1 rounded-full bg-white text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200"
                    >
                      {day}
                    </button>
                  ))}
                </div>
              )}
              {platformData.best_time_windows.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {platformData.best_time_windows.map((tw) => (
                    <button
                      key={tw.time}
                      type="button"
                      onClick={() => setSelectedTime(tw.time)}
                      className="text-xs px-2 py-1 rounded-full bg-white text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
                      title={tw.reason}
                    >
                      {tw.label || tw.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Date + Time pickers */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor="panel-date" className="text-xs font-medium text-gray-600">
                Date
              </label>
              <input
                id="panel-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor="panel-time" className="text-xs font-medium text-gray-600">
                Time
              </label>
              <input
                id="panel-time"
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent"
              />
            </div>
          </div>

          {/* Platform selector */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-gray-600">Platform</p>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPlatform(p)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-full border transition-colors',
                    selectedPlatform === p
                      ? 'bg-[#534AB7] text-white border-[#534AB7]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!selectedDate}
              className="flex-1"
            >
              {post.status === 'scheduled' ? 'Update schedule' : 'Schedule'}
            </Button>
            {post.status === 'scheduled' && onUnschedule && (
              <Button
                onClick={() => onUnschedule(post.id)}
                variant="ghost"
                size="sm"
                className="text-gray-500"
              >
                Unschedule
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
