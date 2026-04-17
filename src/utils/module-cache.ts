/** Creates a module-level keyed cache with TTL. Prevents double-fetches across React remounts. */
export function createModuleCache<T>(ttl: number) {
  const store = new Map<string, { data: T; ts: number }>()
  return {
    /** Returns cached data if still within TTL, otherwise null. */
    get(key: string): T | null {
      const entry = store.get(key)
      return entry && Date.now() - entry.ts < ttl ? entry.data : null
    },
    /** Store data with a fresh timestamp. */
    set(key: string, data: T) {
      store.set(key, { data, ts: Date.now() })
    },
    /** Update data without refreshing the timestamp. */
    patch(key: string, data: T) {
      const entry = store.get(key)
      if (entry) store.set(key, { data, ts: entry.ts })
    },
    delete(key: string) {
      store.delete(key)
    },
  }
}
