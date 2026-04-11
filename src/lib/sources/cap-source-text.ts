const SOURCE_BUDGET = { file: 6000, website: 8000, rss: 4000 }
const TOTAL_CAP = 18000

/** Cap combined source text to stay within prompt budget (~15K chars).
 *  Each category has its own budget. Unused budget is redistributed
 *  to categories that exceed theirs. A final proportional scale ensures
 *  the total never exceeds TOTAL_CAP. */
export function capSourceText(
  rssText: string,
  websiteText: string,
  fileText: string
): { rss: string; website: string; file: string } {
  const lengths = { rss: rssText.length, website: websiteText.length, file: fileText.length }
  const budgets = { ...SOURCE_BUDGET }

  // Redistribute unused budget from categories under their cap
  let surplus = 0
  const overCategories: Array<'rss' | 'website' | 'file'> = []
  for (const key of ['rss', 'website', 'file'] as const) {
    if (lengths[key] <= budgets[key]) {
      surplus += budgets[key] - lengths[key]
    } else {
      overCategories.push(key)
    }
  }

  if (overCategories.length > 0 && surplus > 0) {
    const extra = Math.floor(surplus / overCategories.length)
    for (const key of overCategories) {
      budgets[key] += extra
    }
  }

  // Ensure total doesn't exceed cap
  let total =
    Math.min(lengths.rss, budgets.rss) +
    Math.min(lengths.website, budgets.website) +
    Math.min(lengths.file, budgets.file)
  const scale = total > TOTAL_CAP ? TOTAL_CAP / total : 1

  return {
    rss: rssText.slice(0, Math.floor(budgets.rss * scale)),
    website: websiteText.slice(0, Math.floor(budgets.website * scale)),
    file: fileText.slice(0, Math.floor(budgets.file * scale)),
  }
}
