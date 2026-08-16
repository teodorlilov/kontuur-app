'use client'

import { Modal } from '@/components/ui/modal'

const GROUPS: Array<{ title: string; keys: Array<[string, string]> }> = [
  {
    title: 'Editing',
    keys: [
      ['⌘Z', 'Undo'],
      ['⇧⌘Z', 'Redo'],
      ['⌘D', 'Duplicate the selection'],
      ['Delete', 'Remove the selection'],
      ['Esc', 'Leave the tool, then the selection, then the editor'],
    ],
  },
  {
    title: 'Moving things',
    keys: [
      ['Arrows', 'Nudge by 1px'],
      ['⇧ Arrows', 'Nudge by 10px'],
      ['⌘]', 'Bring forward'],
      ['⌘[', 'Send backward'],
      ['⌥⌘]', 'Bring to front'],
      ['⌥⌘[', 'Send to back'],
      ['⌥ Arrows', 'Restack the focused row in the Layers panel'],
      ['⌘ drag', 'Move without snapping'],
      ['⇧ resize', 'Stretch an element off its aspect'],
    ],
  },
  {
    title: 'Getting around',
    keys: [
      ['Space drag', 'Pan the canvas'],
      ['⌘ scroll', 'Zoom to the pointer'],
      ['Scroll', 'Pan'],
      ['⇧1', 'Fit to the screen'],
      ['⇧0', 'Actual size'],
      ['⌘+ / ⌘−', 'Zoom in and out'],
    ],
  },
  {
    title: 'Selecting',
    keys: [
      ['Click', 'Select one'],
      ['⇧ click', 'Add to the selection'],
      ['Arrows', 'Move through the Layers panel'],
      ['Drag empty canvas', 'Band-select'],
      ['Double-click text', 'Edit it in place'],
    ],
  },
]

/** The canon, in one place — a custom editor has to teach its own keys. */
export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" maxWidth={620}>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-label font-semibold uppercase text-text2">{group.title}</h3>
            <dl className="flex flex-col gap-1.5">
              {group.keys.map(([key, meaning]) => (
                <div key={key} className="flex items-baseline justify-between gap-3">
                  <dt className="text-caption text-text2">{meaning}</dt>
                  <dd className="m-0">
                    <kbd className="rounded-xs border border-line2 px-1 py-px text-label font-semibold text-text3">
                      {key}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
