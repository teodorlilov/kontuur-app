import { describe, it, expect } from 'vitest'
import { capSourceText } from '../cap-source-text'

describe('capSourceText', () => {
  it('returns all text unchanged when under budget', () => {
    const result = capSourceText('rss content', 'web content', 'file content')
    expect(result.rss).toBe('rss content')
    expect(result.website).toBe('web content')
    expect(result.file).toBe('file content')
  })

  it('truncates RSS text to its budget (4000 chars)', () => {
    const longRss = 'R'.repeat(5000)
    const result = capSourceText(longRss, '', '')
    // RSS budget is 4000, but website+file are empty so surplus is redistributed
    // surplus = 5000 + 6000 = 11000, over-categories = [rss], extra = 11000
    // new rss budget = 4000 + 11000 = 15000 which exceeds the text length
    expect(result.rss).toBe(longRss)
  })

  it('truncates website text to its budget (8000 chars)', () => {
    const longWeb = 'W'.repeat(9000)
    const result = capSourceText('', longWeb, '')
    // Similar redistribution — surplus from rss(4000) + file(6000) = 10000
    // new website budget = 8000 + 10000 = 18000
    expect(result.website).toBe(longWeb)
  })

  it('truncates file text to its budget (6000 chars)', () => {
    const longFile = 'F'.repeat(7000)
    const result = capSourceText('', '', longFile)
    // surplus from rss(4000) + website(5000) = 9000
    // new file budget = 6000 + 9000 = 15000
    expect(result.file).toBe(longFile)
  })

  it('redistributes unused budget to over-budget categories', () => {
    // RSS is empty (0 chars), website uses 1000, file needs 8000
    const result = capSourceText('', 'W'.repeat(1000), 'F'.repeat(8000))
    // Under budget: rss (surplus 4000), website (surplus 7000) = 11000 surplus
    // Over: file — budget 6000 + 11000 = 17000
    // File (8000) fits in expanded budget (17000)
    expect(result.file).toBe('F'.repeat(8000))
    expect(result.website).toBe('W'.repeat(1000))
  })

  it('splits surplus evenly among multiple over-budget categories', () => {
    // File empty → surplus 6000, RSS and website both over
    const rss = 'R'.repeat(6000) // over 4000 budget
    const web = 'W'.repeat(10000) // over 8000 budget
    const result = capSourceText(rss, web, '')
    // surplus = 6000 (file), over = [rss, website], extra = 3000 each
    // rss budget = 4000+3000 = 7000 → rss (6000) fits
    // web budget = 8000+3000 = 11000 → web (10000) fits
    // total = 6000+10000 = 16000 < 18000
    expect(result.rss).toBe(rss)
    expect(result.website).toBe(web)
  })

  it('enforces total cap of 18000 chars', () => {
    // All categories massively over budget
    const rss = 'R'.repeat(10000)
    const web = 'W'.repeat(10000)
    const file = 'F'.repeat(10000)
    const result = capSourceText(rss, web, file)
    const totalLength = result.rss.length + result.website.length + result.file.length
    expect(totalLength).toBeLessThanOrEqual(18000)
  })

  it('scales proportionally when all categories are over budget', () => {
    const rss = 'R'.repeat(10000)
    const web = 'W'.repeat(10000)
    const file = 'F'.repeat(10000)
    const result = capSourceText(rss, web, file)
    // No surplus (all over budget), budgets stay at 4000/8000/6000
    // total = 4000+8000+6000 = 18000, scale = 1
    expect(result.rss.length).toBe(4000)
    expect(result.website.length).toBe(8000)
    expect(result.file.length).toBe(6000)
  })

  it('returns empty strings for empty inputs', () => {
    const result = capSourceText('', '', '')
    expect(result.rss).toBe('')
    expect(result.website).toBe('')
    expect(result.file).toBe('')
  })

  it('handles one large category with two empty ones', () => {
    // Only file has content, 14000 chars
    const file = 'F'.repeat(14000)
    const result = capSourceText('', '', file)
    // surplus = 4000 (rss) + 8000 (web) = 12000
    // file budget = 6000 + 12000 = 18000
    // total = 14000 < 18000, scale = 1
    expect(result.file).toBe(file)
  })

  it('truncates single large category to total cap', () => {
    const file = 'F'.repeat(20000)
    const result = capSourceText('', '', file)
    // surplus = 4000 (rss) + 8000 (web) = 12000, file budget = 6000 + 12000 = 18000
    // total = min(20000, 18000) = 18000, scale = 1
    expect(result.file.length).toBe(18000)
  })

  it('preserves content integrity (no mangled characters)', () => {
    const rss = 'Hello RSS world'
    const web = 'Website content here'
    const file = 'File document text'
    const result = capSourceText(rss, web, file)
    expect(result.rss).toBe(rss)
    expect(result.website).toBe(web)
    expect(result.file).toBe(file)
  })
})
