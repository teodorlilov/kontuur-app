import type { CanvasDoc } from '@/types/canvas'

/** Undo depth. Docs are small plain JSON, so whole-doc snapshots are the cheapest correct model. */
export const UNDO_CAP = 50

/** Consecutive commits sharing a coalesce key inside this window fold into one undo step. */
const COALESCE_MS = 800

export interface DocHistory {
  past: CanvasDoc[]
  /** Never absent: a history only ever comes from `initHistory`, which is given a doc. */
  present: CanvasDoc
  future: CanvasDoc[]
  /** The gesture the present entry belongs to — further commits with this key fold into it. */
  run: { key: string; at: number } | null
}

export interface CommitOptions {
  /** Commits sharing a key within the coalesce window replace the present instead of stacking. */
  coalesceKey?: string
  /** Injected clock — production passes nothing; tests drive the coalesce window deterministically. */
  now?: number
}

/** A fresh history holding one doc, with nothing to undo. */
export function initHistory(doc: CanvasDoc): DocHistory {
  return { past: [], present: doc, future: [], run: null }
}

/**
 * Serialisations, keyed by the doc that produced them.
 *
 * The no-op guard below compares two docs by their JSON, and one of the two is almost always a doc
 * that has been compared before: during a coalesced run each tick's `next` becomes the following
 * tick's `present`. Re-serialising it every time doubled the cost of the guard on exactly the path
 * that runs most — one slider drag is one commit per tick over the whole doc. Docs are immutable
 * here (every transform returns a new object), so a cached string can never go stale, and a WeakMap
 * lets the entry go the moment the doc leaves the history.
 */
const serialisations = new WeakMap<CanvasDoc, string>()

function serialised(doc: CanvasDoc): string {
  const cached = serialisations.get(doc)
  if (cached !== undefined) return cached
  const json = JSON.stringify(doc)
  serialisations.set(doc, json)
  return json
}

/**
 * Apply a mutation and record it. A mutation that leaves the doc structurally unchanged returns the
 * history untouched, so a no-op action (deleting nothing, moving past the end of the stack) never
 * costs an undo step; a keyed run (slider drag, arrow-key repeat) edits its own step in place.
 */
export function commitHistory(
  history: DocHistory,
  mutate: (doc: CanvasDoc) => CanvasDoc,
  options: CommitOptions = {}
): DocHistory {
  const { present } = history
  const next = mutate(present)
  if (next === present || serialised(next) === serialised(present)) return history

  const now = options.now ?? Date.now()
  const key = options.coalesceKey
  const run = key === undefined ? null : { key, at: now }
  const continuesRun =
    key !== undefined && history.run?.key === key && now - history.run.at < COALESCE_MS
  if (continuesRun) return { ...history, present: next, future: [], run }
  return { past: [...history.past.slice(-UNDO_CAP + 1), present], present: next, future: [], run }
}

/** Step back one entry, moving the present onto the redo stack. */
export function undoHistory(history: DocHistory): DocHistory {
  const previous = history.past[history.past.length - 1]
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    run: null,
  }
}

/** Step forward one entry, moving the present back onto the undo stack. */
export function redoHistory(history: DocHistory): DocHistory {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
    run: null,
  }
}
