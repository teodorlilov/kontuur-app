'use client'

import type { AnalyticsReportRow } from '@/types'
import { useState, useEffect } from 'react'
import { deleteReport } from '@/features/analytics/actions/report-actions'
import { capitalizePlatform } from '../utils/metrics'
import type { AnalyticsReport } from '@/types/api'
import { createModuleCache } from '@/utils/module-cache'

type ReportHistoryEntry = Pick<
  AnalyticsReportRow,
  'id' | 'platform' | 'period_start' | 'period_end' | 'ai_summary' | 'created_at'
>

interface ReportHistoryProps {
  clientId: string
  platform: string
  onLoad: (report: AnalyticsReport) => void
}

// Module-level cache — survives remounts when navigating away and back to analytics tab
const historyCache = createModuleCache<ReportHistoryEntry[]>(60_000)

export function ReportHistory({ clientId, platform, onLoad }: ReportHistoryProps) {
  const [reports, setReports] = useState<ReportHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const key = `${clientId}:${platform}`
    const cached = historyCache.get(key)
    if (cached) {
      setReports(cached)
      setLoading(false)
      return
    }

    setLoading(true)
    fetch(`/api/analytics/report?client_id=${clientId}&platform=${platform}`)
      .then((r) => r.json())
      .then((data: { reports?: ReportHistoryEntry[] }) => {
        const result = data.reports ?? []
        historyCache.set(key, result)
        setReports(result)
      })
      .catch(() => setReports([]))
      .finally(() => setLoading(false))
  }, [clientId, platform])

  async function handleDelete(reportId: string) {
    setDeletingId(reportId)
    try {
      await deleteReport(reportId)
      setReports((prev) => {
        const updated = prev.filter((r) => r.id !== reportId)
        historyCache.patch(`${clientId}:${platform}`, updated)
        return updated
      })
    } catch {
      // silently ignore
    } finally {
      setDeletingId(null)
    }
  }

  async function handleView(reportId: string) {
    setLoadingId(reportId)
    try {
      const res = await fetch(`/api/analytics/report/${reportId}`)
      if (!res.ok) throw new Error('Failed to load report')
      const data = (await res.json()) as { report?: AnalyticsReport }
      if (data.report) onLoad(data.report)
    } catch {
      // silently ignore
    } finally {
      setLoadingId(null)
    }
  }

  if (loading) return null
  if (reports.length === 0) return null

  return (
    <div className="bg-surface rounded-xl border border-line p-5">
      <p className="text-body font-medium text-text2 mb-3">Previous reports</p>
      <div className="space-y-2">
        {reports.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between py-2 border-b border-line last:border-0"
          >
            <div>
              <p className="text-body text-ink">
                {capitalizePlatform(r.platform)} · {r.period_start} to {r.period_end}
              </p>
              {r.ai_summary && (
                <p className="text-caption text-text3 line-clamp-1 mt-0.5">{r.ai_summary}</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <button
                type="button"
                onClick={() => handleView(r.id)}
                disabled={loadingId === r.id}
                className="text-caption font-medium text-spring-text hover:underline disabled:opacity-50"
              >
                {loadingId === r.id ? 'Loading…' : 'View'}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                disabled={deletingId === r.id}
                className="text-caption font-medium text-danger hover:text-danger hover:underline disabled:opacity-50"
              >
                {deletingId === r.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
