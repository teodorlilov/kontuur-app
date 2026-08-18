'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  CHART_COLORS,
  CHART_AXIS_PROPS,
  CHART_TOOLTIP_STYLE,
} from '@/features/analytics/lib/chart-config'
import type { AnalyticsMetrics } from '@/types/api'

interface AudienceSectionProps {
  metrics: AnalyticsMetrics
}

export function AudienceSection({ metrics }: AudienceSectionProps) {
  const audience = metrics.audience
  if (!audience) return null

  // Aggregate gender totals from gender_age keys like "M.18-24", "F.25-34"
  const genderTotals: Record<string, number> = { M: 0, F: 0, U: 0 }
  const ageTotals: Record<string, number> = {}
  for (const [key, val] of Object.entries(audience.gender_age)) {
    const parts = key.split('.')
    const gender = parts[0] ?? 'U'
    const age = parts[1] ?? 'Unknown'
    genderTotals[gender] = (genderTotals[gender] ?? 0) + val
    ageTotals[age] = (ageTotals[age] ?? 0) + val
  }

  const totalGender = Object.values(genderTotals).reduce((s, v) => s + v, 0) || 1
  const genderItems = [
    { label: 'Male', value: genderTotals['M'] ?? 0, color: 'var(--forest)' },
    { label: 'Female', value: genderTotals['F'] ?? 0, color: 'var(--forest-deep)' },
    { label: 'Other', value: genderTotals['U'] ?? 0, color: 'var(--line2)' },
  ].filter((g) => g.value > 0)

  // Sort age buckets chronologically
  const ageOrder = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']
  const ageData = ageOrder
    .filter((bucket) => ageTotals[bucket] != null)
    .map((bucket) => ({ age: bucket, value: ageTotals[bucket] ?? 0 }))

  return (
    <div className="bg-surface rounded-xl border border-line p-5 space-y-6">
      <p className="text-body font-medium text-text2">Audience</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gender breakdown */}
        <div>
          <p className="text-label font-semibold uppercase text-text3 mb-3">Gender</p>
          <div className="space-y-2">
            {genderItems.map((g) => {
              const pct = Math.round((g.value / totalGender) * 100)
              return (
                <div key={g.label}>
                  <div className="flex justify-between text-caption text-text2 mb-0.5">
                    <span>{g.label}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 bg-sunken rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: g.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Age distribution */}
        <div>
          <p className="text-label font-semibold uppercase text-text3 mb-3">Age</p>
          {ageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={ageData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis
                  dataKey="age"
                  tick={{ ...CHART_AXIS_PROPS.tick, fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ ...CHART_AXIS_PROPS.tick, fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
                  cursor={{ fill: 'rgba(15,21,18,0.04)' }}
                />
                <Bar dataKey="value" fill="var(--forest)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-caption text-text3">No age data available</p>
          )}
        </div>

        {/* Top locations */}
        <div>
          <p className="text-label font-semibold uppercase text-text3 mb-3">Top locations</p>
          <div className="grid grid-cols-2 gap-4">
            {audience.top_countries.length > 0 && (
              <div>
                <p className="text-caption text-text3 mb-1">Countries</p>
                <div className="space-y-1">
                  {audience.top_countries.map((c) => (
                    <div key={c.name} className="flex justify-between text-caption">
                      <span className="text-text2 truncate mr-2">{c.name}</span>
                      <span className="text-text3 shrink-0">{c.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {audience.top_cities.length > 0 && (
              <div>
                <p className="text-caption text-text3 mb-1">Cities</p>
                <div className="space-y-1">
                  {audience.top_cities.map((c) => (
                    <div key={c.name} className="flex justify-between text-caption">
                      <span className="text-text2 truncate mr-2">{c.name}</span>
                      <span className="text-text3 shrink-0">{c.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
