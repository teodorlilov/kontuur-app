/**
 * A minimal FIFO concurrency limiter: at most `max` holders run at once; the rest await a slot.
 * Shared by the brand-extraction capturer and the backdrop-generation batch to bound in-flight work.
 */
export function createSemaphore(max: number): { acquire: () => Promise<() => void> } {
  let active = 0
  const queue: Array<() => void> = []

  function acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const grant = () => {
        active++
        let released = false
        resolve(() => {
          if (released) return
          released = true
          active--
          queue.shift()?.()
        })
      }
      if (active < max) grant()
      else queue.push(grant)
    })
  }

  return { acquire }
}

/**
 * Map with at most `max` callbacks in flight. The acquire/try/finally dance around
 * `createSemaphore` was being copied at every call site — this is that dance, once.
 * Results keep item order (a `Promise.all` guarantee), however the work interleaves.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  max: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const semaphore = createSemaphore(max)
  return Promise.all(
    items.map(async (item) => {
      const release = await semaphore.acquire()
      try {
        return await fn(item)
      } finally {
        release()
      }
    })
  )
}
