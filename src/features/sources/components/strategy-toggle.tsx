'use client'

import { cn } from '@/utils/cn'

interface StrategyToggleProps {
  label: string
  description?: string
  enabled: boolean
  onChange: (value: boolean) => void
}

export function StrategyToggle({ label, description, enabled, onChange }: StrategyToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0',
          enabled ? 'bg-brand-purple' : 'bg-gray-200'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
      <div>
        <span className="text-sm text-gray-700">{label}</span>
        {description && <p className="text-xs text-gray-400">{description}</p>}
      </div>
    </div>
  )
}
