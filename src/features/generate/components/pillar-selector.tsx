'use client'

import { cn } from '@/utils/cn'

interface PillarSelectorProps {
  pillars: string[]
  suggested: string[]
  selected: string[]
  onToggle: (pillar: string) => void
  onAddSuggested: (pillar: string) => void
}

export function PillarSelector({
  pillars,
  suggested,
  selected,
  onToggle,
  onAddSuggested,
}: PillarSelectorProps) {
  return (
    <div className="flex flex-col gap-4">
      {pillars.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Client pillars
          </p>
          <div className="flex flex-wrap gap-2">
            {pillars.map((pillar) => {
              const isSelected = selected.includes(pillar)
              return (
                <button
                  key={pillar}
                  onClick={() => onToggle(pillar)}
                  className={cn(
                    'text-sm px-3 py-1.5 rounded-full border transition-colors',
                    isSelected
                      ? 'border-brand-purple bg-brand-purple-light text-brand-purple'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                >
                  {pillar}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {suggested.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Suggested pillars
          </p>
          <div className="flex flex-wrap gap-2">
            {suggested.map((pillar) => {
              const isAdded = pillars.includes(pillar)
              return (
                <button
                  key={pillar}
                  onClick={() => !isAdded && onAddSuggested(pillar)}
                  className={cn(
                    'text-sm px-3 py-1.5 rounded-full border transition-colors',
                    isAdded
                      ? 'border-brand-purple bg-brand-purple-light text-brand-purple cursor-default'
                      : 'border-dashed border-gray-300 text-gray-600 hover:border-brand-purple hover:text-brand-purple'
                  )}
                >
                  {isAdded ? '✓ ' : '+ '}
                  {pillar}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
