'use client'

import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { formatScheduledAt, getNextDateForDay } from '@/utils/date-helpers'
import type { BestTimePlatform } from '@/types/api'

interface ScheduleModalProps {
  open: boolean
  onClose: () => void
  onSchedule: (scheduledAt: string | null) => void
  bestTimeData?: BestTimePlatform[] | null
  platform?: string | null
  loading?: boolean
  selectedDate: string
  setSelectedDate: (date: string) => void
  selectedTime: string
  setSelectedTime: (time: string) => void
}

export function ScheduleModal({
  open,
  onClose,
  onSchedule,
  bestTimeData,
  platform,
  loading,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
}: ScheduleModalProps) {
  // Find best-time data for the current platform
  const platformData = bestTimeData?.find(
    (bt) => bt.platform.toLowerCase() === (platform ?? '').toLowerCase()
  )

  function handleSchedule() {
    if (!selectedDate) return
    const iso = formatScheduledAt(selectedDate, selectedTime)
    onSchedule(iso)
  }

  function handleScheduleLater() {
    onSchedule(null)
  }

  return (
    <Modal open={open} onClose={onClose} title="Schedule this post?">
      <div className="flex flex-col gap-5">
        {/* Best time recommendations */}
        {platformData && (
          <div className="flex flex-col gap-3">
            <p className="text-label font-semibold uppercase text-text3">
              Best times for {platformData.platform}
            </p>
            {platformData.best_days.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-caption text-text3">Best days</p>
                <div className="flex flex-wrap gap-1.5">
                  {platformData.best_days.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelectedDate(getNextDateForDay(day))}
                      className="text-caption px-2.5 py-1 rounded-full bg-wash text-forest hover:bg-wash transition-colors"
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {platformData.best_time_windows.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-caption text-text3">Best times</p>
                <div className="flex flex-wrap gap-1.5">
                  {platformData.best_time_windows.map((tw) => (
                    <button
                      key={tw.time}
                      type="button"
                      onClick={() => setSelectedTime(tw.time)}
                      className="text-caption px-2.5 py-1 rounded-full bg-wash text-spring-text hover:bg-wash transition-colors"
                      title={tw.reason}
                    >
                      {tw.label || tw.time}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {platformData.reasoning_summary && (
              <p className="text-caption text-text3 italic">{platformData.reasoning_summary}</p>
            )}
          </div>
        )}

        {/* Date + Time pickers */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5 flex-1">
            <label htmlFor="schedule-date" className="text-caption font-medium text-text2">
              Date
            </label>
            <input
              id="schedule-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="text-lead md:text-body text-ink border border-line2 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-spring/12 focus:border-transparent"
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <label htmlFor="schedule-time" className="text-caption font-medium text-text2">
              Time
            </label>
            <input
              id="schedule-time"
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="text-lead md:text-body text-ink border border-line2 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-spring/12 focus:border-transparent"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleSchedule}
            loading={loading}
            disabled={!selectedDate}
            className="flex-1"
          >
            Schedule
          </Button>
          <Button
            onClick={handleScheduleLater}
            loading={loading}
            variant="ghost"
            className="flex-1"
          >
            Schedule later
          </Button>
        </div>
      </div>
    </Modal>
  )
}
