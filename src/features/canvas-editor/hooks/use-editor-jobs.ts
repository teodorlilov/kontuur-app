'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

/**
 * Every kind of work the editor makes you wait for. The kind is what a control asks about when it
 * disables itself ("is a repair running"); the label is what the tray shows the user.
 */
type EditorJobKind =
  | 'generate'
  | 'inpaint'
  | 'repair'
  | 'isolate'
  | 'lasso'
  | 'expand'
  | 'erase'
  | 'vector'
  | 'cutout'

/**
 * How long each kind usually takes, in seconds. Measured where it could be, estimated where it
 * could not, and stated ONCE.
 *
 * Every one of these existed twice before — on the rail tile that offers the verb ("~45s") and in
 * the op that starts the job — and the pair had already drifted: the generate panel showed a
 * measured 52 while the op beside it said 60. A number the user reads from two surfaces has to come
 * from one place, or the surfaces argue.
 *
 * `erase` and `lasso` are the outliers at 3 and 4: they are the two with no model behind them, just a
 * canvas pass and an upload. An 8 on erase made the bar crawl through work that was already
 * finished. The lasso was 12 while it had a matting call in it, and dropped when that came out.
 */
export const TYPICAL_SECONDS: Record<EditorJobKind, number> = {
  generate: 52,
  inpaint: 45,
  repair: 45,
  isolate: 20,
  cutout: 20,
  lasso: 4,
  expand: 60,
  vector: 10,
  erase: 3,
}

export interface EditorJob {
  id: string
  kind: EditorJobKind
  /** The verb in the user's own words — the same phrase the control that started it used. */
  label: string
  /** The slide this belongs to, so a finished job can name where it landed. */
  slide: number
  /** Roughly how long this usually takes. An estimate, and shown as one. */
  typicalSeconds: number
  startedAt: number
}

/** What an op holds while it runs. */
export interface JobHandle {
  id: string
  /** Has the user thrown this result away while it was in flight? Check before committing. */
  discarded: () => boolean
  finish: () => void
}

interface JobSpec {
  kind: EditorJobKind
  label: string
  slide: number
  typicalSeconds: number
  /** Called when the user discards it — abandons the request where the op can abandon one. */
  onDiscard?: () => void
}

export interface EditorJobs {
  jobs: EditorJob[]
  start: (spec: JobSpec) => JobHandle
  /** Is any job of this kind running? What a control asks before disabling itself. */
  running: (kind: EditorJobKind) => boolean
  /** The running job of this kind, so an in-place hint can count from the SAME start as the tray. */
  find: (kind: EditorJobKind) => EditorJob | undefined
  discard: (id: string) => void
}

/**
 * Everything the editor is waiting on, in one list.
 *
 * One registry rather than a boolean per operation, because "is something running" had eight
 * separate answers — `inpainting`, `erasing`, `isolating`, `repairing` and the rest — and every
 * surface that wanted to show a wait had to be handed the right one. A job also knows things a
 * boolean cannot: which slide it belongs to, when it started, and how long its kind usually takes.
 * That is what lets the wait follow you around the editor instead of living in the bar you launched
 * it from.
 *
 * Discarding is not cancelling, and the tray says so in those words. The model keeps running on the
 * provider's side; what stops is this editor caring about the answer. A discarded op drops its
 * result on the floor rather than committing it to the doc, and `onDiscard` lets the one op that
 * CAN abandon its request (background generation, which owns an AbortController) do that too.
 */
export function useEditorJobs(): EditorJobs {
  const [jobs, setJobs] = useState<EditorJob[]>([])
  /**
   * The discarded ids, read synchronously.
   *
   * An op finishing mid-flight asks "was I discarded" from inside an async closure, which cannot
   * see a later render's state. The ref is the answer that is true NOW; `jobs` is the answer the
   * screen is drawing.
   */
  const discardedRef = useRef<Set<string>>(new Set())
  /** Discard callbacks, per instance — a module-level map would let two editors share an id. */
  const discardHooks = useRef(new Map<string, () => void>())
  const nextId = useRef(0)

  const start = useCallback((spec: JobSpec): JobHandle => {
    const { onDiscard, ...job } = spec
    const id = `job-${nextId.current++}`
    setJobs((current) => [...current, { ...job, id, startedAt: Date.now() }])
    if (onDiscard) discardHooks.current.set(id, onDiscard)

    const forget = () => {
      discardedRef.current.delete(id)
      discardHooks.current.delete(id)
      setJobs((current) => current.filter((entry) => entry.id !== id))
    }
    return { id, discarded: () => discardedRef.current.has(id), finish: forget }
  }, [])

  const discard = useCallback((id: string) => {
    discardedRef.current.add(id)
    discardHooks.current.get(id)?.()
    discardHooks.current.delete(id)
    // The row goes immediately: the user has said they do not want this, so leaving it counting up
    // would be the editor arguing. The op still finishes in the background and drops its result —
    // which is why the discarded id STAYS in the set until the op calls finish.
    setJobs((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const running = useCallback(
    (kind: EditorJobKind) => jobs.some((job) => job.kind === kind),
    [jobs]
  )
  const find = useCallback((kind: EditorJobKind) => jobs.find((job) => job.kind === kind), [jobs])

  return useMemo(
    () => ({ jobs, start, running, find, discard }),
    [jobs, start, running, find, discard]
  )
}
