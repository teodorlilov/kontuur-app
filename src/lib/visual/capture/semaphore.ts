/**
 * A minimal FIFO concurrency limiter: at most `max` holders run at once; the rest await a slot.
 * Module-scoped in the capturer so concurrent onboardings on one warm instance can't exhaust memory
 * by launching many page renders at once.
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
