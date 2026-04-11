'use client'

import { cn } from '@/utils/cn'
import { equalizeWeights, type WeightedPillar } from '@/lib/clients/content-pillars'

interface PillarEditorProps {
  pillars: WeightedPillar[]
  onChange: (pillars: WeightedPillar[]) => void
  /** When true, all pillars can be removed. When false, at least one must remain. */
  allowEmpty?: boolean
}

export function PillarEditor({ pillars, onChange, allowEmpty = false }: PillarEditorProps) {
  const totalWeight = pillars.reduce((sum, p) => sum + p.weight, 0)

  function handleNameChange(index: number, name: string) {
    const updated = [...pillars]
    updated[index] = { ...updated[index]!, pillar: name }
    onChange(updated)
  }

  function handleWeightChange(index: number, weight: number) {
    const updated = [...pillars]
    updated[index] = { ...updated[index]!, weight: Math.max(0, Math.min(100, weight)) }
    onChange(updated)
  }

  function handleAdd() {
    const newPillars = [...pillars, { pillar: '', weight: 0 }]
    onChange(equalizeWeights(newPillars))
  }

  function handleRemove(index: number) {
    const updated = pillars.filter((_, i) => i !== index)
    if (updated.length === 0) {
      if (allowEmpty) onChange([])
      return
    }
    const removedWeight = pillars[index]!.weight
    const extra = Math.floor(removedWeight / updated.length)
    const remainder = removedWeight - extra * updated.length
    const redistributed = updated.map((p, i) => ({
      ...p,
      weight: p.weight + extra + (i < remainder ? 1 : 0),
    }))
    onChange(redistributed)
  }

  const canRemove = allowEmpty || pillars.length > 1

  return (
    <div className="space-y-3">
      {pillars.map((pillar, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={pillar.pillar}
            onChange={(e) => handleNameChange(i, e.target.value)}
            placeholder="Pillar name"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20"
          />
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="number"
              value={pillar.weight}
              onChange={(e) => handleWeightChange(i, parseInt(e.target.value, 10) || 0)}
              className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-900 text-center outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20"
              min={0}
              max={100}
            />
            <span className="text-xs text-gray-400">%</span>
          </div>
          {canRemove && (
            <button
              type="button"
              onClick={() => handleRemove(i)}
              className="text-gray-400 hover:text-red-500 shrink-0"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleAdd}
          className="text-xs text-brand-purple hover:underline font-medium"
        >
          + Add pillar
        </button>
        {pillars.length > 0 && (
          <span
            className={cn(
              'text-xs font-medium',
              totalWeight === 100 ? 'text-green-600' : 'text-red-500'
            )}
          >
            Total: {totalWeight}%
          </span>
        )}
      </div>
    </div>
  )
}
