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
          className="text-caption text-forest hover:underline font-medium whitespace-nowrap"
        >
          {assignedPillarIds.length > 0 ? `Topics: ${assignedPillarIds.length}` : 'Limit topics'}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-56 rounded-lg border border-line bg-surface p-2 shadow-lg"
          sideOffset={4}
          align="start"
        >
          <p className="text-caption font-medium text-text3 px-2 pb-1">
            Limit to specific topics (optional)
          </p>
          {pillars.length === 0 ? (
            <p className="text-caption text-text3 px-2 py-1">No topics configured</p>
          ) : (
            <div className="space-y-1">
              {pillars.map((p) => {
                const color = getPillarColor(p.pillar)
                const checked = assignedSet.has(p.id)
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-body cursor-pointer hover:bg-sunken"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggle(p.id)}
                      className="rounded border-line2 text-forest focus:ring-spring/12"
                    />
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span className="truncate text-text2">{p.pillar}</span>
                  </label>
                )
              })}
            </div>
          )}
          {assignedPillarIds.length === 0 && pillars.length > 0 && (
            <p className="text-caption text-text3 px-2 pt-1 border-t border-line mt-1">
              Feeds all topics (default)
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
