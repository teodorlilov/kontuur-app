'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useBatchSchedule, type BatchPost } from '@/components/scheduling/use-batch-schedule'

interface BatchScheduleModalProps {
  open: boolean
  onClose: () => void
  posts: BatchPost[]
  /** Pre-filled slots (e.g. the queue's picker suggestions) — every row stays editable. */
  initialAssignments?: Record<string, { date: string; time: string }>
  onComplete: () => void
}

export function BatchScheduleModal({
  open,
  onClose,
  posts,
  initialAssignments,
  onComplete,
}: BatchScheduleModalProps) {
  const { assignments, setDate, setTime, scheduleAll, resetAssignments, loading } =
    useBatchSchedule(posts, () => {
      onComplete()
      onClose()
    }, initialAssignments)

  // Fresh seed per opening — adjusted during render (the documented pattern).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) resetAssignments(initialAssignments)
  }

  const minDate = new Date().toISOString().slice(0, 10)

  return (
    <Modal open={open} onClose={onClose} title="Schedule approved posts" className="max-w-2xl">
      <div className="flex flex-col gap-4">
        {posts.length === 0 ? (
          <p className="text-body text-text3">No approved posts to schedule.</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto">
              {posts.map((post) => {
                const a = assignments.get(post.id) ?? { date: '', time: '' }
                return (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 p-3 border border-line rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-caption font-medium text-text2">{post.client_name}</p>
                      <p className="text-caption text-text3 truncate">
                        {post.caption?.slice(0, 80) ?? 'No caption'}
                      </p>
                    </div>
                    <input
                      type="date"
                      value={a.date}
                      min={minDate}
                      onChange={(e) => setDate(post.id, e.target.value)}
                      className="text-lead md:text-caption border border-line2 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-spring/12 focus:border-transparent"
                    />
                    <input
                      type="time"
                      value={a.time}
                      onChange={(e) => setTime(post.id, e.target.value)}
                      className="text-lead md:text-caption border border-line2 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-spring/12 focus:border-transparent"
                    />
                  </div>
                )
              })}
            </div>

            <div className="flex gap-2 pt-2 border-t border-line">
              <Button
                onClick={() => {
                  void scheduleAll()
                }}
                loading={loading}
                className="flex-1"
              >
                Schedule all
              </Button>
              <Button onClick={onClose} variant="ghost">
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
