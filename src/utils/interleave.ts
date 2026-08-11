/** Round-robin interleave: one item per list per pass, until the cap is reached. */
export function interleaveRoundRobin<T>(lists: T[][], cap: number): T[] {
  const result: T[] = []
  const maxLength = Math.max(0, ...lists.map((list) => list.length))

  for (let pass = 0; pass < maxLength && result.length < cap; pass++) {
    for (const list of lists) {
      if (result.length >= cap) break
      const item = list[pass]
      if (item !== undefined) result.push(item)
    }
  }
  return result
}
