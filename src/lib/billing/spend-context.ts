import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Who is spending, declared once at the boundary and read wherever money is actually spent.
 *
 * `callAnthropic` has fourteen callers deep in `src/ai` with no agency in scope, and `subscribeFal`
 * sits below every image route and the visuals cron. Threading an id through all of them would be
 * a cross-layer change touching most of the engine; instead the boundary that already knows who is
 * spending — a gated route, the spending action, a cron's per-client loop — wraps its work in
 * `runAsSpender`, and the three provider wrappers read `currentSpender()`. The context follows
 * every await inside `fn`, including a streaming response's pull callbacks created inside it.
 *
 * Fail closed is the reader's job: a wrapper that finds no spender refuses to spend, so a new call
 * site cannot burn money unattributed. The one legitimate exception is the global weekly brief,
 * which belongs to nobody and declares `flow: 'brief'` with no agency.
 *
 * Whether the context survives `unstable_cache` (the analytics narrative runs inside one) is
 * decided by an observed run — docs/plans/BILLING.md step 3.
 */

/** The feature a call belongs to — the "what" beside the model's "how much" in `ai_usage_daily`. */
type SpendFlow =
  | 'generation'
  | 'rewrite'
  | 'editor'
  | 'onboarding'
  | 'analytics'
  | 'sources'
  | 'style_memo'
  | 'brief'

interface Spender {
  /** Null only for `flow: 'brief'`. */
  agencyId: string | null
  clientId?: string
  flow: SpendFlow
}

const storage = new AsyncLocalStorage<Spender>()

/** Runs `fn` with `spender` in scope for every provider call made inside it. */
export function runAsSpender<T>(spender: Spender, fn: () => Promise<T>): Promise<T> {
  return storage.run(spender, fn)
}

/** The spender in scope, or undefined when a boundary forgot to declare one. */
export function currentSpender(): Spender | undefined {
  return storage.getStore()
}
