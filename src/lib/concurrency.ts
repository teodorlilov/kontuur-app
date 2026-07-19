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
