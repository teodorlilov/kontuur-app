'use client'

import * as Popover from '@radix-ui/react-popover'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import type { WeightedPillar } from '@/lib/clients/content-pillars'

interface PillarAssignmentPopoverProps {
  pillars: WeightedPillar[]
  assignedPillarIds: string[]
  onChange: (pillarIds: string[]) => void
}

export function PillarAssignmentPopover({
  pillars,
  assignedPillarIds,
  onChange,
}: PillarAssignmentPopoverProps) {
  const assignedSet = new Set(assignedPillarIds)

  function handleToggle(pillarId: string) {
    if (assignedSet.has(pillarId)) {
      onChange(assignedPillarIds.filter((id) => id !== pillarId))
    } else {
      onChange([...assignedPillarIds, pillarId])
    }
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="text-xs text-brand-purple hover:underline font-medium whitespace-nowrap"
        >
          {assignedPillarIds.length > 0 ? 'Edit pillars' : 'Assign pillars'}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
          sideOffset={4}
          align="start"
        >
          {pillars.length === 0 ? (
            <p className="text-xs text-gray-400 px-2 py-1">No pillars configured</p>
          ) : (
            <div className="space-y-1">
              {pillars.map((p) => {
                const color = getPillarColor(p.pillar)
                const checked = assignedSet.has(p.id)
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggle(p.id)}
                      className="rounded border-gray-300 text-brand-purple focus:ring-brand-purple/20"
                    />
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span className="truncate text-gray-700">{p.pillar}</span>
                  </label>
                )
              })}
            </div>
          )}
          {assignedPillarIds.length === 0 && pillars.length > 0 && (
            <p className="text-xs text-gray-400 px-2 pt-1 border-t border-gray-100 mt-1">
              No pillars assigned — feeds all pillars
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
