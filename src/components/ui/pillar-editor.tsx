'use client'

import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { CLIENT_COLORS } from '@/utils/constants'
import { equalizeWeights, type WeightedPillar } from '@/lib/clients/content-pillars'
import { Input } from './input'
import { InputAffix } from './form/input-affix'

/** Above this, a batch splits too thin to be worth another pillar. */
const MAX_PILLARS = 4

interface PillarEditorProps {
  pillars: WeightedPillar[]
  onChange: (pillars: WeightedPillar[]) => void
  /** When true, all pillars can be removed. When false, at least one must remain. */
  allowEmpty?: boolean
}

/**
 * Edits the content pillars that decide how a batch of posts is divided.
 *
 * The proportion bar above the rows shows the split as it will actually be applied, which the
 * numbers alone do not convey once they stop summing to 100.
 */
export function PillarEditor({ pillars, onChange, allowEmpty = false }: PillarEditorProps) {
  const totalWeight = pillars.reduce((sum, p) => sum + p.weight, 0)
  const balanced = totalWeight === 100

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
    onChange(equalizeWeights([...pillars, { id: crypto.randomUUID(), pillar: '', weight: 0 }]))
  }

  function handleRemove(index: number) {
    const updated = pillars.filter((_, i) => i !== index)
    if (updated.length === 0) {
      if (allowEmpty) onChange([])
      return
    }
    // Give the freed share back to the survivors, largest-remainder style, so the total holds.
    const removedWeight = pillars[index]!.weight
    const extra = Math.floor(removedWeight / updated.length)
    const remainder = removedWeight - extra * updated.length
    onChange(updated.map((p, i) => ({ ...p, weight: p.weight + extra + (i < remainder ? 1 : 0) })))
  }

  const canRemove = allowEmpty || pillars.length > 1

  return (
    <div>
      {pillars.length > 0 && (
        <div aria-hidden className="mb-3.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-line">
          {pillars.map((pillar, i) => (
            <span
              key={pillar.id}
              // Computed share and hue: the one inline style DESIGN.md allows.
              style={{
                width: `${(pillar.weight / Math.max(totalWeight, 1)) * 100}%`,
                background: CLIENT_COLORS[i % CLIENT_COLORS.length],
              }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {pillars.map((pillar, i) => (
          <div key={pillar.id} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="size-[9px] flex-none rounded-xs"
              style={{ background: CLIENT_COLORS[i % CLIENT_COLORS.length] }}
            />
            <Input
              value={pillar.pillar}
              onChange={(e) => handleNameChange(i, e.target.value)}
              placeholder="Pillar name"
              aria-label={`Pillar ${i + 1} name`}
              className="flex-1"
            />
            {/* 92px, not 82: the field has to hold "100", and after the border, the "%" and
                the control's own padding, 82 left 31px of text box for three digits. */}
            <InputAffix suffix="%" className="w-[92px] flex-none">
              <Input
                type="number"
                value={pillar.weight}
                onChange={(e) => handleWeightChange(i, parseInt(e.target.value, 10) || 0)}
                aria-label={`Pillar ${i + 1} share`}
                min={0}
                max={100}
                // Tabular: four of these stack in a column and are read against each other.
                className="tabular-nums"
              />
            </InputAffix>
            {canRemove && (
              <button
                type="button"
                onClick={() => handleRemove(i)}
                aria-label={`Remove ${pillar.pillar || `pillar ${i + 1}`}`}
                className="flex size-8 flex-none items-center justify-center rounded-md text-text3 transition-colors hover:bg-danger-bg hover:text-danger"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {pillars.length < MAX_PILLARS ? (
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-md border border-line2 px-3 py-1.5 text-body font-medium text-text2 transition-colors hover:border-forest hover:text-forest"
          >
            + Add pillar
          </button>
        ) : (
          <span />
        )}
        {pillars.length > 0 && (
          <span className="text-caption">
            Total{' '}
            <b className={cn('font-semibold', balanced ? 'text-forest' : 'text-pending')}>
              {totalWeight}%
            </b>
            {!balanced && <span className="text-text3"> · should be 100</span>}
          </span>
        )}
      </div>
    </div>
  )
}
